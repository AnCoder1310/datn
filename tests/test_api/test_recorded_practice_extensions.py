"""Tests for newly added management endpoints: Prompt-to-Scenario, Deal Diagnostic, and Audit Logs."""

import httpx
import pytest
from fastapi import FastAPI, Header, HTTPException

from src.agents.roleplay.scenario_loader import ScenarioRepository
from src.agents.roleplay.state import RoleplayMessage, TerminationStatus
from src.api.practice_errors import PracticeAPIError, practice_exception_handler
from src.api.recorded_practice import create_recorded_practice_routers
from src.integrations.audit_repository import SQLSalesAuditRepository
from src.integrations.practice_records import SQLPracticeRecordsRepository
from src.models.auth import AuthenticatedUser, UserRole
from src.models.evaluation import (
    CriterionEvaluation,
    CriterionStatus,
    CriterionType,
    SessionEvaluationResult,
    TranscriptEvidence,
)
from src.services.audit_service import SalesAuditService
from src.services.deal_diagnostic import DealDiagnosticService
from src.services.practice import PracticeResultView, PracticeSessionView
from src.services.recorded_practice import RecordedPracticeService
from src.services.scenario_generator import ScenarioGeneratorService


async def fake_identity(x_test_identity: str | None = Header(None)) -> AuthenticatedUser:
    if not x_test_identity:
        raise HTTPException(status_code=401, detail="Authentication required.")
    user_id, role = x_test_identity.split(":", 1)
    return AuthenticatedUser(
        user_id=user_id,
        username=f"{user_id}.test",
        display_name=user_id,
        role=UserRole(role),
    )


class StubPracticeWithScenarioRepo:
    def __init__(self, custom_path=None):
        self._scenarios = ScenarioRepository(custom_dataset_path=custom_path)
        self.sessions: dict[str, PracticeSessionView] = {}

    def list_scenarios(self):
        return self._scenarios.list_public()

    def get_scenario(self, scenario_id: str):
        return self._scenarios.get(scenario_id)

    def register_scenario(self, scenario, persist: bool = False):
        return self._scenarios.register(scenario, persist=persist)

    def delete_scenario(self, scenario_id: str):
        return self._scenarios.delete_custom(scenario_id)

    async def start_session(self, scenario_id: str, max_turns: int | None = None):
        session_id = f"sess-{len(self.sessions) + 1}"
        session = PracticeSessionView(
            session_id=session_id,
            scenario_id=scenario_id,
            difficulty="Medium",
            conversation_stage="opening",
            turn_count=1,
            max_turns=max_turns or 10,
            visible_context="Test context",
            termination_status=TerminationStatus.ACTIVE,
            messages=[RoleplayMessage(role="advisor", content="Xin chào")],
        )
        self.sessions[session_id] = session
        return session

    async def get_session(self, session_id: str):
        return self.sessions[session_id]

    async def get_result(self, session_id: str):
        evaluations = [
            CriterionEvaluation(
                criterion=crit,
                status=CriterionStatus.ASSESSED,
                score=3,
                evidence=[TranscriptEvidence(message_id="m1", quote="Quote")],
                reason="Tốt",
            )
            for crit in CriterionType
        ]
        res = SessionEvaluationResult(
            session_id=session_id,
            scenario_id=self.sessions[session_id].scenario_id,
            rubric_version="sales-rubric-v4",
            assessed_criteria_count=5,
            overall_score=3.0,
            evaluations=evaluations,
        )
        return PracticeResultView(session_id=session_id, evaluation_status="complete", result=res)


