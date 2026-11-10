"""Tests for Sales Audit Service, Prompt-to-Scenario Generator, and Deal Diagnostic RCA."""

from datetime import UTC, datetime

import pytest

from src.agents.roleplay.contracts import ScenarioContract
from src.agents.roleplay.scenario_loader import ScenarioRepository
from src.agents.roleplay.state import RoleplayMessage, TerminationStatus
from src.integrations.audit_repository import SQLSalesAuditRepository
from src.models.evaluation import (
    CriterionEvaluation,
    CriterionStatus,
    CriterionType,
    SessionEvaluationResult,
    TranscriptEvidence,
)
from src.services.audit_service import SalesAuditService
from src.services.deal_diagnostic import (
    DealDiagnosticResult,
    DealDiagnosticService,
    RootCauseCategory,
    RootCauseSeverity,
)
from src.services.practice import PracticeSessionView
from src.services.practice_records import AttemptSummary
from src.services.scenario_generator import ScenarioGeneratorService


def _build_evaluation(session_id: str, scenario_id: str, scores: dict[CriterionType, int]) -> SessionEvaluationResult:
    evaluations = [
        CriterionEvaluation(
            criterion=criterion,
            status=CriterionStatus.ASSESSED,
            score=scores.get(criterion, 3),
            evidence=[TranscriptEvidence(message_id="msg-1", quote="Dẫn chứng hội thoại")],
            reason=f"Đánh giá tiêu chí {criterion}",
        )
        for criterion in CriterionType
    ]
    assessed_scores = [ev.score for ev in evaluations if ev.score is not None]
    overall_score = sum(assessed_scores) / len(assessed_scores)
    return SessionEvaluationResult(
        session_id=session_id,
        scenario_id=scenario_id,
        rubric_version="sales-rubric-v4",
        assessed_criteria_count=len(assessed_scores),
        overall_score=overall_score,
        evaluations=evaluations,
    )


@pytest.mark.asyncio
async def test_audit_repository_and_service(tmp_path):
    db_file = tmp_path / "test_audit.db"
    db_url = f"sqlite:///{db_file}"
    repo = SQLSalesAuditRepository(db_url)
    service = SalesAuditService(repo)

    # 1. Log Score Override
    rec1 = await service.log_score_override(
        manager_id="mgr-1",
        session_id="session-100",
        reason="Tư vấn viên nắm rõ chính sách thực tế hơn AI nhận định",
        score_overrides=[{"criterion": "policy_accuracy", "score": 3}],
    )
    assert rec1.id > 0
    assert rec1.action == "SCORE_OVERRIDE"
    assert rec1.actor_id == "mgr-1"
    assert rec1.target_id == "session-100"

    # 2. Log Review Approval
    rec2 = await service.log_review_approval(
        manager_id="mgr-1",
        session_id="session-101",
        reason="Đạt chuẩn quy trình VinFast",
    )
    assert rec2.action == "REVIEW_APPROVED"

    # 3. Log Assignment Created
    rec3 = await service.log_assignment_created(
        manager_id="mgr-1",
        assignment_id="assign-50",
        advisor_id="adv-99",
        scenario_id="SCENARIO_01_VF5_TAXI",
        title="Luyện tư vấn bác tài taxi",
    )
    assert rec3.action == "ASSIGNMENT_CREATED"

    # 4. Query Audit Logs
    logs_all = await service.list_logs(page=1, page_size=10)
    assert logs_all.total_items == 3
    assert len(logs_all.items) == 3

    # 5. Filter by Action
    logs_override = await service.list_logs(action="SCORE_OVERRIDE")
    assert logs_override.total_items == 1
    assert logs_override.items[0].target_id == "session-100"


@pytest.mark.asyncio
async def test_scenario_generator_service():
    generator = ScenarioGeneratorService()

    # Generate VF 3 scenario
    vf3_scenario = await generator.generate(
        prompt="Khách hàng nữ trẻ văn phòng 27 tuổi muốn mua VF 3 chạy phố thay xe máy điện",
        difficulty="Medium",
    )
    assert isinstance(vf3_scenario, ScenarioContract)
    assert "VF 3" in vf3_scenario.acceptable_outcomes[0].product or "VF 3" in vf3_scenario.title
    assert len(vf3_scenario.disclosure_rules) > 0
    assert len(vf3_scenario.objections) > 0
    assert len(vf3_scenario.policy_expectations) > 0

    # Generate VF 7 scenario
    vf7_scenario = await generator.generate(
        prompt="Gia đình trẻ muốn nâng cấp từ Cerato sang VF 7",
        difficulty="Hard",
    )
    assert isinstance(vf7_scenario, ScenarioContract)
    assert vf7_scenario.difficulty == "Hard"

    # Test repository registration
    repo = ScenarioRepository()
    summary = repo.register(vf3_scenario, persist=False)
    assert summary.scenario_id == vf3_scenario.scenario_id
    assert repo.get(vf3_scenario.scenario_id).scenario_id == vf3_scenario.scenario_id


