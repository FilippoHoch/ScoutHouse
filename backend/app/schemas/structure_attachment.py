from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.structure_attachment import StructureAttachmentKind
from app.schemas.attachment import AttachmentRead


class StructureAttachmentCreate(BaseModel):
    attachment_id: int = Field(gt=0)
    kind: StructureAttachmentKind


class StructureAttachmentRead(BaseModel):
    id: int
    kind: StructureAttachmentKind
    attachment: AttachmentRead

    model_config = {"from_attributes": True}


__all__ = ["StructureAttachmentCreate", "StructureAttachmentRead"]
