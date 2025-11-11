import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1 import geocoding as geocoding_api
from app.main import app
from app.schemas.geocoding import GeocodingAddress, GeocodingResult

client = TestClient(app)


def test_geocoding_search(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_search(**kwargs):  # type: ignore[no-untyped-def]
        assert kwargs["address"] == "Via Roma 1"
        return [
            GeocodingResult(
                latitude=45.4642,
                longitude=9.19,
                altitude=123.0,
                altitude_is_approximate=True,
                label="Via Roma 1, Milano, Lombardia, Italia",
                address=GeocodingAddress(
                    street="Via Roma",
                    house_number="1",
                    municipality="Milano",
                    province="Lombardia",
                    postal_code="20121",
                    country="IT",
                ),
            )
        ]

    monkeypatch.setattr(geocoding_api.geocoding, "search", fake_search)

    response = client.get(
        "/api/v1/geocoding/search",
        params={"address": "Via Roma 1", "municipality": "Milano"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["results"][0]["latitude"] == pytest.approx(45.4642, rel=1e-3)
    assert payload["results"][0]["altitude"] == pytest.approx(123.0)
    assert payload["results"][0]["altitude_is_approximate"] is True
    assert payload["results"][0]["is_approximate"] is True
    assert payload["results"][0]["address"]["postal_code"] == "20121"


def test_geocoding_search_handles_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_search(**kwargs):  # type: ignore[no-untyped-def]
        raise geocoding_api.geocoding.GeocodingError("Service down", status_code=503)

    monkeypatch.setattr(geocoding_api.geocoding, "search", fake_search)

    response = client.get("/api/v1/geocoding/search", params={"address": "Unknown"})
    assert response.status_code == 503
    assert response.json()["detail"] == "Service down"


def test_geocoding_search_returns_empty_on_client_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "Invalid"})

    transport = httpx.MockTransport(handler)

    async def perform_search() -> list[geocoding_api.geocoding.GeocodingResult]:
        async with httpx.AsyncClient(transport=transport) as mock_client:
            return await geocoding_api.geocoding.search(address="Via Roma", client=mock_client)

    results = asyncio.run(perform_search())

    assert results == []
