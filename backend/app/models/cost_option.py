from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import JSON

from app.core.db import Base

if TYPE_CHECKING:  # pragma: no cover
    from .structure import Structure


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
        SQLEnum(StructureCostModel, name="structure_cost_model"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR")
    deposit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    city_tax_per_night: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    utilities_flat: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    age_rules: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    structure: Mapped["Structure"] = relationship(
        "Structure",
        back_populates="cost_options",
    )


__all__ = [
    "StructureCostModel",
    "StructureCostOption",
]
