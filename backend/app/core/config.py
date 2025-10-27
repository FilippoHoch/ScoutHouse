from functools import lru_cache

from decimal import Decimal

from typing import Sequence

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = Field(..., alias="DATABASE_URL")
    app_env: str = Field("development", alias="APP_ENV")
    default_base_lat: float = Field(45.5966, alias="DEFAULT_BASE_LAT")
    default_base_lon: float = Field(10.1655, alias="DEFAULT_BASE_LON")
    cost_band_cheap_max: Decimal = Field(Decimal("8"), alias="COST_BAND_CHEAP_MAX")
    cost_band_medium_max: Decimal = Field(Decimal("15"), alias="COST_BAND_MEDIUM_MAX")
    scenario_margin_best: Decimal = Field(Decimal("0.05"), alias="SCENARIO_MARGIN_BEST")
    scenario_margin_worst: Decimal = Field(Decimal("0.10"), alias="SCENARIO_MARGIN_WORST")

    jwt_secret: str = Field("change-me", alias="JWT_SECRET")
    access_ttl_min: int = Field(10, alias="ACCESS_TTL_MIN")
    refresh_ttl_days: int = Field(14, alias="REFRESH_TTL_DAYS")
    allow_registration: bool = Field(False, alias="ALLOW_REGISTRATION")
    cors_allowed_origins: Sequence[str] = Field(default_factory=list, alias="CORS_ALLOWED_ORIGINS")
    secure_cookies: bool = Field(False, alias="SECURE_COOKIES")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: Sequence[str] | str) -> Sequence[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
