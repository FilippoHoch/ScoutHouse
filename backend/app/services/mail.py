from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal, Mapping
from urllib.parse import urlsplit

from fastapi import BackgroundTasks
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import get_settings
from app.core.mail import MailMessage, send_mail

MailTemplateName = Literal[
    "reset_password",
    "task_assigned",
    "candidate_status_changed",
]


@dataclass(frozen=True)
class MailTemplateDefinition:
    subject: str
    html_template: str
    text_template: str
    sample_context: Mapping[str, Any]


def _templates_path() -> Path:
    return Path(__file__).resolve().parent.parent / "templates" / "mail"


@lru_cache
def _get_environment() -> Environment:
    loader = FileSystemLoader(str(_templates_path()))
    env = Environment(loader=loader, autoescape=select_autoescape(["html", "xml"]))
    return env


MAIL_TEMPLATES: dict[MailTemplateName, MailTemplateDefinition] = {
    "reset_password": MailTemplateDefinition(
        subject="Reset della password ScoutHouse",
        html_template="reset_password.html",
        text_template="reset_password.txt",
        sample_context={
            "recipient_name": "Scout",
            "reset_url": "https://app.scouthouse.test/reset-password?token=abc123",
            "reset_path": "/reset-password?token=***",
            "expires_minutes": 60,
        },
    ),
    "task_assigned": MailTemplateDefinition(
        subject="Nuovo task assegnato per {{ event_title }}",
        html_template="task_assigned.html",
        text_template="task_assigned.txt",
        sample_context={
            "recipient_name": "Scout",
            "event_title": "Evento di test",
            "event_url": "https://app.scouthouse.test/events/42",
            "event_start": "2025-03-10",
            "event_end": "2025-03-12",
            "structure_name": "Casa Alpina",
            "task_notes": "Ricontattare il referente entro venerdì.",
        },
    ),
    "candidate_status_changed": MailTemplateDefinition(
        subject="{{ structure_name }} è ora {{ new_status_label }}",
        html_template="candidate_status_changed.html",
        text_template="candidate_status_changed.txt",
        sample_context={
            "recipient_name": "Scout",
            "event_title": "Evento di test",
            "event_url": "https://app.scouthouse.test/events/42",
            "structure_name": "Casa Alpina",
            "new_status": "confirmed",
            "new_status_label": "confermata",
            "notes": "Confermato dal referente dopo il sopralluogo.",
            "assigned_user_name": "Mario Rossi",
        },
    ),
}


STATUS_LABELS: dict[str, str] = {
    "to_contact": "da contattare",
    "contacting": "in contatto",
    "available": "disponibile",
    "unavailable": "non disponibile",
    "followup": "follow-up",
    "confirmed": "confermata",
    "option": "opzione",
}


def list_mail_templates() -> list[MailTemplateName]:
    return list(MAIL_TEMPLATES.keys())


def get_sample_context(template: MailTemplateName) -> dict[str, Any]:
    definition = MAIL_TEMPLATES[template]
    return dict(definition.sample_context)


def render_mail_template(
    template: MailTemplateName, context: Mapping[str, Any]
) -> MailMessage:
    definition = MAIL_TEMPLATES[template]
    env = _get_environment()
    subject_template = env.from_string(definition.subject)
    html_template = env.get_template(definition.html_template)
    text_template = env.get_template(definition.text_template)

    merged_context = {
        "brand_name": get_settings().mail_from_name,
        **context,
    }

    subject = subject_template.render(merged_context)
    html = html_template.render(merged_context)
    text = text_template.render(merged_context)
    return MailMessage(subject=subject, html=html, text=text)


def _build_event_url(event_id: int) -> str:
    settings = get_settings()
    base = settings.frontend_base_url.rstrip("/")
    return f"{base}/events/{event_id}"


def _path_from_url(url: str) -> str:
    parsed = urlsplit(url)
    path = parsed.path or "/"
    if parsed.query:
        return f"{path}?{parsed.query}"
    return path


def schedule_password_reset_email(
    tasks: BackgroundTasks,
    *,
    recipient_email: str,
    recipient_name: str,
    token: str,
) -> None:
    settings = get_settings()
    base = settings.frontend_base_url.rstrip("/")
    reset_url = f"{base}/reset-password?token={token}"
    context = {
        "recipient_name": recipient_name,
        "reset_url": reset_url,
        "reset_path": _path_from_url(reset_url),
        "expires_minutes": settings.password_reset_ttl_minutes,
    }
    message = render_mail_template("reset_password", context)
    tasks.add_task(send_mail, recipient_email, message)


def schedule_task_assigned_email(
    tasks: BackgroundTasks,
    *,
    recipient_email: str,
    recipient_name: str,
    event_id: int,
    event_title: str,
    event_start: str,
    event_end: str,
    structure_name: str | None,
    notes: str | None,
) -> None:
    context: dict[str, Any] = {
        "recipient_name": recipient_name,
        "event_title": event_title,
        "event_url": _build_event_url(event_id),
        "event_start": event_start,
        "event_end": event_end,
        "structure_name": structure_name,
        "task_notes": notes,
    }
    message = render_mail_template("task_assigned", context)
    tasks.add_task(send_mail, recipient_email, message)


def schedule_candidate_status_email(
    tasks: BackgroundTasks,
    *,
    recipient_email: str,
    recipient_name: str,
    event_id: int,
    event_title: str,
    structure_name: str,
    new_status: str,
    notes: str | None,
    assigned_user_name: str | None,
) -> None:
    status_label = STATUS_LABELS.get(new_status, new_status)
    context: dict[str, Any] = {
        "recipient_name": recipient_name,
        "event_title": event_title,
        "event_url": _build_event_url(event_id),
        "structure_name": structure_name,
        "new_status": new_status,
        "new_status_label": status_label,
        "notes": notes,
        "assigned_user_name": assigned_user_name,
    }
    message = render_mail_template("candidate_status_changed", context)
    tasks.add_task(send_mail, recipient_email, message)


__all__ = [
    "MailTemplateName",
    "MailTemplateDefinition",
    "list_mail_templates",
    "get_sample_context",
    "render_mail_template",
    "schedule_password_reset_email",
    "schedule_task_assigned_email",
    "schedule_candidate_status_email",
]
