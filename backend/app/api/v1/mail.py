from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field

from app.core.config import get_settings
from app.core.mail import get_mail_provider
from app.deps import require_admin
from app.models import User
from app.services.mail import (
    MailTemplateName,
    get_sample_context,
    render_mail_template,
)
from app.tasks.email_jobs import send_email_job
from app.tasks.queue import queue

router = APIRouter(prefix="/mail", tags=["mail"])

AdminUser = Annotated[User, Depends(require_admin)]


class MailPreviewResponse(BaseModel):
    template: MailTemplateName
    subject: str
    html: str
    text: str


class MailTestRequest(BaseModel):
    to: EmailStr
    template: MailTemplateName
    sample_data: dict[str, Any] | None = Field(
        default=None, description="Override sample data"
    )


class MailTestResponse(BaseModel):
    provider: str
    blocked: bool
    subject: str
    html: str
    text: str
    job_id: str


@router.get("/preview", response_model=MailPreviewResponse)
def preview_mail_template(
    template: MailTemplateName,
    sample: Annotated[bool, Query(True)],
    _admin: AdminUser,
) -> MailPreviewResponse:
    if not sample:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only sample previews are supported",
        )
    context = get_sample_context(template)
    message = render_mail_template(template, context)
    return MailPreviewResponse(
        template=template,
        subject=message.subject,
        html=message.html,
        text=message.text,
    )


@router.post(
    "/test", response_model=MailTestResponse, status_code=status.HTTP_202_ACCEPTED
)
def send_test_mail(
    payload: MailTestRequest,
    _admin: AdminUser,
) -> MailTestResponse:
    context = get_sample_context(payload.template)
    if payload.sample_data:
        context.update(payload.sample_data)

    message = render_mail_template(payload.template, context)
    provider = get_mail_provider()
    job = queue.enqueue(
        send_email_job,
        {
            "to": payload.to,
            "subject": message.subject,
            "html": message.html,
            "text": message.text,
        },
        job_timeout=120,
    )

    settings = get_settings()
    blocked = settings.dev_mail_block_external and settings.mail_driver != "console"
    return MailTestResponse(
        provider=provider.name,
        blocked=blocked,
        subject=message.subject,
        html=message.html,
        text=message.text,
        job_id=job.id,
    )


__all__ = ["router"]
