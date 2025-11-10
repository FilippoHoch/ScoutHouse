import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from tests.utils import auth_headers, participants_payload


@pytest.fixture(autouse=True)
def setup_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def get_client(*, authenticated: bool = False, is_admin: bool = False) -> TestClient:
    client = TestClient(app)
    if authenticated:
        client.headers.update(auth_headers(client, is_admin=is_admin))
    return client


def create_structure_with_cost(client: TestClient) -> int:
    structure_payload = {
        "name": "Casa Alpina",
        "slug": "casa-alpina",
        "province": "BG",
        "type": "house",
    }
    response = client.post("/api/v1/structures/", json=structure_payload)
    assert response.status_code == 201
    structure_id = response.json()["id"]

    cost_payload = {
        "model": "per_person_day",
        "amount": "12.50",
        "currency": "EUR",
        "booking_deposit": "150.00",
        "city_tax_per_night": "1.20",
        "utilities_flat": "25.00",
    }
    add_cost = client.post(
        f"/api/v1/structures/{structure_id}/cost-options",
        json=cost_payload,
    )
    assert add_cost.status_code == 201
    return structure_id


def create_event(client: TestClient) -> int:
    event_payload = {
        "title": "Campo Estivo",
        "branch": "ALL",
        "start_date": "2025-08-01",
        "end_date": "2025-08-03",
        "participants": participants_payload(lc=8, eg=4, leaders=2),
    }
    response = client.post("/api/v1/events", json=event_payload)
    assert response.status_code == 201
    return response.json()["id"]


def test_quote_flow() -> None:
    client = get_client(authenticated=True, is_admin=True)
    structure_id = create_structure_with_cost(client)
    event_id = create_event(client)

    calc_response = client.post(
        "/api/v1/quotes/calc",
        json={"event_id": event_id, "structure_id": structure_id},
    )
    assert calc_response.status_code == 200
    calc_data = calc_response.json()
    assert calc_data["totals"]["subtotal"] == pytest.approx(525.0)
    assert calc_data["totals"]["total"] == pytest.approx(583.6)
    assert calc_data["scenarios"]["realistic"] == pytest.approx(583.6)

    create_response = client.post(
        f"/api/v1/events/{event_id}/quotes",
        json={"structure_id": structure_id, "scenario": "realistic"},
    )
    assert create_response.status_code == 201
    quote = create_response.json()
    quote_id = quote["id"]
    assert quote["totals"]["total"] == pytest.approx(583.6)
    assert quote["scenarios"]["worst"] > quote["totals"]["total"]

    list_response = client.get(f"/api/v1/events/{event_id}/quotes")
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) == 1
    assert items[0]["id"] == quote_id
    assert items[0]["total"] == pytest.approx(583.6)

    get_response = client.get(f"/api/v1/quotes/{quote_id}")
    assert get_response.status_code == 200
    assert get_response.json()["id"] == quote_id

    export_xlsx = client.get(f"/api/v1/quotes/{quote_id}/export?format=xlsx")
    assert export_xlsx.status_code == 200
    assert (
        export_xlsx.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert export_xlsx.headers["content-disposition"].startswith("attachment;")
    assert len(export_xlsx.content) > 0

    export_html = client.get(f"/api/v1/quotes/{quote_id}/export?format=html")
    assert export_html.status_code == 200
    assert export_html.headers["content-type"].startswith("text/html")
    assert "Preventivo" in export_html.text
