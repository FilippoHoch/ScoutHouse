from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, ForeignKey, Integer, Text, func, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:  # pragma: no cover
    from .structure import Structure
    from .event_candidate import EventStructureCandidate


class ContactPreferredChannel(str, Enum):
    EMAIL = "email"
    PHONE = "phone"
    OTHER = "other"


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    structure_id: Mapped[int] = mapped_column(
        ForeignKey("structures.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_channel: Mapped[ContactPreferredChannel] = mapped_column(
        SQLEnum(ContactPreferredChannel, name="contact_preferred_channel"),
        nullable=False,
        default=ContactPreferredChannel.EMAIL,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    gdpr_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    structure: Mapped["Structure"] = relationship("Structure", back_populates="contacts")
    candidates: Mapped[list["EventStructureCandidate"]] = relationship(
        "EventStructureCandidate",
        back_populates="contact",
    )


Index("idx_contacts_structure", Contact.structure_id)
Index(
    "idx_contacts_email",
    Contact.email,
    postgresql_where=Contact.email.isnot(None),
    sqlite_where=Contact.email.isnot(None),
)
Index(
    "uix_contacts_primary_per_structure",
    Contact.structure_id,
    unique=True,
    postgresql_where=Contact.is_primary.is_(True),
    sqlite_where=Contact.is_primary.is_(True),
)


__all__ = ["Contact", "ContactPreferredChannel"]
