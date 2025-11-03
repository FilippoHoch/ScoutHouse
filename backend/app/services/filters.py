from __future__ import annotations

from collections.abc import Iterable

from app.models import Structure
from app.models.availability import StructureSeason, StructureSeasonAvailability, StructureUnit
from app.services.costs import CostBand, band_for_cost, estimate_mean_daily_cost


def _availability_matches(
    availability: StructureSeasonAvailability,
    *,
    season: StructureSeason | None,
    unit: StructureUnit | None,
) -> bool:
    if season is not None and availability.season != season:
        return False
    if unit is not None:
        units = {item if isinstance(item, str) else item.value for item in availability.units}
        if StructureUnit.ALL.value in units:
            return True
        if unit.value not in units:
            return False
    return True


def structure_matches_filters(
    structure: Structure,
    *,
    season: StructureSeason | None = None,
    unit: StructureUnit | None = None,
    cost_band: CostBand | None = None,
) -> tuple[bool, CostBand | None, float | None]:
    """Return whether the structure matches filters and metadata used downstream."""

    estimated_cost_decimal = estimate_mean_daily_cost(structure)
    computed_band: CostBand | None = None
    if estimated_cost_decimal is not None:
        computed_band = band_for_cost(estimated_cost_decimal)

    if cost_band is not None:
        if computed_band is None or computed_band != cost_band:
            return False, computed_band, float(estimated_cost_decimal) if estimated_cost_decimal is not None else None

    if season is not None or unit is not None:
        availabilities = getattr(structure, "availabilities", None) or []
        if not any(_availability_matches(avail, season=season, unit=unit) for avail in availabilities):
            return False, computed_band, float(estimated_cost_decimal) if estimated_cost_decimal is not None else None

    estimated_cost = float(estimated_cost_decimal) if estimated_cost_decimal is not None else None
    return True, computed_band, estimated_cost


def filter_structures(
    structures: Iterable[Structure],
    *,
    season: StructureSeason | None = None,
    unit: StructureUnit | None = None,
    cost_band: CostBand | None = None,
) -> list[tuple[Structure, CostBand | None, float | None]]:
    filtered: list[tuple[Structure, CostBand | None, float | None]] = []
    for structure in structures:
        matches, computed_band, estimated_cost = structure_matches_filters(
            structure,
            season=season,
            unit=unit,
            cost_band=cost_band,
        )
        if matches:
            filtered.append((structure, computed_band, estimated_cost))
    return filtered


__all__ = ["filter_structures", "structure_matches_filters"]
