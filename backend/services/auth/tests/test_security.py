"""Unit tests for security utilities.

Tests password hashing, JWT token generation/validation, and session tokens.
"""

import pytest
import uuid
import time
from datetime import datetime, timedelta

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

from backend.services.auth.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_session_token,
    verify_token_type,
    get_token_expiration
)


class TestPasswordHashing:
    """Test password hashing and verification."""

    def test_hash_password_returns_different_hash(self):
        """Test that hashing same password twice produces different hashes."""
        password = "TestPass123!"
        hash1 = hash_password(password)
        hash2 = hash_password(password)

        assert hash1 != hash2  # Different salts
        assert len(hash1) > 0
        assert len(hash2) > 0

    def test_verify_password_correct(self):
        """Test that correct password verification works."""
        password = "MySecurePass123!"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Test that incorrect password fails verification."""
        password = "CorrectPass123!"
        wrong_password = "WrongPass123!"
        hashed = hash_password(password)

        assert verify_password(wrong_password, hashed) is False

    def test_verify_password_empty_string(self):
        """Test verification with empty password."""
        hashed = hash_password("RealPass123!")
        assert verify_password("", hashed) is False

    def test_password_hash_length(self):
        """Test that bcrypt hash has expected length."""
        password = "TestPass123!"
        hashed = hash_password(password)

        # Bcrypt hashes are 60 characters
        assert len(hashed) == 60


class TestJWTTokens:
    """Test JWT token generation and validation."""

    def test_create_access_token(self):
        """Test access token creation."""
        user_id = uuid.uuid4()
        email = "test@example.com"
        role = "interviewer"

        token = create_access_token(user_id, email, role)

        assert isinstance(token, str)
        assert len(token) > 0

    def test_create_refresh_token(self):
        """Test refresh token creation."""
        user_id = uuid.uuid4()

        token = create_refresh_token(user_id)

        assert isinstance(token, str)
        assert len(token) > 0

    def test_decode_access_token(self):
        """Test decoding valid access token."""
        user_id = uuid.uuid4()
        email = "test@example.com"
        role = "interviewer"

        token = create_access_token(user_id, email, role)
        payload = decode_token(token)

        assert payload['user_id'] == str(user_id)
        assert payload['email'] == email
        assert payload['role'] == role
        assert payload['type'] == 'access'

    def test_decode_refresh_token(self):
        """Test decoding valid refresh token."""
        user_id = uuid.uuid4()

        token = create_refresh_token(user_id)
        payload = decode_token(token)

        assert payload['user_id'] == str(user_id)
        assert payload['type'] == 'refresh'

    def test_decode_invalid_token(self):
        """Test that invalid token raises ValueError."""
        with pytest.raises(ValueError, match="Invalid token"):
            decode_token("invalid.token.here")

    def test_decode_malformed_token(self):
        """Test that malformed token raises ValueError."""
        with pytest.raises(ValueError, match="Invalid token"):
            decode_token("not-a-jwt-token")

    def test_token_contains_expiration(self):
        """Test that tokens contain expiration timestamp."""
        user_id = uuid.uuid4()
        token = create_access_token(user_id, "test@example.com", "interviewer")
        payload = decode_token(token)

        assert 'exp' in payload
        assert 'iat' in payload
        assert payload['exp'] > payload['iat']

    def test_verify_token_type_access(self):
        """Test token type verification for access tokens."""
        user_id = uuid.uuid4()
        access_token = create_access_token(user_id, "test@example.com", "interviewer")

        assert verify_token_type(access_token, 'access') is True
        assert verify_token_type(access_token, 'refresh') is False

    def test_verify_token_type_refresh(self):
        """Test token type verification for refresh tokens."""
        user_id = uuid.uuid4()
        refresh_token = create_refresh_token(user_id)

        assert verify_token_type(refresh_token, 'refresh') is True
        assert verify_token_type(refresh_token, 'access') is False

    def test_get_token_expiration(self):
        """Test getting expiration from token."""
        user_id = uuid.uuid4()
        token = create_access_token(user_id, "test@example.com", "interviewer")

        expiration = get_token_expiration(token)

        assert expiration is not None
        assert isinstance(expiration, datetime)
        assert expiration > datetime.now()

    def test_get_token_expiration_invalid_token(self):
        """Test getting expiration from invalid token."""
        expiration = get_token_expiration("invalid.token")
        assert expiration is None


class TestSessionTokens:
    """Test session token generation."""

    def test_generate_session_token(self):
        """Test session token generation."""
        token = generate_session_token()

        assert isinstance(token, str)
        assert len(token) > 40  # URL-safe base64 encoding

    def test_session_tokens_are_unique(self):
        """Test that generated session tokens are unique."""
        tokens = [generate_session_token() for _ in range(100)]

        # All tokens should be unique
        assert len(set(tokens)) == 100

    def test_session_token_url_safe(self):
        """Test that session tokens are URL-safe."""
        token = generate_session_token()

        # Should not contain URL-unsafe characters
        unsafe_chars = ['+', '/', '=', ' ', '\n', '\r']
        for char in unsafe_chars:
            assert char not in token


class TestTokenSecurity:
    """Test security aspects of tokens."""

    def test_different_users_different_tokens(self):
        """Test that different users get different tokens."""
        user1 = uuid.uuid4()
        user2 = uuid.uuid4()

        token1 = create_access_token(user1, "user1@example.com", "interviewer")
        token2 = create_access_token(user2, "user2@example.com", "interviewer")

        assert token1 != token2

    def test_token_includes_nbf_claim(self):
        """Test that tokens include 'not before' claim."""
        user_id = uuid.uuid4()
        token = create_access_token(user_id, "test@example.com", "interviewer")
        payload = decode_token(token)

        assert 'nbf' in payload
        assert payload['nbf'] <= payload['iat']


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
