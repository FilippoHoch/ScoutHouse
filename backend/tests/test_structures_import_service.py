import csv
from io import StringIO

from app.services.structures_import import HEADERS, parse_structures_csv


def _build_csv(rows: list[dict[str, object]]) -> bytes:
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(HEADERS)
    for row in rows:
        writer.writerow([row.get(header, "") for header in HEADERS])
    return buffer.getvalue().encode("utf-8")


def test_house_row_ignores_outdoor_fields_with_warnings() -> None:
    data = _build_csv(
        [
            {
                "name": "Casa Bosco",
                "slug": "casa-bosco",
                "province": "MI",
                "type": "house",
                "indoor_beds": "18",
                "shelter_on_field": "yes",
                "land_area_m2": "450",
                "fire_policy": "allowed",
                "pit_latrine_allowed": "true",
            }
        ]
    )

    result = parse_structures_csv(data)

    assert not result.errors or any(
        error.field == "land_area_m2" and "Ignored for type=house" in error.message
        for error in result.errors
    )
    assert any(
        error.field == "shelter_on_field" and "Ignored for type=house" in error.message
        for error in result.errors
    )

    assert len(result.rows) == 1
    row = result.rows[0]
    assert row.indoor_beds == 18
    assert row.land_area_m2 is None
    assert row.fire_policy is None
    assert row.shelter_on_field is False
    assert row.pit_latrine_allowed is False


def test_land_row_clears_indoor_fields_and_normalises_booleans() -> None:
    data = _build_csv(
        [
            {
                "name": "Campo Pianura",
                "slug": "campo-pianura",
                "province": "BG",
                "type": "land",
                "indoor_beds": "20",
                "indoor_showers": "4",
                "indoor_activity_rooms": "2",
                "has_kitchen": "YES",
                "hot_water": "true",
                "shelter_on_field": "si",
                "electricity_available": "1",
                "pit_latrine_allowed": "0",
            }
        ]
    )

    result = parse_structures_csv(data)

    assert any(
        error.field == "indoor_beds" and "Ignored for type=land" in error.message
        for error in result.errors
    )
    assert any(
        error.field == "hot_water" and "Ignored for type=land" in error.message
        for error in result.errors
    )

    assert len(result.rows) == 1
    row = result.rows[0]
    assert row.indoor_beds is None
    assert row.indoor_showers is None
    assert row.indoor_activity_rooms is None
    assert row.has_kitchen is False
    assert row.hot_water is False
    assert row.shelter_on_field is True
    assert row.electricity_available is True
    assert row.pit_latrine_allowed is False


def test_website_urls_split_from_text_field() -> None:
    data = _build_csv(
        [
            {
                "name": "Casa Digitale",
                "slug": "casa-digitale",
                "province": "MI",
                "type": "house",
                "website_urls": "https://example.org/uno;https://example.org/due\nhttps://example.org/tre",
            }
        ]
    )

    result = parse_structures_csv(data)

    assert not result.errors
    assert len(result.rows) == 1
    assert result.rows[0].website_urls == [
        "https://example.org/uno",
        "https://example.org/due",
        "https://example.org/tre",
    ]


def test_contact_emails_are_normalised_and_deduplicated() -> None:
    data = _build_csv(
        [
            {
                "name": "Casa Email",
                "slug": "casa-email",
                "province": "MI",
                "type": "house",
                "contact_emails": "INFO@example.org; contatti@example.org\ninfo@example.org",
            }
        ]
    )

    result = parse_structures_csv(data)

    assert not result.errors
    assert len(result.rows) == 1
    assert result.rows[0].contact_emails == [
        "info@example.org",
        "contatti@example.org",
    ]
