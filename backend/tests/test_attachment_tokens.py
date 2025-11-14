from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt

from app.core.config import get_settings
from app.core.security import create_attachment_token, verify_attachment_token


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_attachment_token_roundtrip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "testing-secret")
    token = create_attachment_token(attachment_id=42, disposition="inline", ttl_seconds=60)
    attachment_id, mode = verify_attachment_token(token)
    assert attachment_id == 42
    assert mode == "inline"


def test_attachment_token_rejects_invalid_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", "testing-secret")
    get_settings.cache_clear()
    settings = get_settings()
    payload = {
        "sub": "99",
        "type": "access",
        "exp": datetime.now(UTC) + timedelta(minutes=1),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(ValueError):
        verify_attachment_token(token)
