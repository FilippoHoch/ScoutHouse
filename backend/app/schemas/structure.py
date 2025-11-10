from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from app.models.availability import StructureSeason, StructureUnit
from app.models.cost_option import (
    StructureCostModel,
    StructureCostModifierKind,
)
from app.models.structure import (
    AnimalPolicy,
    CellCoverageQuality,
    FieldSlope,
    FirePolicy,
    FloodRiskLevel,
    RiverSwimmingOption,
    StructureContactStatus,
    StructureOpenPeriodKind,
    StructureOpenPeriodSeason,
    StructureOperationalStatus,
    StructureType,
    StructureUsageRecommendation,
    WastewaterType,
    WaterSource,
)
from app.services.costs import CostBand

from .contact import ContactRead

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PLUS_CODE_PATTERN = re.compile(r"^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}$")
WHAT3WORDS_PATTERN = re.compile(r"^[a-z]+(?:[-a-z]+)?\.[a-z]+(?:[-a-z]+)?\.[a-z]+(?:[-a-z]+)?$")
IBAN_PATTERN = re.compile(r"^[A-Z0-9]{15,34}$")


def _normalize_str_list(value: object) -> list[str] | object:
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        normalized: list[str] = []
        for item in value:
            if item is None:
                continue
            text = str(item).strip()
            if not text:
                continue
            normalized.append(text)
        return normalized
    return value


def _normalize_optional_str_list(value: object) -> list[str] | None | object:
    if value is None:
        return None
    normalized = _normalize_str_list(value)
    if isinstance(normalized, list):
        return normalized
    return normalized


def _normalize_url_list(value: object) -> list[AnyHttpUrl] | object:
    if value is None:
        return []
    if isinstance(value, (str, AnyHttpUrl)):
        value = [value]
    if isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        return list(value)
    return value


def _validate_emergency_coordinates(value: object) -> dict[str, float] | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        parts = {
            part.split(":", 1)[0].strip(): part.split(":", 1)[1].strip()
            for part in value.split(",")
            if ":" in part
        }
        value = parts
    if not isinstance(value, dict):
        raise ValueError("Coordinate di emergenza non valide")
    try:
        lat = float(value["lat"])
        lon = float(value["lon"])
    except (KeyError, TypeError, ValueError) as exc:  # pragma: no cover - defensive
        raise ValueError("Coordinate di emergenza non valide") from exc
    if not -90 <= lat <= 90:
        raise ValueError("Latitudine emergenza fuori intervallo")
    if not -180 <= lon <= 180:
        raise ValueError("Longitudine emergenza fuori intervallo")
    return {"lat": lat, "lon": lon}


def _validate_iban(value: str) -> str:
    normalized = value.replace(" ", "").upper()
    if not IBAN_PATTERN.match(normalized):
        raise ValueError("Formato IBAN non valido")
    rearranged = normalized[4:] + normalized[:4]
    digits = "".join(str(int(ch, 36)) for ch in rearranged)
    if int(digits) % 97 != 1:
        raise ValueError("IBAN non valido")
    return normalized


