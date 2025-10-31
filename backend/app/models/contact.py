from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
    Index,
)
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
    first_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    structures: Mapped[list["StructureContact"]] = relationship(
        "StructureContact",
        back_populates="contact",
        cascade="all, delete-orphan",
    )
    candidates: Mapped[list["EventStructureCandidate"]] = relationship(
        "EventStructureCandidate",
        back_populates="contact",
    )

    @property
    def display_name(self) -> str:
        parts = [
            part.strip()
            for part in (self.first_name or "", self.last_name or "")
            if part and part.strip()
        ]
        if parts:
            return " ".join(parts)
        if self.email:
            return self.email
        if self.phone:
            return self.phone
        return "Contatto"


class StructureContact(Base):
    __tablename__ = "structure_contacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    structure_id: Mapped[int] = mapped_column(
        ForeignKey("structures.id", ondelete="CASCADE"),
        nullable=False,
    )
    contact_id: Mapped[int] = mapped_column(
        ForeignKey("contacts.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_channel: Mapped[ContactPreferredChannel] = mapped_column(
        SQLEnum(ContactPreferredChannel, name="contact_preferred_channel"),
        nullable=False,
        default=ContactPreferredChannel.EMAIL,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    gdpr_consent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
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
    contact: Mapped["Contact"] = relationship("Contact", back_populates="structures")

    @property
    def name(self) -> str:
        return self.contact.display_name

    @property
    def email(self) -> str | None:
        return self.contact.email

    @property
    def phone(self) -> str | None:
        return self.contact.phone

    @property
    def notes(self) -> str | None:
        return self.contact.notes

    @property
    def first_name(self) -> str | None:
        return self.contact.first_name

    @property
    def last_name(self) -> str | None:
        return self.contact.last_name


Index(
    "idx_structure_contacts_structure",
    StructureContact.structure_id,
)
Index(
    "idx_structure_contacts_contact",
    StructureContact.contact_id,
)
Index(
    "idx_contacts_email",
    Contact.email,
    postgresql_where=Contact.email.isnot(None),
    sqlite_where=Contact.email.isnot(None),
)
Index(
    "uix_structure_contacts_primary",
    StructureContact.structure_id,
    unique=True,
    postgresql_where=StructureContact.is_primary.is_(True),
    sqlite_where=StructureContact.is_primary.is_(True),
)

StructureContact.__table__.append_constraint(
    UniqueConstraint(
        "structure_id",
        "contact_id",
        name="uix_structure_contact_unique",
    )
)


__all__ = ["Contact", "StructureContact", "ContactPreferredChannel"]
