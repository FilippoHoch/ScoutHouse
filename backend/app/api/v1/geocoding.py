from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.schemas.geocoding import GeocodingSearchResponse
from app.services import geocoding

router = APIRouter(prefix="/geocoding", tags=["geocoding"])


@router.get("/search", response_model=GeocodingSearchResponse)
async def search_geocoding(
    *,
    address: Annotated[str | None, Query(max_length=255)] = None,
    locality: Annotated[str | None, Query(max_length=255)] = None,
    municipality: Annotated[str | None, Query(max_length=255)] = None,
    province: Annotated[str | None, Query(max_length=100)] = None,
    postal_code: Annotated[str | None, Query(max_length=16)] = None,
    country: Annotated[str | None, Query(min_length=2, max_length=2)] = "IT",
    limit: Annotated[int, Query(ge=1, le=10)] = 5,
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
