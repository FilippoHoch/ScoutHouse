from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.db import SessionLocal  # noqa: E402
from app.models import Structure, StructureType  # noqa: E402

DEFAULT_DATASET = ROOT_DIR / "data" / "structures_seed.csv"


def parse_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed structure data from CSV")
    parser.add_argument(
        "--file",
        type=Path,
        default=DEFAULT_DATASET,
        help=f"Path to the CSV file (default: {DEFAULT_DATASET})",
    )
    args = parser.parse_args()
    seed_structures(args.file)


if __name__ == "__main__":
    main()
