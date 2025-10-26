
from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base


class EventStructureCandidateStatus(str, Enum):
    TO_CONTACT = "to_contact"
    CONTACTING = "contacting"
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    FOLLOWUP = "followup"
    CONFIRMED = "confirmed"
    OPTION = "option"


class EventStructureCandidate(Base):
    __tablename__ = "event_structure_candidate"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    structure_id: Mapped[int] = mapped_column(
        ForeignKey("structures.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[EventStructureCandidateStatus] = mapped_column(
        SQLEnum(EventStructureCandidateStatus, name="event_candidate_status"),
        nullable=False,
        default=EventStructureCandidateStatus.TO_CONTACT,
    )
    assigned_user: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_update: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    event: Mapped["Event"] = relationship("Event", back_populates="candidates")
    structure: Mapped["Structure"] = relationship("Structure")


__all__ = ["EventStructureCandidate", "EventStructureCandidateStatus"]
