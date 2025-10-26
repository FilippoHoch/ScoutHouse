from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import re

from pydantic import BaseModel, Field, field_validator

from app.models.structure import StructureType


SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class StructureBase(BaseModel):
    name: str = Field(..., min_length=1)
    slug: str
    province: str | None = Field(default=None, max_length=2)
    address: str | None = None
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    type: StructureType

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        if not SLUG_PATTERN.match(value):
            raise ValueError("Slug must be lowercase alphanumeric with hyphens")
        return value

    @field_validator("province")
    @classmethod
    def validate_province(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if len(value) != 2 or not value.isalpha():
            raise ValueError("Province must be exactly two alphabetic characters")
        return value.upper()

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if not -90 <= value <= 90:
            raise ValueError("Latitude must be between -90 and 90 degrees")
        return value

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if not -180 <= value <= 180:
            raise ValueError("Longitude must be between -180 and 180 degrees")
        return value


class StructureCreate(StructureBase):
    pass


class StructureUpdate(StructureBase):
    pass


class StructureRead(StructureBase):
    id: int
    created_at: datetime

    model_config = {
        "from_attributes": True,
        "json_encoders": {Decimal: float},
    }


class StructureSearchItem(BaseModel):
    id: int
    slug: str
    name: str
    province: str | None = None
    type: StructureType
    address: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    distance_km: float | None = None

    model_config = {
        "from_attributes": True,
        "json_encoders": {Decimal: float},
    }


class StructureSearchResponse(BaseModel):
    items: list[StructureSearchItem]
    page: int
    page_size: int
    total: int
    sort: str
    order: str
    base_coords: dict[str, float]


__all__ = [
    "StructureBase",
    "StructureCreate",
    "StructureUpdate",
    "StructureRead",
    "StructureSearchItem",
    "StructureSearchResponse",
]
