from __future__ import annotations

import json
import logging
import re
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr
from threading import RLock
from typing import Protocol

import httpx

from app.core.config import get_settings

logger = logging.getLogger("app.mail")


@dataclass(slots=True)
class MailMessage:
    subject: str
    html: str
    text: str


class MailProvider(Protocol):
    name: str

    def send(self, *, to: str, subject: str, html: str, text: str) -> None: ...


class MailProviderError(RuntimeError):
    """Raised when a provider cannot deliver a message."""


def _mask_email(address: str) -> str:
    local, _, domain = address.partition("@")
    if not local or not domain:
        return "***"
    masked_local = local[:2] + "***" if len(local) > 2 else local[0] + "***"
    domain_name, _, tld = domain.rpartition(".")
    if not domain_name or not tld:
        return masked_local + "@***"
    masked_domain = domain_name[:2] + "***" if len(domain_name) > 2 else domain_name[0] + "***"
    return f"{masked_local}@{masked_domain}.{tld}"


TOKEN_PATTERN = re.compile(r"(token=)([^&\s]+)", flags=re.IGNORECASE)
URL_PATTERN = re.compile(r"https?://[^/]+(/[^\s\"']*)")


def _sanitize_content(value: str) -> str:
    without_token = TOKEN_PATTERN.sub(r"\1***", value)
    # keep only the path portion of URLs to avoid leaking hostnames in logs
    return URL_PATTERN.sub(lambda match: match.group(1), without_token)


class ConsoleMailProvider:
    name = "console"

    def __init__(self) -> None:
        settings = get_settings()
        self._from_name = settings.mail_from_name
        self._from_address = settings.mail_from_address

    def send(self, *, to: str, subject: str, html: str, text: str) -> None:
        payload = {
            "driver": self.name,
            "from": _mask_email(self._from_address),
            "to": _mask_email(to),
            "subject": subject,
            "html": _sanitize_content(html),
            "text": _sanitize_content(text),
        }
        logger.info("mail.outgoing %s", json.dumps(payload, ensure_ascii=False))


class SmtpMailProvider:
    name = "smtp"

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.smtp_host:
            raise MailProviderError("SMTP_HOST must be configured for smtp driver")
        self._host = settings.smtp_host
        self._port = settings.smtp_port
        self._username = settings.smtp_username
        self._password = settings.smtp_password
        self._use_tls = settings.smtp_tls
        self._from_name = settings.mail_from_name
        self._from_address = settings.mail_from_address

    def send(self, *, to: str, subject: str, html: str, text: str) -> None:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = formataddr((self._from_name, self._from_address))
        message["To"] = to
        message.set_content(text)
        message.add_alternative(html, subtype="html")

        try:
            with smtplib.SMTP(self._host, self._port, timeout=15) as client:
                if self._use_tls:
                    client.starttls()
                if self._username:
                    client.login(self._username, self._password or "")
                client.send_message(message)
        except Exception as exc:  # pragma: no cover - network interaction
            raise MailProviderError("Failed to send message via SMTP") from exc


class SendgridMailProvider:
    name = "sendgrid"

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.sendgrid_api_key:
            raise MailProviderError("SENDGRID_API_KEY must be configured for sendgrid driver")
        self._api_key = settings.sendgrid_api_key
        self._from_name = settings.mail_from_name
        self._from_address = settings.mail_from_address
        self._client = httpx.Client(timeout=15)

    def send(self, *, to: str, subject: str, html: str, text: str) -> None:
        payload = {
            "personalizations": [{"to": [{"email": to}]}],
            "from": {"email": self._from_address, "name": self._from_name},
            "subject": subject,
            "content": [
                {"type": "text/plain", "value": text},
                {"type": "text/html", "value": html},
            ],
        }
        try:
            response = self._client.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
        except Exception as exc:  # pragma: no cover - network interaction
            raise MailProviderError("Failed to call SendGrid API") from exc

        if response.status_code >= 400:
            raise MailProviderError(
                f"SendGrid API returned {response.status_code}: {response.text}"
            )


_provider_lock = RLock()
_provider_instance: MailProvider | None = None
_provider_override: MailProvider | None = None


def _build_provider() -> MailProvider:
    settings = get_settings()
    driver = settings.mail_driver
    if settings.dev_mail_block_external and driver != "console":
        logger.info("DEV_MAIL_BLOCK_EXTERNAL enabled: using console mail driver")
        driver = "console"

    if driver == "console":
        return ConsoleMailProvider()
    if driver == "smtp":
        return SmtpMailProvider()
    if driver == "sendgrid":
        return SendgridMailProvider()
    raise MailProviderError(f"Unsupported mail driver: {driver}")


def get_mail_provider() -> MailProvider:
    override = _provider_override
    if override is not None:
        return override
    global _provider_instance
    if _provider_instance is None:
        with _provider_lock:
            if _provider_instance is None:
                _provider_instance = _build_provider()
    return _provider_instance


def override_mail_provider(provider: MailProvider | None) -> None:
    global _provider_override
    _provider_override = provider


def reset_mail_provider() -> None:
    global _provider_instance
    with _provider_lock:
        _provider_instance = None


def get_active_mail_driver() -> str:
    settings = get_settings()
    if settings.dev_mail_block_external:
        return "console"
    return settings.mail_driver


def send_mail(to: str, message: MailMessage) -> None:
    provider = get_mail_provider()
    provider.send(to=to, subject=message.subject, html=message.html, text=message.text)


__all__ = [
    "MailMessage",
    "MailProvider",
    "MailProviderError",
    "ConsoleMailProvider",
    "SmtpMailProvider",
    "SendgridMailProvider",
    "get_mail_provider",
    "override_mail_provider",
    "reset_mail_provider",
    "get_active_mail_driver",
    "send_mail",
]
