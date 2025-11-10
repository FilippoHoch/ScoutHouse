#!/usr/bin/env python3
"""Validate structure UI documentation against the data model."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
DOC_PATH = ROOT / "docs" / "STRUCTURE_PROFILE.md"
TS_METADATA_PATH = FRONTEND / "src" / "shared" / "structureMetadata.ts"

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.schemas.structure import StructureBase, StructureCostOptionBase  # noqa: E402


def extract_doc_fields() -> set[str]:
    text = DOC_PATH.read_text(encoding="utf-8")
    return set(re.findall(r"`([a-z0-9_]+)`", text))


def extract_ts_string_set(constant_name: str) -> set[str]:
    source = TS_METADATA_PATH.read_text(encoding="utf-8")
    marker = f"const {constant_name} = new Set"
    start = source.find(marker)
    if start == -1:
        marker = f"export const {constant_name} = new Set"
        start = source.find(marker)
    if start == -1:
        raise RuntimeError(
            f"Unable to locate constant '{constant_name}' in {TS_METADATA_PATH}"
        )

    array_start = source.find("[", start)
    array_end = source.find("]", array_start)
    if array_start == -1 or array_end == -1:
        raise RuntimeError(
            f"Unable to parse values for '{constant_name}' in {TS_METADATA_PATH}"
        )

    block = source[array_start : array_end + 1]
    return set(re.findall(r'"([a-z0-9_]+)"', block))


def main() -> int:
    errors: list[str] = []

    doc_fields = extract_doc_fields()

    structure_fields = set(StructureBase.model_fields.keys()) | {
        "open_periods",
        "cost_options",
    }
    missing_structure = sorted(structure_fields - doc_fields)
    if missing_structure:
        errors.append(
            "Missing structure fields in documentation: " + ", ".join(missing_structure)
        )

    cost_fields = set(StructureCostOptionBase.model_fields.keys())
    missing_cost = sorted(cost_fields - doc_fields)
    if missing_cost:
        errors.append(
            "Missing cost option fields in documentation: " + ", ".join(missing_cost)
        )

    managed_keys = extract_ts_string_set("managedKeys")
    unknown_managed = sorted(managed_keys - structure_fields)
    if unknown_managed:
        errors.append(
            "Unexpected form-managed keys not present in StructureBase: "
            + ", ".join(unknown_managed)
        )

    cost_managed_keys = extract_ts_string_set("costOptionManagedKeys")
    allowed_cost_extras = {"id"}
    unknown_cost_managed = sorted(cost_managed_keys - cost_fields - allowed_cost_extras)
    if unknown_cost_managed:
        errors.append(
            "Unexpected cost option form keys: " + ", ".join(unknown_cost_managed)
        )

    if errors:
        for message in errors:
            print(message, file=sys.stderr)
        return 1

    print(
        "Structure profile documentation is in sync with the schema "
        f"({len(structure_fields)} structure fields, {len(cost_fields)} cost fields)."
    )
    print(
        "Structure form manages %d structure fields and %d cost fields."
        % (
            len(managed_keys),
            len(cost_managed_keys),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
