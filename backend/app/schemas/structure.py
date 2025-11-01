from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
import re
from collections.abc import Iterable

from pydantic import AnyHttpUrl, BaseModel, Field, field_validator, model_validator

from app.models.availability import StructureSeason, StructureUnit
from app.models.cost_option import StructureCostModel
from app.models.structure import (
    FirePolicy,
    StructureOpenPeriodKind,
    StructureOpenPeriodSeason,
    StructureType,
    WaterSource,
)
from .contact import ContactRead
from app.services.costs import CostBand


SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class StructureOpenPeriodBase(BaseModel):
    kind: StructureOpenPeriodKind
    season: StructureOpenPeriodSeason | None = None
    date_start: date | None = None
    date_end: date | None = None
    notes: str | None = None
    units: list[StructureUnit] | None = None

    @model_validator(mode="after")
    def validate_period(self) -> "StructureOpenPeriodBase":
        if self.kind is StructureOpenPeriodKind.SEASON:
            if self.season is None:
                raise ValueError("Per i periodi stagionali è richiesta la stagione")
            if self.date_start is not None or self.date_end is not None:
                raise ValueError(
                    "I periodi stagionali non devono includere date di inizio o fine"
                )
        elif self.kind is StructureOpenPeriodKind.RANGE:
            if self.season is not None:
                raise ValueError(
                    "I periodi a data libera non possono avere una stagione"
                )
            if self.date_start is None or self.date_end is None:
                raise ValueError(
                    "I periodi a data libera richiedono sia data di inizio che di fine"
                )
            if self.date_start > self.date_end:
                raise ValueError("date_start non può essere successiva a date_end")
        if self.units is not None and len(self.units) == 0:
            raise ValueError("Specificare almeno una branca quando units è indicato")
        return self


class StructureOpenPeriodCreate(StructureOpenPeriodBase):
    pass


class StructureOpenPeriodUpdate(StructureOpenPeriodBase):
    id: int | None = None


class StructureOpenPeriodRead(StructureOpenPeriodBase):
    id: int

    model_config = {"from_attributes": True}


class StructureBase(BaseModel):
    name: str = Field(..., min_length=1)
    slug: str
    province: str | None = Field(default=None, max_length=2)
    address: str | None = None
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    altitude: float | None = Field(default=None)
    type: StructureType
    indoor_beds: int | None = Field(default=None, ge=0)
    indoor_bathrooms: int | None = Field(default=None, ge=0)
    indoor_showers: int | None = Field(default=None, ge=0)
    indoor_activity_rooms: int | None = Field(default=None, ge=0)
    has_kitchen: bool = False
    hot_water: bool = False
    land_area_m2: float | None = Field(default=None, ge=0)
    shelter_on_field: bool = False
    water_sources: list[WaterSource] | None = None
    electricity_available: bool = False
    fire_policy: FirePolicy | None = None
    access_by_car: bool = False
    access_by_coach: bool = False
    access_by_public_transport: bool = False
    coach_turning_area: bool = False
    nearest_bus_stop: str | None = Field(default=None, max_length=255)
    weekend_only: bool = False
    has_field_poles: bool = False
    pit_latrine_allowed: bool = False
    website_urls: list[AnyHttpUrl] = Field(default_factory=list)
    notes_logistics: str | None = None
    notes: str | None = None

    @field_validator("website_urls", mode="before")
    @classmethod
    def normalize_website_urls(cls, value: object) -> list[str] | object:
        if value is None:
            return []
        if isinstance(value, str):
            value = [value]
        if isinstance(value, Iterable):
            seen: set[str] = set()
            normalized: list[str] = []
            for item in value:
                if item in (None, ""):
                    continue
                text = str(item).strip()
                if not text:
                    continue
                if text not in seen:
                    seen.add(text)
                    normalized.append(text)
            return normalized
        return value

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

    @field_validator("altitude")
    @classmethod
    def validate_altitude(cls, value: float | None) -> float | None:
        if value is None:
            return value
        if not -500 <= value <= 9000:
            raise ValueError("Altitude must be between -500 and 9000 meters")
        return value

    @model_validator(mode="after")
    def validate_by_type(self) -> "StructureBase":
        structure_type = self.type
        indoor_fields = {
            "indoor_beds": self.indoor_beds,
            "indoor_bathrooms": self.indoor_bathrooms,
            "indoor_showers": self.indoor_showers,
            "indoor_activity_rooms": self.indoor_activity_rooms,
        }
        indoor_flags = {
            "has_kitchen": self.has_kitchen,
            "hot_water": self.hot_water,
        }
        outdoor_values = {
            "land_area_m2": self.land_area_m2,
        }
        outdoor_flags = {
            "shelter_on_field": self.shelter_on_field,
            "electricity_available": self.electricity_available,
            "fire_policy": self.fire_policy,
            "has_field_poles": self.has_field_poles,
            "pit_latrine_allowed": self.pit_latrine_allowed,
        }
        outdoor_lists = {
            "water_sources": self.water_sources,
        }

        has_indoor_data = any(
            value not in (None, 0) for value in indoor_fields.values()
        ) or any(flag is True for flag in indoor_flags.values())
        has_outdoor_data = any(
            value not in (None, 0) for value in outdoor_values.values()
        ) or any(flag not in (None, False) for flag in outdoor_flags.values()) or any(
            sequence for sequence in outdoor_lists.values() if sequence
        )

        if structure_type == StructureType.HOUSE and has_outdoor_data:
            offending: list[str] = []
            for name, value in outdoor_values.items():
                if value not in (None, 0):
                    offending.append(name)
            for name, flag in outdoor_flags.items():
                if flag not in (None, False):
                    offending.append(name)
            for name, sequence in outdoor_lists.items():
                if sequence:
                    offending.append(name)
            detail = ", ".join(sorted(offending)) if offending else "campi outdoor"
            raise ValueError(
                f"Campi outdoor non ammessi per type=house: {detail}"
            )
        if structure_type == StructureType.LAND and has_indoor_data:
            offending = [
                name
                for name, value in {**indoor_fields, **indoor_flags}.items()
                if value not in (None, False) and value != 0
            ]
            detail = ", ".join(sorted(offending)) if offending else "campi indoor"
            raise ValueError(
                f"Campi indoor non ammessi per type=land: {detail}"
            )
        return self


class StructureCreate(StructureBase):
    open_periods: list[StructureOpenPeriodCreate] = Field(default_factory=list)


class StructureUpdate(StructureBase):
    open_periods: list[StructureOpenPeriodUpdate] = Field(default_factory=list)


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
    contacts: list[ContactRead] | None = None
    open_periods: list[StructureOpenPeriodRead] | None = None
    warnings: list[str] | None = None

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
    altitude: float | None = None
    distance_km: float | None = None
    estimated_cost: float | None = None
    cost_band: CostBand | None = None
    seasons: list[StructureSeason] = Field(default_factory=list)
    units: list[StructureUnit] = Field(default_factory=list)
    fire_policy: FirePolicy | None = None
    access_by_car: bool = False
    access_by_coach: bool = False
    access_by_public_transport: bool = False
    has_kitchen: bool = False
    hot_water: bool = False

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
    "StructureOpenPeriodRead",
    "StructureOpenPeriodCreate",
    "StructureOpenPeriodUpdate",
]
