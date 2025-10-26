from __future__ import annotations

from datetime import datetime, timedelta, timezone
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.limiter import limiter
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.deps import get_current_user, get_refresh_token_from_cookie
from app.models import PasswordResetToken, RefreshToken, User
from app.schemas import (
    AuthResponse,
    AuthWellKnownResponse,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserRead,
)


router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(response: Response, token: str, expires: datetime) -> None:
    settings = get_settings()
    max_age = settings.refresh_ttl_days * 24 * 60 * 60
    expires_ts = int(expires.timestamp())
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=max_age,
        expires=expires_ts,
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie("refresh_token", path="/")


def _create_refresh_record(db: Session, user: User) -> tuple[str, RefreshToken]:
    token, expires, token_hash = generate_refresh_token()
    refresh = RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires)
    db.add(refresh)
    return token, refresh


@router.get("/.well-known", response_model=AuthWellKnownResponse, status_code=status.HTTP_200_OK)
def auth_well_known() -> AuthWellKnownResponse:
    settings = get_settings()
    return AuthWellKnownResponse(allow_registration=settings.allow_registration)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    settings = get_settings()
    if not settings.allow_registration:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration disabled")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(name=payload.name, email=payload.email, password_hash=hash_password(payload.password))
    db.add(user)
    db.flush()

    token, refresh_record = _create_refresh_record(db, user)
    db.flush()
    db.commit()
    db.refresh(user)

    _set_refresh_cookie(response, token, refresh_record.expires_at)

    access_token = create_access_token(user.id)
    return AuthResponse(access_token=access_token, user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")

    token, refresh_record = _create_refresh_record(db, user)
    db.flush()
    db.commit()
    db.refresh(user)

    _set_refresh_cookie(response, token, refresh_record.expires_at)
    access_token = create_access_token(user.id)
    return AuthResponse(access_token=access_token, user=UserRead.model_validate(user))


@router.post("/refresh", response_model=RefreshResponse)
@limiter.limit("30/minute")
def refresh(
    response: Response,
    request: Request,
    refresh_token: RefreshToken = Depends(get_refresh_token_from_cookie),
    db: Session = Depends(get_db),
) -> RefreshResponse:
    if refresh_token.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")

    user = db.get(User, refresh_token.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")

    refresh_token.revoked = True

    new_token_value, new_refresh = _create_refresh_record(db, user)
    db.flush()
    db.commit()

    _set_refresh_cookie(response, new_token_value, new_refresh.expires_at)

    access_token = create_access_token(user.id)
    return RefreshResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    refresh_token: RefreshToken = Depends(get_refresh_token_from_cookie),
    db: Session = Depends(get_db),
) -> None:
    refresh_token.revoked = True
    db.add(refresh_token)
    db.commit()
    _clear_refresh_cookie(response)
    return None


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/hour")
def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        return {"status": "ok"}

    raw_token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(hours=1)
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=expires,
    )
    db.add(reset_token)
    db.commit()

    reset_url = f"https://example.local/reset-password?token={raw_token}"
    print(f"[reset-password] user={user.email} url={reset_url}")
    return {"status": "ok"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    token_hash_value = hash_token(payload.token)
    token = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == token_hash_value)
        .order_by(PasswordResetToken.created_at.desc())
        .first()
    )
    if token is None or token.used:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    if token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expired")

    user = db.get(User, token.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

    user.password_hash = hash_password(payload.new_password)
    token.used = True

    # revoke existing refresh tokens
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)).update(
        {"revoked": True}
    )

    db.add_all([user, token])
    db.commit()
    return {"status": "ok"}


@router.get("/me", response_model=UserRead)
def get_me(user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(user)
