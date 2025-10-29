from __future__ import annotations

import csv
from dataclasses import dataclass
from decimal import Decimal
from io import BytesIO, StringIO
from typing import Iterator, Literal, Sequence
from urllib.parse import urlparse

from openpyxl import Workbook, load_workbook

from app.models.structure import StructureType

HEADERS = [
    "name",
    "slug",
    "province",
    "address",
    "latitude",
    "longitude",
    "type",
    "beds",
    "bathrooms",
    "showers",
    "dining_capacity",
    "has_kitchen",
    "website_url",
    "notes",
]


TemplateFormat = Literal["xlsx", "csv"]


TEMPLATE_SAMPLE_ROWS: list[dict[str, object]] = [
    {
        "name": "Casa Alpina",
        "slug": "casa-alpina",
        "province": "TN",
        "address": "Via Bosco 10",
        "latitude": Decimal("46.123"),
        "longitude": Decimal("11.456"),
        "type": "house",
        "beds": 48,
        "bathrooms": 6,
        "showers": 10,
        "dining_capacity": 60,
        "has_kitchen": True,
        "website_url": "https://example.org/casa-alpina",
        "notes": "Spazi esterni ampi",
    },
    {
        "name": "Terreno Pianura",
        "slug": "terreno-pianura",
        "province": "MI",
        "address": "Località Campi",
        "latitude": Decimal("45.45"),
        "longitude": Decimal("9.12"),
        "type": "land",
        "beds": None,
        "bathrooms": 2,
        "showers": None,
        "dining_capacity": 40,
        "has_kitchen": False,
        "website_url": "https://example.org/terreno",
        "notes": "Ideale per campi estivi",
    },
]


@dataclass(slots=True)
class RowError:
    row: int
    field: str
    message: str
    source_format: TemplateFormat


@dataclass(slots=True)
class StructureImportRow:
    row: int
    name: str
    slug: str
    province: str
    address: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    type: StructureType
    beds: int | None
    bathrooms: int | None
    showers: int | None
    dining_capacity: int | None
    has_kitchen: bool | None
    website_url: str | None
    notes: str | None


@dataclass(slots=True)
class ParsedWorkbook:
    rows: list[StructureImportRow]
    errors: list[RowError]
    blank_rows: int
    source_format: TemplateFormat


def _normalise_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _normalise_decimal(value: object) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        if isinstance(value, (int, float, Decimal)):
            return Decimal(str(value))
        return Decimal(str(value).strip())
    except Exception as exc:  # pragma: no cover - defensive
        raise ValueError("invalid number") from exc


def _validate_province(value: str) -> str:
    if len(value) != 2 or not value.isalpha():
        raise ValueError("must be 2 letters")
    return value.upper()


def _validate_slug(value: str) -> str:
    if not value:
        raise ValueError("cannot be empty")
    return value


def _validate_type(value: str) -> StructureType:
    try:
        return StructureType(value.lower())
    except ValueError as exc:
        raise ValueError("must be one of house, land, mixed") from exc


def _validate_positive_int(value: object, *, allow_empty: bool = True) -> int | None:
    text = _normalise_text(value)
    if not text:
        return None if allow_empty else 0
    try:
        number = int(text)
    except ValueError as exc:
        raise ValueError("must be an integer") from exc
    if number < 0:
        raise ValueError("must be zero or greater")
    return number


def _validate_bool(value: object) -> bool | None:
    text = _normalise_text(value)
    if not text:
        return None
    lowered = text.lower()
    truthy = {"true", "1", "yes", "y", "si", "sì"}
    falsy = {"false", "0", "no", "n"}
    if lowered in truthy:
        return True
    if lowered in falsy:
        return False
    raise ValueError("must be true or false")


def _validate_url(value: object) -> str | None:
    text = _normalise_text(value)
    if not text:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("must be a valid http or https URL")
    return text


