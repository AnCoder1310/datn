import pytest
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from src.api.sales_copilot import PublicTestDriveRequest, _record_test_drive
from src.integrations.sales_copilot_repository import SQLSalesCopilotRepository
from src.services.sales_agenda_service import SalesAgendaService


@pytest.fixture
def repo(tmp_path):
    return SQLSalesCopilotRepository(f"sqlite:///{tmp_path / 'bookings.db'}")


def test_public_booking_links_real_input_to_message_and_follow_up(repo):
    payload = PublicTestDriveRequest(name=" Khách kiểm thử ", phone="0900000000", model="VF 7")
    result = _record_test_drive(repo, payload)
    customer_id = result["customer_id"]
    assert repo.get_customer(customer_id)["name"] == "Khách kiểm thử"
    assert repo.get_customer_snapshot(customer_id)["interested_models"] == ["VF 7"]
    assert "VF 7" in repo.list_messages(result["conversation_id"])[0].content
    task, = repo.list_tasks_for_customer(customer_id)
    assert task["conversation_id"] == result["conversation_id"]
    assert task["location"] == "Showroom VinFast"
    notification, = repo.list_notifications("advisor-demo")
    assert notification.payload["conversation_id"] == result["conversation_id"]


def test_public_booking_retry_reuses_existing_assignment(repo):
    payload = PublicTestDriveRequest(name="Khách lặp lại", phone="0900000000", model="VF 7")
    first = _record_test_drive(repo, payload)
    second = _record_test_drive(repo, payload)
    assert second["customer_id"] == first["customer_id"]
    assert second["conversation_id"] == first["conversation_id"]
    assert len(repo.list_customers_for_advisor("advisor-demo")) == 1
    assert len(repo.list_tasks_for_customer(first["customer_id"])) == 1
    assert len(repo.list_notifications("advisor-demo")) == 1


def test_public_booking_rolls_back_every_write_when_follow_up_fails(repo, monkeypatch):
    create = SalesAgendaService.create

    def fail_after_insert(*args, **kwargs):
        create(*args, **kwargs)
        raise OperationalError(None, None, ConnectionError("Write interrupted"))

    monkeypatch.setattr(SalesAgendaService, "create", fail_after_insert)
    with pytest.raises(OperationalError):
        _record_test_drive(repo, PublicTestDriveRequest(name="Khách kiểm thử", phone="0900000000"))
    with repo.engine.connect() as connection:
        for table in (repo.customers, repo.conversations, repo.messages, repo.snapshots, repo.tasks,
                      repo.intelligence_tables["activity_details"]):
            assert connection.scalar(select(func.count()).select_from(table)) == 0


def test_public_booking_rejects_blank_name_and_phone():
    with pytest.raises(ValidationError):
        PublicTestDriveRequest(name="  ", phone="         ")


def test_public_booking_http_reports_validation_and_storage_failure(repo, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from src.api.sales_copilot import router

    app = FastAPI()
    app.state.sales_copilot_repository = repo
    app.include_router(router)
    client = TestClient(app)
    endpoint = "/sales-copilot/public/test-drive"
    assert client.post(endpoint, json={"name": " ", "phone": "0900000000"}).status_code == 422

    def unavailable(*args, **kwargs):
        raise OperationalError(None, None, ConnectionError("Write interrupted"))

    monkeypatch.setattr(repo, "add_message", unavailable)
    payload = {"name": "Khách kiểm thử", "phone": "0900000000"}
    assert client.post(endpoint, json=payload).status_code == 503
    assert repo.list_customers_for_advisor("advisor-demo") == []
