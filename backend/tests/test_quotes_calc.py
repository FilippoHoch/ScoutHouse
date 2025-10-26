from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models.cost_option import StructureCostModel, StructureCostOption
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


def test_apply_scenarios_uses_defaults() -> None:
    scenarios = apply_scenarios(Decimal("100"))
    assert scenarios["best"] == pytest.approx(95.0)
    assert scenarios["realistic"] == pytest.approx(100.0)
    assert scenarios["worst"] == pytest.approx(110.0)
