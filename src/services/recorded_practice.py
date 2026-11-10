"""Identity-aware Practice operations, ready for the shared auth dependency.

Only backend-authenticated IDs may be passed to this service. The public
FastAPI router is intentionally not registered until auth is available.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Protocol

from pydantic import BaseModel, ConfigDict

from src.agents.roleplay.contracts import ScenarioContract
from src.agents.roleplay.scenario_loader import ScenarioSummary
from src.agents.roleplay.state import EvaluationStatus
from src.integrations.audit_repository import AuditLogListResponse
from src.models.auth import AuthenticatedUser
from src.services.audit_service import SalesAuditService
from src.services.deal_diagnostic import DealDiagnosticResult, DealDiagnosticService
from src.services.practice import (
    PracticeEvaluationUnavailableError,
    PracticeResultView,
    PracticeService,
    PracticeSessionView,
)
from src.services.practice_dashboard import build_dashboard, build_progress
from src.services.practice_records import (
    AdvisorPerformance,
    AdvisorProgress,
    AssignmentConflictError,
    AssignmentRecord,
    AttemptSummary,
    CreateAssignmentInput,
    ManagerDashboard,
    ManagerReviewDecision,
    ManagerReviewRecord,
    ManagerTodo,
    PracticeRecordsRepository,
    TeamOverview,
)
from src.services.scenario_generator import ScenarioGeneratorService


class AdvisorDirectory(Protocol):
    async def active_advisors(self) -> list[AuthenticatedUser]: ...

    async def active_advisor(self, user_id: str) -> AuthenticatedUser | None: ...


class RecordedAttemptDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempt: AttemptSummary
    session: PracticeSessionView
    ai_evaluation: PracticeResultView
    manager_review: ManagerReviewRecord | None = None


class RecordedPracticeService:
    def __init__(
        self,
        practice: PracticeService,
        records: PracticeRecordsRepository,
        advisors: AdvisorDirectory | None = None,
        audit_service: SalesAuditService | None = None,
        scenario_generator: ScenarioGeneratorService | None = None,
        deal_diagnostic: DealDiagnosticService | None = None,
    ) -> None:
        self._practice = practice
        self._records = records
        self._advisors = advisors
        self._audit = audit_service
        self._scenario_generator = scenario_generator
        self._deal_diagnostic = deal_diagnostic

    def list_scenarios(self) -> list[ScenarioSummary]:
        return self._practice.list_scenarios()

    async def start_session(
        self,
        scenario_id: str,
        advisor_id: str,
        max_turns: int | None = None,
        assignment_id: str | None = None,
    ) -> PracticeSessionView:
        if assignment_id:
            await self._records.validate_assignment(assignment_id, advisor_id, scenario_id)
        session = (
            await self._practice.start_session(scenario_id, max_turns=max_turns)
            if max_turns is not None
            else await self._practice.start_session(scenario_id)
        )
        if assignment_id:
            await self._records.register(session.session_id, session.scenario_id, advisor_id, assignment_id)
        else:
            await self._records.register(session.session_id, session.scenario_id, advisor_id)
        return session

    async def advisor_assignments(self, advisor_id: str) -> list[AssignmentRecord]:
        return await self._records.assignments(advisor_id)

    async def manager_assignments(self) -> list[AssignmentRecord]:
        return await self._records.assignments()

    async def create_assignment(self, manager_id: str, payload: CreateAssignmentInput) -> AssignmentRecord:
        if self._advisors is None or await self._advisors.active_advisor(payload.advisor_id) is None:
            raise AssignmentConflictError("Advisor does not exist or is inactive.")
        if not any(item.scenario_id == payload.scenario_id for item in self.list_scenarios()):
            raise AssignmentConflictError("Practice scenario was not found.")
        if payload.due_date and payload.due_date < datetime.now(UTC).date():
            raise AssignmentConflictError("Due date cannot be in the past.")
        record = await self._records.create_assignment(manager_id, payload)
        if self._audit:
            await self._audit.log_assignment_created(
                manager_id=manager_id,
                assignment_id=record.assignment_id,
                advisor_id=record.advisor_id,
                scenario_id=record.scenario_id,
                title=record.title,
            )
        return record

    async def advisor_performance(self) -> list[AdvisorPerformance]:
        if self._advisors is None:
            return []
        advisors = await self._advisors.active_advisors()
        persisted = await self._records.advisor_performance()
        results = []
        for advisor in advisors:
            performance = persisted.get(advisor.user_id) or AdvisorPerformance(
                advisor_id=advisor.user_id,
                display_name=advisor.display_name,
                completed_sessions=0,
                approved_sessions=0,
                scored_sessions=0,
                average_score=None,
                rank=None,
                skill_summaries=[],
                recent_scores=[],
            )
            results.append(performance.model_copy(update={"display_name": advisor.display_name}))
        eligible = sorted(
            (item for item in results if item.scored_sessions >= 3 and item.average_score is not None),
            key=lambda item: (-item.average_score, item.advisor_id),
        )
        rank_by_id: dict[str, int] = {}
        previous_score: float | None = None
        current_rank = 0
        for position, item in enumerate(eligible, start=1):
            if item.average_score != previous_score:
                current_rank = position
                previous_score = item.average_score
            rank_by_id[item.advisor_id] = current_rank
        return sorted(
            [item.model_copy(update={"rank": rank_by_id.get(item.advisor_id)}) for item in results],
            key=lambda item: (item.rank is None, item.rank or 0, item.display_name.casefold()),
        )

    async def send_message(self, session_id: str, advisor_id: str, message: str) -> PracticeSessionView:
        await self._records.owned_attempt(session_id, advisor_id)
        return await self._practice.send_message(session_id, message)

    async def retry_customer_reply(self, session_id: str, advisor_id: str) -> PracticeSessionView:
        await self._records.owned_attempt(session_id, advisor_id)
        return await self._practice.retry_customer_reply(session_id)

    async def finish_session(self, session_id: str, advisor_id: str) -> PracticeResultView:
        attempt = await self._records.owned_attempt(session_id, advisor_id)
        try:
            evaluation = await self._practice.finish_session(
                session_id,
                started_at=attempt.started_at,
                on_saved=lambda: self._records.mark_evaluation_pending(session_id),
            )
        except PracticeEvaluationUnavailableError:
            await self._records.mark_evaluation_failed(session_id)
            raise
        if evaluation.evaluation_status is EvaluationStatus.COMPLETE and evaluation.result is not None:
            await self._records.complete(session_id, evaluation.result)
        return evaluation

    async def advisor_detail(self, session_id: str, advisor_id: str) -> RecordedAttemptDetail:
        attempt = await self._records.owned_attempt(session_id, advisor_id)
        session = await self._practice.get_session(session_id)
        evaluation = await self._practice.get_result(session_id)
        review = await self._records.review_details(session_id)
        return RecordedAttemptDetail(
            attempt=attempt,
            session=session,
            ai_evaluation=evaluation,
            manager_review=review,
        )

    async def advisor_session(self, session_id: str, advisor_id: str) -> PracticeSessionView:
        await self._records.owned_attempt(session_id, advisor_id)
        return await self._practice.get_session(session_id)

    async def advisor_result(self, session_id: str, advisor_id: str) -> PracticeResultView:
        await self._records.owned_attempt(session_id, advisor_id)
        return await self._practice.get_result(session_id)

    async def history(self, advisor_id: str, scenario_id: str | None = None) -> list[AttemptSummary]:
        return await self._records.history(advisor_id, scenario_id)

    async def review_queue(self) -> list[AttemptSummary]:
        return await self._records.review_queue()

    async def manager_history(
        self, advisor_id: str | None = None, scenario_id: str | None = None, limit: int = 50, offset: int = 0
    ) -> list[AttemptSummary]:
        return await self._records.manager_history(advisor_id, scenario_id, limit, offset)

    async def manager_attempt(self, session_id: str) -> AttemptSummary:
        return await self._records.manager_attempt(session_id)

    async def team_overview(self) -> TeamOverview:
        return await self._records.team_overview()

    async def manager_detail(self, session_id: str) -> RecordedAttemptDetail:
        attempt = await self._records.manager_attempt(session_id)
        session = await self._practice.get_session(session_id)
        evaluation = await self._practice.get_result(session_id)
        review = await self._records.review_details(session_id)
        return RecordedAttemptDetail(
            attempt=attempt,
            session=session,
            ai_evaluation=evaluation,
            manager_review=review,
        )

    async def approve(self, session_id: str, manager_id: str, decision: ManagerReviewDecision) -> ManagerReviewRecord:
        record = await self._records.approve(session_id, manager_id, decision)
        if self._audit:
            if decision.score_overrides:
                await self._audit.log_score_override(
                    manager_id=manager_id,
                    session_id=session_id,
                    reason=decision.change_reason,
                    score_overrides=[so.model_dump() for so in decision.score_overrides],
                )
            else:
                await self._audit.log_review_approval(
                    manager_id=manager_id,
                    session_id=session_id,
                    reason=decision.change_reason,
                )
        return record

    async def manager_dashboard(self, weeks: int = 8, now: datetime | None = None) -> ManagerDashboard:
        now = now or datetime.now(UTC)
        advisors = await self._advisors.active_advisors() if self._advisors is not None else []
        return build_dashboard(
            advisors,
            await self._records.scored_attempts(),
            await self._records.review_queue(),
            await self._records.assignments(),
            now,
            weeks,
        )

    async def advisor_progress(self, advisor_id: str, now: datetime | None = None) -> AdvisorProgress:
        return build_progress(await self._records.scored_attempts(advisor_id), now or datetime.now(UTC))

    async def list_todos(self, manager_id: str) -> list[ManagerTodo]:
        return await self._records.list_todos(manager_id)

    async def create_todo(self, manager_id: str, text: str) -> ManagerTodo:
        return await self._records.create_todo(manager_id, text)

    async def set_todo_done(self, manager_id: str, todo_id: str, done: bool) -> ManagerTodo:
        return await self._records.set_todo_done(manager_id, todo_id, done)

    async def generate_scenario(
        self, manager_id: str, prompt: str, difficulty: str = "Medium"
    ) -> ScenarioContract:
        if self._scenario_generator is None:
            self._scenario_generator = ScenarioGeneratorService()
        scenario = await self._scenario_generator.generate(prompt, difficulty)
        if self._audit:
            await self._audit.log_scenario_generated(manager_id, prompt, scenario.scenario_id)
        return scenario

    async def create_scenario(self, manager_id: str, scenario: ScenarioContract) -> ScenarioSummary:
        summary = self._practice.register_scenario(scenario, persist=True)
        if self._audit:
            await self._audit.log_scenario_created(
                manager_id=manager_id,
                scenario_id=scenario.scenario_id,
                title=scenario.title,
                difficulty=scenario.difficulty,
            )
        return summary

    async def delete_scenario(self, manager_id: str, scenario_id: str) -> bool:
        deleted = self._practice.delete_scenario(scenario_id)
        if self._audit and deleted:
            await self._audit.log_scenario_deleted(
                manager_id=manager_id,
                scenario_id=scenario_id,
            )
        return deleted

    async def diagnose_session(
        self, session_id: str, user_id: str, *, is_manager: bool = False
    ) -> DealDiagnosticResult:
        if not is_manager:
            await self._records.owned_attempt(session_id, user_id)
        detail = await (self.manager_detail(session_id) if is_manager else self.advisor_detail(session_id, user_id))
        scenario = self._practice.get_scenario(detail.session.scenario_id)
        if self._deal_diagnostic is None:
            self._deal_diagnostic = DealDiagnosticService()
        return await self._deal_diagnostic.diagnose(
            session_id=session_id,
            scenario=scenario,
            session=detail.session,
            evaluation=detail.ai_evaluation.result if detail.ai_evaluation else None,
            attempt=detail.attempt,
        )

    async def list_audit_logs(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        action: str | None = None,
        actor_id: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> AuditLogListResponse:
        if self._audit is None:
            return AuditLogListResponse(items=[], page=page, page_size=page_size, total_items=0, total_pages=0)
        return await self._audit.list_logs(
            page=page,
            page_size=page_size,
            action=action,
            actor_id=actor_id,
            date_from=date_from,
            date_to=date_to,
        )
