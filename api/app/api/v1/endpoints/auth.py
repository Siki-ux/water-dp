from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from app.api import deps
from app.schemas.auth import LoginRequest, RegisterRequest, TokenRefreshRequest, TokenSchema, UpdatePasswordRequest, UpdateProfileRequest
from app.services.keycloak_service import KeycloakService

router = APIRouter()


@router.post("/token", response_model=TokenSchema)
async def login_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
) -> Dict[str, Any]:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    return KeycloakService.login_user(form_data.username, form_data.password)


@router.post("/login", response_model=TokenSchema)
async def login(request: LoginRequest) -> Dict[str, Any]:
    """
    Login with username and password to obtain access and refresh tokens.
    """
    return KeycloakService.login_user(request.username, request.password)


@router.post("/refresh", response_model=TokenSchema)
async def refresh_token(request: TokenRefreshRequest) -> Dict[str, Any]:
    """
    Refresh an access token using a valid refresh token.
    """
    return KeycloakService.refresh_user_token(request.refresh_token)


@router.get("/me", response_model=Dict[str, Any])
async def check_session(current_user: Dict[str, Any] = Depends(deps.get_current_user)):
    """
    Check current session validity and return user details (enriched with Keycloak profile).
    """
    user_id = current_user.get("sub")
    if user_id:
        kc_user = KeycloakService.get_user_by_id(user_id)
        if kc_user:
            current_user.setdefault("given_name", kc_user.get("firstName", ""))
            current_user.setdefault("family_name", kc_user.get("lastName", ""))
            current_user.setdefault("email", kc_user.get("email", ""))
    return current_user


@router.post("/register", response_model=Dict[str, Any], status_code=201)
async def register(request: RegisterRequest) -> Dict[str, Any]:
    """
    Register a new user account.
    """
    KeycloakService.create_user(request.username, request.email, request.password, request.first_name, request.last_name)
    return {"message": "User created successfully"}


@router.put("/me", response_model=Dict[str, Any])
async def update_profile(
    request: UpdateProfileRequest,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
) -> Dict[str, Any]:
    """
    Update the current user's profile (first name, last name, email).
    """
    KeycloakService.update_profile(
        current_user["sub"],
        request.first_name,
        request.last_name,
        request.email,
    )
    return {"message": "Profile updated"}


@router.put("/me/password", response_model=Dict[str, Any])
async def update_password(
    request: UpdatePasswordRequest,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
) -> Dict[str, Any]:
    """
    Change the current user's password. Requires current password for verification.
    """
    try:
        KeycloakService.login_user(current_user["preferred_username"], request.current_password)
    except Exception:
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    KeycloakService.set_user_password(current_user["sub"], request.new_password)
    return {"message": "Password updated"}
