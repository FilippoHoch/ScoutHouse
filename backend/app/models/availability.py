from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.sqltypes import JSON

from app.core.db import Base
from app.models.enum_utils import sqla_enum

if TYPE_CHECKING:  # pragma: no cover
    from .structure import Structure


class StructureSeason(str, Enum):
    WINTER = "winter"
    SPRING = "spring"
    SUMMER = "summer"
    AUTUMN = "autumn"


class StructureUnit(str, Enum):
    LC = "LC"
    EG = "EG"
    RS = "RS"
    ALL = "ALL"


class StructureSeasonAvailability(Base):
    __tablename__ = "structure_season_availability"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    structure_id: Mapped[int] = mapped_column(
        ForeignKey("structures.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    season: Mapped[StructureSeason] = mapped_column(
        sqla_enum(StructureSeason, name="structure_season"),
        nullable=False,
        index=True,
    )
    units: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    capacity_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    capacity_max: Mapped[int | None] = mapped_column(Integer, nullable=True)

    structure: Mapped[Structure] = relationship(
        "Structure",
        back_populates="availabilities",
    )


Index(
    "ix_structure_season_availability_structure_id_season",
    StructureSeasonAvailability.structure_id,
    StructureSeasonAvailability.season,
)

__all__ = [
    "StructureSeason",
    "StructureUnit",
    "StructureSeasonAvailability",
]
