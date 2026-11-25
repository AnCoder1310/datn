"""Availability calculation over persisted schedules, leave and appointments."""
from __future__ import annotations
from datetime import UTC, datetime, timedelta
from typing import Any

def _at(day: datetime, value: str) -> datetime:
    hour, minute = (int(part) for part in value.split(':', 1))
    return day.replace(hour=hour, minute=minute, second=0, microsecond=0, tzinfo=UTC)

def availability_for_advisor(repo: Any, advisor_id: str, showroom_id: str, day: datetime, *, duration_minutes: int = 60, slot_minutes: int = 30) -> list[dict[str, str]]:
    """Return available slots from persisted working hours, leave and appointments."""
    repo.ensure_schema()
    weekday = day.weekday()
    with repo.engine.connect() as connection:
        rows = connection.execute(repo.advisor_schedules.select().where(
            repo.advisor_schedules.c.advisor_id == advisor_id,
            repo.advisor_schedules.c.showroom_id == showroom_id,
            repo.advisor_schedules.c.weekday == weekday,
            repo.advisor_schedules.c.active.is_(True),
        )).mappings().all()
    slots: list[dict[str, str]] = []
    for row in rows:
        cursor = _at(day, row['starts_at'])
        boundary = _at(day, row['ends_at'])
        while cursor + timedelta(minutes=duration_minutes) <= boundary:
            end = cursor + timedelta(minutes=duration_minutes)
            if not repo.advisor_has_leave(advisor_id, cursor, end) and not repo.advisor_has_conflict(advisor_id, cursor, end):
                slots.append({'starts_at': cursor.isoformat(), 'ends_at': end.isoformat()})
            cursor += timedelta(minutes=slot_minutes)
    return slots
