
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.models import (
    Event,
    EventAccommodation,
    EventBranch,
    EventBranchSegment,
    EventStructureCandidate,
    EventStructureCandidateStatus,
    Structure,
    StructureSeason,
    StructureType,
    StructureUnit,
)
from app.services.filters import structure_matches_filters
from app.services.geo import haversine_km


def date_ranges_overlap(start_a: date, end_a: date, start_b: date, end_b: date) -> bool:
    return start_a <= end_b and start_b <= end_a


def is_structure_occupied(
    db: Session,
    structure_id: int,
    start: date,
    end: date,
    *,
    exclude_event_id: int | None = None,
) -> bool:
    query = (
        select(EventStructureCandidate)
        .join(Event)
        .where(
            EventStructureCandidate.structure_id == structure_id,
            EventStructureCandidate.status == EventStructureCandidateStatus.CONFIRMED,
            Event.start_date <= end,
            Event.end_date >= start,
        )
    )
    if exclude_event_id is not None:
        query = query.where(Event.id != exclude_event_id)
    return db.execute(query.limit(1)).scalar_one_or_none() is not None


def _season_from_date(value: date) -> StructureSeason:
    month = value.month
    if month in (12, 1, 2):
        return StructureSeason.WINTER
    if month in (3, 4, 5):
        return StructureSeason.SPRING
    if month in (6, 7, 8):
        return StructureSeason.SUMMER
    return StructureSeason.AUTUMN


_BRANCH_TO_UNIT: dict[EventBranch, StructureUnit | None] = {
    EventBranch.LC: StructureUnit.LC,
    EventBranch.EG: StructureUnit.EG,
    EventBranch.RS: StructureUnit.RS,
    EventBranch.ALL: None,
}


def _max_concurrent_load(segments: list[EventBranchSegment]) -> int:
    if not segments:
        return 0
    points: list[tuple[date, int]] = []
    for segment in segments:
        total = (segment.youth_count or 0) + (segment.leaders_count or 0)
        if total <= 0:
            continue
        points.append((segment.start_date, total))
        points.append((segment.end_date + timedelta(days=1), -total))
    if not points:
        return 0
    points.sort(key=lambda item: item[0])
    running = 0
    peak = 0
    for _, delta in points:
        running += delta
        if running > peak:
            peak = running
    return peak


def suggest_structures(
    db: Session,
    event: Event,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    season = _season_from_date(event.start_date)
    unit = _BRANCH_TO_UNIT.get(event.branch)

    branch_segments = list(getattr(event, "branch_segments", []) or [])
    indoor_segments = [
        segment
        for segment in branch_segments
        if segment.accommodation == EventAccommodation.INDOOR
    ]
    tent_segments = [
        segment
        for segment in branch_segments
        if segment.accommodation == EventAccommodation.TENTS
    ]
    needs_indoor = bool(indoor_segments)
    needs_tents = bool(tent_segments)
    indoor_requirement = _max_concurrent_load(indoor_segments)
    tent_requirement = _max_concurrent_load(tent_segments)

    structures_query = select(Structure).options(
        selectinload(Structure.availabilities),
        selectinload(Structure.cost_options),
    )
    structures = db.execute(structures_query).scalars().all()

    settings = get_settings()
    base_lat = settings.default_base_lat
    base_lon = settings.default_base_lon

    suggestions: list[dict[str, Any]] = []
    for structure in structures:
        matches, cost_band, estimated_cost = structure_matches_filters(
            structure,
            season=season,
            unit=unit,
            cost_band=None,
        )
        if not matches:
            continue

        distance = None
        if structure.latitude is not None and structure.longitude is not None:
            distance = haversine_km(
                float(base_lat),
                float(base_lon),
                float(structure.latitude),
                float(structure.longitude),
            )

        if needs_indoor:
            if structure.type == StructureType.LAND:
                continue
            if indoor_requirement > 0:
                beds = structure.indoor_beds or 0
                if beds < indoor_requirement:
                    continue
        if needs_tents:
            if structure.type == StructureType.HOUSE:
                continue
            if tent_requirement > 0:
                pitches = structure.pitches_tende or 0
                if pitches < tent_requirement:
                    continue

        suggestions.append(
            {
                "structure": structure,
                "distance_km": distance,
                "estimated_cost": estimated_cost,
                "cost_band": cost_band.value if cost_band else None,
            }
        )

    suggestions.sort(
        key=lambda item: (
            item["distance_km"] if item["distance_km"] is not None else float("inf"),
            item["estimated_cost"] if item["estimated_cost"] is not None else float("inf"),
            item["structure"].name.lower(),
        )
    )
    return suggestions[:limit]


__all__ = ["date_ranges_overlap", "is_structure_occupied", "suggest_structures"]
