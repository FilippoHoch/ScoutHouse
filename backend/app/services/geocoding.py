from __future__ import annotations

from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.geocoding import GeocodingAddress, GeocodingResult


class GeocodingError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _normalize_query_part(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _pick(address: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = address.get(key)
        if value:
            return str(value)
    return None


def _build_address(entry: dict[str, Any]) -> GeocodingAddress | None:
    address = entry.get("address")
    if not isinstance(address, dict):
        return None

    locality = _pick(
        address,
        "hamlet",
        "neighbourhood",
        "suburb",
        "village",
        "locality",
    )
    municipality = _pick(
        address,
        "city",
        "town",
        "municipality",
        "county",
    )
    province = _pick(address, "state_district", "province", "state", "region")

    return GeocodingAddress(
        street=_pick(address, "road", "pedestrian", "path", "residential"),
        house_number=_pick(address, "house_number", "house_name"),
        locality=locality,
        municipality=municipality,
        province=province,
        postal_code=_pick(address, "postcode"),
        country=_pick(address, "country_code", "country"),
    )


def _build_params(
    *,
    address: str | None,
    locality: str | None,
    municipality: str | None,
    province: str | None,
    postal_code: str | None,
    country: str | None,
    limit: int,
) -> dict[str, str]:
    params: dict[str, str] = {
        "format": "jsonv2",
        "addressdetails": "1",
        "limit": str(max(1, min(limit, 10))),
    }

    parts = [
        value
        for value in (
            _normalize_query_part(address),
            _normalize_query_part(locality),
            _normalize_query_part(municipality),
            _normalize_query_part(province),
            _normalize_query_part(postal_code),
            _normalize_query_part(country),
        )
        if value
    ]
    if parts:
        params["q"] = ", ".join(parts)

    street = _normalize_query_part(address)
    if street:
        params["street"] = street

    city = _normalize_query_part(locality) or _normalize_query_part(municipality)
    if city:
        params["city"] = city

    county = _normalize_query_part(province)
    if county:
        params["county"] = county

    code = _normalize_query_part(postal_code)
    if code:
        params["postalcode"] = code

    country_code = _normalize_query_part(country)
    if country_code:
        params["countrycodes"] = country_code.lower()

    return params


async def search(
    *,
    address: str | None = None,
    locality: str | None = None,
    municipality: str | None = None,
    province: str | None = None,
    postal_code: str | None = None,
    country: str | None = "IT",
    limit: int = 5,
    client: httpx.AsyncClient | None = None,
) -> list[GeocodingResult]:
    settings = get_settings()
    params = _build_params(
        address=address,
        locality=locality,
        municipality=municipality,
        province=province,
        postal_code=postal_code,
        country=country,
        limit=limit,
    )

    headers = {
        "User-Agent": settings.geocoding_user_agent,
        "Accept": "application/json",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.6",
    }
    url = f"{settings.geocoding_base_url.rstrip('/')}/search"

    async def _perform(request_client: httpx.AsyncClient) -> list[dict[str, Any]]:
        try:
            response = await request_client.get(url, params=params, headers=headers, timeout=10.0)
        except httpx.RequestError as exc:  # pragma: no cover - network failure
            raise GeocodingError("Unable to contact geocoding provider") from exc

        if response.status_code == 429:
            raise GeocodingError("Geocoding quota exceeded", status_code=503)
        if response.status_code >= 500:
            raise GeocodingError("Geocoding provider is temporarily unavailable", status_code=503)
        if response.status_code >= 400:
            raise GeocodingError("Unable to resolve the requested address", status_code=422)

        try:
            payload = response.json()
        except ValueError as exc:  # pragma: no cover - defensive
            raise GeocodingError("Invalid response from geocoding provider") from exc

        if not isinstance(payload, list):  # pragma: no cover - defensive
            raise GeocodingError("Unexpected geocoding response format")

        return payload

    if client is not None:
        raw_results = await _perform(client)
    else:
        async with httpx.AsyncClient() as owned_client:
            raw_results = await _perform(owned_client)

    results: list[GeocodingResult] = []
    for entry in raw_results:
        if not isinstance(entry, dict):
            continue
        lat = entry.get("lat")
        lon = entry.get("lon")
        if lat is None or lon is None:
            continue
        try:
            latitude = float(lat)
            longitude = float(lon)
        except (TypeError, ValueError):
            continue
        label = str(entry.get("display_name", "")).strip() or ""
        results.append(
            GeocodingResult(
                latitude=latitude,
                longitude=longitude,
                label=label,
                address=_build_address(entry),
            )
        )
    return results
