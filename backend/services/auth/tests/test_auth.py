"""Integration tests for authentication endpoints.

Tests all authentication API endpoints with mocked database.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
import uuid
from datetime import datetime

import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../..')))

from backend.services.auth.main import app
from backend.services.auth.security import hash_password, create_access_token


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_db_connection():
    """Mock database connection."""
    with patch('backend.services.auth.routes.DatabasePool') as mock_pool:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_pool.return_value.get_connection.return_value = mock_conn
        mock_pool.return_value.return_connection.return_value = None
        yield mock_cursor, mock_conn


class TestHealthEndpoint:
    """Test health check endpoint."""

    def test_health_check(self, client):
        """Test health check returns 200 OK."""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data['status'] == 'healthy'
        assert data['service'] == 'auth'


class TestRootEndpoint:
    """Test root endpoint."""

    def test_root_endpoint(self, client):
        """Test root endpoint returns service info."""
        response = client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data['service'] == 'Blockd Authentication Service'
        assert data['version'] == '1.0.0'


class TestUserRegistration:
    """Test user registration endpoint."""

    def test_register_user_success(self, client, mock_db_connection):
        """Test successful user registration."""
        mock_cursor, mock_conn = mock_db_connection

        # Mock email check (no existing user)
        mock_cursor.fetchone.side_effect = [
            None,  # Email doesn't exist
            (  # Registration return values
                uuid.uuid4(),
                "newuser@test.com",
                "Test User",
                "interviewer",
                None,
                datetime.now()
            )
        ]

        response = client.post("/auth/register", json={
            "email": "newuser@test.com",
            "password": "SecurePass123!",
            "full_name": "Test User",
            "role": "interviewer"
        })

        assert response.status_code == 201
        data = response.json()
        assert data['email'] == "newuser@test.com"
        assert data['full_name'] == "Test User"
        assert data['role'] == "interviewer"

    def test_register_duplicate_email(self, client, mock_db_connection):
        """Test registration with duplicate email fails."""
        mock_cursor, mock_conn = mock_db_connection

        # Mock email check (user exists)
        mock_cursor.fetchone.return_value = (uuid.uuid4(),)

        response = client.post("/auth/register", json={
            "email": "existing@test.com",
            "password": "SecurePass123!",
            "full_name": "Test User",
            "role": "interviewer"
        })

        assert response.status_code == 400
        assert "already registered" in response.json()['detail']

    def test_register_weak_password(self, client):
        """Test registration with weak password fails validation."""
        response = client.post("/auth/register", json={
            "email": "test@test.com",
            "password": "weak",  # Too short
            "full_name": "Test User",
            "role": "interviewer"
        })

        assert response.status_code == 422  # Validation error

    def test_register_invalid_email(self, client):
        """Test registration with invalid email fails validation."""
        response = client.post("/auth/register", json={
            "email": "not-an-email",
            "password": "SecurePass123!",
            "full_name": "Test User",
            "role": "interviewer"
        })

        assert response.status_code == 422  # Validation error

    def test_register_password_without_uppercase(self, client):
        """Test registration with password missing uppercase."""
        response = client.post("/auth/register", json={
            "email": "test@test.com",
            "password": "securepass123!",  # No uppercase
            "full_name": "Test User",
            "role": "interviewer"
        })

        assert response.status_code == 422
        assert "uppercase" in str(response.json()).lower()

    def test_register_password_without_digit(self, client):
        """Test registration with password missing digit."""
        response = client.post("/auth/register", json={
            "email": "test@test.com",
            "password": "SecurePass!",  # No digit
            "full_name": "Test User",
            "role": "interviewer"
        })

        assert response.status_code == 422
        assert "digit" in str(response.json()).lower()


class TestUserLogin:
    """Test user login endpoint."""

    def test_login_success(self, client, mock_db_connection):
        """Test successful login."""
        mock_cursor, mock_conn = mock_db_connection

        user_id = uuid.uuid4()
        email = "test@example.com"
        password = "SecurePass123!"
        password_hash = hash_password(password)

        # Mock user fetch
        mock_cursor.fetchone.return_value = (
            user_id,
            email,
            password_hash,
            "interviewer",
            True  # is_active
        )

        response = client.post("/auth/login", json={
            "email": email,
            "password": password
        })

        assert response.status_code == 200
        data = response.json()
        assert 'access_token' in data
        assert 'refresh_token' in data
        assert data['token_type'] == 'bearer'
        assert data['expires_in'] > 0

    def test_login_wrong_password(self, client, mock_db_connection):
        """Test login with wrong password fails."""
        mock_cursor, mock_conn = mock_db_connection

        user_id = uuid.uuid4()
        password_hash = hash_password("CorrectPass123!")

        # Mock user fetch
        mock_cursor.fetchone.return_value = (
            user_id,
            "test@example.com",
            password_hash,
            "interviewer",
            True
        )

        response = client.post("/auth/login", json={
            "email": "test@example.com",
            "password": "WrongPass123!"
        })

        assert response.status_code == 401
        assert "Invalid credentials" in response.json()['detail']

    def test_login_nonexistent_user(self, client, mock_db_connection):
        """Test login with non-existent user fails."""
        mock_cursor, mock_conn = mock_db_connection

        # Mock user not found
        mock_cursor.fetchone.return_value = None

        response = client.post("/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "AnyPass123!"
        })

        assert response.status_code == 401
        assert "Invalid credentials" in response.json()['detail']

    def test_login_inactive_account(self, client, mock_db_connection):
        """Test login with inactive account fails."""
        mock_cursor, mock_conn = mock_db_connection

        user_id = uuid.uuid4()
        password = "SecurePass123!"
        password_hash = hash_password(password)

        # Mock inactive user
        mock_cursor.fetchone.return_value = (
            user_id,
            "test@example.com",
            password_hash,
            "interviewer",
            False  # is_active = False
        )

        response = client.post("/auth/login", json={
            "email": "test@example.com",
            "password": password
        })

        assert response.status_code == 403
        assert "disabled" in response.json()['detail'].lower()


class TestTokenRefresh:
    """Test token refresh endpoint."""

    def test_refresh_token_success(self, client, mock_db_connection):
        """Test successful token refresh."""
        mock_cursor, mock_conn = mock_db_connection

        from backend.services.auth.security import create_refresh_token

        user_id = uuid.uuid4()
        refresh_token = create_refresh_token(user_id)

        # Mock user fetch
        mock_cursor.fetchone.return_value = (
            "test@example.com",
            "interviewer",
            True  # is_active
        )

        response = client.post("/auth/refresh", json={
            "refresh_token": refresh_token
        })

        assert response.status_code == 200
        data = response.json()
        assert 'access_token' in data
        assert 'refresh_token' in data

    def test_refresh_with_access_token_fails(self, client, mock_db_connection):
        """Test refresh with access token instead of refresh token fails."""
        user_id = uuid.uuid4()
        access_token = create_access_token(user_id, "test@example.com", "interviewer")

        response = client.post("/auth/refresh", json={
            "refresh_token": access_token
        })

        assert response.status_code == 401
        assert "Invalid token type" in response.json()['detail']

    def test_refresh_invalid_token(self, client):
        """Test refresh with invalid token fails."""
        response = client.post("/auth/refresh", json={
            "refresh_token": "invalid.token.here"
        })

        assert response.status_code == 401


class TestGetCurrentUser:
    """Test get current user endpoint."""

    def test_get_me_success(self, client, mock_db_connection):
        """Test successful get current user."""
        mock_cursor, mock_conn = mock_db_connection

        user_id = uuid.uuid4()
        email = "test@example.com"
        token = create_access_token(user_id, email, "interviewer")

        # Mock user fetch
        mock_cursor.fetchone.return_value = (
            user_id,
            email,
            "Test User",
            "interviewer",
            None,
            datetime.now()
        )

        response = client.get("/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })

        assert response.status_code == 200
        data = response.json()
        assert data['email'] == email
        assert data['role'] == "interviewer"

    def test_get_me_no_token(self, client):
        """Test get current user without token fails."""
        response = client.get("/auth/me")

        assert response.status_code == 403  # No credentials provided

    def test_get_me_invalid_token(self, client):
        """Test get current user with invalid token fails."""
        response = client.get("/auth/me", headers={
            "Authorization": "Bearer invalid.token.here"
        })

        assert response.status_code == 401


class TestSessionToken:
    """Test session token endpoints."""

    def test_validate_session_token_success(self, client, mock_db_connection):
        """Test successful session token validation."""
        mock_cursor, mock_conn = mock_db_connection

        session_id = uuid.uuid4()

        # Mock session fetch
        mock_cursor.fetchone.return_value = (
            session_id,
            "active"
        )

        response = client.get("/auth/validate-session-token/test-session-token")

        assert response.status_code == 200
        data = response.json()
        assert data['valid'] is True
        assert 'session_id' in data

    def test_validate_invalid_session_token(self, client, mock_db_connection):
        """Test validation of invalid session token fails."""
        mock_cursor, mock_conn = mock_db_connection

        # Mock session not found
        mock_cursor.fetchone.return_value = None

        response = client.get("/auth/validate-session-token/invalid-token")

        assert response.status_code == 401

    def test_validate_inactive_session(self, client, mock_db_connection):
        """Test validation of inactive session fails."""
        mock_cursor, mock_conn = mock_db_connection

        session_id = uuid.uuid4()

        # Mock inactive session
        mock_cursor.fetchone.return_value = (
            session_id,
            "completed"  # Not active
        )

        response = client.get("/auth/validate-session-token/test-token")

        assert response.status_code == 403


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