def _validate_latitude(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    if value < Decimal("-90") or value > Decimal("90"):
        raise ValueError("must be between -90 and 90")
    return value


def _validate_longitude(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    if value < Decimal("-180") or value > Decimal("180"):
        raise ValueError("must be between -180 and 180")
    return value


def _is_blank_row(values: Sequence[object]) -> bool:
    for value in values:
        text = _normalise_text(value)
        if text:
            return False
    return True


def _process_rows(
    rows: Iterator[tuple[int, Sequence[object]]],
    *,
    source_format: TemplateFormat,
    max_rows: int,
) -> ParsedWorkbook:
    processed_rows = 0
    stored_rows: list[StructureImportRow] = []
    errors: list[RowError] = []
    seen_slugs: dict[str, int] = {}
    blank_rows = 0

    for index, raw_values in rows:
        values = list(raw_values)
        if len(values) < len(HEADERS):
            values.extend([None] * (len(HEADERS) - len(values)))
        else:
            values = values[: len(HEADERS)]

        if _is_blank_row(values):
            blank_rows += 1
            continue

        processed_rows += 1
        if processed_rows > max_rows:
            raise ValueError(f"Too many rows. Maximum allowed is {max_rows}")

        name_value = values[0]
        slug_value = values[1]
        province_value = values[2]
        address_value = values[3]
        latitude_raw = values[4]
        longitude_raw = values[5]
        type_raw = values[6]
        beds_raw = values[7]
        bathrooms_raw = values[8]
        showers_raw = values[9]
        dining_capacity_raw = values[10]
        has_kitchen_raw = values[11]
        website_url_raw = values[12]
        notes_raw = values[13]

        row_errors: list[RowError] = []

        name = _normalise_text(name_value)
        if not name:
            row_errors.append(
                RowError(
                    row=index, field="name", message="cannot be empty", source_format=source_format
                )
            )

        try:
            slug = _validate_slug(_normalise_text(slug_value))
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="slug", message=str(exc), source_format=source_format)
            )
            slug = ""
        try:
            province = _validate_province(_normalise_text(province_value))
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="province", message=str(exc), source_format=source_format)
            )
            province = ""

        address = _normalise_text(address_value) or None

        try:
            latitude = _validate_latitude(_normalise_decimal(latitude_raw))
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="latitude", message=str(exc), source_format=source_format)
            )
            latitude = None

        try:
            longitude = _validate_longitude(_normalise_decimal(longitude_raw))
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="longitude", message=str(exc), source_format=source_format)
            )
            longitude = None

        try:
            structure_type = _validate_type(_normalise_text(type_raw))
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="type", message=str(exc), source_format=source_format)
            )
            structure_type = StructureType.HOUSE

        try:
            beds = _validate_positive_int(beds_raw)
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="beds", message=str(exc), source_format=source_format)
            )
            beds = None

        try:
            bathrooms = _validate_positive_int(bathrooms_raw)
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="bathrooms", message=str(exc), source_format=source_format)
            )
            bathrooms = None

        try:
            showers = _validate_positive_int(showers_raw)
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="showers", message=str(exc), source_format=source_format)
            )
            showers = None

        try:
            dining_capacity = _validate_positive_int(dining_capacity_raw)
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="dining_capacity", message=str(exc), source_format=source_format)
            )
            dining_capacity = None

        try:
            has_kitchen = _validate_bool(has_kitchen_raw)
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="has_kitchen", message=str(exc), source_format=source_format)
            )
            has_kitchen = None

        try:
            website_url = _validate_url(website_url_raw)
        except ValueError as exc:
            row_errors.append(
                RowError(row=index, field="website_url", message=str(exc), source_format=source_format)
            )
            website_url = None

        notes = _normalise_text(notes_raw) or None

        if slug and slug in seen_slugs:
            row_errors.append(
                RowError(
                    row=index,
                    field="slug",
                    message="duplicate slug in file",
                    source_format=source_format,
                )
            )
        elif slug:
            seen_slugs[slug] = index

        errors.extend(row_errors)
        if row_errors:
            continue

        stored_rows.append(
            StructureImportRow(
                row=index,
                name=name,
                slug=slug,
                province=province,
                address=address,
                latitude=latitude,
                longitude=longitude,
                type=structure_type,
                beds=beds,
                bathrooms=bathrooms,
                showers=showers,
                dining_capacity=dining_capacity,
                has_kitchen=has_kitchen,
                website_url=website_url,
                notes=notes,
            )
        )

    return ParsedWorkbook(
        rows=stored_rows,
        errors=errors,
        blank_rows=blank_rows,
        source_format=source_format,
    )


