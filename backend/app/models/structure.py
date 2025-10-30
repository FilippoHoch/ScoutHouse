from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    func,
    Index,
)
from sqlalchemy.sql import expression
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.availability import StructureSeasonAvailability
from app.models.cost_option import StructureCostOption
from app.models.contact import Contact


class StructureType(str, Enum):
    HOUSE = "house"
    LAND = "land"
    MIXED = "mixed"


class FirePolicy(str, Enum):
    ALLOWED = "allowed"
    WITH_PERMIT = "with_permit"
    FORBIDDEN = "forbidden"


class WaterSource(str, Enum):
    NONE = "none"
    FOUNTAIN = "fountain"
    TAP = "tap"
    RIVER = "river"


class Structure(Base):
    __tablename__ = "structures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    province: Mapped[str] = mapped_column(String(100), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    type: Mapped[StructureType] = mapped_column(
        SQLEnum(StructureType, name="structure_type"),
        nullable=False,
    )
    indoor_beds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    indoor_bathrooms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    indoor_showers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dining_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_kitchen: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    hot_water: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    land_area_m2: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    max_tents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    shelter_on_field: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    toilets_on_field: Mapped[int | None] = mapped_column(Integer, nullable=True)
    water_source: Mapped[WaterSource | None] = mapped_column(
        SQLEnum(WaterSource, name="water_source"),
        nullable=True,
    )
    electricity_available: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    fire_policy: Mapped[FirePolicy | None] = mapped_column(
        SQLEnum(FirePolicy, name="fire_policy"),
        nullable=True,
    )
    access_by_car: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    access_by_coach: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    access_by_public_transport: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    coach_turning_area: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    max_vehicle_height_m: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    nearest_bus_stop: Mapped[str | None] = mapped_column(String(255), nullable=True)
    winter_open: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    weekend_only: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    has_field_poles: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    website_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes_logistics: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    contacts: Mapped[list[Contact]] = relationship(
        Contact,
        back_populates="structure",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Contact.name",
    )

    @property
    def has_coords(self) -> bool:
        return self.latitude is not None and self.longitude is not None


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

__all__ = [
    "Structure",
    "StructureType",
    "FirePolicy",
    "WaterSource",
]
