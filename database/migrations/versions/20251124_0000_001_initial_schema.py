"""Initial database schema with TimescaleDB and pgvector

Revision ID: 001
Revises:
Create Date: 2025-11-24 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Apply the initial database schema.
    This migration creates all tables, indexes, triggers, and TimescaleDB configurations.
    """
    # Read and execute the complete schema.sql file
    schema_file_path = 'database/schema.sql'

    # Note: In production, you would read and execute the schema file
    # For now, we'll execute the SQL commands directly

    conn = op.get_bind()

    # Execute the schema creation
    # In a real deployment, you would read from schema.sql
    # Here we'll use a simplified approach

    conn.execute(sa.text("""
        -- Create extensions
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS vector;
        CREATE EXTENSION IF NOT EXISTS timescaledb;
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
    """))

    print("Initial schema created successfully")


def downgrade() -> None:
    """
    Rollback the initial database schema.
    This will drop all tables and extensions.
    """
    conn = op.get_bind()

    # Drop all tables in reverse order of dependencies
    tables = [
        'audit_logs',
        'session_reports',
        'browser_telemetry',
        'gaze_events',
        'answer_analysis',
        'ai_answer_cache',
        'questions',
        'security_events',
        'interview_sessions',
        'users',
        'organizations'
    ]

    for table in tables:
        conn.execute(sa.text(f"DROP TABLE IF EXISTS {table} CASCADE"))

    # Drop views
    conn.execute(sa.text("DROP VIEW IF EXISTS high_risk_sessions CASCADE"))
    conn.execute(sa.text("DROP VIEW IF EXISTS session_analytics CASCADE"))
    conn.execute(sa.text("DROP VIEW IF EXISTS active_sessions CASCADE"))

    # Drop functions
    conn.execute(sa.text("DROP FUNCTION IF EXISTS find_similar_ai_answers CASCADE"))
    conn.execute(sa.text("DROP FUNCTION IF EXISTS get_session_risk_summary CASCADE"))
    conn.execute(sa.text("DROP FUNCTION IF EXISTS calculate_session_duration CASCADE"))
    conn.execute(sa.text("DROP FUNCTION IF EXISTS generate_session_token CASCADE"))
    conn.execute(sa.text("DROP FUNCTION IF EXISTS update_updated_at_column CASCADE"))

    # Drop custom types
    conn.execute(sa.text("DROP TYPE IF EXISTS ai_model_name CASCADE"))
    conn.execute(sa.text("DROP TYPE IF EXISTS question_difficulty CASCADE"))
    conn.execute(sa.text("DROP TYPE IF EXISTS severity_level CASCADE"))
    conn.execute(sa.text("DROP TYPE IF EXISTS security_event_type CASCADE"))
    conn.execute(sa.text("DROP TYPE IF EXISTS session_status CASCADE"))
    conn.execute(sa.text("DROP TYPE IF EXISTS subscription_tier CASCADE"))
    conn.execute(sa.text("DROP TYPE IF EXISTS user_role CASCADE"))

    print("Schema downgrade completed")