def parse_structures_xlsx(data: bytes, *, max_rows: int = 2000) -> ParsedWorkbook:
    if not data:
        raise ValueError("The uploaded file is empty")

    workbook = load_workbook(BytesIO(data), data_only=True, read_only=True)
    try:
        sheet = workbook.active
        try:
            header_row = next(sheet.iter_rows(max_row=1, values_only=True))
        except StopIteration as exc:
            raise ValueError("The uploaded file is empty") from exc

        header = [str(cell) if cell is not None else "" for cell in header_row]
        if [item.strip() for item in header] != HEADERS:
            raise ValueError("Invalid header. Please use the provided template")

        rows = _process_rows(
            ((index, tuple(row or tuple())) for index, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2)),
            source_format="xlsx",
            max_rows=max_rows,
        )
        return rows
    finally:
        workbook.close()


def parse_structures_csv(data: bytes, *, max_rows: int = 2000) -> ParsedWorkbook:
    if not data:
        raise ValueError("The uploaded file is empty")

    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("CSV must be UTF-8 encoded") from exc

    buffer = StringIO(text)
    reader = csv.reader(buffer, delimiter=",")

    try:
        header = next(reader)
    except StopIteration as exc:
        raise ValueError("The uploaded file is empty") from exc

    if [item.strip() for item in header] != HEADERS:
        raise ValueError("Invalid header. Please use the provided template")

    return _process_rows(
        ((index, row) for index, row in enumerate(reader, start=2)),
        source_format="csv",
        max_rows=max_rows,
    )


def parse_structures_file(
    data: bytes,
    *,
    source_format: TemplateFormat,
    max_rows: int = 2000,
) -> ParsedWorkbook:
    if source_format == "xlsx":
        return parse_structures_xlsx(data, max_rows=max_rows)
    if source_format == "csv":
        return parse_structures_csv(data, max_rows=max_rows)
    raise ValueError("Unsupported format")


def build_structures_template_workbook() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Structures"
    sheet.append(HEADERS)
    for row in TEMPLATE_SAMPLE_ROWS:
        sheet.append(
            [
                row["name"],
                row["slug"],
                row["province"],
                row["address"],
                row["latitude"],
                row["longitude"],
                row["type"],
                row["beds"],
                row["bathrooms"],
                row["showers"],
                row["dining_capacity"],
                row["has_kitchen"],
                row["website_url"],
                row["notes"],
            ]
        )
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def build_structures_template_csv() -> str:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(HEADERS)
    for row in TEMPLATE_SAMPLE_ROWS:
        writer.writerow(
            [
                row["name"],
                row["slug"],
                row["province"],
                row["address"],
                row["latitude"],
                row["longitude"],
                row["type"],
                row["beds"],
                row["bathrooms"],
                row["showers"],
                row["dining_capacity"],
                row["has_kitchen"],
                row["website_url"],
                row["notes"],
            ]
        )
    return output.getvalue()


__all__ = [
    "HEADERS",
    "TemplateFormat",
    "TEMPLATE_SAMPLE_ROWS",
    "ParsedWorkbook",
    "RowError",
    "StructureImportRow",
    "parse_structures_file",
    "parse_structures_csv",
    "parse_structures_xlsx",
    "build_structures_template_workbook",
    "build_structures_template_csv",
]
