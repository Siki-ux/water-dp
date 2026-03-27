from typing import Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class TokenSchema(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    refresh_expires_in: Optional[int] = None
    not_before_policy: Optional[int] = None
    session_state: Optional[str] = None
    scope: Optional[str] = None


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    first_name: str
    last_name: str


class UpdateProfileRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None


class UpdatePasswordRequest(BaseModel):
    current_password: str
    new_password: str
