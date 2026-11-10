"""SQL storage for Sales Audit logs (compliance and manager review tracking)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from threading import Lock
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    create_engine,
    desc,
    insert,
    select,
)
from sqlalchemy.engine import Engine

from src.integrations.practice_persistence import normalize_database_url


class AuditLogRecord(BaseModel):
    id: int
    action: str
    actor_id: str
    actor_role: str
    target_type: str
    target_id: str
    created_at: datetime
    detail: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AuditLogListResponse(BaseModel):
    items: list[AuditLogRecord]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class SQLSalesAuditRepository:
    """Thread-safe persistent audit log store for compliance and manager actions."""

    def __init__(self, database_url: str, *, engine: Engine | None = None) -> None:
        self._engine = engine or create_engine(normalize_database_url(database_url), pool_pre_ping=True)
        metadata = MetaData()
        self._table = Table(
            "sales_audit_logs",
            metadata,
            Column("id", Integer, primary_key=True, autoincrement=True),
            Column("action", String(50), nullable=False, index=True),
            Column("actor_id", String(120), nullable=False, index=True),
            Column("actor_role", String(50), nullable=False),
            Column("target_type", String(50), nullable=False),
            Column("target_id", String(120), nullable=False, index=True),
            Column("created_at", DateTime(timezone=True), nullable=False),
            Column("detail", Text, nullable=False),
            Column("metadata_json", Text, nullable=False),
        )
        self._metadata = metadata
        self._schema_ready = False
        self._schema_lock = Lock()

    def _ensure_schema(self) -> None:
        if self._schema_ready:
            return
        with self._schema_lock:
            if not self._schema_ready:
                self._metadata.create_all(self._engine)
                self._schema_ready = True

    async def log(
        self,
        action: str,
        actor_id: str,
        actor_role: str,
        target_type: str,
        target_id: str,
        detail: str,
        metadata: dict[str, Any] | None = None,
    ) -> AuditLogRecord:
        self._ensure_schema()
        now = datetime.now(UTC)
        meta_dict = metadata or {}
        meta_json = json.dumps(meta_dict, ensure_ascii=False)
        with self._engine.begin() as connection:
            result = connection.execute(
                insert(self._table).values(
                    action=action,
                    actor_id=actor_id,
                    actor_role=actor_role,
                    target_type=target_type,
                    target_id=target_id,
                    created_at=now,
                    detail=detail,
                    metadata_json=meta_json,
                )
            )
            inserted_id = result.inserted_primary_key[0] if result.inserted_primary_key else 0
        return AuditLogRecord(
            id=inserted_id,
            action=action,
            actor_id=actor_id,
            actor_role=actor_role,
            target_type=target_type,
            target_id=target_id,
            created_at=now,
            detail=detail,
            metadata=meta_dict,
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
        self._ensure_schema()
        query = select(self._table)
        if action:
            query = query.where(self._table.c.action == action)
        if actor_id:
            query = query.where(self._table.c.actor_id == actor_id)

        with self._engine.connect() as connection:
            rows = connection.execute(query.order_by(desc(self._table.c.id))).fetchall()

        items: list[AuditLogRecord] = []
        for row in rows:
            created_at = row.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=UTC)
            dt_str = created_at.strftime("%Y-%m-%d")
            if date_from and dt_str < date_from[:10]:
                continue
            if date_to and dt_str > date_to[:10]:
                continue
            try:
                meta = json.loads(row.metadata_json)
            except Exception:
                meta = {}
            items.append(
                AuditLogRecord(
                    id=row.id,
                    action=row.action,
                    actor_id=row.actor_id,
                    actor_role=row.actor_role,
                    target_type=row.target_type,
                    target_id=row.target_id,
                    created_at=created_at,
                    detail=row.detail,
                    metadata=meta,
                )
            )

        total_items = len(items)
        start = (page - 1) * page_size
        paged_items = items[start : start + page_size]
        total_pages = (total_items + page_size - 1) // page_size if page_size > 0 else 0

        return AuditLogListResponse(
            items=paged_items,
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
        )
