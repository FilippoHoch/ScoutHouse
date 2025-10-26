from __future__ import annotations

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.deps import get_current_user, require_event_member
from app.models import (
    Event,
    EventContactTask,
    EventMember,
    EventMemberRole,
    EventStructureCandidate,
    EventStructureCandidateStatus,
    EventStatus,
    Structure,
    User,
)
from app.schemas import (
    EventCandidateCreate,
    EventCandidateRead,
    EventCandidateUpdate,
    EventContactTaskCreate,
    EventContactTaskRead,
    EventContactTaskUpdate,
    EventCreate,
    EventListResponse,
    EventRead,
    EventSuggestion,
    EventSummary,
    EventUpdate,
    EventWithRelations,
)
from app.services.events import is_structure_occupied, suggest_structures

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]

SLUG_RE = re.compile(r"[^a-z0-9]+")
def _participants_to_dict(participants: Any) -> dict[str, int]:
    if hasattr(participants, "model_dump"):
        return participants.model_dump()  # type: ignore[no-any-return]
    if isinstance(participants, dict):
        return participants
    raise TypeError("participants must be a mapping")


def _slugify(value: str) -> str:
    slug = SLUG_RE.sub("-", value.lower()).strip("-")
    return slug or "event"


def _generate_unique_slug(db: Session, base: str) -> str:
    slug = base
    counter = 2
    while (
        db.execute(select(Event.id).where(func.lower(Event.slug) == slug.lower()))
        .scalar_one_or_none()
        is not None
    ):
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def _ensure_member_user(db: Session, event_id: int, user_id: str | None) -> str | None:
    if user_id is None:
        return None
    membership = (
        db.execute(
            select(EventMember).where(
                EventMember.event_id == event_id, EventMember.user_id == user_id
            )
        )
        .scalars()
        .first()
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not a member of the event",
        )
    return membership.user_id


def _load_event(db: Session, event_id: int, *, with_candidates: bool = False, with_tasks: bool = False) -> Event:
    options = []
    if with_candidates:
        options.append(
            selectinload(Event.candidates).selectinload(EventStructureCandidate.structure)
        )
    if with_tasks:
        options.append(selectinload(Event.tasks))
    query = select(Event).where(Event.id == event_id)
    if options:
        query = query.options(*options)
    event = db.execute(query).unique().scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


def _get_structure(db: Session, *, structure_id: int | None = None, slug: str | None = None) -> Structure:
    if structure_id is not None:
        structure = db.get(Structure, structure_id)
    else:
        structure = (
            db.execute(select(Structure).where(func.lower(Structure.slug) == slug.lower()))
            .scalar_one_or_none()
            if slug is not None
            else None
        )
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Structure not found")
    return structure


