from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, Text, func, Index
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
    beds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bathrooms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    showers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dining_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_kitchen: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=expression.false(),
        default=False,
    )
    website_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
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
Index("ix_structures_province", Structure.province)
Index("ix_structures_type", Structure.type)

__all__ = ["Structure", "StructureType"]
