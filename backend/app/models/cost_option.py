from __future__ import annotations

from datetime import date
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, Text, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import JSON

from app.core.db import Base
from app.models.availability import StructureSeason
from app.models.enum_utils import sqla_enum

if TYPE_CHECKING:  # pragma: no cover
    from .structure import Structure


class StructureCostModifierKind(str, Enum):
    SEASON = "season"
    DATE_RANGE = "date_range"
    WEEKEND = "weekend"


class StructureCostModel(str, Enum):
    PER_PERSON_DAY = "per_person_day"
    PER_PERSON_NIGHT = "per_person_night"
    FORFAIT = "forfait"


class StructureCostOption(Base):
    __tablename__ = "structure_cost_option"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    structure_id: Mapped[int] = mapped_column(
        ForeignKey("structures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    model: Mapped[StructureCostModel] = mapped_column(
        sqla_enum(StructureCostModel, name="structure_cost_model"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    booking_deposit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    damage_deposit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    city_tax_per_night: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    utilities_flat: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    utilities_included: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True, default=None
    )
    utilities_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    min_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    max_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    age_rules: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    payment_methods: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    payment_terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_per_resource: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    structure: Mapped["Structure"] = relationship(
        "Structure",
        back_populates="cost_options",
    )
    modifiers: Mapped[list["StructureCostModifier"]] = relationship(
        "StructureCostModifier",
        back_populates="cost_option",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="StructureCostModifier.id",
    )


Index(
    "ix_structure_cost_option_structure_id_model",
    StructureCostOption.structure_id,
    StructureCostOption.model,
)


class StructureCostModifier(Base):
    __tablename__ = "structure_cost_modifier"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cost_option_id: Mapped[int] = mapped_column(
        ForeignKey("structure_cost_option.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[StructureCostModifierKind] = mapped_column(
        sqla_enum(StructureCostModifierKind, name="structure_cost_modifier_kind"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    price_per_resource: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    season: Mapped[StructureSeason | None] = mapped_column(
        sqla_enum(StructureSeason, name="structure_season"), nullable=True
    )
    date_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    date_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    cost_option: Mapped[StructureCostOption] = relationship(
        StructureCostOption,
        back_populates="modifiers",
    )

__all__ = [
    "StructureCostModel",
    "StructureCostOption",
    "StructureCostModifier",
    "StructureCostModifierKind",
]
