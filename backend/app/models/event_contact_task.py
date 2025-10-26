from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base


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
    status: Mapped[EventContactTaskStatus] = mapped_column(
        SQLEnum(EventContactTaskStatus, name="event_contact_task_status"),
        nullable=False,
        default=EventContactTaskStatus.TODO,
    )
    outcome: Mapped[EventContactTaskOutcome] = mapped_column(
        SQLEnum(EventContactTaskOutcome, name="event_contact_task_outcome"),
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

    event: Mapped["Event"] = relationship("Event", back_populates="tasks")
    structure: Mapped["Structure"] = relationship("Structure")


__all__ = [
    "EventContactTask",
    "EventContactTaskStatus",
    "EventContactTaskOutcome",
]
