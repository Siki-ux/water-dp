"""API authentication and authorization dependencies."""

import os
from typing import Any, Callable, Dict

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from app.core.database import get_db  # noqa
from app.core.security import verify_token

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{os.getenv('ROOT_PATH', '')}{settings.api_prefix}/auth/token",
    auto_error=False,
)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """Validate Bearer token and return user payload."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    payload = await verify_token(token)
    return payload


async def get_current_user_with_token(
    request: Request,
    token: str = Depends(oauth2_scheme),
) -> Dict[str, Any]:
    """Validate Bearer token and store the raw token on request.state.

    The token is stored on ``request.state.token`` instead of being embedded
    in the user dict to prevent accidental leakage via logging, exception
    serialization, or returning the user dict in a response.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    payload = await verify_token(token)
    request.state.token = token
    return payload


def has_role(required_role: str) -> Callable:
    """Dependency factory that checks for a specific Keycloak realm role."""

    async def role_checker(user: Dict[str, Any] = Depends(get_current_user)):
        realm_access = user.get("realm_access", {})
        roles = realm_access.get("roles", [])

        if required_role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation requires '{required_role}' role",
            )
        return user

    return role_checker


async def get_current_active_superuser(
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Check if the user has an admin role."""
    realm_access = user.get("realm_access", {})
    roles = realm_access.get("roles", [])
    if not any(role in roles for role in settings.admin_roles_list):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges",
        )
    return user