class StructureOpenPeriodBase(BaseModel):
    kind: StructureOpenPeriodKind
    season: StructureOpenPeriodSeason | None = None
    date_start: date | None = None
    date_end: date | None = None
    notes: str | None = None
    units: list[StructureUnit] | None = None
    blackout: bool = False

    @model_validator(mode="after")
    def validate_period(self) -> StructureOpenPeriodBase:
        if self.kind is StructureOpenPeriodKind.SEASON:
            if self.season is None:
                raise ValueError("Per i periodi stagionali è richiesta la stagione")
            if self.date_start is not None or self.date_end is not None:
                raise ValueError("I periodi stagionali non devono includere date di inizio o fine")
        elif self.kind is StructureOpenPeriodKind.RANGE:
            if self.season is not None:
                raise ValueError("I periodi a data libera non possono avere una stagione")
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
    country: str = Field(default="IT", min_length=2, max_length=2)
    province: str | None = Field(default=None, max_length=2)
    municipality: str | None = Field(default=None, max_length=255)
    municipality_code: str | None = Field(default=None, max_length=16)
    locality: str | None = Field(default=None, max_length=255)
    postal_code: str | None = Field(default=None, max_length=16)
    address: str | None = None
    latitude: float | None = Field(default=None)
    longitude: float | None = Field(default=None)
    altitude: float | None = Field(default=None)
    plus_code: str | None = None
    what3words: str | None = None
    emergency_coordinates: dict[str, float] | None = None
    winter_access_notes: str | None = None
    road_weight_limit_tonnes: float | None = Field(default=None, ge=0)
    bridge_weight_limit_tonnes: float | None = Field(default=None, ge=0)
    max_vehicle_height_m: float | None = Field(default=None, ge=0)
    road_access_notes: str | None = None
    type: StructureType
    indoor_beds: int | None = Field(default=None, ge=0)
    indoor_bathrooms: int | None = Field(default=None, ge=0)
    indoor_showers: int | None = Field(default=None, ge=0)
    indoor_activity_rooms: int | None = Field(default=None, ge=0)
    indoor_rooms: list[dict[str, Any]] | None = None
    has_kitchen: bool | None = None
    hot_water: bool | None = None
    land_area_m2: float | None = Field(default=None, ge=0)
    field_slope: FieldSlope | None = None
    pitches_tende: int | None = Field(default=None, ge=0)
    water_at_field: bool | None = None
    shelter_on_field: bool | None = None
    water_sources: list[WaterSource] | None = None
    electricity_available: bool | None = None
    power_capacity_kw: float | None = Field(default=None, ge=0)
    power_outlets_count: int | None = Field(default=None, ge=0)
    power_outlet_types: list[str] | None = None
    generator_available: bool | None = None
    generator_notes: str | None = None
    water_tank_capacity_liters: int | None = Field(default=None, ge=0)
    wastewater_type: WastewaterType | None = None
    wastewater_notes: str | None = None
    fire_policy: FirePolicy | None = None
    fire_rules: str | None = None
    access_by_car: bool | None = None
    access_by_coach: bool | None = None
    access_by_public_transport: bool | None = None
    coach_turning_area: bool | None = None
    nearest_bus_stop: str | None = Field(default=None, max_length=255)
    bus_type_access: list[str] | None = None
    weekend_only: bool | None = None
    has_field_poles: bool | None = None
    pit_latrine_allowed: bool | None = None
    dry_toilet: bool | None = None
    outdoor_bathrooms: int | None = Field(default=None, ge=0)
    outdoor_showers: int | None = Field(default=None, ge=0)
    wheelchair_accessible: bool | None = None
    step_free_access: bool | None = None
    parking_car_slots: int | None = Field(default=None, ge=0)
    parking_bus_slots: int | None = Field(default=None, ge=0)
    parking_notes: str | None = None
    accessibility_notes: str | None = None
    allowed_audiences: list[str] | None = None
    usage_recommendation: StructureUsageRecommendation | None = None
    usage_rules: str | None = None
    animal_policy: AnimalPolicy | None = None
    animal_policy_notes: str | None = None
    in_area_protetta: bool | None = None
    ente_area_protetta: str | None = Field(default=None, max_length=255)
    environmental_notes: str | None = None
    seasonal_amenities: dict[str, Any] | None = None
    booking_url: AnyHttpUrl | None = None
    whatsapp: str | None = Field(default=None, max_length=32)
    booking_required: bool | None = None
    booking_notes: str | None = None
    documents_required: list[str] = Field(default_factory=list)
    map_resources_urls: list[AnyHttpUrl] = Field(default_factory=list)
    event_rules_url: AnyHttpUrl | None = None
    event_rules_notes: str | None = None
    contact_status: StructureContactStatus = StructureContactStatus.UNKNOWN
    operational_status: StructureOperationalStatus | None = None
    cell_coverage: CellCoverageQuality | None = None
    cell_coverage_notes: str | None = None
    communications_infrastructure: list[str] = Field(default_factory=list)
    aed_on_site: bool | None = None
    emergency_phone_available: bool | None = None
    emergency_response_time_minutes: int | None = Field(default=None, ge=0)
    emergency_plan_notes: str | None = None
    evacuation_plan_url: AnyHttpUrl | None = None
    risk_assessment_template_url: AnyHttpUrl | None = None
    wildlife_notes: str | None = None
    river_swimming: RiverSwimmingOption | None = None
    flood_risk: FloodRiskLevel | None = None
    weather_risk_notes: str | None = None
    activity_spaces: list[str] = Field(default_factory=list)
    activity_equipment: list[str] = Field(default_factory=list)
    inclusion_services: list[str] = Field(default_factory=list)
    inclusion_notes: str | None = None
    pec_email: EmailStr | None = None
    sdi_recipient_code: str | None = Field(default=None, min_length=7, max_length=7)
    invoice_available: bool | None = None
    iban: str | None = None
    payment_methods: list[str] = Field(default_factory=list)
    fiscal_notes: str | None = None
    data_source: str | None = Field(default=None, max_length=255)
    data_source_url: AnyHttpUrl | None = None
    data_last_verified: date | None = None
    data_quality_score: int | None = Field(default=None, ge=0, le=100)
    data_quality_notes: str | None = None
    data_quality_flags: list[str] = Field(default_factory=list)
    governance_notes: str | None = None
    contact_emails: list[EmailStr] = Field(default_factory=list)
    website_urls: list[AnyHttpUrl] = Field(default_factory=list)
    notes_logistics: str | None = None
    logistics_arrival_notes: str | None = None
    logistics_departure_notes: str | None = None
    notes: str | None = None

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, value: Any) -> StructureType:
        if isinstance(value, StructureType):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            try:
                return StructureType(normalized)
            except ValueError as exc:
                allowed_values = [member.value for member in StructureType]
                raise ValueError(
                    f"Invalid structure type. Allowed values: {allowed_values}"
                ) from exc
        allowed_values = [member.value for member in StructureType]
        raise ValueError(f"Invalid structure type. Allowed values: {allowed_values}")

    @field_validator("contact_emails", mode="before")
    @classmethod
    def normalize_contact_emails(cls, value: object) -> list[str] | object:
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
                lowered = text.lower()
                if lowered in seen:
                    continue
                seen.add(lowered)
                normalized.append(text)
            return normalized
        return value

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

    @field_validator("country")
    @classmethod
    def validate_country(cls, value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) != 2 or not normalized.isalpha():
            raise ValueError("Country must be a 2-letter ISO code")
        return normalized

    @field_validator("plus_code")
    @classmethod
    def validate_plus_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if not PLUS_CODE_PATTERN.match(normalized):
            raise ValueError("Plus code non valido")
        return normalized

    @field_validator("what3words")
    @classmethod
    def validate_what3words(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        if not WHAT3WORDS_PATTERN.match(normalized):
            raise ValueError("what3words deve essere nel formato parola.parola.parola")
        return normalized

    @field_validator("emergency_coordinates", mode="before")
    @classmethod
    def normalize_emergency_coordinates(cls, value: object) -> dict[str, float] | None:
        return _validate_emergency_coordinates(value)

    @field_validator("power_outlet_types", mode="before")
    @classmethod
    def normalize_power_outlet_types(cls, value: object) -> list[str] | None | object:
        return _normalize_optional_str_list(value)

    @field_validator(
        "documents_required",
        "communications_infrastructure",
        "activity_spaces",
        "activity_equipment",
        "inclusion_services",
        "payment_methods",
        "data_quality_flags",
        mode="before",
    )
    @classmethod
    def normalize_string_lists(cls, value: object) -> list[str] | object:
        return _normalize_str_list(value)

    @field_validator("map_resources_urls", mode="before")
    @classmethod
    def normalize_map_urls(cls, value: object) -> list[AnyHttpUrl] | object:
        return _normalize_url_list(value)

    @field_validator("sdi_recipient_code")
    @classmethod
    def validate_sdi(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if len(normalized) != 7 or not normalized.isalnum():
            raise ValueError("Il codice SDI deve essere di 7 caratteri alfanumerici")
        return normalized

    @field_validator("iban")
    @classmethod
    def validate_iban(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _validate_iban(value)

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

    @field_validator("municipality")
    @classmethod
    def normalize_municipality(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("municipality_code")
    @classmethod
    def normalize_municipality_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        return normalized or None

    @field_validator("postal_code")
    @classmethod
    def normalize_postal_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        return normalized or None

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
    def validate_by_type(self) -> StructureBase:
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
        indoor_payload = self.indoor_rooms
        outdoor_values = {
            "land_area_m2": self.land_area_m2,
            "pitches_tende": self.pitches_tende,
        }
        outdoor_flags = {
            "shelter_on_field": self.shelter_on_field,
            "electricity_available": self.electricity_available,
            "fire_policy": self.fire_policy,
            "has_field_poles": self.has_field_poles,
            "pit_latrine_allowed": self.pit_latrine_allowed,
            "water_at_field": self.water_at_field,
        }
        outdoor_lists = {
            "water_sources": self.water_sources,
            "bus_type_access": self.bus_type_access,
            "allowed_audiences": self.allowed_audiences,
        }

        has_indoor_data = (
            any(value not in (None, 0) for value in indoor_fields.values())
            or any(flag is True for flag in indoor_flags.values())
            or bool(indoor_payload)
        )
        has_outdoor_data = (
            any(value not in (None, 0) for value in outdoor_values.values())
            or any(flag not in (None, False) for flag in outdoor_flags.values())
            or any(sequence for sequence in outdoor_lists.values() if sequence)
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
            raise ValueError(f"Campi outdoor non ammessi per type=house: {detail}")
        if structure_type == StructureType.LAND and has_indoor_data:
            offending = [
                name
                for name, value in {**indoor_fields, **indoor_flags}.items()
                if value not in (None, False) and value != 0
            ]
            detail = ", ".join(sorted(offending)) if offending else "campi indoor"
            raise ValueError(f"Campi indoor non ammessi per type=land: {detail}")
        if self.generator_available:
            if self.power_capacity_kw is None:
                raise ValueError(
                    "Specificare la potenza disponibile (power_capacity_kw) quando "
                    "generator_available è attivo"
                )
        if self.dry_toilet:
            if self.pit_latrine_allowed is not True:
                raise ValueError("Quando dry_toilet è attivo, pit_latrine_allowed deve essere true")
        if self.river_swimming is RiverSwimmingOption.SI:
            if not (self.wildlife_notes or self.risk_assessment_template_url):
                raise ValueError(
                    "Per river_swimming=si indicare wildlife_notes o risk_assessment_template_url"
                )
        if self.invoice_available and self.country == "IT":
            if not (self.sdi_recipient_code or self.pec_email):
                raise ValueError("Per le fatture in Italia indicare sdi_recipient_code o pec_email")
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
    def validate_units_and_capacity(self) -> StructureAvailabilityBase:
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


class StructureCostModifierBase(BaseModel):
    kind: StructureCostModifierKind
    amount: Decimal = Field(..., gt=0)
    season: StructureSeason | None = None
    date_start: date | None = None
    date_end: date | None = None
    price_per_resource: dict[str, Decimal] | None = None

    @model_validator(mode="after")
    def validate_modifier(self) -> StructureCostModifierBase:
        if self.kind is StructureCostModifierKind.SEASON:
            if self.season is None:
                raise ValueError("Per i prezzi stagionali è richiesta la stagione")
            if self.date_start is not None or self.date_end is not None:
                raise ValueError("I prezzi stagionali non possono avere date specifiche")
        elif self.kind is StructureCostModifierKind.DATE_RANGE:
            if self.season is not None:
                raise ValueError("I prezzi per periodo specifico non possono avere una stagione")
            if self.date_start is None or self.date_end is None:
                raise ValueError("I prezzi per periodo specifico richiedono date di inizio e fine")
            if self.date_start > self.date_end:
                raise ValueError("date_start non può essere successiva a date_end")
        elif self.kind is StructureCostModifierKind.WEEKEND:
            if any(value is not None for value in (self.season, self.date_start, self.date_end)):
                raise ValueError("I prezzi per il weekend non possono avere stagione o date")
        return self


class StructureCostModifierCreate(StructureCostModifierBase):
    pass


class StructureCostModifierUpdate(StructureCostModifierBase):
    id: int | None = None


class StructureCostModifierRead(StructureCostModifierBase):
    id: int

    model_config = {
        "from_attributes": True,
        "json_encoders": {Decimal: float},
    }


class StructureCostOptionBase(BaseModel):
    model: StructureCostModel
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    booking_deposit: Decimal | None = Field(default=None, ge=0)
    damage_deposit: Decimal | None = Field(default=None, ge=0)
    city_tax_per_night: Decimal | None = Field(default=None, ge=0)
    utilities_flat: Decimal | None = Field(default=None, ge=0)
    utilities_included: bool | None = None
    utilities_notes: str | None = None
    min_total: Decimal | None = Field(default=None, ge=0)
    max_total: Decimal | None = Field(default=None, ge=0)
    age_rules: dict[str, Any] | None = None
    payment_methods: list[str] | None = None
    payment_terms: str | None = None
    price_per_resource: dict[str, Decimal] | None = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        if len(value) != 3 or not value.isalpha():
            raise ValueError("Currency must be a 3-letter ISO code")
        return value.upper()

    @model_validator(mode="after")
    def validate_totals(self) -> StructureCostOptionBase:
        if self.min_total is not None and self.max_total is not None:
            if self.min_total > self.max_total:
                raise ValueError("min_total non può essere maggiore di max_total")
        return self


class StructureCostOptionCreate(StructureCostOptionBase):
    modifiers: list[StructureCostModifierCreate] | None = None


class StructureCostOptionUpdate(StructureCostOptionBase):
    id: int | None = None
    modifiers: list[StructureCostModifierUpdate] | None = None


class StructureCostOptionRead(StructureCostOptionBase):
    id: int
    modifiers: list[StructureCostModifierRead] | None = None

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
    postal_code: str | None = None
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
    access_by_car: bool | None = None
    access_by_coach: bool | None = None
    access_by_public_transport: bool | None = None
    has_kitchen: bool | None = None
    hot_water: bool | None = None
    cell_coverage: CellCoverageQuality | None = None
    aed_on_site: bool | None = None
    river_swimming: RiverSwimmingOption | None = None
    wastewater_type: WastewaterType | None = None
    flood_risk: FloodRiskLevel | None = None
    power_capacity_kw: float | None = None
    parking_car_slots: int | None = None
    usage_recommendation: StructureUsageRecommendation | None = None

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
    "StructureCostModifierRead",
    "StructureCostModifierCreate",
    "StructureCostModifierUpdate",
    "StructureOpenPeriodRead",
    "StructureOpenPeriodCreate",
    "StructureOpenPeriodUpdate",
]
