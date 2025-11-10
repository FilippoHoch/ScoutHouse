from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base
from app.models.enum_utils import sqla_enum

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.structure import Structure

    from .user import User


class EventContactTaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    NOT_APPLICABLE = "n_a"


class EventContactTaskOutcome(str, Enum):
    PENDING = "pending"
    POSITIVE = "positive"
    NEGATIVE = "negative"


class EventContactTask(Base):
    __tablename__ = "event_contact_task"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    structure_id: Mapped[int | None] = mapped_column(
        ForeignKey("structures.id", ondelete="SET NULL"), nullable=True
    )
    assigned_user: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[EventContactTaskStatus] = mapped_column(
        sqla_enum(EventContactTaskStatus, name="event_contact_task_status"),
        nullable=False,
        default=EventContactTaskStatus.TODO,
    )
    outcome: Mapped[EventContactTaskOutcome] = mapped_column(
        sqla_enum(EventContactTaskOutcome, name="event_contact_task_outcome"),
        nullable=False,
        default=EventContactTaskOutcome.PENDING,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    event: Mapped[Event] = relationship("Event", back_populates="tasks")
    structure: Mapped[Structure] = relationship("Structure")
    assigned_user_ref: Mapped[User | None] = relationship("User", foreign_keys=[assigned_user_id])

    @property
    def assigned_user_name(self) -> str | None:
        if self.assigned_user_ref is not None:
            return self.assigned_user_ref.name
        return None


__all__ = [
    "EventContactTask",
    "EventContactTaskStatus",
    "EventContactTaskOutcome",
]
