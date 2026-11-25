"""Draft requests use confirmed facts and fail closed without demo replies."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr

from src.config import get_settings
from src.integrations.sales_copilot_repository import SQLSalesCopilotRepository
from src.models.customer_intelligence import DraftAnswer
from src.services.customer_pii import CustomerPII
from src.services.sales_conversation_service import SalesConversationService
from src.services.sales_copilot_assistant import SalesCopilotAssistant


@pytest.fixture
def conversation(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "sales_pii_key", SecretStr(Fernet.generate_key().decode()))
    monkeypatch.setattr(get_settings(), "sales_intelligence_v2_enabled", True)
    repo = SQLSalesCopilotRepository(f"sqlite:///{tmp_path / 'draft.db'}")
    customer = repo.create_customer(name="Draft test", advisor_id="sales")
    conv = repo.get_or_create_conversation(customer)
    repo.add_message(conv, "customer", "Tôi muốn tư vấn VF 6. SĐT: 0912345678")
    yield repo, customer, conv
    repo.engine.dispose()


@pytest.mark.asyncio
async def test_request_draft_uses_confirmed_profile_and_original_cursor(conversation, monkeypatch):
    repo, customer, conv = conversation
    repo.save_profile_override(conv, "budget_vnd", 500000000, "sales")
    retrieval = SimpleNamespace(retrieve=lambda query, **_: [])
    monkeypatch.setattr("src.services.sales_copilot_assistant.get_retrieval_service", lambda: retrieval)
    seen = []

    async def ask(self, system, payload, schema):
        assert schema is DraftAnswer
        seen.append(payload)
        assert payload["profile"] == {"budget_vnd": 500000000}
        repo.add_message(conv, "customer", "Tin mới trong lúc tạo nháp")
        return DraftAnswer(text="Em sẽ kiểm tra thông tin để tư vấn anh/chị.")

    monkeypatch.setattr(CustomerPII, "ask", ask)
    response = await SalesCopilotAssistant(repo).generate_message_draft(conv, "sales")
    assert len(seen) == 1
    assert response.based_on_message_seq == 1
    assert response.status == "generated"
    assert repo.get_latest_recommendation(conv, "draft")["text"] == response.text
    assert len(repo.list_messages(conv)) == 2  # Draft was not sent.


@pytest.mark.asyncio
async def test_draft_retrieval_receives_masked_query_and_failure_saves_nothing(conversation, monkeypatch):
    repo, _, conv = conversation
    queries = []

    def retrieve(query, **kwargs):
        queries.append(query)
        raise RuntimeError("Unavailable")

    monkeypatch.setattr(
        "src.services.sales_copilot_assistant.get_retrieval_service", lambda: SimpleNamespace(retrieve=retrieve)
    )
    model = AsyncMock()
    monkeypatch.setattr(CustomerPII, "ask", model)
    with pytest.raises(RuntimeError):
        await SalesCopilotAssistant(repo).generate_message_draft(conv, "sales")
    assert queries and "0912345678" not in queries[0]
    assert "[SDT_1]" in queries[0]
    model.assert_not_called()
    assert repo.get_latest_recommendation(conv, "draft") is None


@pytest.mark.asyncio
async def test_draft_authorization_before_any_model_call(conversation, monkeypatch):
    repo, _, conv = conversation
    model = AsyncMock()
    monkeypatch.setattr(CustomerPII, "ask", model)
    with pytest.raises(LookupError):
        await SalesCopilotAssistant(repo).generate_message_draft(conv, "other")
    model.assert_not_called()


@pytest.mark.asyncio
async def test_request_uses_full_current_customer_turn_and_ignores_system_messages(conversation, monkeypatch):
    repo, _, conv = conversation
    repo.save_profile_override(conv, "interested_models", ["VF 6"], "sales")
    repo.add_message(conv, "sales", "Dạ chị đang quan tâm bản Eco hay Plus ạ?")
    questions = ["Tôi muốn hỏi về VF 7 Plus.", "Màu trắng còn xe không em?"]
    repo.add_message(conv, "customer", questions[0])
    repo.add_message(conv, "system", "Đã cập nhật hồ sơ.")
    repo.add_message(conv, "customer", questions[1])
    for _ in range(12):
        repo.add_message(conv, "system", "Thông báo hệ thống.")
    retrieval = Mock(return_value=[])
    monkeypatch.setattr(
        "src.services.sales_copilot_assistant.get_retrieval_service", lambda: SimpleNamespace(retrieve=retrieval)
    )

    async def ask(self, system, payload, schema):
        assert payload["customer_turn"] == questions
        assert payload["sales_style"]["customer_address"] == "chị"
        assert all(message["sender_role"] != "system" for message in payload["messages"])
        return DraftAnswer(text="Dạ em kiểm tra tồn kho màu trắng của bản VF 7 Plus rồi báo lại chị ạ.")

    monkeypatch.setattr(CustomerPII, "ask", ask)
    response = await SalesCopilotAssistant(repo).generate_message_draft(conv, "sales")
    assert response.reply_version == 2
    assert response.context_trigger == "\n".join(questions)
    assert response.based_on_message_seq == 17
    assert SalesConversationService(repo).get_conversation_details(conv, message_limit=1).last_human_sender_role == "customer"
    retrieval.assert_called_once_with("\n".join(questions), top_k=5)


@pytest.mark.asyncio
async def test_already_answered_customer_does_not_trigger_retrieval(conversation, monkeypatch):
    repo, _, conv = conversation
    repo.add_message(conv, "sales", "Dạ em sẽ kiểm tra rồi báo lại ạ.")
    repo.add_message(conv, "system", "Đã cập nhật hồ sơ.")
    retrieval = Mock()
    monkeypatch.setattr("src.services.sales_copilot_assistant.get_retrieval_service", retrieval)
    with pytest.raises(ValueError, match="Chưa có tin nhắn mới từ khách hàng"):
        await SalesCopilotAssistant(repo).generate_message_draft(conv, "sales")
    retrieval.assert_not_called()


@pytest.mark.asyncio
async def test_model_failure_preserves_existing_draft(conversation, monkeypatch):
    repo, _, conv = conversation
    old = {"text": "Bản nháp trước đó", "based_on_message_seq": 1}
    repo.save_recommendation_or_draft(conv, "draft", old)
    retrieval = SimpleNamespace(retrieve=lambda query, **_: [])
    monkeypatch.setattr("src.services.sales_copilot_assistant.get_retrieval_service", lambda: retrieval)
    monkeypatch.setattr(CustomerPII, "ask", AsyncMock(side_effect=ValueError("Không thể xử lý dữ liệu khách lúc này.")))
    with pytest.raises(ValueError, match="Không thể xử lý dữ liệu khách lúc này"):
        await SalesCopilotAssistant(repo).generate_message_draft(conv, "sales")
    assert repo.get_latest_recommendation(conv, "draft") == old
