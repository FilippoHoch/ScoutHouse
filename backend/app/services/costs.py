from __future__ import annotations

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum
from typing import Any, cast

from app.core.config import get_settings
from app.models import (
    Event,
    Structure,
    StructureCostModel,
    StructureCostModifier,
    StructureCostModifierKind,
    StructureCostOption,
    StructureSeason,
)


class CostBand(str, Enum):
    CHEAP = "cheap"
    MEDIUM = "medium"
    EXPENSIVE = "expensive"


def _sanitize_decimal(value: Decimal | None) -> Decimal:
    if value is None:
        return Decimal("0")
    return value


def _serialize_price_map(value: dict | None) -> dict | None:
    if not value:
        return None
    result: dict[str, float] = {}
    for key, amount in value.items():
        if amount is None:
            continue
        decimal_amount = _sanitize_decimal(Decimal(str(amount)))
        result[str(key)] = float(_quantize(decimal_amount))
    return result or None


def estimate_mean_daily_cost(structure: Structure) -> Decimal | None:
    """Estimate the mean daily cost for a structure based on its options."""

    cost_options = getattr(structure, "cost_options", None)
    if not cost_options:
        return None

    totals: list[Decimal] = []
    for option in cost_options:
        amount = _sanitize_decimal(option.amount)
        extras = _sanitize_decimal(option.city_tax_per_night) + _sanitize_decimal(
            option.utilities_flat
        )
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


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _extract_participants(event: Event, overrides: dict[str, Any] | None) -> dict[str, int]:
    base = {"lc": 0, "eg": 0, "rs": 0, "leaders": 0}
    raw = getattr(event, "participants", {}) or {}
    for key in base:
        base[key] = int(raw.get(key, 0))

    if overrides is None:
        return base

    participants_override = overrides.get("participants")
    if participants_override:
        if hasattr(participants_override, "model_dump"):
            data = participants_override.model_dump(exclude_none=True)
        elif isinstance(participants_override, dict):
            data = {k: v for k, v in participants_override.items() if v is not None}
        else:
            raise ValueError("participants overrides must be a mapping")
        for key, value in data.items():
            if key not in base:
                raise ValueError(f"Unknown participant unit '{key}'")
            if value is None:
                continue
            if int(value) < 0:
                raise ValueError("Participant counts cannot be negative")
            base[key] = int(value)
    return base


def _resolve_duration(event: Event, overrides: dict[str, Any] | None) -> tuple[int, int]:
    if event.end_date <= event.start_date:
        raise ValueError("end_date must be later than start_date to compute nights")

    default_nights = (event.end_date - event.start_date).days
    nights = default_nights
    days = nights + 1

    if overrides is None:
        return days, nights

    override_nights = overrides.get("nights")
    override_days = overrides.get("days")

    if override_nights is not None:
        nights = int(override_nights)
        if nights <= 0:
            raise ValueError("nights override must be greater than zero")

    if override_days is not None:
        days = int(override_days)
        if days <= 0:
            raise ValueError("days override must be greater than zero")

    if override_nights is not None and override_days is not None:
        if days != nights + 1:
            raise ValueError("days must be equal to nights + 1")
    elif override_nights is not None:
        days = nights + 1
    elif override_days is not None:
        nights = days - 1
        if nights <= 0:
            raise ValueError("days override implies zero or negative nights")

    return days, nights


