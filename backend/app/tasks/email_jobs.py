from app.core.mail import MailMessage, send_mail


def send_email_job(payload: dict[str, str]) -> None:
    message = MailMessage(
        subject=payload["subject"],
        html=payload["html"],
        text=payload["text"],
    )
    send_mail(payload["to"], message)
