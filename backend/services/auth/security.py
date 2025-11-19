"""Security utilities for authentication.

This module provides JWT token generation/validation and password hashing
using industry-standard cryptographic libraries.
"""

import bcrypt
import jwt
from datetime import datetime, timedelta
import os
from typing import Optional, Dict, Any
import uuid
import secrets
import logging

logger = logging.getLogger(__name__)

# JWT Configuration
JWT_SECRET = os.getenv('JWT_SECRET', 'change-this-in-production-use-strong-random-secret')
JWT_ALGORITHM = 'HS256'
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRE_MINUTES', '60'))
JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv('JWT_REFRESH_TOKEN_EXPIRE_DAYS', '7'))


def hash_password(password: str) -> str:
    """
    Hash password using bcrypt with salt rounds = 12.

    Args:
        password: Plain text password to hash

    Returns:
        str: Hashed password (bcrypt hash)

    Example:
        >>> hashed = hash_password("MySecurePass123!")
        >>> len(hashed) > 0
        True
    """
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify password against bcrypt hash.

    Args:
        plain_password: Plain text password to verify
        hashed_password: Bcrypt hash to compare against

    Returns:
        bool: True if password matches, False otherwise

    Example:
        >>> hashed = hash_password("MyPass123!")
        >>> verify_password("MyPass123!", hashed)
        True
        >>> verify_password("WrongPass", hashed)
        False
    """
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'),
            hashed_password.encode('utf-8')
        )
    except Exception as e:
        logger.error(f"Password verification failed: {e}")
        return False


def create_access_token(user_id: uuid.UUID, email: str, role: str) -> str:
    """
    Generate JWT access token with user claims.

    Args:
        user_id: User's unique identifier
        email: User's email address
        role: User's role (interviewer, interviewee, admin)

    Returns:
        str: Encoded JWT access token

    Example:
        >>> token = create_access_token(uuid.uuid4(), "test@example.com", "interviewer")
        >>> len(token) > 0
        True
    """
    now = datetime.utcnow()
    payload: Dict[str, Any] = {
        'user_id': str(user_id),
        'email': email,
        'role': role,
        'type': 'access',
        'exp': now + timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        'iat': now,
        'nbf': now  # Not before - prevents token from being used before issued
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    logger.debug(f"Access token created for user {user_id}")
    return token


def create_refresh_token(user_id: uuid.UUID) -> str:
    """
    Generate JWT refresh token for token renewal.

    Args:
        user_id: User's unique identifier

    Returns:
        str: Encoded JWT refresh token

    Example:
        >>> token = create_refresh_token(uuid.uuid4())
        >>> len(token) > 0
        True
    """
    now = datetime.utcnow()
    payload: Dict[str, Any] = {
        'user_id': str(user_id),
        'type': 'refresh',
        'exp': now + timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        'iat': now,
        'nbf': now
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    logger.debug(f"Refresh token created for user {user_id}")
    return token


def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode and validate JWT token.

    Args:
        token: JWT token string to decode

    Returns:
        dict: Decoded token payload

    Raises:
        ValueError: If token is expired or invalid

    Example:
        >>> user_id = uuid.uuid4()
        >>> token = create_access_token(user_id, "test@example.com", "interviewer")
        >>> payload = decode_token(token)
        >>> payload['email'] == "test@example.com"
        True
    """
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={
                'verify_signature': True,
                'verify_exp': True,
                'verify_nbf': True,
                'verify_iat': True
            }
        )
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        raise ValueError("Token has expired")
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        raise ValueError("Invalid token")
    except Exception as e:
        logger.error(f"Token decode error: {e}")
        raise ValueError("Token decode failed")


def generate_session_token() -> str:
    """
    Generate cryptographically secure random session token.

    This token is used for browser-based authentication where users
    join interview sessions without traditional login.

    Returns:
        str: URL-safe random token (32 bytes = 43 characters base64)

    Example:
        >>> token1 = generate_session_token()
        >>> token2 = generate_session_token()
        >>> len(token1) > 40
        True
        >>> token1 != token2
        True
    """
    return secrets.token_urlsafe(32)


def verify_token_type(token: str, expected_type: str) -> bool:
    """
    Verify that a token is of the expected type (access or refresh).

    Args:
        token: JWT token to verify
        expected_type: Expected token type ('access' or 'refresh')

    Returns:
        bool: True if token type matches, False otherwise

    Example:
        >>> user_id = uuid.uuid4()
        >>> access_token = create_access_token(user_id, "test@example.com", "interviewer")
        >>> verify_token_type(access_token, 'access')
        True
        >>> verify_token_type(access_token, 'refresh')
        False
    """
    try:
        payload = decode_token(token)
        return payload.get('type') == expected_type
    except ValueError:
        return False


def get_token_expiration(token: str) -> Optional[datetime]:
    """
    Get expiration datetime from a JWT token.

    Args:
        token: JWT token to inspect

    Returns:
        Optional[datetime]: Expiration datetime or None if invalid

    Example:
        >>> user_id = uuid.uuid4()
        >>> token = create_access_token(user_id, "test@example.com", "interviewer")
        >>> exp = get_token_expiration(token)
        >>> exp is not None
        True
    """
    try:
        payload = decode_token(token)
        exp_timestamp = payload.get('exp')
        if exp_timestamp:
            return datetime.fromtimestamp(exp_timestamp)
        return None
    except ValueError:
        return None
