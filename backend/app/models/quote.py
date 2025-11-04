from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import CHAR, DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.db import Base
from app.models.enum_utils import sqla_enum


class QuoteScenario(str, Enum):
    BEST = "best"
    REALISTIC = "realistic"
    WORST = "worst"


JsonType = JSONB().with_variant(JSON(), "sqlite")


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    structure_id: Mapped[int] = mapped_column(
        ForeignKey("structures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    scenario: Mapped[QuoteScenario] = mapped_column(
        sqla_enum(QuoteScenario, name="quote_scenario"),
        nullable=False,
        default=QuoteScenario.REALISTIC,
    )
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, default="EUR")
    totals: Mapped[dict] = mapped_column(JsonType, nullable=False)
    breakdown: Mapped[list] = mapped_column(JsonType, nullable=False)
    inputs: Mapped[dict] = mapped_column(JsonType, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    event = relationship("Event")
    structure = relationship("Structure")


__all__ = ["Quote", "QuoteScenario"]
