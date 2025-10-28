from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field

from app.core.config import get_settings
from app.core.mail import get_mail_provider, send_mail
from app.deps import require_admin
from app.services.mail import (
    MailTemplateName,
    get_sample_context,
    render_mail_template,
)

router = APIRouter(prefix="/mail", tags=["mail"])


class MailPreviewResponse(BaseModel):
    template: MailTemplateName
    subject: str
    html: str
    text: str


class MailTestRequest(BaseModel):
    to: EmailStr
    template: MailTemplateName
    sample_data: dict[str, Any] | None = Field(default=None, description="Override sample data")


class MailTestResponse(BaseModel):
    provider: str
    blocked: bool
    subject: str
    html: str
    text: str


@router.get("/preview", response_model=MailPreviewResponse)
def preview_mail_template(
    template: MailTemplateName,
    sample: bool = Query(True),
    _: None = Depends(require_admin),
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


@router.post("/test", response_model=MailTestResponse)
def send_test_mail(
    payload: MailTestRequest,
    _: None = Depends(require_admin),
) -> MailTestResponse:
    context = get_sample_context(payload.template)
    if payload.sample_data:
        context.update(payload.sample_data)

    message = render_mail_template(payload.template, context)
    provider = get_mail_provider()
    send_mail(payload.to, message)

    settings = get_settings()
    blocked = settings.dev_mail_block_external and settings.mail_driver != "console"
    return MailTestResponse(
        provider=provider.name,
        blocked=blocked,
        subject=message.subject,
        html=message.html,
        text=message.text,
    )


__all__ = ["router"]
