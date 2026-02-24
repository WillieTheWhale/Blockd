"""
Authentication utilities for Video Processing Service
Supports JWT validation and session token verification
"""
import os
import logging
from typing import Optional
from datetime import datetime
from dataclasses import dataclass
from uuid import UUID

import httpx
import jwt
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from src.config import settings

logger = logging.getLogger(__name__)


@dataclass
class AuthResult:
    """Result of authentication attempt"""
    is_valid: bool
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    error: Optional[str] = None


class JWTValidator:
    """JWT token validator using RS256"""

    def __init__(self):
        self._public_key: Optional[str] = None
        self._algorithm: str = os.getenv("JWT_ALGORITHM", "RS256")
        self._load_public_key()

    def _load_public_key(self) -> None:
        """Load RSA public key for JWT verification"""
        key_path = os.getenv("JWT_PUBLIC_KEY_PATH")
        if key_path and os.path.exists(key_path):
            try:
                with open(key_path, 'r') as f:
                    self._public_key = f.read()
                logger.info("Loaded JWT public key from file")
            except Exception as e:
                logger.error(f"Failed to load JWT public key: {e}")
        else:
            # Try environment variable
            self._public_key = os.getenv('JWT_PUBLIC_KEY')
            if self._public_key:
                logger.info("Loaded JWT public key from environment")
            else:
                logger.warning("No JWT public key configured - authentication will fail")

    def validate_token(self, token: str) -> AuthResult:
        """
        Validate a JWT token.

        Args:
            token: JWT token string

        Returns:
            AuthResult with validation status and claims
        """
        if not self._public_key:
            logger.warning("JWT validation skipped - no public key configured")
            return AuthResult(
                is_valid=False,
                error="JWT verification not configured"
            )

        try:
            # Decode and verify the token
            payload = jwt.decode(
                token,
                self._public_key,
                algorithms=[self._algorithm],
                options={"require": ["exp", "sub"]}
            )

            user_id = payload.get("sub")
            session_id = payload.get("session_id")

            return AuthResult(
                is_valid=True,
                user_id=user_id,
                session_id=session_id
            )

        except ExpiredSignatureError:
            logger.warning("JWT token has expired")
            return AuthResult(
                is_valid=False,
                error="Token has expired"
            )
        except InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {e}")
            return AuthResult(
                is_valid=False,
                error=f"Invalid token: {str(e)}"
            )
        except Exception as e:
            logger.error(f"JWT validation error: {e}")
            return AuthResult(
                is_valid=False,
                error="Token validation failed"
            )


