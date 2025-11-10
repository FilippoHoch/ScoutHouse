from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.schemas.geocoding import GeocodingSearchResponse
from app.services import geocoding

router = APIRouter(prefix="/geocoding", tags=["geocoding"])


@router.get("/search", response_model=GeocodingSearchResponse)
async def search_geocoding(
    *,
    address: Annotated[str | None, Query(default=None, max_length=255)],
    locality: Annotated[str | None, Query(default=None, max_length=255)],
    municipality: Annotated[str | None, Query(default=None, max_length=255)],
    province: Annotated[str | None, Query(default=None, max_length=100)],
    postal_code: Annotated[str | None, Query(default=None, max_length=16)],
    country: Annotated[str | None, Query(default="IT", min_length=2, max_length=2)],
    limit: Annotated[int, Query(default=5, ge=1, le=10)],
) -> GeocodingSearchResponse:
    try:
        results = await geocoding.search(
            address=address,
            locality=locality,
            municipality=municipality,
            province=province,
            postal_code=postal_code,
            country=country,
            limit=limit,
        )
    except geocoding.GeocodingError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return GeocodingSearchResponse(results=results)
