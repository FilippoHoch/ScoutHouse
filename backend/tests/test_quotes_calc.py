from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models.availability import StructureSeason
from app.models.cost_option import (
    StructureCostModel,
    StructureCostModifier,
    StructureCostModifierKind,
    StructureCostOption,
)
from app.models.event import Event, EventBranch, EventStatus
from app.services.costs import apply_scenarios, calc_quote


@pytest.fixture()
def sample_event() -> Event:
    return Event(
        id=1,
        slug="campo-estivo",
        title="Campo estivo",
        branch=EventBranch.ALL,
        start_date=date(2025, 7, 10),
        end_date=date(2025, 7, 12),
        participants={"lc": 10, "eg": 5, "rs": 0, "leaders": 2},
        status=EventStatus.DRAFT,
    )


@pytest.fixture()
def structure_with_costs() -> SimpleNamespace:
    option = StructureCostOption(
        id=1,
        structure_id=10,
        model=StructureCostModel.PER_PERSON_DAY,
        amount=Decimal("10.00"),
        currency="EUR",
        deposit=Decimal("100"),
        city_tax_per_night=Decimal("1.50"),
        utilities_flat=Decimal("20"),
    )
    option.age_rules = {"city_tax_exempt_units": ["leaders"]}
    structure = SimpleNamespace(id=10, cost_options=[option])
    return structure


@pytest.fixture()
def structure_with_modifiers() -> SimpleNamespace:
    option = StructureCostOption(
        id=2,
        structure_id=20,
        model=StructureCostModel.PER_PERSON_DAY,
        amount=Decimal("10.00"),
        currency="EUR",
    )
    option.modifiers.append(
        StructureCostModifier(
            id=201,
            cost_option=option,
            kind=StructureCostModifierKind.SEASON,
            amount=Decimal("12.00"),
            season=StructureSeason.SUMMER,
        )
    )
    option.modifiers.append(
        StructureCostModifier(
            id=202,
            cost_option=option,
            kind=StructureCostModifierKind.WEEKEND,
            amount=Decimal("15.00"),
        )
    )
    option.modifiers.append(
        StructureCostModifier(
            id=203,
            cost_option=option,
            kind=StructureCostModifierKind.DATE_RANGE,
            amount=Decimal("20.00"),
            date_start=date(2025, 7, 1),
            date_end=date(2025, 7, 5),
        )
    )
    structure = SimpleNamespace(id=20, cost_options=[option])
    return structure


def test_calc_quote_applies_minimum_total(sample_event: Event) -> None:
    option = StructureCostOption(
        id=3,
        structure_id=30,
        model=StructureCostModel.PER_PERSON_DAY,
        amount=Decimal("5.00"),
        currency="EUR",
        min_total=Decimal("400.00"),
    )
    structure = SimpleNamespace(id=30, cost_options=[option])

    result = calc_quote(sample_event, structure)

    totals = result["totals"]
    assert totals["subtotal"] == pytest.approx(400.0)
    line = next(
        item
        for item in result["breakdown"]
        if item["type"] == StructureCostModel.PER_PERSON_DAY.value
    )
    assert line["metadata"]["minimum_total"] == pytest.approx(400.0)
    assert line["metadata"]["minimum_total_applied"] is True


def test_calc_quote_applies_maximum_total(sample_event: Event) -> None:
    option = StructureCostOption(
        id=4,
        structure_id=40,
        model=StructureCostModel.PER_PERSON_DAY,
        amount=Decimal("25.00"),
        currency="EUR",
        max_total=Decimal("600.00"),
    )
    structure = SimpleNamespace(id=40, cost_options=[option])

    result = calc_quote(sample_event, structure)

    totals = result["totals"]
    assert totals["subtotal"] == pytest.approx(600.0)
    line = next(
        item
        for item in result["breakdown"]
        if item["type"] == StructureCostModel.PER_PERSON_DAY.value
    )
    assert line["metadata"]["maximum_total"] == pytest.approx(600.0)
    assert line["metadata"]["maximum_total_applied"] is True


