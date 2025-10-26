from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from app.core.config import get_settings
from app.models import Structure


class CostBand(str, Enum):
    CHEAP = "cheap"
    MEDIUM = "medium"
    EXPENSIVE = "expensive"


def _sanitize_decimal(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return value


def estimate_mean_daily_cost(structure: Structure) -> Decimal | None:
    """Estimate the mean daily cost for a structure based on its options."""

    cost_options = getattr(structure, "cost_options", None)
    if not cost_options:
        return None

    totals: list[Decimal] = []
    for option in cost_options:
        amount = _sanitize_decimal(option.amount)
        extras = _sanitize_decimal(option.city_tax_per_night) + _sanitize_decimal(option.utilities_flat)
        totals.append(amount + extras)

    if not totals:
        return None

    total_sum = sum(totals, start=Decimal("0"))
    average = (total_sum / Decimal(len(totals))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return average


def band_for_cost(
    value: Decimal,
    *,
    cheap_max: Decimal | None = None,
    medium_max: Decimal | None = None,
) -> CostBand:
    settings = get_settings()
    cheap_threshold = cheap_max if cheap_max is not None else settings.cost_band_cheap_max
    medium_threshold = medium_max if medium_max is not None else settings.cost_band_medium_max

    if value <= cheap_threshold:
        return CostBand.CHEAP
    if value <= medium_threshold:
        return CostBand.MEDIUM
    return CostBand.EXPENSIVE


__all__ = ["CostBand", "estimate_mean_daily_cost", "band_for_cost"]
