"""Pydantic schemas for structure photos."""

from datetime import datetime

from pydantic import AnyHttpUrl, BaseModel, Field


class StructurePhotoCreate(BaseModel):
    attachment_id: int = Field(..., gt=0)


class StructurePhotoRead(BaseModel):
    id: int
    structure_id: int
    attachment_id: int
    filename: str
    mime: str
    size: int
    position: int
    url: AnyHttpUrl
    created_at: datetime


__all__ = ["StructurePhotoCreate", "StructurePhotoRead"]

