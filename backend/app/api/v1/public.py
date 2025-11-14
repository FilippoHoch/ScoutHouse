from collections.abc import Mapping
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models import Event, EventStatus, Structure
from app.schemas import LandingEventSample, LandingSnapshot, LandingStructureSample

router = APIRouter(prefix="/public", tags=["public"])

DbSession = Annotated[Session, Depends(get_db)]


def _sum_participants(participants: Mapping[str, Any] | None) -> int:
    if not isinstance(participants, Mapping):
        return 0
    total = 0
    for value in participants.values():
        try:
            count = int(value)
        except (TypeError, ValueError):
            continue
        if count > 0:
            total += count
    return total


@router.get("/landing", response_model=LandingSnapshot)
def landing_snapshot(db: DbSession) -> LandingSnapshot:
    structures_total = int(
        db.scalar(select(func.count()).select_from(Structure)) or 0
    )
    provinces_total = int(
        db.scalar(
            select(func.count(func.distinct(Structure.province))).where(
                Structure.province.is_not(None)
            )
        )
        or 0
    )
    beds_total = int(
        db.scalar(select(func.coalesce(func.sum(Structure.indoor_beds), 0))) or 0
    )

    structure_rows = (
        db.execute(
            select(Structure).order_by(Structure.created_at.desc()).limit(3)
        )
        .scalars()
        .all()
    )
    structures = [
        LandingStructureSample(
            name=item.name,
            slug=item.slug,
            province=item.province,
            indoor_beds=item.indoor_beds,
        )
        for item in structure_rows
    ]

    active_events = Event.status != EventStatus.ARCHIVED
    events_total = int(
        db.scalar(select(func.count()).select_from(Event).where(active_events)) or 0
    )
    participant_rows = db.execute(
        select(Event.participants).where(active_events)
    ).all()
    participants_total = sum(_sum_participants(row[0]) for row in participant_rows)

    event_rows = (
        db.execute(
            select(Event)
            .where(active_events)
            .order_by(Event.start_date.asc(), Event.id.asc())
            .limit(3)
        )
        .scalars()
        .all()
    )
    events = [
        LandingEventSample(
            id=item.id,
            title=item.title,
            status=item.status,
            start_date=item.start_date,
            end_date=item.end_date,
            participants_total=_sum_participants(item.participants),
        )
        for item in event_rows
    ]

    return LandingSnapshot(
        structures_total=structures_total,
        provinces_total=provinces_total,
        beds_total=beds_total,
        events_total=events_total,
        participants_total=participants_total,
        structures=structures,
        events=events,
    )


__all__ = ["router"]
