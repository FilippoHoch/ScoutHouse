from __future__ import annotations

import asyncio
import json
import re
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.db import get_db
from app.core.pubsub import event_bus
from app.core.security import decode_token
from app.deps import get_current_user, require_event_member
from app.models import (
    Contact,
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
    EventMemberCreate,
    EventMemberRead,
    EventMemberUpdate,
    EventRead,
    EventSuggestion,
    EventSummary,
    EventUpdate,
    EventWithRelations,
)
from app.services.events import is_structure_occupied, suggest_structures
from app.services.mail import (
    schedule_candidate_status_email,
    schedule_task_assigned_email,
)
from app.services.audit import record_audit

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]

SLUG_RE = re.compile(r"[^a-z0-9]+")


def _escape_ical_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace(";", "\\;")
        .replace(",", "\\,")
    )


def _format_utc_timestamp(moment: datetime | None = None) -> str:
    timestamp = moment or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    else:
        timestamp = timestamp.astimezone(timezone.utc)
    return timestamp.strftime("%Y%m%dT%H%M%SZ")


def _build_event_ical(event: Event) -> str:
    start_date = event.start_date.strftime("%Y%m%d")
    end_date_exclusive = (event.end_date + timedelta(days=1)).strftime("%Y%m%d")
    participants = event.participants or {}
    total_participants = 0
    if isinstance(participants, dict):
        total_participants = int(sum(int(value) for value in participants.values()))

    description_lines = [
        f"Branch: {event.branch.value}",
        f"Status: {event.status.value}",
        f"Partecipanti: {total_participants}",
    ]
    description = "\n".join(description_lines)

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ScoutHouse//Event//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        f"UID:event-{event.id}@scouthouse",
        f"DTSTAMP:{_format_utc_timestamp()}",
        f"DTSTART;VALUE=DATE:{start_date}",
        f"DTEND;VALUE=DATE:{end_date_exclusive}",
        f"SUMMARY:{_escape_ical_text(event.title)}",
        f"DESCRIPTION:{_escape_ical_text(description)}",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"


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


def _authenticate_access_token(db: Session, token: str) -> User:
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return user


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


def _require_event_membership(db: Session, event_id: int, user_id: str) -> EventMember:
    membership = (
        db.execute(
            select(EventMember).where(
                EventMember.event_id == event_id,
                EventMember.user_id == user_id,
            )
        )
        .scalars()
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    return membership


def _owner_count(db: Session, event_id: int, *, exclude_member_id: int | None = None) -> int:
    query = (
        select(func.count())
        .select_from(EventMember)
        .where(EventMember.event_id == event_id, EventMember.role == EventMemberRole.OWNER)
    )
    if exclude_member_id is not None:
        query = query.where(EventMember.id != exclude_member_id)
    return db.execute(query).scalar_one()


def _load_event(db: Session, event_id: int, *, with_candidates: bool = False, with_tasks: bool = False) -> Event:
    options = []
    if with_candidates:
        options.append(
            selectinload(Event.candidates).selectinload(EventStructureCandidate.structure)
        )
        options.append(
            selectinload(Event.candidates).selectinload(EventStructureCandidate.contact)
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


@router.get("/{event_id}/live", response_class=StreamingResponse)
async def stream_event_updates(
    event_id: int,
    request: Request,
    db: DbSession,
    access_token: str = Query(..., alias="access_token"),
) -> StreamingResponse:
    request.state.skip_access_log = True

    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    user = _authenticate_access_token(db, access_token)
    _require_event_membership(db, event_id, user.id)

    subscriber = event_bus.subscribe()
    keepalive_payload = {"type": "keepalive", "event_id": event_id, "payload": {}}
    keepalive_line = f"data: {json.dumps(keepalive_payload, separators=(',', ':'))}\n\n"

    async def event_stream() -> AsyncIterator[str]:
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(
                        subscriber.__anext__(), timeout=KEEPALIVE_INTERVAL_SECONDS
                    )
                except asyncio.TimeoutError:
                    yield keepalive_line
                    continue
                except StopAsyncIteration:  # pragma: no cover - defensive
                    break

                payload_event_id = message.payload.get("event_id")
                if payload_event_id != event_id:
                    continue

                envelope = {
                    "type": message.type,
                    "event_id": event_id,
                    "payload": message.payload,
                }
                yield f"data: {json.dumps(envelope, separators=(',', ':'))}\n\n"
        except asyncio.CancelledError:  # pragma: no cover - connection closed
            pass
        finally:
            with suppress(Exception):
                await subscriber.aclose()

    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)


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


def _get_structure_contact(
    db: Session,
    *,
    structure_id: int,
    contact_id: int | None,
) -> Contact | None:
    if contact_id is None:
        return None
    contact = (
        db.execute(
            select(Contact)
            .where(Contact.id == contact_id, Contact.structure_id == structure_id)
        )
        .scalars()
        .first()
    )
    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contact does not belong to this structure",
        )
    return contact


