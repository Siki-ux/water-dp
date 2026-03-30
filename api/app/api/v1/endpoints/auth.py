from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm

from app.api import deps
from app.core.rate_limit import limiter
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenRefreshRequest,
    TokenSchema,
    UpdatePasswordRequest,
    UpdateProfileRequest,
)
from app.services.keycloak_service import KeycloakService

router = APIRouter()


@router.post("/token", response_model=TokenSchema)
@limiter.limit("10/minute")
async def login_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> Dict[str, Any]:
    """OAuth2 compatible token login."""
    return KeycloakService.login_user(form_data.username, form_data.password)


@router.post("/login", response_model=TokenSchema)
@limiter.limit("10/minute")
async def login(request: Request, login_data: LoginRequest) -> Dict[str, Any]:
    """Login with username and password."""
    return KeycloakService.login_user(login_data.username, login_data.password)


@router.post("/refresh", response_model=TokenSchema)
@limiter.limit("30/minute")
async def refresh_token(
    request: Request, token_data: TokenRefreshRequest
) -> Dict[str, Any]:
    """Refresh an access token using a valid refresh token."""
    return KeycloakService.refresh_user_token(token_data.refresh_token)


@router.get("/me", response_model=Dict[str, Any])
async def check_session(current_user: Dict[str, Any] = Depends(deps.get_current_user)):
    """Check session validity and return user details."""
    user_id = current_user.get("sub")
    if user_id:
        kc_user = KeycloakService.get_user_by_id(user_id)
        if kc_user:
            current_user.setdefault("given_name", kc_user.get("firstName", ""))
            current_user.setdefault("family_name", kc_user.get("lastName", ""))
            current_user.setdefault("email", kc_user.get("email", ""))
    return current_user


@router.post("/register", response_model=Dict[str, Any], status_code=201)
@limiter.limit("3/minute")
async def register(
    request: Request,
    register_data: RegisterRequest,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
) -> Dict[str, Any]:
    """Register a new user account. Requires authentication."""
    KeycloakService.create_user(
        register_data.username,
        register_data.email,
        register_data.password,
        register_data.first_name,
        register_data.last_name,
    )
    return {"message": "User created successfully"}


@router.put("/me", response_model=Dict[str, Any])
async def update_profile(
    profile_data: UpdateProfileRequest,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
) -> Dict[str, Any]:
    """Update current user's profile."""
    KeycloakService.update_profile(
        current_user["sub"],
        profile_data.first_name,
        profile_data.last_name,
        profile_data.email,
    )
    return {"message": "Profile updated"}


@router.put("/me/password", response_model=Dict[str, Any])
async def update_password(
    password_data: UpdatePasswordRequest,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
) -> Dict[str, Any]:
    """Change current user's password."""
    try:
        KeycloakService.login_user(
            current_user["preferred_username"], password_data.current_password
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    KeycloakService.set_user_password(current_user["sub"], password_data.new_password)
    return {"message": "Password updated"}
