import json
import os
from collections.abc import Generator

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./test.db")
os.environ.setdefault("APP_ENV", "test")

from app.core.config import get_settings  # noqa: E402
from app.core.mail import (  # noqa: E402
    ConsoleMailProvider,
    MailProviderError,
    SendgridMailProvider,
    SmtpMailProvider,
    get_mail_provider,
    reset_mail_provider,
)


@pytest.fixture(autouse=True)
def clear_settings() -> Generator[None, None, None]:
    get_settings.cache_clear()
    reset_mail_provider()
    yield
    get_settings.cache_clear()
    reset_mail_provider()


def test_console_provider_masks_email(
    caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MAIL_FROM_ADDRESS", "no-reply@example.com")
    monkeypatch.setenv("MAIL_FROM_NAME", "ScoutHouse")
    provider = ConsoleMailProvider()

    with caplog.at_level("INFO", logger="app.mail"):
        provider.send(
            to="alice.doe@example.com",
            subject="Subject",
            html="<p>reset?token=abc</p>",
            text="token=abc",
        )

    assert caplog.records
    record = caplog.records[0]
    payload = json.loads(record.message.split(" ", 1)[1])
    assert payload["to"] == "al***@ex***.com"
    assert payload["subject"] == "Subject"
    assert "token=***" in payload["html"]
    assert payload["from"] == "no***@ex***.com"


def test_smtp_provider_sends(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAIL_DRIVER", "smtp")
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("SMTP_PORT", "2525")
    monkeypatch.setenv("SMTP_USERNAME", "user")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("SMTP_TLS", "false")

    get_settings.cache_clear()

    calls: dict[str, bool] = {"sent": False}

    class DummySMTP:
        def __init__(self, host: str, port: int, timeout: int) -> None:
            self.host = host
            self.port = port
            self.timeout = timeout

        def __enter__(self) -> "DummySMTP":
            return self

        def __exit__(self, exc_type, exc, tb) -> None:  # type: ignore[no-untyped-def]
            return None

        def starttls(self) -> None:
            raise AssertionError("starttls should not be called when SMTP_TLS=false")

        def login(self, username: str, password: str) -> None:
            assert username == "user"
            assert password == "secret"

        def send_message(self, message) -> None:  # type: ignore[no-untyped-def]
            calls["sent"] = True
            assert message["To"] == "bob@example.com"

    monkeypatch.setattr("smtplib.SMTP", DummySMTP)

    provider = SmtpMailProvider()
    provider.send(to="bob@example.com", subject="Hi", html="<p>Hi</p>", text="Hi")
    assert calls["sent"] is True


def test_sendgrid_provider_calls_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAIL_DRIVER", "sendgrid")
    monkeypatch.setenv("SENDGRID_API_KEY", "test-key")

    get_settings.cache_clear()

    called: dict[str, object] = {}

    class DummyResponse:
        status_code = 202
        text = "accepted"

    class DummyClient:
        def __init__(self, *args, **kwargs) -> None:  # type: ignore[no-untyped-def]
            pass

        def post(self, url: str, json: dict[str, object], headers: dict[str, str]) -> DummyResponse:
            called["url"] = url
            called["json"] = json
            called["headers"] = headers
            return DummyResponse()

    monkeypatch.setattr("httpx.Client", DummyClient)

    provider = SendgridMailProvider()
    provider.send(to="bob@example.com", subject="Hello", html="<p>Hello</p>", text="Hello")

    assert called["url"] == "https://api.sendgrid.com/v3/mail/send"
    assert isinstance(called["json"], dict)
    assert called["headers"] == {"Authorization": "Bearer test-key"}


def test_get_mail_provider_respects_dev_block(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAIL_DRIVER", "smtp")
    monkeypatch.setenv("SMTP_HOST", "smtp.test")
    monkeypatch.setenv("DEV_MAIL_BLOCK_EXTERNAL", "true")

    get_settings.cache_clear()

    provider = get_mail_provider()
    assert isinstance(provider, ConsoleMailProvider)


def test_smtp_provider_requires_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAIL_DRIVER", "smtp")
    monkeypatch.delenv("SMTP_HOST", raising=False)

    get_settings.cache_clear()

    with pytest.raises(MailProviderError):
        SmtpMailProvider()
