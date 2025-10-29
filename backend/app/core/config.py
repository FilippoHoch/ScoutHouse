from functools import lru_cache

import json
from decimal import Decimal

from typing import List, Literal, Sequence

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


DEFAULT_DATABASE_URL = "postgresql+psycopg://scout:changeme@db:5432/scouthouse"


class Settings(BaseSettings):
    database_url: str = Field(DEFAULT_DATABASE_URL, alias="DATABASE_URL")
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
        default_factory=list, alias="CORS_ALLOWED_ORIGINS"
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
    redis_url: str = Field("redis://cache:6379/0", alias="REDIS_URL")
    rq_queue_name: str = Field("scouthouse", alias="RQ_QUEUE_NAME")
    s3_endpoint: str | None = Field(default=None, alias="S3_ENDPOINT")
    s3_bucket: str | None = Field(default=None, alias="S3_BUCKET")
    s3_access_key: str | None = Field(default=None, alias="S3_ACCESS_KEY")
    s3_secret_key: str | None = Field(default=None, alias="S3_SECRET_KEY")
    s3_region: str | None = Field(default=None, alias="S3_REGION")
    s3_use_path_style: bool = Field(False, alias="S3_USE_PATH_STYLE")
    mail_driver: Literal["console", "smtp", "sendgrid"] = Field(
        "console", alias="MAIL_DRIVER"
    )
    mail_from_name: str = Field("ScoutHouse", alias="MAIL_FROM_NAME")
    mail_from_address: str = Field(
        "no-reply@scouthouse.local", alias="MAIL_FROM_ADDRESS"
    )
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int = Field(587, alias="SMTP_PORT")
    smtp_username: str | None = Field(default=None, alias="SMTP_USERNAME")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_tls: bool = Field(True, alias="SMTP_TLS")
    sendgrid_api_key: str | None = Field(default=None, alias="SENDGRID_API_KEY")
    dev_mail_block_external: bool = Field(True, alias="DEV_MAIL_BLOCK_EXTERNAL")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: Sequence[str] | str | None) -> Sequence[str]:
        if value is None:
            return []
        if isinstance(value, str):
            cleaned = value.strip()
            if not cleaned:
                return []

            if cleaned.startswith("["):
                try:
                    parsed = json.loads(cleaned)
                except json.JSONDecodeError as exc:  # pragma: no cover - defensive
                    raise ValueError("CORS_ALLOWED_ORIGINS must be valid JSON or CSV") from exc

                if isinstance(parsed, list):
                    return [str(origin).strip() for origin in parsed if str(origin).strip()]
                if isinstance(parsed, str):
                    parsed = parsed.strip()
                    return [parsed] if parsed else []
                raise ValueError("CORS_ALLOWED_ORIGINS must decode to a list or string")

            return [origin.strip() for origin in cleaned.split(",") if origin.strip()]

        return [str(origin).strip() for origin in value if str(origin).strip()]

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
        "smtp_host",
        "smtp_username",
        "smtp_password",
        "sendgrid_api_key",
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

    @field_validator("mail_driver", mode="before")
    @classmethod
    def _validate_mail_driver(cls, value: str | None) -> str:
        if value is None:
            return "console"
        normalized = value.strip().lower()
        allowed = {"console", "smtp", "sendgrid"}
        if normalized not in allowed:
            raise ValueError(
                "MAIL_DRIVER must be one of 'console', 'smtp' or 'sendgrid'"
            )
        return normalized

    @field_validator("mail_from_name", "mail_from_address", mode="before")
    @classmethod
    def _strip_mail_strings(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("Mail sender fields cannot be empty")
        return stripped

    @field_validator("smtp_port", mode="before")
    @classmethod
    def _coerce_smtp_port(cls, value: int | str | None) -> int | str:
        if value is None:
            return 587
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return 587
            return stripped
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def _ensure_database_url(cls, value: str | None) -> str:
        if value is None:
            return DEFAULT_DATABASE_URL
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return DEFAULT_DATABASE_URL
            return stripped
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


REDIS_URL: str = get_settings().redis_url
RQ_QUEUE_NAME: str = get_settings().rq_queue_name