@router.post("/", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(
    event_in: EventCreate,
    db: DbSession,
    current_user: User = Depends(get_current_user),
) -> EventRead:
    base_slug = _slugify(event_in.title)
    slug = _generate_unique_slug(db, base_slug)

    data = event_in.model_dump()
    participants = data.pop("participants")
    status_value = data.pop("status", EventStatus.DRAFT)

    event = Event(slug=slug, **data)
    event.participants = _participants_to_dict(participants)
    event.status = status_value

    db.add(event)
    db.flush()

    membership = EventMember(event_id=event.id, user_id=current_user.id, role=EventMemberRole.OWNER)
    db.add(membership)

    db.commit()
    db.refresh(event)
    return EventRead.model_validate(event)


@router.get("/", response_model=EventListResponse)
def list_events(
    db: DbSession,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = Query(default=None, min_length=1),
    status_filter: EventStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
) -> EventListResponse:
    filters = []
    if q:
        like = f"%{q.lower()}%"
        filters.append(
            or_(func.lower(Event.title).like(like), func.lower(Event.slug).like(like))
        )
    if status_filter:
        filters.append(Event.status == status_filter)

    base_query = (
        select(Event)
        .join(EventMember, EventMember.event_id == Event.id)
        .where(EventMember.user_id == current_user.id)
        .distinct()
    )
    if filters:
        base_query = base_query.where(and_(*filters))

    total = db.execute(select(func.count()).select_from(base_query.subquery())).scalar_one()

    items = (
        db.execute(
            base_query.order_by(Event.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        .scalars()
        .all()
    )

    return EventListResponse(
        items=[EventRead.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{event_id}", response_model=EventWithRelations | EventRead)
def get_event(
    event_id: int,
    db: DbSession,
    include: str | None = Query(default=None),
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.VIEWER))] = None,
) -> EventWithRelations | EventRead:
    include_parts = {part.strip().lower() for part in (include.split(",") if include else [])}
    with_candidates = "candidates" in include_parts
    with_tasks = "tasks" in include_parts

    event = _load_event(db, event_id, with_candidates=with_candidates, with_tasks=with_tasks)

    if with_candidates or with_tasks:
        return EventWithRelations.model_validate(event)
    return EventRead.model_validate(event)


@router.patch("/{event_id}", response_model=EventRead)
def update_event(
    event_id: int,
    event_in: EventUpdate,
    db: DbSession,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventRead:
    event = _load_event(db, event_id)

    data = event_in.model_dump(exclude_unset=True)
    if "participants" in data and data["participants"] is not None:
        data["participants"] = _participants_to_dict(data["participants"])

    new_start = data.get("start_date", event.start_date)
    new_end = data.get("end_date", event.end_date)
    if new_end < new_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date cannot be earlier than start_date",
        )

    for key, value in data.items():
        setattr(event, key, value)

    db.add(event)
    db.commit()
    db.refresh(event)
    return EventRead.model_validate(event)


@router.post("/{event_id}/candidates", response_model=EventCandidateRead, status_code=status.HTTP_201_CREATED)
def add_candidate(
    event_id: int,
    candidate_in: EventCandidateCreate,
    db: DbSession,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventCandidateRead:
    event = _load_event(db, event_id)
    structure = _get_structure(
        db,
        structure_id=candidate_in.structure_id,
        slug=candidate_in.structure_slug,
    )

    existing = db.execute(
        select(EventStructureCandidate)
        .where(EventStructureCandidate.event_id == event.id)
        .where(EventStructureCandidate.structure_id == structure.id)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Structure already added to this event",
        )

    assigned_user_id = _ensure_member_user(db, event.id, candidate_in.assigned_user_id)

    candidate = EventStructureCandidate(
        event_id=event.id,
        structure_id=structure.id,
        assigned_user=candidate_in.assigned_user,
        assigned_user_id=assigned_user_id,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    return EventCandidateRead.model_validate(candidate)


@router.patch("/{event_id}/candidates/{candidate_id}", response_model=EventCandidateRead)
def update_candidate(
    event_id: int,
    candidate_id: int,
    candidate_in: EventCandidateUpdate,
    db: DbSession,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventCandidateRead:
    event = _load_event(db, event_id)
    candidate = (
        db.execute(
            select(EventStructureCandidate)
            .options(selectinload(EventStructureCandidate.structure))
            .where(
                EventStructureCandidate.id == candidate_id,
                EventStructureCandidate.event_id == event.id,
            )
        )
        .unique()
        .scalar_one_or_none()
    )
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    data = candidate_in.model_dump(exclude_unset=True)
    if "assigned_user_id" in data:
        candidate.assigned_user_id = _ensure_member_user(db, event.id, data.pop("assigned_user_id"))
    status_value = data.get("status")
    if status_value == EventStructureCandidateStatus.CONFIRMED:
        if is_structure_occupied(
            db,
            candidate.structure_id,
            event.start_date,
            event.end_date,
            exclude_event_id=event.id,
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Structure already confirmed for overlapping event",
            )

    for key, value in data.items():
        setattr(candidate, key, value)

    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return EventCandidateRead.model_validate(candidate)


@router.get("/{event_id}/summary", response_model=EventSummary)
def get_event_summary(
    event_id: int,
    db: DbSession,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.VIEWER))] = None,
) -> EventSummary:
    event = _load_event(db, event_id, with_candidates=True)

    counts: dict[str, int] = {status.value: 0 for status in EventStructureCandidateStatus}
    for candidate in event.candidates:
        counts[candidate.status.value] = counts.get(candidate.status.value, 0) + 1

    has_conflicts = any(
        candidate.status == EventStructureCandidateStatus.CONFIRMED
        and is_structure_occupied(
            db,
            candidate.structure_id,
            event.start_date,
            event.end_date,
            exclude_event_id=event.id,
        )
        for candidate in event.candidates
    )

    return EventSummary(status_counts=counts, has_conflicts=has_conflicts)


@router.post("/{event_id}/tasks", response_model=EventContactTaskRead, status_code=status.HTTP_201_CREATED)
def create_task(
    event_id: int,
    task_in: EventContactTaskCreate,
    db: DbSession,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventContactTaskRead:
    _ = _load_event(db, event_id)
    structure_id = task_in.structure_id
    if structure_id is not None:
        _get_structure(db, structure_id=structure_id)

    assigned_user_id = _ensure_member_user(db, event_id, task_in.assigned_user_id)

    task = EventContactTask(
        event_id=event_id,
        structure_id=structure_id,
        assigned_user=task_in.assigned_user,
        assigned_user_id=assigned_user_id,
        status=task_in.status,
        outcome=task_in.outcome,
        notes=task_in.notes,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return EventContactTaskRead.model_validate(task)


@router.patch("/{event_id}/tasks/{task_id}", response_model=EventContactTaskRead)
def update_task(
    event_id: int,
    task_id: int,
    task_in: EventContactTaskUpdate,
    db: DbSession,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventContactTaskRead:
    task = (
        db.execute(
            select(EventContactTask).where(
                EventContactTask.id == task_id,
                EventContactTask.event_id == event_id,
            )
        )
        .scalar_one_or_none()
    )
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    data = task_in.model_dump(exclude_unset=True)
    if "structure_id" in data and data["structure_id"] is not None:
        _get_structure(db, structure_id=data["structure_id"])
    if "assigned_user_id" in data:
        task.assigned_user_id = _ensure_member_user(db, event_id, data.pop("assigned_user_id"))

    for key, value in data.items():
        setattr(task, key, value)

    db.add(task)
    db.commit()
    db.refresh(task)
    return EventContactTaskRead.model_validate(task)


@router.get("/{event_id}/suggest", response_model=list[EventSuggestion])
def get_suggestions(
    event_id: int,
    db: DbSession,
    limit: int = Query(default=20, ge=1, le=50),
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.VIEWER))] = None,
) -> list[EventSuggestion]:
    event = _load_event(db, event_id)
    raw_suggestions = suggest_structures(db, event, limit=limit)

    results: list[EventSuggestion] = []
    for item in raw_suggestions:
        structure: Structure = item["structure"]
        results.append(
            EventSuggestion(
                structure_id=structure.id,
                structure_name=structure.name,
                structure_slug=structure.slug,
                distance_km=item["distance_km"],
                estimated_cost=item["estimated_cost"],
                cost_band=item["cost_band"],
            )
        )
    return results


__all__ = ["router"]