def _snapshot_cost_options(options: list[StructureCostOption]) -> list[dict[str, Any]]:
    snapshot: list[dict[str, Any]] = []
    for option in options:
        modifiers: list[dict[str, Any]] = []
        for modifier in option.modifiers:
            modifiers.append(
                {
                    "id": modifier.id,
                    "kind": modifier.kind.value,
                    "amount": float(_quantize(_sanitize_decimal(modifier.amount))),
                    "season": modifier.season.value if modifier.season else None,
                    "date_start": modifier.date_start.isoformat() if modifier.date_start else None,
                    "date_end": modifier.date_end.isoformat() if modifier.date_end else None,
                    "price_per_resource": _serialize_price_map(
                        getattr(modifier, "price_per_resource", None)
                    ),
                }
            )
        snapshot.append(
            {
                "id": option.id,
                "model": option.model.value,
                "amount": float(_quantize(_sanitize_decimal(option.amount))),
                "currency": option.currency,
                "booking_deposit": float(_quantize(_sanitize_decimal(option.booking_deposit)))
                if getattr(option, "booking_deposit", None) is not None
                else None,
                "damage_deposit": float(_quantize(_sanitize_decimal(option.damage_deposit)))
                if getattr(option, "damage_deposit", None) is not None
                else None,
                "city_tax_per_night": float(_quantize(option.city_tax_per_night))
                if option.city_tax_per_night is not None
                else None,
                "utilities_flat": float(_quantize(option.utilities_flat))
                if option.utilities_flat is not None
                else None,
                "utilities_included": option.utilities_included,
                "utilities_notes": option.utilities_notes,
                "min_total": float(_quantize(option.min_total))
                if option.min_total is not None
                else None,
                "max_total": float(_quantize(option.max_total))
                if option.max_total is not None
                else None,
                "age_rules": option.age_rules or None,
                "payment_methods": option.payment_methods or None,
                "payment_terms": option.payment_terms,
                "price_per_resource": _serialize_price_map(
                    getattr(option, "price_per_resource", None)
                ),
                "modifiers": modifiers or None,
            }
        )
    return snapshot


def _event_days(event: Event) -> list[date]:
    duration = (event.end_date - event.start_date).days
    return [event.start_date + timedelta(days=index) for index in range(duration + 1)]


def _event_includes_weekend(event: Event) -> bool:
    return any(day.weekday() >= 5 for day in _event_days(event))


def _season_for_date(target: date) -> StructureSeason:
    month = target.month
    if month in (12, 1, 2):
        return StructureSeason.WINTER
    if month in (3, 4, 5):
        return StructureSeason.SPRING
    if month in (6, 7, 8):
        return StructureSeason.SUMMER
    return StructureSeason.AUTUMN


def _modifier_priority(modifier: StructureCostModifier) -> int:
    if modifier.kind is StructureCostModifierKind.DATE_RANGE:
        return 0
    if modifier.kind is StructureCostModifierKind.SEASON:
        return 1
    if modifier.kind is StructureCostModifierKind.WEEKEND:
        return 2
    return 3


def _select_applicable_modifier(
    option: StructureCostOption, event: Event
) -> StructureCostModifier | None:
    modifiers = getattr(option, "modifiers", None) or []
    if not modifiers:
        return None

    matches: list[tuple[int, StructureCostModifier]] = []
    event_start = event.start_date
    event_end = event.end_date
    event_season = _season_for_date(event_start)
    includes_weekend = _event_includes_weekend(event)

    for modifier in modifiers:
        if modifier.kind is StructureCostModifierKind.DATE_RANGE:
            if modifier.date_start and modifier.date_end:
                if event_start >= modifier.date_start and event_end <= modifier.date_end:
                    matches.append((_modifier_priority(modifier), modifier))
        elif modifier.kind is StructureCostModifierKind.WEEKEND:
            if includes_weekend:
                matches.append((_modifier_priority(modifier), modifier))
        elif modifier.kind is StructureCostModifierKind.SEASON:
            if modifier.season == event_season:
                matches.append((_modifier_priority(modifier), modifier))

    if not matches:
        return None

    matches.sort(key=lambda item: (item[0], getattr(item[1], "id", 0)))
    return matches[0][1]


