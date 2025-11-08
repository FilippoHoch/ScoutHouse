from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import JSON

from app.core.db import Base
from app.models.availability import StructureSeasonAvailability
from app.models.cost_option import StructureCostOption
from app.models.contact import Contact, StructureContact
from app.models.enum_utils import sqla_enum

if TYPE_CHECKING:  # pragma: no cover
    from .structure_photo import StructurePhoto


class StructureType(str, Enum):
    HOUSE = "house"
    LAND = "land"
    MIXED = "mixed"

    @classmethod
    def _missing_(
        cls, value: object
    ) -> "StructureType | None":  # pragma: no cover - exercised via Pydantic
        """Allow case-insensitive matching for backwards compatibility with legacy payloads."""

        if isinstance(value, str):
            normalized = value.strip().lower()
            for member in cls:
                if member.value == normalized:
                    return member
        return None


class FirePolicy(str, Enum):
    ALLOWED = "allowed"
    WITH_PERMIT = "with_permit"
    FORBIDDEN = "forbidden"


class StructureOperationalStatus(str, Enum):
    OPERATIONAL = "operational"
    SEASONAL = "seasonal"
    TEMPORARILY_CLOSED = "temporarily_closed"
    PERMANENTLY_CLOSED = "permanently_closed"


class StructureContactStatus(str, Enum):
    UNKNOWN = "unknown"
    TO_CONTACT = "to_contact"
    CONTACTED = "contacted"
    CONFIRMED = "confirmed"
    STALE = "stale"


class WaterSource(str, Enum):
    NONE = "none"
    TAP = "tap"
    RIVER = "river"
    LAKE = "lake"
    FIELD_SHOWER = "field_shower"
    UNKNOWN = "unknown"


class AnimalPolicy(str, Enum):
    ALLOWED = "allowed"
    ALLOWED_ON_REQUEST = "allowed_on_request"
    FORBIDDEN = "forbidden"


class FieldSlope(str, Enum):
    FLAT = "flat"
    GENTLE = "gentle"
    MODERATE = "moderate"
    STEEP = "steep"


class StructureOpenPeriodKind(str, Enum):
    SEASON = "season"
    RANGE = "range"


class StructureOpenPeriodSeason(str, Enum):
    SPRING = "spring"
    SUMMER = "summer"
    AUTUMN = "autumn"
    WINTER = "winter"


class CellCoverageQuality(str, Enum):
    NONE = "none"
    LIMITED = "limited"
    GOOD = "good"
    EXCELLENT = "excellent"


class WastewaterType(str, Enum):
    NONE = "none"
    SEPTIC = "septic"
    HOLDING_TANK = "holding_tank"
    MAINS = "mains"
    UNKNOWN = "unknown"


class FloodRiskLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class RiverSwimmingOption(str, Enum):
    SI = "si"
    NO = "no"
    UNKNOWN = "unknown"


