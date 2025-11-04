from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enum_utils import sqla_enum


class AttachmentOwnerType(str, Enum):
    STRUCTURE = "structure"
    EVENT = "event"


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_type: Mapped[AttachmentOwnerType] = mapped_column(
        sqla_enum(AttachmentOwnerType, name="attachment_owner_type"), nullable=False
    )
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    creator: Mapped["User | None"] = relationship("User")


Index("ix_attachments_owner", Attachment.owner_type, Attachment.owner_id)


__all__ = ["Attachment", "AttachmentOwnerType"]
