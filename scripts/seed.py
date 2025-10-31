from __future__ import annotations

import argparse
import csv
import json
from datetime import date
from collections import defaultdict
from datetime import date
from decimal import Decimal
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Event,
    EventBranch,
    EventStatus,
    EventStructureCandidate,
    EventStructureCandidateStatus,
    Quote,
    QuoteScenario,
    Structure,
    StructureCostModel,
    StructureCostOption,
    StructureSeason,
    StructureSeasonAvailability,
    StructureOpenPeriod,
    StructureOpenPeriodKind,
    StructureOpenPeriodSeason,
    StructureType,
    StructureUnit,
)
from app.services.costs import calc_quote  # noqa: E402

DEFAULT_STRUCTURES_DATASET = ROOT_DIR / "data" / "structures_seed.csv"
DEFAULT_AVAILABILITY_DATASET = ROOT_DIR / "data" / "structures_availability_seed.csv"
DEFAULT_COST_DATASET = ROOT_DIR / "data" / "structures_costs_seed.csv"
DEFAULT_EVENTS_DATASET = ROOT_DIR / "data" / "events_seed.csv"
DEFAULT_EVENT_CANDIDATES_DATASET = ROOT_DIR / "data" / "event_candidates_seed.csv"
DEFAULT_QUOTES_DATASET = ROOT_DIR / "data" / "quotes_seed.csv"

OPEN_PERIOD_SEED: dict[str, list[dict[str, Any]]] = {
    "casa-bosco": [
        {
            "kind": StructureOpenPeriodKind.SEASON,
            "season": StructureOpenPeriodSeason.SUMMER,
            "notes": "Disponibile in estate",
        },
        {
            "kind": StructureOpenPeriodKind.RANGE,
            "date_start": date(2025, 7, 1),
            "date_end": date(2025, 7, 31),
            "notes": "Turni estivi",
        },
    ],
    "campo-pianura": [
        {
            "kind": StructureOpenPeriodKind.SEASON,
            "season": StructureOpenPeriodSeason.SPRING,
        },
        {
            "kind": StructureOpenPeriodKind.SEASON,
            "season": StructureOpenPeriodSeason.SUMMER,
        },
    ],
}


