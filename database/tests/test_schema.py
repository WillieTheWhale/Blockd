"""
Blockd Database Schema Tests
Tests the database schema, constraints, and basic operations.

Usage:
    pytest test_schema.py -v

Requirements:
    - PostgreSQL database running
    - BLOCKD_DATABASE_URL environment variable set
    - pytest and pytest-postgresql installed
"""

import os
import pytest
import psycopg2
from psycopg2.extras import RealDictCursor
import uuid
import hashlib
from datetime import datetime, timedelta


# Test database connection
@pytest.fixture
def db_connection():
    """Create a database connection for tests."""
    conn_string = os.getenv(
        'BLOCKD_DATABASE_URL',
        'postgresql://blockd:password@localhost:5432/blockd_db'
    )
    conn = psycopg2.connect(conn_string)
    yield conn
    conn.close()


@pytest.fixture
def db_cursor(db_connection):
    """Create a database cursor for tests."""
    cursor = db_connection.cursor(cursor_factory=RealDictCursor)
    yield cursor
    db_connection.rollback()  # Rollback after each test
    cursor.close()


class TestOrganizations:
    """Test organizations table."""

    def test_create_organization(self, db_cursor):
        """Test creating an organization."""
        org_id = str(uuid.uuid4())
        db_cursor.execute("""
            INSERT INTO organizations (id, name, slug, subscription_tier)
            VALUES (%s, %s, %s, %s)
            RETURNING id, name, slug
        """, (org_id, 'Test Org', 'test-org', 'pro'))

        result = db_cursor.fetchone()
        assert result['id'] == org_id
        assert result['name'] == 'Test Org'
        assert result['slug'] == 'test-org'

    def test_unique_slug_constraint(self, db_cursor):
        """Test that slug must be unique."""
        db_cursor.execute("""
            INSERT INTO organizations (name, slug, subscription_tier)
            VALUES ('Org 1', 'duplicate', 'free')
        """)

        with pytest.raises(psycopg2.IntegrityError):
            db_cursor.execute("""
                INSERT INTO organizations (name, slug, subscription_tier)
                VALUES ('Org 2', 'duplicate', 'pro')
            """)

    def test_subscription_tier_constraint(self, db_cursor):
        """Test that subscription_tier must be valid."""
        with pytest.raises(psycopg2.IntegrityError):
            db_cursor.execute("""
                INSERT INTO organizations (name, slug, subscription_tier)
                VALUES ('Test', 'test', 'invalid_tier')
            """)


class TestUsers:
    """Test users table."""

    def test_create_user(self, db_cursor):
        """Test creating a user."""
        # First create an organization
        org_id = str(uuid.uuid4())
        db_cursor.execute("""
            INSERT INTO organizations (id, name, slug, subscription_tier)
            VALUES (%s, 'Test Org', 'test-org-user', 'free')
        """, (org_id,))

        # Create user
        user_id = str(uuid.uuid4())
        password_hash = hashlib.sha256('password123'.encode()).hexdigest()

        db_cursor.execute("""
            INSERT INTO users (id, email, password_hash, full_name, role, organization_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, email, role
        """, (user_id, 'test@example.com', password_hash, 'Test User', 'interviewer', org_id))

        result = db_cursor.fetchone()
        assert result['email'] == 'test@example.com'
        assert result['role'] == 'interviewer'

    def test_unique_email_constraint(self, db_cursor):
        """Test that email must be unique."""
        org_id = str(uuid.uuid4())
        db_cursor.execute("""
            INSERT INTO organizations (id, name, slug, subscription_tier)
            VALUES (%s, 'Org', 'org', 'free')
        """, (org_id,))

        password_hash = hashlib.sha256('password'.encode()).hexdigest()

        db_cursor.execute("""
            INSERT INTO users (email, password_hash, full_name, role, organization_id)
            VALUES ('duplicate@example.com', %s, 'User 1', 'interviewer', %s)
        """, (password_hash, org_id))

        with pytest.raises(psycopg2.IntegrityError):
            db_cursor.execute("""
                INSERT INTO users (email, password_hash, full_name, role, organization_id)
                VALUES ('duplicate@example.com', %s, 'User 2', 'interviewee', %s)
            """, (password_hash, org_id))


