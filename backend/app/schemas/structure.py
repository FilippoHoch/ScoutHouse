from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
import re

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.availability import StructureSeason, StructureUnit
from app.models.cost_option import StructureCostModel
from app.models.structure import StructureType
from app.services.costs import CostBand


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


class StructureAvailabilityBase(BaseModel):
    season: StructureSeason
    units: list[StructureUnit] = Field(default_factory=list)
    capacity_min: int | None = Field(default=None, ge=0)
    capacity_max: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_units_and_capacity(self) -> "StructureAvailabilityBase":
        if not self.units:
            raise ValueError("At least one unit must be provided")
        if self.capacity_min is not None and self.capacity_max is not None:
            if self.capacity_min > self.capacity_max:
                raise ValueError("capacity_min cannot exceed capacity_max")
        return self


class StructureAvailabilityCreate(StructureAvailabilityBase):
    pass


class StructureAvailabilityUpdate(StructureAvailabilityBase):
    id: int | None = None


class StructureAvailabilityRead(StructureAvailabilityBase):
    id: int

    model_config = {
        "from_attributes": True,
    }


class StructureCostOptionBase(BaseModel):
    model: StructureCostModel
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    deposit: Decimal | None = Field(default=None, ge=0)
    city_tax_per_night: Decimal | None = Field(default=None, ge=0)
    utilities_flat: Decimal | None = Field(default=None, ge=0)
    age_rules: dict[str, Any] | None = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        if len(value) != 3 or not value.isalpha():
            raise ValueError("Currency must be a 3-letter ISO code")
        return value.upper()


class StructureCostOptionCreate(StructureCostOptionBase):
    pass


class StructureCostOptionUpdate(StructureCostOptionBase):
    id: int | None = None


class StructureCostOptionRead(StructureCostOptionBase):
    id: int

    model_config = {
        "from_attributes": True,
        "json_encoders": {Decimal: float},
    }


class StructureRead(StructureBase):
    id: int
    created_at: datetime
    estimated_cost: Decimal | None = None
    cost_band: CostBand | None = None
    availabilities: list[StructureAvailabilityRead] | None = None
    cost_options: list[StructureCostOptionRead] | None = None

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
    estimated_cost: float | None = None
    cost_band: CostBand | None = None
    seasons: list[StructureSeason] = Field(default_factory=list)
    units: list[StructureUnit] = Field(default_factory=list)

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
    "StructureAvailabilityRead",
    "StructureAvailabilityCreate",
    "StructureAvailabilityUpdate",
    "StructureCostOptionRead",
    "StructureCostOptionCreate",
    "StructureCostOptionUpdate",
]
