import asyncio
import importlib.util
from pathlib import Path
from typing import Dict

import httpx
import pytest
from pydantic import BaseModel


def _install_schema_stubs() -> None:
    import sys
    import types

    package = types.ModuleType("app")
    package.__path__ = [str(Path(__file__).resolve().parents[1] / "app")]

    schemas_module = types.ModuleType("app.schemas")
    schemas_geocoding_module = types.ModuleType("app.schemas.geocoding")

    class GeocodingAddress(BaseModel):
        street: str | None = None
        house_number: str | None = None
        locality: str | None = None
        municipality: str | None = None
        province: str | None = None
        postal_code: str | None = None
        country: str | None = None

    class GeocodingResult(BaseModel):
        latitude: float
        longitude: float
        label: str
        address: GeocodingAddress | None = None

    class GeocodingSearchResponse(BaseModel):
        results: list[GeocodingResult]

    schemas_geocoding_module.GeocodingAddress = GeocodingAddress
    schemas_geocoding_module.GeocodingResult = GeocodingResult
    schemas_geocoding_module.GeocodingSearchResponse = GeocodingSearchResponse

    schemas_module.geocoding = schemas_geocoding_module

    sys.modules["app"] = package
    sys.modules["app.schemas"] = schemas_module
    sys.modules["app.schemas.geocoding"] = schemas_geocoding_module


_install_schema_stubs()

_GEO_MODULE_SPEC = importlib.util.spec_from_file_location(
    "app.services.geocoding",
    Path(__file__).resolve().parents[1] / "app/services/geocoding.py",
)
assert _GEO_MODULE_SPEC is not None and _GEO_MODULE_SPEC.loader is not None
geocoding = importlib.util.module_from_spec(_GEO_MODULE_SPEC)
_GEO_MODULE_SPEC.loader.exec_module(geocoding)


def test_build_params_extracts_house_number_and_cleans_tokens() -> None:
    params = geocoding._build_params(
        address="Via Brione, 26, Brione, Gussago, BS, CAP 25064, Italia",
        locality="Brione",
        municipality="Gussago",
        province="BS",
        postal_code="25064",
        country="IT",
        limit=5,
    )

    assert params["street"] == "26 Via Brione"
    assert params["housenumber"] == "26"
    assert params["city"] == "Gussago"
    assert params["postalcode"] == "25064"
    assert "CAP" not in params["q"]
    assert "25064" in params["q"]


def test_build_params_handles_inline_house_number() -> None:
    params = geocoding._build_params(
        address="Via Roma 12",
        locality=None,
        municipality="Roma",
        province=None,
        postal_code=None,
        country="IT",
        limit=1,
    )

    assert params["street"] == "12 Via Roma"
    assert params["housenumber"] == "12"
    assert params["city"] == "Roma"
    assert "Via Roma" in params["q"]
    assert "12" in params["q"]


def test_search_retries_without_structured_params() -> None:
    calls: list[Dict[str, str]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        params = dict(request.url.params)
        calls.append(params)

        if "street" in params:
            return httpx.Response(200, json=[])

        assert "street" not in params
        assert "city" not in params
        assert "county" not in params
        assert "postalcode" not in params

        payload = [
            {
                "lat": "45.635",
                "lon": "10.151",
                "display_name": "Via Brione 26, Gussago, Brescia, Italia",
                "address": {
                    "road": "Via Brione",
                    "house_number": "26",
                    "city": "Gussago",
                    "state_district": "Brescia",
                    "postcode": "25064",
                    "country": "Italia",
                },
            }
        ]
        return httpx.Response(200, json=payload)

    transport = httpx.MockTransport(handler)

    async def perform_search() -> list[geocoding.GeocodingResult]:
        async with httpx.AsyncClient(transport=transport) as mock_client:
            return await geocoding.search(
                address="Via Brione, 26, Brione, Gussago, BS, CAP 25064, Italia",
                locality="Brione",
                municipality="Gussago",
                province="BS",
                postal_code="25064",
                country="IT",
                client=mock_client,
            )

    results = asyncio.run(perform_search())

    assert len(results) == 1
    assert results[0].latitude == pytest.approx(45.635, rel=1e-5)
    assert len(calls) == 2
