from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.quote import QuoteScenario


class QuoteOverrideParticipants(BaseModel):
    lc: int | None = Field(default=None, ge=0)
    eg: int | None = Field(default=None, ge=0)
    rs: int | None = Field(default=None, ge=0)
    leaders: int | None = Field(default=None, ge=0)


class QuoteOverrides(BaseModel):
    participants: QuoteOverrideParticipants | None = None
    days: int | None = Field(default=None, ge=1)
    nights: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_duration(self) -> "QuoteOverrides":
        if self.days is not None and self.nights is not None:
            if self.days != self.nights + 1:
                raise ValueError("days must equal nights + 1")
        return self


class QuoteCalcRequest(BaseModel):
    event_id: int
    structure_id: int
    overrides: QuoteOverrides | None = None


class QuoteTotals(BaseModel):
    subtotal: float
    utilities: float
    city_tax: float
    deposit: float
    total: float


class QuoteBreakdownEntry(BaseModel):
    option_id: int | None = None
    type: str
    description: str
    currency: str
    unit_amount: float | None = None
    quantity: float | None = None
    metadata: dict[str, Any] | None = None
    total: float


class QuoteScenarios(BaseModel):
    best: float
    realistic: float
    worst: float


class QuoteCalcResponse(BaseModel):
    currency: str
    totals: QuoteTotals
    breakdown: list[QuoteBreakdownEntry]
    scenarios: QuoteScenarios
    inputs: dict[str, Any]


class QuoteCreate(BaseModel):
    structure_id: int
    scenario: QuoteScenario = QuoteScenario.REALISTIC
    overrides: QuoteOverrides | None = None

    @field_validator("scenario", mode="before")
    @classmethod
    def normalize_scenario(cls, value: QuoteScenario | str) -> QuoteScenario | str:
        if isinstance(value, str) and value.lower() == "base":
            return QuoteScenario.REALISTIC
        return value


class QuoteRead(BaseModel):
    id: int
    event_id: int
    structure_id: int
    scenario: QuoteScenario
    currency: str
    totals: QuoteTotals
    breakdown: list[QuoteBreakdownEntry]
    inputs: dict[str, Any]
    scenarios: QuoteScenarios
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }


class QuoteListItem(BaseModel):
    id: int
    event_id: int
    structure_id: int
    structure_name: str | None = None
    scenario: QuoteScenario
    currency: str
    total: float
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }


__all__ = [
    "QuoteCalcRequest",
    "QuoteCalcResponse",
    "QuoteCreate",
    "QuoteRead",
    "QuoteListItem",
    "QuoteTotals",
    "QuoteBreakdownEntry",
    "QuoteScenarios",
    "QuoteOverrides",
]
