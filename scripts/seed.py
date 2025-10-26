from __future__ import annotations

import argparse
import csv
from collections import defaultdict
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
    Structure,
    StructureCostModel,
    StructureCostOption,
    StructureSeason,
    StructureSeasonAvailability,
    StructureType,
    StructureUnit,
)

DEFAULT_STRUCTURES_DATASET = ROOT_DIR / "data" / "structures_seed.csv"
DEFAULT_AVAILABILITY_DATASET = ROOT_DIR / "data" / "structures_availability_seed.csv"
DEFAULT_COST_DATASET = ROOT_DIR / "data" / "structures_costs_seed.csv"


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
            }

            existing = session.execute(
                select(Structure).where(Structure.slug == slug)
            ).scalar_one_or_none()

            if existing is None:
                session.add(Structure(**data))
                action = "created"
            else:
                for key, value in data.items():
                    setattr(existing, key, value)
                action = "updated"

            print(f"{action.capitalize()} structure '{slug}'")

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


if __name__ == "__main__":
    main()
