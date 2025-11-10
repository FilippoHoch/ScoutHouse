from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from sqlalchemy.types import JSON

from app.core.db import Base
from app.models.enum_utils import sqla_enum

if TYPE_CHECKING:
    from app.models.event_candidate import EventStructureCandidate
    from app.models.event_contact_task import EventContactTask
    from app.models.user import EventMember


class EventBranch(str, Enum):
    LC = "LC"
    EG = "EG"
    RS = "RS"
    ALL = "ALL"


class EventAccommodation(str, Enum):
    INDOOR = "indoor"
    TENTS = "tents"


class EventStatus(str, Enum):
    DRAFT = "draft"
    PLANNING = "planning"
    BOOKED = "booked"
    ARCHIVED = "archived"


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    branch: Mapped[EventBranch] = mapped_column(
        sqla_enum(EventBranch, name="event_branch"), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    participants: Mapped[dict[str, int]] = mapped_column(
        JSON,
        default=lambda: {
            "lc": 0,
            "eg": 0,
            "rs": 0,
            "leaders": 0,
            "lc_kambusieri": 0,
            "eg_kambusieri": 0,
            "rs_kambusieri": 0,
            "detached_leaders": 0,
            "detached_guests": 0,
        },
        nullable=False,
    )
    budget_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[EventStatus] = mapped_column(
        sqla_enum(EventStatus, name="event_status"),
        nullable=False,
        default=EventStatus.DRAFT,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    candidates: Mapped[list[EventStructureCandidate]] = relationship(
        "EventStructureCandidate",
        back_populates="event",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    tasks: Mapped[list[EventContactTask]] = relationship(
        "EventContactTask",
        back_populates="event",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    members: Mapped[list[EventMember]] = relationship(
        "EventMember",
        back_populates="event",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    branch_segments: Mapped[list[EventBranchSegment]] = relationship(
        "EventBranchSegment",
        back_populates="event",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class EventBranchSegment(Base):
    __tablename__ = "event_branch_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    branch: Mapped[EventBranch] = mapped_column(
        sqla_enum(EventBranch, name="event_branch"),
        nullable=False,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    youth_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    leaders_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kambusieri_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    accommodation: Mapped[EventAccommodation] = mapped_column(
        sqla_enum(EventAccommodation, name="event_accommodation"),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    event: Mapped[Event] = relationship("Event", back_populates="branch_segments")


__all__ = [
    "Event",
    "EventBranch",
    "EventStatus",
    "EventAccommodation",
    "EventBranchSegment",
]