@pytest.mark.asyncio
async def test_deal_diagnostic_lost_deal_policy_inaccuracy():
    service = DealDiagnosticService()
    generator = ScenarioGeneratorService()
    scenario = generator.generate_offline_template("VF 5 taxi")

    session = PracticeSessionView(
        session_id="test-session-diag-1",
        scenario_id=scenario.scenario_id,
        difficulty="Medium",
        conversation_stage="closing",
        turn_count=4,
        max_turns=10,
        visible_context=scenario.visible_context,
        termination_status=TerminationStatus.ACTIVE,
        messages=[
            RoleplayMessage(role="advisor", content="Chào anh, em là tư vấn viên VinFast."),
            RoleplayMessage(role="customer", content="Anh đang chạy Vios muốn đổi sang VF 5 mà sợ tiền sạc đắt hơn tiền xăng."),
            RoleplayMessage(role="advisor", content="Tiền sạc chỉ có 100 nghìn một tháng thôi anh, rẻ lắm cứ mua đi."),
            RoleplayMessage(role="customer", content="Em nói thế nào chứ anh chạy 5.000 km một tháng sao sạc 100 nghìn được?"),
        ],
    )

    evaluation = _build_evaluation(
        session_id="test-session-diag-1",
        scenario_id=scenario.scenario_id,
        scores={
            CriterionType.POLICY_ACCURACY: 1,
            CriterionType.OBJECTION_HANDLING: 1,
            CriterionType.NEED_DISCOVERY: 2,
            CriterionType.PRODUCT_KNOWLEDGE: 2,
            CriterionType.CLOSING_NEXT_STEP: 1,
        },
    )

    attempt = AttemptSummary(
        session_id="test-session-diag-1",
        scenario_id=scenario.scenario_id,
        advisor_id="advisor-1",
        started_at=datetime.now(UTC),
        ai_score=1.4,
    )

    diag: DealDiagnosticResult = await service.diagnose(
        session_id="test-session-diag-1",
        scenario=scenario,
        session=session,
        evaluation=evaluation,
        attempt=attempt,
    )

    assert diag.deal_status == "LOST"
    assert diag.severity == RootCauseSeverity.HIGH
    assert diag.root_cause_category == RootCauseCategory.POLICY_INACCURACY
    assert diag.critical_turn is not None
    assert len(diag.remediation_advice) > 0
    assert len(diag.recommended_script) > 0
    assert "VinFast" in diag.recommended_script or "chính sách" in diag.recommended_script


@pytest.mark.asyncio
async def test_deal_diagnostic_won_deal():
    service = DealDiagnosticService()
    generator = ScenarioGeneratorService()
    scenario = generator.generate_offline_template("VF 3")

    session = PracticeSessionView(
        session_id="test-session-diag-2",
        scenario_id=scenario.scenario_id,
        difficulty="Medium",
        conversation_stage="closing",
        turn_count=4,
        max_turns=10,
        visible_context=scenario.visible_context,
        termination_status=TerminationStatus.ACTIVE,
        messages=[
            RoleplayMessage(role="advisor", content="Chào chị Linh, chị đang quan tâm mẫu xe điện VF 3 đúng không ạ?"),
            RoleplayMessage(role="customer", content="Đúng rồi em, chị ở chung cư sợ không có chỗ cắm sạc."),
            RoleplayMessage(role="advisor", content="Dạ chị yên tâm, quanh khu chung cư chị có 2 trạm sạc nhanh V-Green và xe đi làm cả tuần mới cần sạc một lần ạ."),
            RoleplayMessage(role="customer", content="Thế thì tiện quá em, cho chị đăng ký lái thử thứ Bảy này nhé."),
        ],
    )

    evaluation = _build_evaluation(
        session_id="test-session-diag-2",
        scenario_id=scenario.scenario_id,
        scores={
            CriterionType.NEED_DISCOVERY: 3,
            CriterionType.PRODUCT_KNOWLEDGE: 3,
            CriterionType.OBJECTION_HANDLING: 3,
            CriterionType.POLICY_ACCURACY: 3,
            CriterionType.CLOSING_NEXT_STEP: 3,
        },
    )

    diag: DealDiagnosticResult = await service.diagnose(
        session_id="test-session-diag-2",
        scenario=scenario,
        session=session,
        evaluation=evaluation,
    )

    assert diag.deal_status == "WON"
    assert diag.severity == RootCauseSeverity.LOW
