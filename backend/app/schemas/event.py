from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.event import EventAccommodation, EventBranch, EventStatus
from app.models.event_candidate import EventStructureCandidateStatus
from app.models.event_contact_task import (
    EventContactTaskOutcome,
    EventContactTaskStatus,
)
from app.models.user import EventMemberRole
from .contact import ContactRead


class EventParticipants(BaseModel):
    lc: int = Field(default=0, ge=0)
    eg: int = Field(default=0, ge=0)
    rs: int = Field(default=0, ge=0)
    leaders: int = Field(default=0, ge=0)

    model_config = {
        "from_attributes": True,
    }


class EventBranchSegmentBase(BaseModel):
    branch: EventBranch
    start_date: date
    end_date: date
    youth_count: int = Field(default=0, ge=0)
    leaders_count: int = Field(default=0, ge=0)
    accommodation: EventAccommodation
    notes: str | None = None

    @model_validator(mode="after")
    def validate_branch_segment(self) -> "EventBranchSegmentBase":
        if self.end_date < self.start_date:
            raise ValueError("Segment end_date cannot be earlier than start_date")
        if self.branch == EventBranch.ALL:
            raise ValueError("Segment branch must be specific")
        return self


class EventBranchSegmentCreate(EventBranchSegmentBase):
    pass


class EventBranchSegmentRead(EventBranchSegmentBase):
    id: int

    model_config = {"from_attributes": True}


class EventBase(BaseModel):
    title: str = Field(..., min_length=1)
    branch: EventBranch
    start_date: date
    end_date: date
    participants: EventParticipants = Field(default_factory=EventParticipants)
    budget_total: Decimal | None = Field(default=None, ge=0)
    status: EventStatus = EventStatus.DRAFT
    notes: str | None = None
    branch_segments: list[EventBranchSegmentRead] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_dates(self) -> "EventBase":
        if self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class EventCreate(EventBase):
    branch_segments: list[EventBranchSegmentCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_segments(self) -> "EventCreate":
        for segment in self.branch_segments:
            if segment.start_date < self.start_date or segment.end_date > self.end_date:
                raise ValueError("Segment dates must be within event dates")
        return self


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    branch: EventBranch | None = None
    start_date: date | None = None
    end_date: date | None = None
    participants: EventParticipants | None = None
    budget_total: Decimal | None = Field(default=None, ge=0)
    status: EventStatus | None = None
    notes: str | None = None
    branch_segments: list[EventBranchSegmentCreate] | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> "EventUpdate":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date cannot be earlier than start_date")
        return self


class EventRead(EventBase):
    id: int
    slug: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
        "json_encoders": {Decimal: float},
    }


class EventCandidateStructure(BaseModel):
    id: int
    name: str
    slug: str
    province: str | None = None

    model_config = {
        "from_attributes": True,
    }


class EventCandidateCreate(BaseModel):
    structure_id: int | None = None
    structure_slug: str | None = None
    assigned_user: str | None = None
    assigned_user_id: str | None = None
    contact_id: int | None = None

    @model_validator(mode="after")
    def validate_structure(self) -> "EventCandidateCreate":
        if bool(self.structure_id) == bool(self.structure_slug):
            raise ValueError("Provide either structure_id or structure_slug")
        return self


class EventCandidateUpdate(BaseModel):
    status: EventStructureCandidateStatus | None = None
    assigned_user: str | None = None
    assigned_user_id: str | None = None
    contact_id: int | None = None


class EventCandidateRead(BaseModel):
    id: int
    event_id: int
    structure_id: int
    status: EventStructureCandidateStatus
    assigned_user: str | None
    assigned_user_id: str | None = None
    assigned_user_name: str | None = None
    contact_id: int | None = None
    contact: ContactRead | None = None
    last_update: datetime
    structure: EventCandidateStructure | None = None

    model_config = {
        "from_attributes": True,
    }


class EventContactTaskBase(BaseModel):
    structure_id: int | None = None
    assigned_user: str | None = None
    assigned_user_id: str | None = None
    status: EventContactTaskStatus = EventContactTaskStatus.TODO
    outcome: EventContactTaskOutcome = EventContactTaskOutcome.PENDING
    notes: str | None = None


class EventContactTaskCreate(EventContactTaskBase):
    pass


class EventContactTaskUpdate(BaseModel):
    structure_id: int | None = None
    assigned_user: str | None = None
    assigned_user_id: str | None = None
    status: EventContactTaskStatus | None = None
    outcome: EventContactTaskOutcome | None = None
    notes: str | None = None


class EventContactTaskRead(EventContactTaskBase):
    id: int
    event_id: int
    updated_at: datetime
    assigned_user_name: str | None = None

    model_config = {
        "from_attributes": True,
    }


class EventSummary(BaseModel):
    status_counts: dict[str, int]
    has_conflicts: bool


class EventWithRelations(EventRead):
    candidates: list[EventCandidateRead] | None = None
    tasks: list[EventContactTaskRead] | None = None


class EventMemberUser(BaseModel):
    id: str
    email: EmailStr
    name: str

    model_config = {
        "from_attributes": True,
    }


class EventMemberRead(BaseModel):
    id: int
    event_id: int
    role: EventMemberRole
    user: EventMemberUser

    model_config = {
        "from_attributes": True,
    }


class EventMemberCreate(BaseModel):
    email: EmailStr
    role: EventMemberRole


class EventMemberUpdate(BaseModel):
    role: EventMemberRole


class EventListResponse(BaseModel):
    items: list[EventRead]
    total: int
    page: int
    page_size: int


class EventSuggestion(BaseModel):
    structure_id: int
    structure_name: str
    structure_slug: str
    distance_km: float | None = None
    estimated_cost: float | None = None
    cost_band: str | None = None


__all__ = [
    "EventCreate",
    "EventUpdate",
    "EventRead",
    "EventWithRelations",
    "EventListResponse",
    "EventCandidateCreate",
    "EventCandidateUpdate",
    "EventCandidateRead",
    "EventContactTaskCreate",
    "EventContactTaskUpdate",
    "EventContactTaskRead",
    "EventSummary",
    "EventSuggestion",
    "EventMemberRead",
    "EventMemberCreate",
    "EventMemberUpdate",
]
