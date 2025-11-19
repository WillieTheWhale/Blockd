"""Pydantic models for authentication service requests and responses.

This module defines all data validation models for user registration, login,
token management, and session authentication.
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, Literal
from datetime import datetime
import uuid


class UserRegister(BaseModel):
    """User registration request model."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)
    full_name: str = Field(..., min_length=2, max_length=255)
    role: Literal['interviewer', 'interviewee'] = 'interviewee'
    organization_id: Optional[uuid.UUID] = None

    @field_validator('password')
    @classmethod
    def password_strength(cls, v: str) -> str:
        """Validate password strength requirements."""
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain at least one digit')
        if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in v):
            raise ValueError('Password must contain at least one special character')
        return v


class UserLogin(BaseModel):
    """User login request model."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT token response model."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class SessionTokenRequest(BaseModel):
    """Session token generation request model."""

    session_id: uuid.UUID


class SessionTokenResponse(BaseModel):
    """Session token response model."""

    session_token: str
    session_id: uuid.UUID
    interviewer_id: uuid.UUID
    interviewee_id: Optional[uuid.UUID]
    expires_at: datetime


class TokenRefresh(BaseModel):
    """Token refresh request model."""

    refresh_token: str


class UserInfo(BaseModel):
    """User information response model."""

    id: uuid.UUID
    email: str
    full_name: str
    role: str
    organization_id: Optional[uuid.UUID]
    created_at: datetime

    class Config:
        """Pydantic configuration."""
        from_attributes = True


class ErrorResponse(BaseModel):
    """Error response model."""

    detail: str
    error_code: Optional[str] = None


class HealthCheckResponse(BaseModel):
    """Health check response model."""

    status: str
    service: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