@router.post("/", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(
    event_in: EventCreate,
    db: DbSession,
    request: Request,
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

    record_audit(
        db,
        actor=current_user,
        action="event.create",
        entity_type="event",
        entity_id=event.id,
        diff={"after": EventRead.model_validate(event).model_dump()},
        request=request,
    )

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


@router.get("/{event_id}/ical")
def download_event_ical(
    event_id: int,
    db: DbSession,
    request: Request,
    membership: Annotated[EventMember, Depends(require_event_member(EventMemberRole.VIEWER))],
) -> Response:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Event not found")

    content = _build_event_ical(event)
    filename = event.slug or f"event-{event.id}"
    response = Response(content=content, media_type="text/calendar; charset=utf-8")
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}.ics"'

    record_audit(
        db,
        actor=getattr(membership, "user", None),
        action="export_event_ical",
        entity_type="event",
        entity_id=event.id,
        diff={"format": "ics"},
        request=request,
    )
    db.commit()

    return response


@router.patch("/{event_id}", response_model=EventRead)
def update_event(
    event_id: int,
    event_in: EventUpdate,
    db: DbSession,
    request: Request,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventRead:
    event = _load_event(db, event_id)
    before_snapshot = EventRead.model_validate(event).model_dump()

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
    db.flush()

    record_audit(
        db,
        actor=_.user if _ is not None else None,
        action="event.update",
        entity_type="event",
        entity_id=event.id,
        diff={
            "before": before_snapshot,
            "after": EventRead.model_validate(event).model_dump(),
        },
        request=request,
    )

    db.commit()
    db.refresh(event)
    event_bus.publish("summary_updated", {"event_id": event.id})
    return EventRead.model_validate(event)


@router.post("/{event_id}/candidates", response_model=EventCandidateRead, status_code=status.HTTP_201_CREATED)
def add_candidate(
    event_id: int,
    candidate_in: EventCandidateCreate,
    db: DbSession,
    request: Request,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventCandidateRead:
    event = _load_event(db, event_id)
    structure = _get_structure(
        db,
        structure_id=candidate_in.structure_id,
        slug=candidate_in.structure_slug,
    )

    contact = _get_structure_contact(
        db,
        structure_id=structure.id,
        contact_id=candidate_in.contact_id,
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
        contact_id=contact.id if contact else None,
    )
    if contact is not None:
        candidate.contact = contact
    db.add(candidate)
    db.flush()

    record_audit(
        db,
        actor=_.user if _ is not None else None,
        action="event.candidate.create",
        entity_type="event_candidate",
        entity_id=candidate.id,
        diff={"after": EventCandidateRead.model_validate(candidate).model_dump()},
        request=request,
    )

    db.commit()
    db.refresh(candidate)
    db.refresh(candidate, attribute_names=["contact"])
    event_bus.publish("candidate_updated", {"event_id": event.id})
    event_bus.publish("summary_updated", {"event_id": event.id})

    return EventCandidateRead.model_validate(candidate)


@router.patch("/{event_id}/candidates/{candidate_id}", response_model=EventCandidateRead)
def update_candidate(
    event_id: int,
    candidate_id: int,
    candidate_in: EventCandidateUpdate,
    db: DbSession,
    request: Request,
    background_tasks: BackgroundTasks,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventCandidateRead:
    event = _load_event(db, event_id)
    candidate = (
        db.execute(
            select(EventStructureCandidate)
            .options(
                selectinload(EventStructureCandidate.structure),
                selectinload(EventStructureCandidate.contact),
            )
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
    previous_status = candidate.status
    before_snapshot = EventCandidateRead.model_validate(candidate).model_dump()
    if "contact_id" in data:
        contact_id_value = data.pop("contact_id")
        if contact_id_value is None:
            candidate.contact_id = None
            candidate.contact = None
        else:
            contact = _get_structure_contact(
                db,
                structure_id=candidate.structure_id,
                contact_id=contact_id_value,
            )
            candidate.contact_id = contact.id
            candidate.contact = contact
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
    db.flush()

    record_audit(
        db,
        actor=_.user if _ is not None else None,
        action="event.candidate.update",
        entity_type="event_candidate",
        entity_id=candidate.id,
        diff={
            "before": before_snapshot,
            "after": EventCandidateRead.model_validate(candidate).model_dump(),
        },
        request=request,
    )

    db.commit()
    db.refresh(candidate)
    db.refresh(candidate, attribute_names=["contact"])
    status_changed = previous_status != candidate.status
    if status_changed:
        recipients: dict[str, str] = {}
        memberships = (
            db.execute(
                select(EventMember)
                .options(selectinload(EventMember.user))
                .where(EventMember.event_id == event.id)
                .where(EventMember.role == EventMemberRole.OWNER)
            )
            .scalars()
            .all()
        )
        for membership in memberships:
            user = membership.user
            if user is None or not user.is_active or not user.email:
                continue
            recipients[user.email] = user.name

        assigned_user = (
            db.get(User, candidate.assigned_user_id) if candidate.assigned_user_id else None
        )
        if assigned_user is not None and assigned_user.email and assigned_user.is_active:
            recipients.setdefault(assigned_user.email, assigned_user.name)

        if recipients:
            structure_name = (
                candidate.structure.name if candidate.structure is not None else ""
            )
            assigned_name = assigned_user.name if assigned_user is not None else None
            notes = candidate.assigned_user or None
            for email, name in recipients.items():
                schedule_candidate_status_email(
                    background_tasks,
                    recipient_email=email,
                    recipient_name=name,
                    event_id=event.id,
                    event_title=event.title,
                    structure_name=structure_name,
                    new_status=candidate.status.value,
                    notes=notes,
                    assigned_user_name=assigned_name,
                )
    event_bus.publish("candidate_updated", {"event_id": event.id})
    event_bus.publish("summary_updated", {"event_id": event.id})
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
    background_tasks: BackgroundTasks,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventContactTaskRead:
    event = _load_event(db, event_id)
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
    db.refresh(task, attribute_names=["structure"])
    assignee = db.get(User, assigned_user_id) if assigned_user_id else None
    if assignee is not None and assignee.email and assignee.is_active:
        schedule_task_assigned_email(
            background_tasks,
            recipient_email=assignee.email,
            recipient_name=assignee.name,
            event_id=event.id,
            event_title=event.title,
            event_start=str(event.start_date),
            event_end=str(event.end_date),
            structure_name=task.structure.name if task.structure is not None else None,
            notes=task.notes,
        )
    event_bus.publish("task_updated", {"event_id": event_id})
    event_bus.publish("summary_updated", {"event_id": event_id})
    return EventContactTaskRead.model_validate(task)


@router.patch("/{event_id}/tasks/{task_id}", response_model=EventContactTaskRead)
def update_task(
    event_id: int,
    task_id: int,
    task_in: EventContactTaskUpdate,
    db: DbSession,
    background_tasks: BackgroundTasks,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.COLLAB))] = None,
) -> EventContactTaskRead:
    event = _load_event(db, event_id)
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
    previous_assignee_id = task.assigned_user_id
    if "structure_id" in data and data["structure_id"] is not None:
        _get_structure(db, structure_id=data["structure_id"])
    if "assigned_user_id" in data:
        task.assigned_user_id = _ensure_member_user(db, event_id, data.pop("assigned_user_id"))

    for key, value in data.items():
        setattr(task, key, value)

    db.add(task)
    db.commit()
    db.refresh(task)
    db.refresh(task, attribute_names=["structure"])
    if task.assigned_user_id and task.assigned_user_id != previous_assignee_id:
        assignee = db.get(User, task.assigned_user_id)
        if assignee is not None and assignee.email and assignee.is_active:
            schedule_task_assigned_email(
                background_tasks,
                recipient_email=assignee.email,
                recipient_name=assignee.name,
                event_id=event.id,
                event_title=event.title,
                event_start=str(event.start_date),
                event_end=str(event.end_date),
                structure_name=task.structure.name if task.structure is not None else None,
                notes=task.notes,
            )
    event_bus.publish("task_updated", {"event_id": event_id})
    event_bus.publish("summary_updated", {"event_id": event_id})
    return EventContactTaskRead.model_validate(task)


@router.get("/{event_id}/members", response_model=list[EventMemberRead])
def list_members(
    event_id: int,
    db: DbSession,
    _: Annotated[EventMember, Depends(require_event_member(EventMemberRole.VIEWER))] = None,
) -> list[EventMemberRead]:
    _load_event(db, event_id)
    memberships = (
        db.execute(
            select(EventMember)
            .options(selectinload(EventMember.user))
            .where(EventMember.event_id == event_id)
            .order_by(EventMember.role.desc(), EventMember.id.asc())
        )
        .scalars()
        .all()
    )
    return [EventMemberRead.model_validate(item) for item in memberships]


@router.post(
    "/{event_id}/members",
    response_model=EventMemberRead,
    status_code=status.HTTP_201_CREATED,
)
def add_member(
    event_id: int,
    payload: EventMemberCreate,
    db: DbSession,
    request: Request,
    actor_membership: Annotated[
        EventMember, Depends(require_event_member(EventMemberRole.OWNER))
    ],
) -> EventMemberRead:
    event = _load_event(db, event_id)
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = (
        db.query(EventMember)
        .filter(EventMember.event_id == event.id, EventMember.user_id == user.id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already a member")

    membership = EventMember(event_id=event.id, user_id=user.id, role=payload.role)
    membership.user = user
    db.add(membership)
    db.flush()

    record_audit(
        db,
        actor=actor_membership.user,
        action="event.member.add",
        entity_type="event_member",
        entity_id=membership.id,
        diff={"after": EventMemberRead.model_validate(membership).model_dump()},
        request=request,
    )

    db.commit()
    db.refresh(membership)
    return EventMemberRead.model_validate(membership)


@router.patch("/{event_id}/members/{member_id}", response_model=EventMemberRead)
def update_member(
    event_id: int,
    member_id: int,
    payload: EventMemberUpdate,
    db: DbSession,
    request: Request,
    actor_membership: Annotated[
        EventMember, Depends(require_event_member(EventMemberRole.OWNER))
    ],
) -> EventMemberRead:
    membership = (
        db.execute(
            select(EventMember)
            .options(selectinload(EventMember.user))
            .where(EventMember.id == member_id, EventMember.event_id == event_id)
        )
        .scalars()
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if membership.role == payload.role:
        return EventMemberRead.model_validate(membership)

    if (
        membership.role == EventMemberRole.OWNER
        and payload.role != EventMemberRole.OWNER
        and _owner_count(db, event_id, exclude_member_id=member_id) == 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one owner must remain",
        )

    before_snapshot = EventMemberRead.model_validate(membership).model_dump()
    membership.role = payload.role
    db.add(membership)
    db.flush()

    record_audit(
        db,
        actor=actor_membership.user,
        action="event.member.update",
        entity_type="event_member",
        entity_id=membership.id,
        diff={
            "before": before_snapshot,
            "after": EventMemberRead.model_validate(membership).model_dump(),
        },
        request=request,
    )

    db.commit()
    db.refresh(membership)
    return EventMemberRead.model_validate(membership)


@router.delete("/{event_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member(
    event_id: int,
    member_id: int,
    db: DbSession,
    request: Request,
    actor_membership: Annotated[
        EventMember, Depends(require_event_member(EventMemberRole.OWNER))
    ],
) -> None:
    membership = (
        db.execute(
            select(EventMember)
            .options(selectinload(EventMember.user))
            .where(EventMember.id == member_id, EventMember.event_id == event_id)
        )
        .scalars()
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    if membership.role == EventMemberRole.OWNER and _owner_count(db, event_id, exclude_member_id=member_id) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one owner must remain",
        )

    before_snapshot = EventMemberRead.model_validate(membership).model_dump()
    db.delete(membership)
    db.flush()

    record_audit(
        db,
        actor=actor_membership.user,
        action="event.member.remove",
        entity_type="event_member",
        entity_id=member_id,
        diff={"before": before_snapshot},
        request=request,
    )

    db.commit()
    return None


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
KEEPALIVE_INTERVAL_SECONDS = 60
