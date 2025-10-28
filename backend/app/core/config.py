from functools import lru_cache

from decimal import Decimal

from typing import List, Sequence

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
    cors_allowed_origins: List[str] = Field(
        default_factory=lambda: ["http://localhost:5173"], alias="CORS_ALLOWED_ORIGINS"
    )
    secure_cookies: bool = Field(False, alias="SECURE_COOKIES")
    frontend_base_url: str = Field("http://localhost:5173", alias="FRONTEND_BASE_URL")
    password_reset_ttl_minutes: int = Field(60, alias="PASSWORD_RESET_TTL_MINUTES")
    log_level: str = Field("INFO", alias="LOG_LEVEL")
    log_json: bool = Field(True, alias="LOG_JSON")
    sentry_dsn: str | None = Field(None, alias="SENTRY_DSN")
    sentry_traces_sample_rate: float = Field(0.1, alias="SENTRY_TRACES_SAMPLE_RATE")
    public_cache_max_age: int = Field(120, alias="PUBLIC_CACHE_MAX_AGE")
    public_cache_stale_while_revalidate: int = Field(
        600,
        alias="PUBLIC_CACHE_SWR",
    )
    gzip_min_length: int = Field(1024, alias="GZIP_MIN_LENGTH")
    s3_endpoint: str | None = Field(default=None, alias="S3_ENDPOINT")
    s3_bucket: str | None = Field(default=None, alias="S3_BUCKET")
    s3_access_key: str | None = Field(default=None, alias="S3_ACCESS_KEY")
    s3_secret_key: str | None = Field(default=None, alias="S3_SECRET_KEY")
    s3_region: str | None = Field(default=None, alias="S3_REGION")
    s3_use_path_style: bool = Field(False, alias="S3_USE_PATH_STYLE")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: Sequence[str] | str | None) -> Sequence[str]:
        if value is None:
            return ["http://localhost:5173"]
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return ["http://localhost:5173"]
            import json

            try:
                parsed = json.loads(cleaned)
            except Exception:
                return [origin.strip() for origin in cleaned.split(",") if origin.strip()]

            if isinstance(parsed, list):
                return [str(origin).strip() for origin in parsed if str(origin).strip()]
            if isinstance(parsed, str):
                return [parsed.strip()] if parsed.strip() else ["http://localhost:5173"]
            raise ValueError("CORS_ALLOWED_ORIGINS must be a list or CSV string")
        return list(value)

    @field_validator("sentry_traces_sample_rate")
    @classmethod
    def _clamp_sample_rate(cls, value: float) -> float:
        return max(0.0, min(1.0, value))

    @field_validator(
        "s3_endpoint",
        "s3_bucket",
        "s3_access_key",
        "s3_secret_key",
        "s3_region",
        mode="before",
    )
    @classmethod
    def _empty_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