class Structure(Base):
    __tablename__ = "structures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="IT")
    province: Mapped[str] = mapped_column(String(100), nullable=True)
    municipality: Mapped[str | None] = mapped_column(String(255), nullable=True)
    municipality_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    locality: Mapped[str | None] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    altitude: Mapped[Decimal | None] = mapped_column(Numeric(7, 2), nullable=True)
    plus_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    what3words: Mapped[str | None] = mapped_column(String(64), nullable=True)
    emergency_coordinates: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    winter_access_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    road_weight_limit_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    bridge_weight_limit_tonnes: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    max_vehicle_height_m: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    road_access_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[StructureType] = mapped_column(
        sqla_enum(StructureType, name="structure_type"),
        nullable=False,
    )
    indoor_beds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    indoor_bathrooms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    indoor_showers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    indoor_activity_rooms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    indoor_rooms: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    has_kitchen: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    hot_water: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    land_area_m2: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    field_slope: Mapped[FieldSlope | None] = mapped_column(
        sqla_enum(FieldSlope, name="structure_field_slope"),
        nullable=True,
    )
    pitches_tende: Mapped[int | None] = mapped_column(Integer, nullable=True)
    water_at_field: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    shelter_on_field: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    water_sources: Mapped[list[WaterSource] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    electricity_available: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    power_capacity_kw: Mapped[Decimal | None] = mapped_column(Numeric(7, 2), nullable=True)
    power_outlets_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    power_outlet_types: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    generator_available: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    generator_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    water_tank_capacity_liters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wastewater_type: Mapped[WastewaterType | None] = mapped_column(
        sqla_enum(WastewaterType, name="structure_wastewater_type"),
        nullable=True,
    )
    wastewater_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    fire_policy: Mapped[FirePolicy | None] = mapped_column(
        sqla_enum(FirePolicy, name="fire_policy"),
        nullable=True,
    )
    fire_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    access_by_car: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    access_by_coach: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    access_by_public_transport: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    coach_turning_area: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    nearest_bus_stop: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bus_type_access: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    weekend_only: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    has_field_poles: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    pit_latrine_allowed: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True,
        default=None,
    )
    dry_toilet: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    outdoor_bathrooms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    outdoor_showers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    wheelchair_accessible: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    step_free_access: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    parking_car_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parking_bus_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parking_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    accessibility_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    allowed_audiences: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    usage_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    animal_policy: Mapped[AnimalPolicy | None] = mapped_column(
        sqla_enum(AnimalPolicy, name="structure_animal_policy"),
        nullable=True,
    )
    animal_policy_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    in_area_protetta: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    ente_area_protetta: Mapped[str | None] = mapped_column(String(255), nullable=True)
    environmental_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    seasonal_amenities: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    booking_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    whatsapp: Mapped[str | None] = mapped_column(String(32), nullable=True)
    booking_required: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    booking_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    documents_required: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    map_resources_urls: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    event_rules_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_rules_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_status: Mapped[StructureContactStatus] = mapped_column(
        sqla_enum(StructureContactStatus, name="structure_contact_status"),
        nullable=False,
        default=StructureContactStatus.UNKNOWN,
    )
    operational_status: Mapped[StructureOperationalStatus | None] = mapped_column(
        sqla_enum(StructureOperationalStatus, name="structure_operational_status"),
        nullable=True,
    )
    cell_coverage: Mapped[CellCoverageQuality | None] = mapped_column(
        sqla_enum(CellCoverageQuality, name="structure_cell_coverage"),
        nullable=True,
    )
    cell_coverage_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    communications_infrastructure: Mapped[list[str] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    aed_on_site: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    emergency_phone_available: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    emergency_response_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    emergency_plan_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    evacuation_plan_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    risk_assessment_template_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    wildlife_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    river_swimming: Mapped[RiverSwimmingOption | None] = mapped_column(
        sqla_enum(RiverSwimmingOption, name="structure_river_swimming"),
        nullable=True,
    )
    flood_risk: Mapped[FloodRiskLevel | None] = mapped_column(
        sqla_enum(FloodRiskLevel, name="structure_flood_risk"),
        nullable=True,
    )
    weather_risk_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    activity_spaces: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    activity_equipment: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    inclusion_services: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    inclusion_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pec_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sdi_recipient_code: Mapped[str | None] = mapped_column(String(7), nullable=True)
    invoice_available: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=None)
    iban: Mapped[str | None] = mapped_column(String(34), nullable=True)
    payment_methods: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    fiscal_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data_source_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    data_last_verified: Mapped[date | None] = mapped_column(Date, nullable=True)
    data_quality_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data_quality_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_quality_flags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    governance_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact_emails: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    website_urls: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    notes_logistics: Mapped[str | None] = mapped_column(Text, nullable=True)
    logistics_arrival_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    logistics_departure_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    availabilities: Mapped[list[StructureSeasonAvailability]] = relationship(
        StructureSeasonAvailability,
        back_populates="structure",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StructureSeasonAvailability.season",
    )
    cost_options: Mapped[list[StructureCostOption]] = relationship(
        StructureCostOption,
        back_populates="structure",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StructureCostOption.id",
    )
    contacts: Mapped[list[StructureContact]] = relationship(
        StructureContact,
        back_populates="structure",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by=(
            StructureContact.is_primary.desc(),
            StructureContact.id,
        ),
    )
    open_periods: Mapped[list["StructureOpenPeriod"]] = relationship(
        "StructureOpenPeriod",
        back_populates="structure",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StructureOpenPeriod.id",
    )
    photos: Mapped[list["StructurePhoto"]] = relationship(
        "StructurePhoto",
        back_populates="structure",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StructurePhoto.position",
    )

    __table_args__ = (
        CheckConstraint("power_capacity_kw >= 0", name="power_capacity_kw_non_negative"),
        CheckConstraint("power_outlets_count >= 0", name="power_outlets_count_non_negative"),
        CheckConstraint(
            "water_tank_capacity_liters >= 0",
            name="water_tank_capacity_liters_non_negative",
        ),
        CheckConstraint("outdoor_bathrooms >= 0", name="outdoor_bathrooms_non_negative"),
        CheckConstraint("outdoor_showers >= 0", name="outdoor_showers_non_negative"),
        CheckConstraint(
            "emergency_response_time_minutes >= 0",
            name="emergency_response_time_minutes_non_negative",
        ),
        CheckConstraint(
            "(data_quality_score >= 0 AND data_quality_score <= 100) OR data_quality_score IS NULL",
            name="data_quality_score_range",
        ),
    )

    @property
    def has_coords(self) -> bool:
        return self.latitude is not None and self.longitude is not None