def calc_quote(
    event: Event,
    structure: Structure,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if overrides is None:
        overrides_dict: dict[str, Any] = {}
    elif hasattr(overrides, "model_dump"):
        overrides_dict = cast(dict[str, Any], overrides.model_dump(exclude_none=True))
    elif isinstance(overrides, dict):
        overrides_dict = dict(overrides)
    else:
        raise ValueError("overrides must be a mapping")
    participants = _extract_participants(event, overrides_dict)
    people_total = sum(participants.values())

    days, nights = _resolve_duration(event, overrides_dict)

    cost_options = list(getattr(structure, "cost_options", []) or [])

    exempt_units: set[str] = set()
    for option in cost_options:
        rules = option.age_rules or {}
        if isinstance(rules, dict):
            raw_units = rules.get("city_tax_exempt_units")
            if isinstance(raw_units, list | tuple | set):
                for unit in raw_units:
                    if isinstance(unit, str):
                        exempt_units.add(unit)

    taxable_people = people_total - sum(participants.get(unit, 0) for unit in exempt_units)
    taxable_people = max(taxable_people, 0)

    subtotal = Decimal("0")
    utilities_total = Decimal("0")
    city_tax_total = Decimal("0")
    booking_deposit_total = Decimal("0")
    damage_deposit_total = Decimal("0")
    breakdown: list[dict[str, Any]] = []

    currency = cost_options[0].currency if cost_options else "EUR"

    for option in cost_options:
        modifier = _select_applicable_modifier(option, event)
        amount = _sanitize_decimal(option.amount)
        modifier_metadata: dict[str, Any] = {}

        if modifier is not None:
            amount = _sanitize_decimal(modifier.amount)
            modifier_metadata = {
                "modifier_id": getattr(modifier, "id", None),
                "modifier_kind": modifier.kind.value,
            }
            if modifier.season is not None:
                modifier_metadata["modifier_season"] = modifier.season.value
            if modifier.date_start is not None:
                modifier_metadata["modifier_date_start"] = modifier.date_start.isoformat()
            if modifier.date_end is not None:
                modifier_metadata["modifier_date_end"] = modifier.date_end.isoformat()

        minimum_total_applied = False
        maximum_total_applied = False
        metadata: dict[str, Any]
        if option.model == StructureCostModel.PER_PERSON_DAY:
            quantity = people_total * days
            line_total = amount * Decimal(people_total) * Decimal(days)
            description = "Costo per persona/giorno"
            metadata = {"people": people_total, "days": days}
        elif option.model == StructureCostModel.PER_PERSON_NIGHT:
            quantity = people_total * nights
            line_total = amount * Decimal(people_total) * Decimal(nights)
            description = "Costo per persona/notte"
            metadata = {"people": people_total, "nights": nights}
        else:
            quantity = 1
            line_total = amount
            description = "Forfait"
            metadata = {}

        if modifier_metadata:
            metadata.update({k: v for k, v in modifier_metadata.items() if v is not None})

        if option.model in (
            StructureCostModel.PER_PERSON_DAY,
            StructureCostModel.PER_PERSON_NIGHT,
        ):
            if option.min_total is not None:
                minimum_total = _sanitize_decimal(option.min_total)
                metadata["minimum_total"] = float(_quantize(minimum_total))
                if line_total < minimum_total:
                    line_total = minimum_total
                    minimum_total_applied = True
            if option.max_total is not None:
                maximum_total = _sanitize_decimal(option.max_total)
                metadata["maximum_total"] = float(_quantize(maximum_total))
                if line_total > maximum_total:
                    line_total = maximum_total
                    maximum_total_applied = True

        if minimum_total_applied:
            metadata["minimum_total_applied"] = True
        if maximum_total_applied:
            metadata["maximum_total_applied"] = True

        line_total = _quantize(line_total)
        subtotal += line_total

        breakdown.append(
            {
                "option_id": option.id,
                "type": option.model.value,
                "description": description,
                "currency": option.currency,
                "unit_amount": float(_quantize(amount)),
                "quantity": quantity,
                "metadata": metadata,
                "total": float(line_total),
            }
        )

        if option.utilities_flat is not None:
            util_amount = _quantize(_sanitize_decimal(option.utilities_flat))
            utilities_total += util_amount
            breakdown.append(
                {
                    "option_id": option.id,
                    "type": "utilities",
                    "description": "Servizi/utenze",
                    "currency": option.currency,
                    "unit_amount": float(util_amount),
                    "quantity": 1,
                    "metadata": {},
                    "total": float(util_amount),
                }
            )

        if option.city_tax_per_night is not None:
            tax_unit = _quantize(_sanitize_decimal(option.city_tax_per_night))
            tax_total = _quantize(tax_unit * Decimal(taxable_people) * Decimal(nights))
            city_tax_total += tax_total
            breakdown.append(
                {
                    "option_id": option.id,
                    "type": "city_tax",
                    "description": "Tassa di soggiorno",
                    "currency": option.currency,
                    "unit_amount": float(tax_unit),
                    "quantity": taxable_people * nights,
                    "metadata": {"taxable_people": taxable_people, "nights": nights},
                    "total": float(tax_total),
                }
            )

        if getattr(option, "booking_deposit", None) is not None:
            deposit_amount = _quantize(_sanitize_decimal(option.booking_deposit))
            booking_deposit_total += deposit_amount
            breakdown.append(
                {
                    "option_id": option.id,
                    "type": "booking_deposit",
                    "description": "Caparra di prenotazione",
                    "currency": option.currency,
                    "unit_amount": float(deposit_amount),
                    "quantity": 1,
                    "metadata": {},
                    "total": float(deposit_amount),
                }
            )
        if getattr(option, "damage_deposit", None) is not None:
            damage_amount = _quantize(_sanitize_decimal(option.damage_deposit))
            damage_deposit_total += damage_amount
            breakdown.append(
                {
                    "option_id": option.id,
                    "type": "damage_deposit",
                    "description": "Deposito cauzionale",
                    "currency": option.currency,
                    "unit_amount": float(damage_amount),
                    "quantity": 1,
                    "metadata": {},
                    "total": float(damage_amount),
                }
            )

    total = subtotal + utilities_total + city_tax_total

    settings = get_settings()
    mean_daily_cost = estimate_mean_daily_cost(structure)
    cost_band_value = band_for_cost(mean_daily_cost).value if mean_daily_cost is not None else None

    sanitized_overrides: dict[str, Any] = {}
    participants_override = overrides_dict.get("participants")
    if participants_override:
        if hasattr(participants_override, "model_dump"):
            sanitized_overrides["participants"] = participants_override.model_dump(
                exclude_none=True
            )
        elif isinstance(participants_override, dict):
            sanitized_overrides["participants"] = {
                key: int(value) for key, value in participants_override.items() if value is not None
            }
    if "days" in overrides_dict:
        sanitized_overrides["days"] = int(overrides_dict["days"])
    if "nights" in overrides_dict:
        sanitized_overrides["nights"] = int(overrides_dict["nights"])

    inputs_snapshot = {
        "event_id": getattr(event, "id", None),
        "structure_id": getattr(structure, "id", None),
        "participants": participants,
        "people_total": people_total,
        "taxable_people": taxable_people,
        "days": days,
        "nights": nights,
        "cost_band": cost_band_value,
        "rules": {
            "city_tax_exempt_units": sorted(exempt_units),
            "scenario_margins": {
                "best": float(_quantize(settings.scenario_margin_best)),
                "worst": float(_quantize(settings.scenario_margin_worst)),
            },
        },
        "overrides": sanitized_overrides,
        "cost_options": _snapshot_cost_options(cost_options),
    }

    deposit_total = booking_deposit_total + damage_deposit_total

    totals = {
        "subtotal": float(_quantize(subtotal)),
        "utilities": float(_quantize(utilities_total)),
        "city_tax": float(_quantize(city_tax_total)),
        "deposit": float(_quantize(deposit_total)),
        "booking_deposit": float(_quantize(booking_deposit_total)),
        "damage_deposit": float(_quantize(damage_deposit_total)),
        "total": float(_quantize(total)),
    }

    return {
        "currency": currency,
        "inputs": inputs_snapshot,
        "breakdown": breakdown,
        "totals": totals,
    }


def apply_scenarios(
    total: Decimal | float,
    margin_best: Decimal | None = None,
    margin_worst: Decimal | None = None,
) -> dict[str, float]:
    settings = get_settings()
    base = Decimal(str(total))
    best_margin = margin_best if margin_best is not None else settings.scenario_margin_best
    worst_margin = margin_worst if margin_worst is not None else settings.scenario_margin_worst

    realistic = _quantize(base)
    best = _quantize(base * (Decimal("1") - Decimal(str(best_margin))))
    worst = _quantize(base * (Decimal("1") + Decimal(str(worst_margin))))

    return {
        "best": float(best),
        "realistic": float(realistic),
        "worst": float(worst),
    }


__all__ = [
    "CostBand",
    "estimate_mean_daily_cost",
    "band_for_cost",
    "calc_quote",
    "apply_scenarios",
]
