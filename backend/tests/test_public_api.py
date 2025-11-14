import pytest
from fastapi.testclient import TestClient

from app.core.db import Base, engine
from app.main import app
from tests.utils import auth_headers, participants_payload


@pytest.fixture(autouse=True)
def setup_database() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def stub_website_checks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.api.v1.structures._check_website_urls", lambda urls: [])


def get_client(*, authenticated: bool = False, is_admin: bool = True) -> TestClient:
    client = TestClient(app)
    if authenticated:
        client.headers.update(auth_headers(client, is_admin=is_admin))
    return client


def test_landing_snapshot_returns_real_data() -> None:
    admin_client = get_client(authenticated=True)

    for index, (slug, province, beds) in enumerate(
        [
            ("casa-alpina", "BS", 40),
            ("campo-garda", "VR", 30),
        ],
        start=1,
    ):
        response = admin_client.post(
            "/api/v1/structures",
            json={
                "name": f"Struttura {index}",
                "slug": slug,
                "province": province,
                "type": "house",
                "indoor_beds": beds,
            },
        )
        assert response.status_code == 201, response.text

    event_payloads = [
        {
            "title": "Campi Invernali",
            "branch": "EG",
            "status": "planning",
            "start_date": "2025-02-01",
            "end_date": "2025-02-04",
            "participants": participants_payload(eg=20, leaders=5, rs=2),
        },
        {
            "title": "Route Estiva",
            "branch": "RS",
            "status": "draft",
            "start_date": "2025-07-12",
            "end_date": "2025-07-20",
            "participants": participants_payload(rs=15, leaders=3),
        },
        {
            "title": "Evento passato",
            "branch": "ALL",
            "status": "archived",
            "start_date": "2024-01-01",
            "end_date": "2024-01-05",
            "participants": participants_payload(eg=10),
        },
    ]

    for payload in event_payloads:
        response = admin_client.post("/api/v1/events", json=payload)
        assert response.status_code == 201, response.text

    public_client = get_client()
    response = public_client.get("/api/v1/public/landing")

    assert response.status_code == 200
    data = response.json()

    assert data["structures_total"] == 2
    assert data["provinces_total"] == 2
    assert data["beds_total"] == 70
    assert data["events_total"] == 2
    assert data["participants_total"] == 45

    assert len(data["structures"]) == 2
    assert {item["slug"] for item in data["structures"]} == {"casa-alpina", "campo-garda"}

    assert len(data["events"]) == 2
    event_titles = [event["title"] for event in data["events"]]
    assert event_titles == ["Campi Invernali", "Route Estiva"]
    assert data["events"][0]["participants_total"] == 27
    assert data["events"][1]["participants_total"] == 18