class StructureOpenPeriod(Base):
    __tablename__ = "structure_open_periods"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    structure_id: Mapped[int] = mapped_column(
        ForeignKey("structures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[StructureOpenPeriodKind] = mapped_column(
        sqla_enum(StructureOpenPeriodKind, name="structure_open_period_kind"),
        nullable=False,
    )
    season: Mapped[StructureOpenPeriodSeason | None] = mapped_column(
        sqla_enum(StructureOpenPeriodSeason, name="structure_open_period_season"),
        nullable=True,
    )
    date_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    units: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    blackout: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    structure: Mapped[Structure] = relationship(
        Structure,
        back_populates="open_periods",
    )


Index("ix_structures_lower_name", func.lower(Structure.name))
Index(
    "ix_structures_province",
    Structure.province,
    postgresql_where=Structure.province.is_not(None),
)
Index(
    "ix_structures_type",
    Structure.type,
    postgresql_where=Structure.type.is_not(None),
)
Index(
    "ix_structures_fire_policy",
    Structure.fire_policy,
    postgresql_where=Structure.fire_policy.is_not(None),
)
Index(
    "ix_structures_access_by_coach",
    Structure.access_by_coach,
    postgresql_where=Structure.access_by_coach.is_(True),
)
Index(
    "ix_structures_access_by_public_transport",
    Structure.access_by_public_transport,
    postgresql_where=Structure.access_by_public_transport.is_(True),
)

Index(
    "ix_structure_open_periods_structure_kind",
    StructureOpenPeriod.structure_id,
    StructureOpenPeriod.kind,
)
Index(
    "ix_structure_open_periods_structure_season",
    StructureOpenPeriod.structure_id,
    StructureOpenPeriod.season,
)
Index(
    "ix_structure_open_periods_structure_dates",
    StructureOpenPeriod.structure_id,
    StructureOpenPeriod.date_start,
    StructureOpenPeriod.date_end,
)

__all__ = [
    "Structure",
    "StructureType",
    "FirePolicy",
    "WaterSource",
    "StructureOpenPeriod",
    "StructureOpenPeriodKind",
    "StructureOpenPeriodSeason",
    "StructureOperationalStatus",
    "StructureContactStatus",
    "AnimalPolicy",
    "FieldSlope",
    "CellCoverageQuality",
    "WastewaterType",
    "FloodRiskLevel",
    "RiverSwimmingOption",
]