@pytest.mark.asyncio
async def test_management_extensions_flow(tmp_path):
    records = SQLPracticeRecordsRepository(f"sqlite:///{tmp_path / 'records.db'}")
    audit_repo = SQLSalesAuditRepository(f"sqlite:///{tmp_path / 'audit.db'}")
    audit_service = SalesAuditService(audit_repo)
    practice = StubPracticeWithScenarioRepo(tmp_path / "custom.json")

    service = RecordedPracticeService(
        practice=practice,
        records=records,
        audit_service=audit_service,
        scenario_generator=ScenarioGeneratorService(),
        deal_diagnostic=DealDiagnosticService(),
    )

    practice_router, manager_router = create_recorded_practice_routers(service, fake_identity)
    app = FastAPI()
    app.add_exception_handler(PracticeAPIError, practice_exception_handler)
    app.include_router(practice_router, prefix="/api/v1")
    app.include_router(manager_router, prefix="/api/v1")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Advisor tries to generate scenario -> 403 Forbidden
        adv_gen = await client.post(
            "/api/v1/manager/scenarios/generate",
            headers={"X-Test-Identity": "adv-1:advisor"},
            json={"prompt": "Khách muốn mua VF 3", "difficulty": "Medium"},
        )
        assert adv_gen.status_code == 403

        # 2. Manager generates scenario -> 200 OK
        mgr_gen = await client.post(
            "/api/v1/manager/scenarios/generate",
            headers={"X-Test-Identity": "mgr-1:manager"},
            json={"prompt": "Khách nữ 27 tuổi muốn mua VF 3 chạy phố thay xe máy điện", "difficulty": "Medium"},
        )
        assert mgr_gen.status_code == 200
        scenario_data = mgr_gen.json()
        assert "VF 3" in scenario_data["title"] or "VF 3" in scenario_data["scenario_id"]

        # 3. Manager registers the new scenario -> 201 Created
        create_res = await client.post(
            "/api/v1/manager/scenarios",
            headers={"X-Test-Identity": "mgr-1:manager"},
            json=scenario_data,
        )
        assert create_res.status_code == 201
        registered_summary = create_res.json()
        assert registered_summary["scenario_id"] == scenario_data["scenario_id"]

        # 4. Check scenarios list includes the newly registered scenario
        scenarios_res = await client.get(
            "/api/v1/practice/scenarios",
            headers={"X-Test-Identity": "adv-1:advisor"},
        )
        assert scenarios_res.status_code == 200
        scenario_ids = [s["scenario_id"] for s in scenarios_res.json()]
        assert scenario_data["scenario_id"] in scenario_ids

        # 5. Start a session with the new scenario and complete it
        start_res = await client.post(
            "/api/v1/practice/sessions",
            headers={"X-Test-Identity": "adv-1:advisor"},
            json={"scenario_id": scenario_data["scenario_id"]},
        )
        assert start_res.status_code == 201
        session_id = start_res.json()["session_id"]

        eval_result = (await practice.get_result(session_id)).result
        await records.complete(session_id, eval_result)

        # 6. Advisor views diagnostic for own session
        diag_res = await client.get(
            f"/api/v1/practice/{session_id}/diagnostic",
            headers={"X-Test-Identity": "adv-1:advisor"},
        )
        assert diag_res.status_code == 200
        diag_data = diag_res.json()
        assert diag_data["deal_status"] in {"WON", "RISK", "LOST"}
        assert len(diag_data["remediation_advice"]) > 0

        # Another advisor cannot view someone else's diagnostic -> 404
        diag_adv2 = await client.get(
            f"/api/v1/practice/{session_id}/diagnostic",
            headers={"X-Test-Identity": "adv-2:advisor"},
        )
        assert diag_adv2.status_code == 404

        # Manager can view diagnostic -> 200 OK
        mgr_diag = await client.get(
            f"/api/v1/manager/reviews/{session_id}/diagnostic",
            headers={"X-Test-Identity": "mgr-1:manager"},
        )
        assert mgr_diag.status_code == 200

        # 7. Manager views audit logs
        audit_res = await client.get(
            "/api/v1/manager/audit-logs",
            headers={"X-Test-Identity": "mgr-1:manager"},
        )
        assert audit_res.status_code == 200
        logs = audit_res.json()["items"]
        actions = [log["action"] for log in logs]
        assert "SCENARIO_GENERATED" in actions
        assert "SCENARIO_CREATED" in actions

        # 8. Manager deletes the custom scenario -> 200 OK
        del_res = await client.delete(
            f"/api/v1/manager/scenarios/{scenario_data['scenario_id']}",
            headers={"X-Test-Identity": "mgr-1:manager"},
        )
        assert del_res.status_code == 200
        assert del_res.json()["status"] == "deleted"

        # Check scenario is no longer in list
        scenarios_after = await client.get(
            "/api/v1/practice/scenarios",
            headers={"X-Test-Identity": "adv-1:advisor"},
        )
        assert scenario_data["scenario_id"] not in [s["scenario_id"] for s in scenarios_after.json()]
