from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enum_utils import sqla_enum

if TYPE_CHECKING:  # pragma: no cover - circular imports handled at runtime
    from app.models.attachment import Attachment
    from app.models.structure import Structure


class StructureAttachmentKind(str, Enum):
    MAP_RESOURCE = "map_resource"
    REQUIRED_DOCUMENT = "required_document"


class StructureAttachment(Base):
    __tablename__ = "structure_attachments"
    __table_args__ = (UniqueConstraint("structure_id", "attachment_id", name="uq_structure_attachment"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    structure_id: Mapped[int] = mapped_column(Integer, ForeignKey("structures.id", ondelete="CASCADE"))
    attachment_id: Mapped[int] = mapped_column(Integer, ForeignKey("attachments.id", ondelete="CASCADE"))
    kind: Mapped[StructureAttachmentKind] = mapped_column(
        sqla_enum(StructureAttachmentKind, name="structure_attachment_kind"), nullable=False
    )

    structure: Mapped[Structure] = relationship("Structure", back_populates="categorized_attachments")
    attachment: Mapped[Attachment] = relationship("Attachment")


__all__ = ["StructureAttachment", "StructureAttachmentKind"]
