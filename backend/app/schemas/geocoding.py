from pydantic import BaseModel


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
