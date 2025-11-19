"""Initial database schema

Revision ID: 001
Revises:
Create Date: 2024-01-15 10:00:00.000000

This migration creates the complete initial schema for Blockd including:
- Extensions (uuid-ossp, pgcrypto, timescaledb, pg_trgm, vector)
- 7 core tables: organizations, users, sessions, detection_events, alerts, session_analytics, ai_cache
- Indexes for performance optimization
- Triggers for auto-updating timestamps
- Views for common queries
- Constraints for data integrity
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pathlib import Path


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Execute the initial schema creation."""
    # Get the path to schema.sql
    schema_path = Path(__file__).resolve().parent.parent.parent / 'schema.sql'

    # Read the schema file
    with open(schema_path, 'r') as f:
        schema_sql = f.read()

    # Execute the schema SQL
    # Note: We execute as a single transaction
    op.execute(schema_sql)


def downgrade() -> None:
    """Drop all tables and extensions in reverse order."""

    # Drop views first
    op.execute('DROP VIEW IF EXISTS v_session_summary CASCADE')
    op.execute('DROP VIEW IF EXISTS v_active_sessions CASCADE')

    # Drop triggers
    op.execute('DROP TRIGGER IF EXISTS update_ai_cache_access_trigger ON ai_cache')
    op.execute('DROP TRIGGER IF EXISTS calculate_session_duration_trigger ON sessions')
    op.execute('DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations')
    op.execute('DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions')
    op.execute('DROP TRIGGER IF EXISTS update_users_updated_at ON users')

    # Drop functions
    op.execute('DROP FUNCTION IF EXISTS update_ai_cache_access() CASCADE')
    op.execute('DROP FUNCTION IF EXISTS calculate_session_duration() CASCADE')
    op.execute('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE')

    # Drop tables in reverse dependency order
    op.execute('DROP TABLE IF EXISTS ai_cache CASCADE')
    op.execute('DROP TABLE IF EXISTS session_analytics CASCADE')
    op.execute('DROP TABLE IF EXISTS alerts CASCADE')
    op.execute('DROP TABLE IF EXISTS detection_events CASCADE')
    op.execute('DROP TABLE IF EXISTS sessions CASCADE')
    op.execute('DROP TABLE IF EXISTS users CASCADE')
    op.execute('DROP TABLE IF EXISTS organizations CASCADE')

    # Drop extensions (optional - may want to keep for other databases)
    # op.execute('DROP EXTENSION IF EXISTS vector')
    # op.execute('DROP EXTENSION IF EXISTS pg_trgm')
    # op.execute('DROP EXTENSION IF EXISTS timescaledb')
    # op.execute('DROP EXTENSION IF EXISTS pgcrypto')
    # op.execute('DROP EXTENSION IF EXISTS "uuid-ossp"')
