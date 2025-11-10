from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.limiter import limiter
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    issue_refresh_cookie,
    rotate_refresh_token,
    verify_password,
)
from app.deps import get_current_user, get_refresh_token_from_cookie
from app.models import RefreshToken, User
from app.schemas import (
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    RefreshResponse,
    RegisterRequest,
    ResetPasswordRequest,
    UserRead,
)
from app.services.mail import schedule_password_reset_email
from app.services.password_reset import (
    create_reset_token,
    reset_user_password,
    verify_reset_token,
)

DbSession = Annotated[Session, Depends(get_db)]
RefreshTokenDep = Annotated[RefreshToken, Depends(get_refresh_token_from_cookie)]
CurrentUser = Annotated[User, Depends(get_current_user)]

router = APIRouter(prefix="/auth", tags=["auth"])


def _mint_refresh_token(db: Session, user: User) -> tuple[str, RefreshToken]:
    token_value, expires_at, token_hash = generate_refresh_token()
    refresh = RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at)
    db.add(refresh)
    return token_value, refresh


def _serialize_user(user: User) -> UserRead:
    settings = get_settings()
    can_edit_structures = bool(user.is_admin or settings.allow_non_admin_structure_edit)
    data = UserRead.model_validate(user)
    return data.model_copy(update={"can_edit_structures": can_edit_structures})


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response, db: DbSession) -> AuthResponse:
    settings = get_settings()
    if not settings.allow_registration:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration disabled")

    existing = db.query(User).filter(User.email == payload.email).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.flush()

    token_value, refresh = _mint_refresh_token(db, user)
    db.commit()
    db.refresh(user)

    issue_refresh_cookie(response, token_value, refresh.expires_at)
    access_token = create_access_token(user.id)
    return AuthResponse(access_token=access_token, user=_serialize_user(user))


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    db: DbSession,
) -> AuthResponse:
    payload = LoginRequest.model_validate(await request.json())

    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")

    token_value, refresh = _mint_refresh_token(db, user)
    db.commit()
    db.refresh(user)

    issue_refresh_cookie(response, token_value, refresh.expires_at)
    access_token = create_access_token(user.id)
    return AuthResponse(access_token=access_token, user=_serialize_user(user))


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    db: DbSession,
) -> Response:
    payload = ForgotPasswordRequest.model_validate(await request.json())

    user = db.query(User).filter(User.email == payload.email).first()
    if user is None:
        return Response(status_code=status.HTTP_202_ACCEPTED)

    token_value, _record = create_reset_token(db, user)
    db.commit()

    schedule_password_reset_email(
        recipient_email=user.email,
        recipient_name=user.name,
        token=token_value,
    )
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    payload: ResetPasswordRequest,
    db: DbSession,
) -> None:
    try:
        record = verify_reset_token(db, payload.token)
        reset_user_password(db, record, payload.password)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired token",
        ) from exc
    return None


@router.post("/refresh", response_model=RefreshResponse)
@limiter.limit("30/minute")
def refresh(
    request: Request,
    response: Response,
    refresh_token: RefreshTokenDep,
    db: DbSession,
) -> RefreshResponse:
    if refresh_token.revoked:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked"
        )

    user = db.get(User, refresh_token.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")

    token_value, new_refresh = rotate_refresh_token(db, refresh_token)
    db.commit()

    issue_refresh_cookie(response, token_value, new_refresh.expires_at)
    access_token = create_access_token(user.id)
    return RefreshResponse(access_token=access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    refresh_token: RefreshTokenDep,
    db: DbSession,
) -> None:
    refresh_token.revoked = True
    db.add(refresh_token)
    db.commit()
    response.delete_cookie("refresh_token", path="/")
    return None


@router.get("/me", response_model=UserRead)
def get_me(user: CurrentUser) -> UserRead:
    return _serialize_user(user)
