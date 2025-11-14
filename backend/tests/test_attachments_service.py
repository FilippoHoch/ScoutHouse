from __future__ import annotations

from urllib.parse import urlparse

import pytest

from app.core.config import get_settings
from app.services.attachments import rewrite_presigned_url


@pytest.fixture(autouse=True)
def clear_settings_cache() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_rewrite_presigned_url_preserves_original_when_no_public_endpoint(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT", "")

    original = "https://s3.example.com/bucket/path/to/file.jpg?signature=abc"
    rewritten = rewrite_presigned_url(original)

    assert rewritten == original


@pytest.mark.parametrize(
    "public_endpoint, expected_netloc, expected_path",
    [
        (
            "https://cdn.example.com",
            "cdn.example.com",
            "/bucket/path/to/file.jpg",
        ),
        (
            "https://cdn.example.com/assets",
            "cdn.example.com",
            "/assets/path/to/file.jpg",
        ),
        (
            "https://cdn.example.com/assets/",
            "cdn.example.com",
            "/assets/path/to/file.jpg",
        ),
        (
            "https://cdn.example.com/assets/bucket",
            "cdn.example.com",
            "/assets/bucket/path/to/file.jpg",
        ),
    ],
)
def test_rewrite_presigned_url_uses_public_endpoint_path(
    monkeypatch: pytest.MonkeyPatch,
    public_endpoint: str,
    expected_netloc: str,
    expected_path: str,
) -> None:
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT", public_endpoint)
    monkeypatch.setenv("S3_BUCKET", "bucket")

    original = "https://s3.internal.local/bucket/path/to/file.jpg?signature=abc"

    rewritten = rewrite_presigned_url(original)
    parsed = urlparse(rewritten)

    assert parsed.scheme == "https"
    assert parsed.netloc == expected_netloc
    assert parsed.path == expected_path
    # Query string must be preserved untouched
    assert parsed.query == "signature=abc"


def test_rewrite_presigned_url_handles_virtual_host_style(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("S3_PUBLIC_ENDPOINT", "https://cdn.example.com/assets")
    monkeypatch.setenv("S3_BUCKET", "bucket")

    original = "https://bucket.storage.local/path/to/file.jpg?signature=abc"

    rewritten = rewrite_presigned_url(original)
    parsed = urlparse(rewritten)

    assert parsed.scheme == "https"
    assert parsed.netloc == "cdn.example.com"
    assert parsed.path == "/assets/path/to/file.jpg"
    assert parsed.query == "signature=abc"