def test_calc_quote_breakdown(sample_event: Event, structure_with_costs: SimpleNamespace) -> None:
    result = calc_quote(sample_event, structure_with_costs)

    totals = result["totals"]
    assert totals["subtotal"] == pytest.approx(510.0)
    assert totals["utilities"] == pytest.approx(20.0)
    assert totals["city_tax"] == pytest.approx(45.0)
    assert totals["deposit"] == pytest.approx(100.0)
    assert totals["total"] == pytest.approx(575.0)

    deposit_entries = [entry for entry in result["breakdown"] if entry["type"] == "deposit"]
    assert len(deposit_entries) == 1
    assert deposit_entries[0]["total"] == pytest.approx(100.0)

    inputs = result["inputs"]
    assert inputs["people_total"] == 17
    assert inputs["taxable_people"] == 15
    assert inputs["days"] == 3
    assert inputs["nights"] == 2


def test_calc_quote_with_overrides(sample_event: Event, structure_with_costs: SimpleNamespace) -> None:
    overrides = {"participants": {"lc": 8, "leaders": 1}, "nights": 3}
    result = calc_quote(sample_event, structure_with_costs, overrides=overrides)

    totals = result["totals"]
    # people total becomes 14, days inferred to nights + 1 = 4
    assert totals["subtotal"] == pytest.approx(560.0)
    assert totals["total"] == pytest.approx(638.5)

    inputs = result["inputs"]
    assert inputs["people_total"] == 14
    assert inputs["taxable_people"] == 13
    assert inputs["days"] == 4
    assert inputs["nights"] == 3
    assert inputs["overrides"]["participants"]["lc"] == 8
    assert inputs["overrides"]["nights"] == 3


def test_calc_quote_uses_season_modifier(
    sample_event: Event, structure_with_modifiers: SimpleNamespace
) -> None:
    result = calc_quote(sample_event, structure_with_modifiers)

    totals = result["totals"]
    assert totals["subtotal"] == pytest.approx(612.0)
    assert totals["total"] == pytest.approx(612.0)

    breakdown = result["breakdown"]
    primary = next(item for item in breakdown if item["type"] == StructureCostModel.PER_PERSON_DAY.value)
    assert primary["unit_amount"] == pytest.approx(12.0)
    assert primary["metadata"]["modifier_kind"] == "season"
    assert primary["metadata"]["modifier_season"] == StructureSeason.SUMMER.value


def test_calc_quote_prefers_date_range_modifier(
    structure_with_modifiers: SimpleNamespace,
) -> None:
    event = Event(
        id=2,
        slug="settimana-scout",
        title="Settimana scout",
        branch=EventBranch.ALL,
        start_date=date(2025, 7, 2),
        end_date=date(2025, 7, 4),
        participants={"lc": 5, "eg": 5, "rs": 0, "leaders": 2},
        status=EventStatus.PLANNING,
    )

    result = calc_quote(event, structure_with_modifiers)
    primary = next(item for item in result["breakdown"] if item["type"] == StructureCostModel.PER_PERSON_DAY.value)

    assert primary["unit_amount"] == pytest.approx(20.0)
    assert primary["metadata"]["modifier_kind"] == "date_range"
    assert primary["metadata"]["modifier_date_start"] == "2025-07-01"
    assert primary["metadata"]["modifier_date_end"] == "2025-07-05"
    assert primary["metadata"]["modifier_id"] == 203


def test_calc_quote_uses_weekend_modifier(
    structure_with_modifiers: SimpleNamespace,
) -> None:
    weekend_event = Event(
        id=3,
        slug="uscita-weekend",
        title="Uscita weekend",
        branch=EventBranch.ALL,
        start_date=date(2025, 10, 3),
        end_date=date(2025, 10, 6),
        participants={"lc": 8, "eg": 4, "rs": 0, "leaders": 2},
        status=EventStatus.PLANNING,
    )

    result = calc_quote(weekend_event, structure_with_modifiers)
    primary = next(item for item in result["breakdown"] if item["type"] == StructureCostModel.PER_PERSON_DAY.value)

    assert primary["unit_amount"] == pytest.approx(15.0)
    assert primary["metadata"]["modifier_kind"] == "weekend"
    assert primary["metadata"]["modifier_id"] == 202

def test_apply_scenarios_uses_defaults() -> None:
    scenarios = apply_scenarios(Decimal("100"))
    assert scenarios["best"] == pytest.approx(95.0)
    assert scenarios["realistic"] == pytest.approx(100.0)
    assert scenarios["worst"] == pytest.approx(110.0)