class SessionValidator:
    """Session token validator - validates against session service"""

    def __init__(self):
        self._session_service_url = os.getenv(
            'SESSION_SERVICE_URL',
            'http://localhost:8003'
        )
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client"""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=5.0)
        return self._client

    async def validate_session(self, session_id: str, session_token: Optional[str] = None) -> AuthResult:
        """
        Validate a session ID against the session service.

        Args:
            session_id: Interview session ID
            session_token: Optional session access token

        Returns:
            AuthResult with validation status
        """
        try:
            # Validate UUID format
            try:
                UUID(session_id)
            except ValueError:
                return AuthResult(
                    is_valid=False,
                    error="Invalid session ID format"
                )

            client = await self._get_client()

            # Call session service to validate
            headers = {}
            if session_token:
                headers["Authorization"] = f"Bearer {session_token}"

            response = await client.get(
                f"{self._session_service_url}/api/sessions/{session_id}/status",
                headers=headers
            )

            if response.status_code == 200:
                data = response.json()
                status = data.get("status")

                # Only allow active sessions
                if status in ("active", "in_progress"):
                    return AuthResult(
                        is_valid=True,
                        session_id=session_id
                    )
                else:
                    return AuthResult(
                        is_valid=False,
                        session_id=session_id,
                        error=f"Session is not active (status: {status})"
                    )

            elif response.status_code == 404:
                return AuthResult(
                    is_valid=False,
                    error="Session not found"
                )
            elif response.status_code == 401:
                return AuthResult(
                    is_valid=False,
                    error="Unauthorized - invalid session token"
                )
            else:
                logger.warning(f"Session service returned {response.status_code}")
                return AuthResult(
                    is_valid=False,
                    error=f"Session validation failed (status: {response.status_code})"
                )

        except httpx.TimeoutException:
            logger.warning("Session service timeout")
            return AuthResult(
                is_valid=False,
                error="Session service timeout"
            )
        except httpx.RequestError as e:
            logger.error(f"Session service request error: {e}")
            return AuthResult(
                is_valid=False,
                error="Failed to reach session service"
            )
        except Exception as e:
            logger.error(f"Session validation error: {e}")
            return AuthResult(
                is_valid=False,
                error="Session validation failed"
            )

    async def close(self) -> None:
        """Close the HTTP client"""
        if self._client and not self._client.is_closed:
            await self._client.aclose()


# Singleton instances
_jwt_validator: Optional[JWTValidator] = None
_session_validator: Optional[SessionValidator] = None


def get_jwt_validator() -> JWTValidator:
    """Get singleton JWT validator instance"""
    global _jwt_validator
    if _jwt_validator is None:
        _jwt_validator = JWTValidator()
    return _jwt_validator


def get_session_validator() -> SessionValidator:
    """Get singleton session validator instance"""
    global _session_validator
    if _session_validator is None:
        _session_validator = SessionValidator()
    return _session_validator


# FastAPI security scheme
security = HTTPBearer(auto_error=False)


async def require_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> AuthResult:
    """
    FastAPI dependency to require JWT authentication.

    Use as a dependency in route handlers:
        @router.get("/protected")
        async def protected_route(auth: AuthResult = Depends(require_auth)):
            ...
    """
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )

    jwt_validator = get_jwt_validator()
    result = jwt_validator.validate_token(credentials.credentials)

    if not result.is_valid:
        raise HTTPException(
            status_code=401,
            detail=result.error or "Invalid token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return result


async def optional_auth(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[AuthResult]:
    """
    FastAPI dependency for optional JWT authentication.
    Returns None if no token provided, raises 401 if invalid token.
    """
    if credentials is None:
        return None

    jwt_validator = get_jwt_validator()
    result = jwt_validator.validate_token(credentials.credentials)

    if not result.is_valid:
        raise HTTPException(
            status_code=401,
            detail=result.error or "Invalid token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return result


async def require_session_auth(
    session_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> AuthResult:
    """
    FastAPI dependency to require both JWT and session validation.

    Validates:
    1. JWT token is valid
    2. Session ID is valid and active
    3. JWT session_id claim matches the requested session_id (if present in JWT)
    """
    # First validate JWT
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )

    jwt_validator = get_jwt_validator()
    jwt_result = jwt_validator.validate_token(credentials.credentials)

    if not jwt_result.is_valid:
        raise HTTPException(
            status_code=401,
            detail=jwt_result.error or "Invalid token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Check if JWT session_id matches requested session_id
    if jwt_result.session_id and jwt_result.session_id != session_id:
        raise HTTPException(
            status_code=403,
            detail="Token session_id does not match requested session"
        )

    # Validate session is active
    session_validator = get_session_validator()
    session_result = await session_validator.validate_session(
        session_id,
        credentials.credentials
    )

    if not session_result.is_valid:
        raise HTTPException(
            status_code=403,
            detail=session_result.error or "Session validation failed"
        )

    return AuthResult(
        is_valid=True,
        user_id=jwt_result.user_id,
        session_id=session_id
    )


class WebSocketAuthenticator:
    """
    Combined authenticator for WebSocket connections.
    Supports both JWT and session token validation.
    """

    def __init__(self):
        self.jwt_validator = get_jwt_validator()
        self.session_validator = get_session_validator()

    async def authenticate(
        self,
        session_id: str,
        jwt_token: Optional[str] = None,
        session_token: Optional[str] = None
    ) -> AuthResult:
        """
        Authenticate a WebSocket connection.

        Requires both:
        1. Valid JWT token (if configured)
        2. Valid session ID (active session)

        Args:
            session_id: Interview session ID
            jwt_token: Optional JWT token from Authorization header
            session_token: Optional session-specific token

        Returns:
            AuthResult with combined validation status
        """
        errors = []

        # Step 1: Validate JWT if provided and configured
        jwt_result = None
        if jwt_token:
            jwt_result = self.jwt_validator.validate_token(jwt_token)
            if not jwt_result.is_valid:
                errors.append(f"JWT: {jwt_result.error}")

            # Check if JWT session_id matches requested session_id
            if jwt_result.is_valid and jwt_result.session_id:
                if jwt_result.session_id != session_id:
                    return AuthResult(
                        is_valid=False,
                        error="JWT session_id does not match requested session"
                    )

        # Step 2: Validate session ID against session service
        session_result = await self.session_validator.validate_session(
            session_id,
            session_token
        )

        if not session_result.is_valid:
            errors.append(f"Session: {session_result.error}")

        # Combined result
        if errors:
            return AuthResult(
                is_valid=False,
                session_id=session_id,
                error="; ".join(errors)
            )

        return AuthResult(
            is_valid=True,
            session_id=session_id,
            user_id=jwt_result.user_id if jwt_result else None
        )

    async def close(self) -> None:
        """Clean up resources"""
        await self.session_validator.close()


# Singleton WebSocket authenticator
_ws_authenticator: Optional[WebSocketAuthenticator] = None


def get_ws_authenticator() -> WebSocketAuthenticator:
    """Get singleton WebSocket authenticator instance"""
    global _ws_authenticator
    if _ws_authenticator is None:
        _ws_authenticator = WebSocketAuthenticator()
    return _ws_authenticator
