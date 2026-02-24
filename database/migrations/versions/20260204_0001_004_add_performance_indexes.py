"""Add missing database indexes for performance optimization

Revision ID: 004
Revises: 003
Create Date: 2026-02-04 00:01:00.000000

This migration adds missing indexes to improve query performance:
- Index on interview_sessions.created_at for sorting
- Composite index on answer_analysis(question_id, analyzed_at DESC)
- Composite index on word_timestamps(transcription_id, word_index)
- Indexes for foreign keys that don't have them
- Option to convert active_sessions view to materialized view
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add performance indexes"""
    conn = op.get_bind()

    # ==========================================================================
    # INTERVIEW SESSIONS INDEXES
    # ==========================================================================

    conn.execute(sa.text("""
        -- Index on interview_sessions.created_at for sorting queries
        CREATE INDEX IF NOT EXISTS idx_interview_sessions_created_at
            ON interview_sessions(created_at DESC);
    """))

    # ==========================================================================
    # ANSWER ANALYSIS INDEXES
    # ==========================================================================

    conn.execute(sa.text("""
        -- Composite index on answer_analysis for question lookup with time ordering
        -- Useful for queries like: SELECT * FROM answer_analysis WHERE question_id = ? ORDER BY analyzed_at DESC
        CREATE INDEX IF NOT EXISTS idx_answer_analysis_question_analyzed
            ON answer_analysis(question_id, analyzed_at DESC);
    """))

    # ==========================================================================
    # WORD TIMESTAMPS INDEXES (Detection Service)
    # ==========================================================================

    conn.execute(sa.text("""
        -- Composite index on word_timestamps for efficient word lookup by position
        -- Useful for queries like: SELECT * FROM word_timestamps WHERE transcription_id = ? ORDER BY word_index
        CREATE INDEX IF NOT EXISTS idx_word_timestamps_transcription_index
            ON word_timestamps(transcription_id, word_index);
    """))

    # ==========================================================================
    # FOREIGN KEY INDEXES
    # ==========================================================================

    # Check and add indexes for foreign keys that might be missing
    conn.execute(sa.text("""
        -- Index on users.organization_id (FK to organizations)
        -- Note: idx_users_organization exists but has a WHERE clause, this is unconditional
        CREATE INDEX IF NOT EXISTS idx_users_organization_id_fk
            ON users(organization_id);

        -- Index on interview_sessions.organization_id (FK to organizations)
        -- Note: idx_sessions_org_status is composite with status, this is just org_id
        CREATE INDEX IF NOT EXISTS idx_interview_sessions_org_id_fk
            ON interview_sessions(organization_id);

        -- Index on oauth_accounts.user_id (FK to users)
        -- Already exists as idx_oauth_accounts_user, skipping

        -- Index on refresh_tokens.user_id (FK to users)
        -- Already exists as idx_refresh_tokens_user, skipping

        -- Index on session_reports.session_id (FK to interview_sessions)
        -- Already exists as idx_session_reports_session, skipping

        -- Index on questions.session_id (FK to interview_sessions)
        -- Already exists as idx_questions_session, skipping

        -- Index on security_events.session_id (FK to interview_sessions)
        -- Already exists as idx_security_events_session, skipping

        -- Index on answer_analysis.question_id (FK to questions)
        -- Already exists as idx_answer_analysis_question, skipping

        -- Index on transcriptions.analysis_id (FK to response_timing_analysis)
        -- Already exists as idx_transcription_analysis, skipping

        -- Index on word_timestamps.transcription_id (FK to transcriptions)
        -- Already exists as idx_word_timestamps_transcription, skipping

        -- Index on pause_events.analysis_id (FK to response_timing_analysis)
        -- Already exists as idx_pause_events_analysis, skipping

        -- Index on filler_word_events.analysis_id (FK to response_timing_analysis)
        -- Already exists as idx_filler_events_analysis, skipping

        -- Index on timing_anomalies.analysis_id (FK to response_timing_analysis)
        -- Already exists as idx_timing_anomalies_analysis, skipping

        -- Index on gaze_summaries.session_id (FK)
        -- Already exists as idx_gaze_summaries_session, skipping

        -- Index on gaze_anomalies.session_id (FK)
        -- Already exists as idx_gaze_anomalies_session, skipping

        -- Index on chat_messages.session_id (FK to interview_sessions)
        -- Already exists as idx_chat_messages_session, skipping

        -- Index on browser_telemetry.session_id (FK)
        -- Covered by idx_browser_telemetry_session_time, skipping

        -- Index on gaze_events.session_id (FK)
        -- Covered by idx_gaze_events_session_time or idx_gaze_events_session, skipping
    """))

    # ==========================================================================
    # MATERIALIZED VIEW FOR ACTIVE SESSIONS (Optional)
    # ==========================================================================

    # Note: Materialized views require manual refresh, so this is provided as an
    # optional optimization. Uncomment and run separately if needed.
    #
    # The regular view should be sufficient for most use cases, but if the
    # active_sessions view is queried frequently with heavy joins, consider
    # converting to a materialized view with a refresh strategy.

    conn.execute(sa.text("""
        -- Create materialized view for active_sessions (optional performance optimization)
        -- This should only be used if the regular view causes performance issues
        -- Note: Requires periodic refresh via: REFRESH MATERIALIZED VIEW CONCURRENTLY active_sessions_mat;

        -- First, drop the materialized view if it exists (for idempotency)
        DROP MATERIALIZED VIEW IF EXISTS active_sessions_mat;

        -- Create the materialized view
        CREATE MATERIALIZED VIEW active_sessions_mat AS
        SELECT
            s.id,
            s.session_token,
            s.scheduled_start,
            s.actual_start,
            i.email AS interviewer_email,
            i.first_name AS interviewer_first_name,
            i.last_name AS interviewer_last_name,
            ie.email AS interviewee_email,
            ie.first_name AS interviewee_first_name,
            ie.last_name AS interviewee_last_name,
            o.name AS organization_name,
            s.risk_score,
            COUNT(DISTINCT se.id) AS security_events_count
        FROM interview_sessions s
        INNER JOIN users i ON s.interviewer_id = i.id
        LEFT JOIN users ie ON s.interviewee_id = ie.id
        INNER JOIN organizations o ON s.organization_id = o.id
        LEFT JOIN security_events se ON s.id = se.session_id
        WHERE s.status = 'active'
        GROUP BY s.id, i.id, ie.id, o.id;

        -- Create unique index to support CONCURRENTLY refresh
        CREATE UNIQUE INDEX idx_active_sessions_mat_id ON active_sessions_mat(id);

        -- Additional indexes for common query patterns
        CREATE INDEX idx_active_sessions_mat_org ON active_sessions_mat(organization_name);
        CREATE INDEX idx_active_sessions_mat_interviewer ON active_sessions_mat(interviewer_email);
        CREATE INDEX idx_active_sessions_mat_risk ON active_sessions_mat(risk_score DESC);
    """))

    # ==========================================================================
    # FUNCTION TO REFRESH MATERIALIZED VIEW
    # ==========================================================================

    conn.execute(sa.text("""
        -- Function to refresh the active_sessions materialized view
        -- Can be called manually or via a scheduled job (e.g., pg_cron)
        CREATE OR REPLACE FUNCTION refresh_active_sessions_mat()
        RETURNS void AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY active_sessions_mat;
        END;
        $$ LANGUAGE plpgsql;

        -- Example: Schedule refresh every minute using pg_cron (if available)
        -- SELECT cron.schedule('refresh-active-sessions', '* * * * *', 'SELECT refresh_active_sessions_mat()');
    """))

    # ==========================================================================
    # ANALYZE TABLES
    # ==========================================================================

    conn.execute(sa.text("""
        -- Update statistics for query planner
        ANALYZE interview_sessions;
        ANALYZE answer_analysis;
        ANALYZE word_timestamps;
        ANALYZE users;
    """))

    print("Performance indexes added successfully")


def downgrade() -> None:
    """Remove performance indexes"""
    conn = op.get_bind()

    # Drop function
    conn.execute(sa.text("""
        DROP FUNCTION IF EXISTS refresh_active_sessions_mat();
    """))

    # Drop materialized view
    conn.execute(sa.text("""
        DROP MATERIALIZED VIEW IF EXISTS active_sessions_mat CASCADE;
    """))

    # Drop indexes
    conn.execute(sa.text("""
        -- Drop interview_sessions indexes
        DROP INDEX IF EXISTS idx_interview_sessions_created_at;

        -- Drop answer_analysis indexes
        DROP INDEX IF EXISTS idx_answer_analysis_question_analyzed;

        -- Drop word_timestamps indexes
        DROP INDEX IF EXISTS idx_word_timestamps_transcription_index;

        -- Drop foreign key indexes
        DROP INDEX IF EXISTS idx_users_organization_id_fk;
        DROP INDEX IF EXISTS idx_interview_sessions_org_id_fk;
    """))

    print("Performance indexes removed successfully")
