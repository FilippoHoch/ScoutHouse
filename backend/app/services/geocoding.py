from __future__ import annotations

import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.geocoding import GeocodingAddress, GeocodingResult


class GeocodingError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


_CAP_PREFIX_RE = re.compile(r"(?i)\bcap\b[\s.:]*")
_ITALIA_RE = re.compile(r"(?i)\bitalia\b")
_MULTIPLE_WHITESPACE_RE = re.compile(r"\s+")
_HOUSE_NUMBER_SUFFIX_RE = re.compile(r"(?i)(\d+[A-Za-z]?(?:/\d+[A-Za-z]?)?)$")
_HOUSE_NUMBER_PREFIX_RE = re.compile(r"(?i)^(?:n\.?|n°)\s*")


def _normalize_query_part(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _split_address_components(value: str) -> list[str]:
    components: list[str] = []
    for piece in value.replace("\n", ",").split(","):
        cleaned = piece.strip()
        if cleaned:
            components.append(cleaned)
    if not components:
        collapsed = value.strip()
        return [collapsed] if collapsed else []
    return components


def _cleanup_query_token(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = _CAP_PREFIX_RE.sub("", value)
    cleaned = _ITALIA_RE.sub("", cleaned)
    cleaned = _MULTIPLE_WHITESPACE_RE.sub(" ", cleaned)
    cleaned = cleaned.strip(" ,")
    return cleaned or None


def _normalize_postal_code(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = _CAP_PREFIX_RE.sub("", value)
    cleaned = cleaned.strip()
    cleaned = cleaned.replace(" ", "")
    return cleaned or None


def _normalize_house_number(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = _HOUSE_NUMBER_PREFIX_RE.sub("", value.strip())
    cleaned = cleaned.replace(" ", "")
    if not cleaned:
        return None
    if not re.fullmatch(r"\d+[A-Za-z]?(?:/\d+[A-Za-z]?)?", cleaned):
        return None
    return cleaned


def _extract_street_components(value: str | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    components = _split_address_components(value)
    if not components:
        return None, None

    street_candidate = components[0]
    match = _HOUSE_NUMBER_SUFFIX_RE.search(street_candidate)
    if match:
        number = _normalize_house_number(match.group(1))
        street_name = street_candidate[: match.start()].strip(" ,")
        cleaned_street = _cleanup_query_token(street_name) or street_name.strip()
        return (cleaned_street or None), number

    for component in components[1:]:
        number = _normalize_house_number(component)
        if number:
            cleaned_street = _cleanup_query_token(street_candidate) or street_candidate.strip()
            return (cleaned_street or None), number

    cleaned_street = _cleanup_query_token(street_candidate) or street_candidate.strip()
    return (cleaned_street or None), None


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
    structured: bool = True,
) -> dict[str, str]:
    params: dict[str, str] = {
        "format": "jsonv2",
        "addressdetails": "1",
        "limit": str(max(1, min(limit, 10))),
    }

    normalized_address = _normalize_query_part(address)
    address_parts = _split_address_components(normalized_address) if normalized_address else []
    postal_value = _normalize_postal_code(_normalize_query_part(postal_code))

    parts: list[str] = []
    seen_parts: set[str] = set()
    for candidate in [
        *address_parts,
        _normalize_query_part(locality),
        _normalize_query_part(municipality),
        _normalize_query_part(province),
        postal_value,
        _normalize_query_part(country),
    ]:
        cleaned = _cleanup_query_token(candidate)
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered in seen_parts:
            continue
        seen_parts.add(lowered)
        parts.append(cleaned)

    if parts:
        params["q"] = ", ".join(parts)

    if structured:
        street_name, house_number = _extract_street_components(normalized_address)
        if street_name:
            if house_number:
                params["street"] = f"{house_number} {street_name}"
                params["housenumber"] = house_number
            else:
                params["street"] = street_name

        city = _normalize_query_part(municipality) or _normalize_query_part(locality)
        if city:
            params["city"] = city

        county = _normalize_query_part(province) or _normalize_query_part(municipality)
        if county:
            params["county"] = county

        if postal_value:
            params["postalcode"] = postal_value

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
    should_retry_without_structure = any(
        key in params for key in ("street", "housenumber", "city", "county", "postalcode")
    )

    headers = {
        "User-Agent": settings.geocoding_user_agent,
        "Accept": "application/json",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.6",
    }
    url = f"{settings.geocoding_base_url.rstrip('/')}/search"

    async def _perform(
        request_client: httpx.AsyncClient, query_params: dict[str, str]
    ) -> list[dict[str, Any]]:
        try:
            response = await request_client.get(
                url, params=query_params, headers=headers, timeout=10.0
            )
        except httpx.RequestError as exc:  # pragma: no cover - network failure
            raise GeocodingError("Unable to contact geocoding provider") from exc

        if response.status_code == 429:
            raise GeocodingError("Geocoding quota exceeded", status_code=503)
        if response.status_code >= 500:
            raise GeocodingError("Geocoding provider is temporarily unavailable", status_code=503)
        if 400 <= response.status_code < 500:
            return []

        try:
            payload = response.json()
        except ValueError as exc:  # pragma: no cover - defensive
            raise GeocodingError("Invalid response from geocoding provider") from exc

        if not isinstance(payload, list):  # pragma: no cover - defensive
            raise GeocodingError("Unexpected geocoding response format")

        return payload

    timeout = httpx.Timeout(10.0, connect=5.0)
    limits = httpx.Limits(max_connections=10, max_keepalive_connections=5)

    async def _fetch_altitudes(
        request_client: httpx.AsyncClient,
        coordinates: list[tuple[float, float]],
    ) -> list[float | None]:
        if not coordinates:
            return []

        altitude_url = f"{settings.elevation_base_url.rstrip('/')}/v1/elevation"
        lat_values = ",".join(f"{lat:.6f}" for lat, _ in coordinates)
        lon_values = ",".join(f"{lon:.6f}" for _, lon in coordinates)
        altitude_headers = {
            "User-Agent": settings.geocoding_user_agent,
            "Accept": "application/json",
        }

        try:
            response = await request_client.get(
                altitude_url,
                params={"latitude": lat_values, "longitude": lon_values},
                headers=altitude_headers,
                timeout=10.0,
            )
        except httpx.RequestError:
            return [None] * len(coordinates)

        if response.status_code >= 500 or response.status_code == 429:
            return [None] * len(coordinates)
        if response.status_code >= 400:
            return [None] * len(coordinates)

        try:
            payload = response.json()
        except ValueError:
            return [None] * len(coordinates)

        altitudes: list[float | None] = [None] * len(coordinates)

        if isinstance(payload, dict):
            elevation_value = payload.get("elevation")
            if isinstance(elevation_value, list):
                for index, value in enumerate(elevation_value[: len(altitudes)]):
                    try:
                        altitudes[index] = float(value)
                    except (TypeError, ValueError):
                        altitudes[index] = None
            elif isinstance(elevation_value, (int, float, str)):
                try:
                    altitudes[0] = float(elevation_value)
                except (TypeError, ValueError):
                    altitudes[0] = None

            results_payload = payload.get("results")
            if isinstance(results_payload, list):
                for index, entry in enumerate(results_payload[: len(altitudes)]):
                    if not isinstance(entry, dict):
                        continue
                    try:
                        altitude_value = float(entry.get("elevation"))
                    except (TypeError, ValueError):
                        altitude_value = None
                    altitudes[index] = altitude_value

        return altitudes

    async def _collect(
        request_client: httpx.AsyncClient,
    ) -> list[GeocodingResult]:
        raw_results = await _perform(request_client, params)

        if not raw_results and should_retry_without_structure:
            fallback_params = _build_params(
                address=address,
                locality=locality,
                municipality=municipality,
                province=province,
                postal_code=postal_code,
                country=country,
                limit=limit,
                structured=False,
            )

            raw_results = await _perform(request_client, fallback_params)

        processed: list[tuple[float, float, str, GeocodingAddress | None]] = []
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
            processed.append(
                (latitude, longitude, label, _build_address(entry))
            )

        coordinates = [(item[0], item[1]) for item in processed]
        altitudes = await _fetch_altitudes(request_client, coordinates)

        results: list[GeocodingResult] = []
        for index, (latitude, longitude, label, geocoded_address) in enumerate(
            processed
        ):
            altitude = altitudes[index] if index < len(altitudes) else None
            results.append(
                GeocodingResult(
                    latitude=latitude,
                    longitude=longitude,
                    altitude=altitude,
                    is_approximate=True,
                    altitude_is_approximate=altitude is not None,
                    label=label,
                    address=geocoded_address,
                )
            )

        return results

    if client is not None:
        return await _collect(client)

    async with httpx.AsyncClient(timeout=timeout, limits=limits) as owned_client:
        return await _collect(owned_client)
