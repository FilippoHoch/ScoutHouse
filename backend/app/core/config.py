from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = Field(..., alias="DATABASE_URL")
    app_env: str = Field("development", alias="APP_ENV")
    default_base_lat: float = Field(45.5966, alias="DEFAULT_BASE_LAT")
    default_base_lon: float = Field(10.1655, alias="DEFAULT_BASE_LON")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