def parse_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def parse_int(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    return int(value)


def parse_decimal(value: str | None) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(value)


def parse_bool(value: str | None) -> bool:
    if value is None:
        return False
    text = value.strip().lower()
    if not text:
        return False
    return text in {"true", "1", "yes", "y", "si", "sì"}


def parse_participants(value: str | None) -> dict[str, int]:
    if not value:
        return {"lc": 0, "eg": 0, "rs": 0, "leaders": 0}
    try:
        raw = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid participants_json value") from exc
    participants = {"lc": 0, "eg": 0, "rs": 0, "leaders": 0}
    for key in participants:
        val = int(raw.get(key, 0))
        if val < 0:
            raise ValueError("Participant counts cannot be negative")
        participants[key] = val
    return participants

def load_rows(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        if reader.fieldnames is None:
            raise ValueError("Seed file is missing headers")
        return [dict(row) for row in reader]


def seed_structures(dataset: Path) -> None:
    rows = load_rows(dataset)
    if not rows:
        print("No rows found in seed file; nothing to seed.")
        return

    with SessionLocal() as session:
        for row in rows:
            slug = row.get("slug", "").strip()
            if not slug:
                print("Skipping row without slug")
                continue

            try:
                structure_type = StructureType(row.get("type", "").strip())
            except ValueError as exc:  # pragma: no cover - defensive guard
                raise ValueError(f"Invalid structure type for slug '{slug}'") from exc

            data = {
                "name": row.get("name", "").strip(),
                "slug": slug,
                "province": (row.get("province") or "").strip().upper() or None,
                "address": row.get("address", "").strip() or None,
                "latitude": parse_float((row.get("latitude") or "").strip()),
                "longitude": parse_float((row.get("longitude") or "").strip()),
                "type": structure_type,
                "indoor_beds": parse_int((row.get("indoor_beds") or row.get("beds") or "").strip()),
                "indoor_bathrooms": parse_int((row.get("indoor_bathrooms") or row.get("bathrooms") or "").strip()),
                "indoor_showers": parse_int((row.get("indoor_showers") or row.get("showers") or "").strip()),
                "indoor_activity_rooms": parse_int((row.get("indoor_activity_rooms") or "").strip()),
                "has_kitchen": parse_bool(row.get("has_kitchen")),
                "pit_latrine_allowed": parse_bool(row.get("pit_latrine_allowed")),
                "website_url": row.get("website_url", "").strip() or None,
                "notes": row.get("notes", "").strip() or None,
            }

            existing = session.execute(
                select(Structure).where(Structure.slug == slug)
            ).scalar_one_or_none()

            if existing is None:
                structure = Structure(**data)
                _apply_open_period_seed(structure, slug)
                session.add(structure)
                action = "created"
            else:
                for key, value in data.items():
                    setattr(existing, key, value)
                _apply_open_period_seed(existing, slug)
                action = "updated"

            print(f"{action.capitalize()} structure '{slug}'")

        session.commit()


def _apply_open_period_seed(structure: Structure, slug: str) -> None:
    structure.open_periods.clear()
    for entry in OPEN_PERIOD_SEED.get(slug, []):
        structure.open_periods.append(
            StructureOpenPeriod(
                kind=entry["kind"],
                season=entry.get("season"),
                date_start=entry.get("date_start"),
                date_end=entry.get("date_end"),
                notes=entry.get("notes"),
            )
        )


def seed_events(dataset: Path) -> None:
    rows = load_rows(dataset)
    if not rows:
        print("No rows found in events seed file; nothing to seed.")
        return

    with SessionLocal() as session:
        for row in rows:
            slug = (row.get("slug") or "").strip()
            if not slug:
                print("Skipping event row without slug")
                continue

            title = (row.get("title") or "").strip()
            branch_raw = (row.get("branch") or EventBranch.ALL.value).strip() or EventBranch.ALL.value
            try:
                branch = EventBranch(branch_raw)
            except ValueError as exc:
                raise ValueError(f"Invalid branch '{branch_raw}' for event '{slug}'") from exc

            try:
                start_date = date.fromisoformat((row.get("start_date") or "").strip())
                end_date = date.fromisoformat((row.get("end_date") or "").strip())
            except ValueError as exc:
                raise ValueError(f"Invalid date range for event '{slug}'") from exc
            if end_date < start_date:
                raise ValueError(f"end_date cannot be earlier than start_date for event '{slug}'")

            participants = parse_participants(row.get("participants_json"))
            budget_total = parse_decimal(row.get("budget_total"))
            status_raw = (row.get("status") or EventStatus.DRAFT.value).strip() or EventStatus.DRAFT.value
            try:
                status_value = EventStatus(status_raw)
            except ValueError as exc:
                raise ValueError(f"Invalid event status '{status_raw}' for slug '{slug}'") from exc

            data = {
                "title": title,
                "branch": branch,
                "start_date": start_date,
                "end_date": end_date,
                "budget_total": budget_total,
                "status": status_value,
                "notes": (row.get("notes") or None),
            }

            existing = session.execute(select(Event).where(Event.slug == slug)).scalar_one_or_none()
            if existing is None:
                event = Event(slug=slug, **data)
                event.participants = participants
                session.add(event)
                action = "created"
            else:
                for key, value in data.items():
                    setattr(existing, key, value)
                existing.participants = participants
                action = "updated"

            print(f"{action.capitalize()} event '{slug}'")

        session.commit()


def seed_event_candidates(dataset: Path) -> None:
    rows = load_rows(dataset)
    if not rows:
        print("No event candidates to seed.")
        return

    with SessionLocal() as session:
        for row in rows:
            event_slug = (row.get("event_slug") or "").strip()
            structure_slug = (row.get("structure_slug") or "").strip()
            if not event_slug or not structure_slug:
                print("Skipping candidate row missing slugs")
                continue

            event = session.execute(select(Event).where(Event.slug == event_slug)).scalar_one_or_none()
            if event is None:
                print(f"Skipping candidate for unknown event '{event_slug}'")
                continue

            structure = session.execute(select(Structure).where(Structure.slug == structure_slug)).scalar_one_or_none()
            if structure is None:
                print(f"Skipping candidate for unknown structure '{structure_slug}'")
                continue

            status_raw = (row.get("status") or EventStructureCandidateStatus.TO_CONTACT.value).strip() or EventStructureCandidateStatus.TO_CONTACT.value
            try:
                status_value = EventStructureCandidateStatus(status_raw)
            except ValueError as exc:
                raise ValueError(
                    f"Invalid candidate status '{status_raw}' for event '{event_slug}'"
                ) from exc

            assigned_user = (row.get("assigned_user") or None)

            candidate = session.execute(
                select(EventStructureCandidate)
                .where(EventStructureCandidate.event_id == event.id)
                .where(EventStructureCandidate.structure_id == structure.id)
            ).scalar_one_or_none()

            if candidate is None:
                candidate = EventStructureCandidate(
                    event_id=event.id,
                    structure_id=structure.id,
                    status=status_value,
                    assigned_user=assigned_user,
                )
                session.add(candidate)
                action = "created"
            else:
                candidate.status = status_value
                candidate.assigned_user = assigned_user
                action = "updated"

            print(f"{action.capitalize()} candidate for event '{event_slug}' and structure '{structure_slug}'")

        session.commit()


def seed_quotes(dataset: Path) -> None:
    rows = load_rows(dataset)
    if not rows:
        print("No quotes to seed.")
        return

    with SessionLocal() as session:
        for row in rows:
            event_slug = (row.get("event_slug") or "").strip()
            structure_slug = (row.get("structure_slug") or "").strip()
            if not event_slug or not structure_slug:
                print("Skipping quote row missing slugs")
                continue

            event = session.execute(select(Event).where(Event.slug == event_slug)).scalar_one_or_none()
            if event is None:
                print(f"Skipping quote for unknown event '{event_slug}'")
                continue

            structure = session.execute(select(Structure).where(Structure.slug == structure_slug)).scalar_one_or_none()
            if structure is None:
                print(f"Skipping quote for unknown structure '{structure_slug}'")
                continue

            # Ensure cost options are loaded for calculation
            _ = structure.cost_options  # noqa: B018

            scenario_raw = (row.get("scenario") or QuoteScenario.REALISTIC.value).strip().lower()
            try:
                scenario = QuoteScenario(scenario_raw)
            except ValueError:
                scenario = QuoteScenario.REALISTIC

            existing = session.execute(
                select(Quote)
                .where(Quote.event_id == event.id)
                .where(Quote.structure_id == structure.id)
                .where(Quote.scenario == scenario)
            ).scalar_one_or_none()
            if existing is not None:
                print(
                    f"Quote for event '{event_slug}' and structure '{structure_slug}' already exists; skipping."
                )
                continue

            calculation = calc_quote(event, structure)
            quote = Quote(
                event_id=event.id,
                structure_id=structure.id,
                scenario=scenario,
                currency=calculation["currency"],
                totals=calculation["totals"],
                breakdown=calculation["breakdown"],
                inputs=calculation["inputs"],
            )
            session.add(quote)
            print(
                f"Created quote for event '{event_slug}' and structure '{structure_slug}' ({scenario.value})."
            )

        session.commit()


def parse_units(value: str) -> list[str]:
    raw_units = value.replace(",", ";").split(";")
    cleaned = []
    for token in raw_units:
        unit_value = token.strip()
        if not unit_value:
            continue
        try:
            cleaned.append(StructureUnit(unit_value).value)
        except ValueError as exc:
            raise ValueError(f"Invalid unit '{unit_value}' in availability seed") from exc
    if not cleaned:
        raise ValueError("Availability entry must list at least one unit")
    return cleaned


def seed_availabilities(dataset: Path) -> None:
    rows = load_rows(dataset)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        slug = row.get("slug", "").strip()
        if slug:
            grouped[slug].append(row)

    with SessionLocal() as session:
        for slug, entries in grouped.items():
            structure = session.execute(
                select(Structure).where(Structure.slug == slug)
            ).scalar_one_or_none()
            if structure is None:
                print(f"Skipping availability for unknown structure '{slug}'")
                continue

            existing = session.execute(
                select(StructureSeasonAvailability).where(
                    StructureSeasonAvailability.structure_id == structure.id
                )
            ).scalars()
            for availability in list(existing):
                session.delete(availability)

            for entry in entries:
                season_raw = (entry.get("season") or "").strip()
                if not season_raw:
                    print(f"Skipping availability without season for '{slug}'")
                    continue
                try:
                    season = StructureSeason(season_raw)
                except ValueError as exc:
                    raise ValueError(f"Invalid season '{season_raw}' for slug '{slug}'") from exc

                units = parse_units(entry.get("units", ""))
                availability = StructureSeasonAvailability(
                    structure_id=structure.id,
                    season=season,
                    units=units,
                    capacity_min=parse_int(entry.get("capacity_min")),
                    capacity_max=parse_int(entry.get("capacity_max")),
                )
                session.add(availability)

            print(f"Seeded {len(entries)} availability rows for '{slug}'")

        session.commit()



def seed_cost_options(dataset: Path) -> None:
    rows = load_rows(dataset)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        slug = row.get("slug", "").strip()
        if slug:
            grouped[slug].append(row)

    with SessionLocal() as session:
        for slug, entries in grouped.items():
            structure = session.execute(
                select(Structure).where(Structure.slug == slug)
            ).scalar_one_or_none()
            if structure is None:
                print(f"Skipping cost options for unknown structure '{slug}'")
                continue

            existing = session.execute(
                select(StructureCostOption).where(
                    StructureCostOption.structure_id == structure.id
                )
            ).scalars()
            for option in list(existing):
                session.delete(option)

            for entry in entries:
                model_raw = (entry.get("model") or "").strip()
                if not model_raw:
                    print(f"Skipping cost option without model for '{slug}'")
                    continue
                try:
                    model = StructureCostModel(model_raw)
                except ValueError as exc:
                    raise ValueError(f"Invalid cost model '{model_raw}' for slug '{slug}'") from exc

                amount = parse_decimal(entry.get("amount"))
                if amount is None or amount <= Decimal("0"):
                    raise ValueError(f"Invalid amount for cost option on slug '{slug}'")

                currency = (entry.get("currency") or "EUR").strip().upper() or "EUR"

                cost_option = StructureCostOption(
                    structure_id=structure.id,
                    model=model,
                    amount=amount,
                    currency=currency,
                    deposit=parse_decimal(entry.get("deposit")),
                    city_tax_per_night=parse_decimal(entry.get("city_tax_per_night")),
                    utilities_flat=parse_decimal(entry.get("utilities_flat")),
                    age_rules=None,
                )
                session.add(cost_option)

            print(f"Seeded {len(entries)} cost option rows for '{slug}'")

        session.commit()



def main() -> None:
    parser = argparse.ArgumentParser(description="Seed structure data from CSV")
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_STRUCTURES_DATASET,
        help=f"Path to the structures CSV file (default: {DEFAULT_STRUCTURES_DATASET})",
    )
    parser.add_argument(
        "--availability-file",
        type=Path,
        default=DEFAULT_AVAILABILITY_DATASET,
        help=f"Path to the availability CSV file (default: {DEFAULT_AVAILABILITY_DATASET})",
    )
    parser.add_argument(
        "--cost-file",
        type=Path,
        default=DEFAULT_COST_DATASET,
        help=f"Path to the cost options CSV file (default: {DEFAULT_COST_DATASET})",
    )
    parser.add_argument(
        "--events-file",
        type=Path,
        default=DEFAULT_EVENTS_DATASET,
        help=f"Path to the events CSV file (default: {DEFAULT_EVENTS_DATASET})",
    )
    parser.add_argument(
        "--event-candidates-file",
        type=Path,
        default=DEFAULT_EVENT_CANDIDATES_DATASET,
        help=f"Path to the event candidates CSV file (default: {DEFAULT_EVENT_CANDIDATES_DATASET})",
    )
    parser.add_argument(
        "--quotes-file",
        type=Path,
        default=DEFAULT_QUOTES_DATASET,
        help=f"Path to the quotes CSV file (default: {DEFAULT_QUOTES_DATASET})",
    )
    args = parser.parse_args()

    if args.file.exists():
        seed_structures(args.file)
    else:
        print(f"Structures seed file '{args.file}' not found; skipping.")

    if args.availability_file.exists():
        seed_availabilities(args.availability_file)
    else:
        print(f"Availability seed file '{args.availability_file}' not found; skipping.")

    if args.cost_file.exists():
        seed_cost_options(args.cost_file)
    else:
        print(f"Cost seed file '{args.cost_file}' not found; skipping.")

    if args.events_file.exists():
        seed_events(args.events_file)
    else:
        print(f"Events seed file '{args.events_file}' not found; skipping.")

    if args.event_candidates_file.exists():
        seed_event_candidates(args.event_candidates_file)
    else:
        print(f"Event candidates seed file '{args.event_candidates_file}' not found; skipping.")

    if args.quotes_file.exists():
        seed_quotes(args.quotes_file)
    else:
        print(f"Quotes seed file '{args.quotes_file}' not found; skipping.")


if __name__ == "__main__":
    main()
