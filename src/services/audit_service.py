"""Sales Audit Service for recording and querying managerial compliance events."""

from __future__ import annotations

from typing import Any

from src.integrations.audit_repository import (
    AuditLogListResponse,
    AuditLogRecord,
    SQLSalesAuditRepository,
)


class SalesAuditService:
    """Orchestrates audit trail generation for manager reviews, assignments, and scenarios."""

    def __init__(self, repository: SQLSalesAuditRepository) -> None:
        self._repo = repository

    async def log_score_override(
        self,
        manager_id: str,
        session_id: str,
        reason: str,
        score_overrides: list[dict[str, Any]],
    ) -> AuditLogRecord:
        return await self._repo.log(
            action="SCORE_OVERRIDE",
            actor_id=manager_id,
            actor_role="manager",
            target_type="session",
            target_id=session_id,
            detail=f"Quản lý điều chỉnh điểm AI chấm cho phiên {session_id}: {reason}",
            metadata={"reason": reason, "overrides": score_overrides},
        )

    async def log_review_approval(
        self,
        manager_id: str,
        session_id: str,
        reason: str,
    ) -> AuditLogRecord:
        return await self._repo.log(
            action="REVIEW_APPROVED",
            actor_id=manager_id,
            actor_role="manager",
            target_type="session",
            target_id=session_id,
            detail=f"Quản lý duyệt kết quả đánh giá cho phiên {session_id}",
            metadata={"reason": reason},
        )

    async def log_assignment_created(
        self,
        manager_id: str,
        assignment_id: str,
        advisor_id: str,
        scenario_id: str,
        title: str,
    ) -> AuditLogRecord:
        return await self._repo.log(
            action="ASSIGNMENT_CREATED",
            actor_id=manager_id,
            actor_role="manager",
            target_type="assignment",
            target_id=assignment_id,
            detail=f"Quản lý giao bài tập '{title}' cho tư vấn viên {advisor_id}",
            metadata={"advisor_id": advisor_id, "scenario_id": scenario_id, "title": title},
        )

    async def log_scenario_created(
        self,
        manager_id: str,
        scenario_id: str,
        title: str,
        difficulty: str,
    ) -> AuditLogRecord:
        return await self._repo.log(
            action="SCENARIO_CREATED",
            actor_id=manager_id,
            actor_role="manager",
            target_type="scenario",
            target_id=scenario_id,
            detail=f"Quản lý tạo mới kịch bản luyện tập VinFast '{title}' ({difficulty})",
            metadata={"scenario_id": scenario_id, "title": title, "difficulty": difficulty},
        )

    async def log_scenario_generated(
        self,
        manager_id: str,
        prompt: str,
        scenario_id: str,
    ) -> AuditLogRecord:
        return await self._repo.log(
            action="SCENARIO_GENERATED",
            actor_id=manager_id,
            actor_role="manager",
            target_type="scenario",
            target_id=scenario_id,
            detail=f"Hệ thống AI tự động sinh kịch bản '{scenario_id}' từ yêu cầu của quản lý",
            metadata={"prompt": prompt, "scenario_id": scenario_id},
        )

    async def log_scenario_deleted(
        self,
        manager_id: str,
        scenario_id: str,
    ) -> AuditLogRecord:
        return await self._repo.log(
            action="SCENARIO_DELETED",
            actor_id=manager_id,
            actor_role="manager",
            target_type="scenario",
            target_id=scenario_id,
            detail=f"Quản lý xóa kịch bản tùy chỉnh '{scenario_id}'",
            metadata={"scenario_id": scenario_id},
        )

    async def list_logs(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        action: str | None = None,
        actor_id: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> AuditLogListResponse:
        return await self._repo.list_logs(
            page=page,
            page_size=page_size,
            action=action,
            actor_id=actor_id,
            date_from=date_from,
            date_to=date_to,
        )