class TestSessions:
    """Test sessions table."""

    def test_create_session(self, db_cursor):
        """Test creating a session."""
        # Setup: Create org and users
        org_id = str(uuid.uuid4())
        db_cursor.execute("""
            INSERT INTO organizations (id, name, slug, subscription_tier)
            VALUES (%s, 'Org', 'org-session', 'pro')
        """, (org_id,))

        interviewer_id = str(uuid.uuid4())
        password_hash = hashlib.sha256('password'.encode()).hexdigest()

        db_cursor.execute("""
            INSERT INTO users (id, email, password_hash, full_name, role, organization_id)
            VALUES (%s, 'interviewer@example.com', %s, 'Interviewer', 'interviewer', %s)
        """, (interviewer_id, password_hash, org_id))

        # Create session
        session_id = str(uuid.uuid4())
        session_token = hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()

        db_cursor.execute("""
            INSERT INTO sessions (
                id, interviewer_id, organization_id, session_token,
                status, scheduled_start_time
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, status, session_token
        """, (
            session_id, interviewer_id, org_id, session_token,
            'scheduled', datetime.now() + timedelta(hours=1)
        ))

        result = db_cursor.fetchone()
        assert result['status'] == 'scheduled'
        assert result['session_token'] == session_token

    def test_session_duration_trigger(self, db_cursor):
        """Test that duration is auto-calculated on completion."""
        # Setup
        org_id = str(uuid.uuid4())
        db_cursor.execute("""
            INSERT INTO organizations (id, name, slug, subscription_tier)
            VALUES (%s, 'Org', 'org-duration', 'pro')
        """, (org_id,))

        interviewer_id = str(uuid.uuid4())
        password_hash = hashlib.sha256('password'.encode()).hexdigest()

        db_cursor.execute("""
            INSERT INTO users (id, email, password_hash, full_name, role, organization_id)
            VALUES (%s, 'interviewer2@example.com', %s, 'Interviewer', 'interviewer', %s)
        """, (interviewer_id, password_hash, org_id))

        session_id = str(uuid.uuid4())
        session_token = hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()

        start_time = datetime.now()
        end_time = start_time + timedelta(minutes=45)

        db_cursor.execute("""
            INSERT INTO sessions (
                id, interviewer_id, organization_id, session_token,
                status, actual_start_time
            )
            VALUES (%s, %s, %s, %s, 'active', %s)
        """, (session_id, interviewer_id, org_id, session_token, start_time))

        # Complete the session
        db_cursor.execute("""
            UPDATE sessions
            SET status = 'completed', end_time = %s
            WHERE id = %s
            RETURNING duration_seconds
        """, (end_time, session_id))

        result = db_cursor.fetchone()
        assert result['duration_seconds'] == 45 * 60  # 45 minutes


class TestDetectionEvents:
    """Test detection_events table."""

    def test_create_detection_event(self, db_cursor):
        """Test creating a detection event."""
        # Setup
        org_id = str(uuid.uuid4())
        db_cursor.execute("""
            INSERT INTO organizations (id, name, slug, subscription_tier)
            VALUES (%s, 'Org', 'org-event', 'pro')
        """, (org_id,))

        interviewer_id = str(uuid.uuid4())
        password_hash = hashlib.sha256('password'.encode()).hexdigest()

        db_cursor.execute("""
            INSERT INTO users (id, email, password_hash, full_name, role, organization_id)
            VALUES (%s, 'interviewer3@example.com', %s, 'Interviewer', 'interviewer', %s)
        """, (interviewer_id, password_hash, org_id))

        session_id = str(uuid.uuid4())
        session_token = hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()

        db_cursor.execute("""
            INSERT INTO sessions (
                id, interviewer_id, organization_id, session_token, status
            )
            VALUES (%s, %s, %s, %s, 'active')
        """, (session_id, interviewer_id, org_id, session_token))

        # Create event
        db_cursor.execute("""
            INSERT INTO detection_events (
                session_id, event_type, confidence_score, event_data, severity
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, event_type, severity
        """, (
            session_id, 'eye_tracking', 0.85,
            '{"gaze_x": 100, "gaze_y": 200}', 'medium'
        ))

        result = db_cursor.fetchone()
        assert result['event_type'] == 'eye_tracking'
        assert result['severity'] == 'medium'


class TestConstraints:
    """Test database constraints."""

    def test_invalid_event_type(self, db_cursor):
        """Test that invalid event types are rejected."""
        org_id = str(uuid.uuid4())
        db_cursor.execute("""
            INSERT INTO organizations (id, name, slug, subscription_tier)
            VALUES (%s, 'Org', 'org-constraint', 'pro')
        """, (org_id,))

        interviewer_id = str(uuid.uuid4())
        password_hash = hashlib.sha256('password'.encode()).hexdigest()

        db_cursor.execute("""
            INSERT INTO users (id, email, password_hash, full_name, role, organization_id)
            VALUES (%s, 'interviewer4@example.com', %s, 'Interviewer', 'interviewer', %s)
        """, (interviewer_id, password_hash, org_id))

        session_id = str(uuid.uuid4())
        session_token = hashlib.sha256(str(uuid.uuid4()).encode()).hexdigest()

        db_cursor.execute("""
            INSERT INTO sessions (
                id, interviewer_id, organization_id, session_token, status
            )
            VALUES (%s, %s, %s, %s, 'active')
        """, (session_id, interviewer_id, org_id, session_token))

        with pytest.raises(psycopg2.IntegrityError):
            db_cursor.execute("""
                INSERT INTO detection_events (
                    session_id, event_type, confidence_score, event_data, severity
                )
                VALUES (%s, 'invalid_type', 0.85, '{}', 'low')
            """, (session_id,))


# Run tests
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
