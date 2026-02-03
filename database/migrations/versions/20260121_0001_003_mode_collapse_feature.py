"""Add mode collapse detection feature tables

Revision ID: 003
Revises: 002
Create Date: 2026-01-21 00:01:00.000000

This migration adds support for mode collapse detection:
- global_questions table: Store questions independent of sessions for reuse
- interviewer_audio_transcriptions: Store transcribed interviewer audio
- Updated ai_model_name enum: Support latest AI models (GPT-5.2, Claude Opus 4.5, Gemini 3 Pro)
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create mode collapse detection tables and update enums"""
    conn = op.get_bind()

    # ==========================================================================
    # UPDATE AI MODEL ENUM
    # ==========================================================================

    conn.execute(sa.text("""
        -- Add new AI model values to the enum
        -- Note: PostgreSQL allows adding values to enums but not removing them
        DO $$ BEGIN
            ALTER TYPE ai_model_name ADD VALUE IF NOT EXISTS 'gpt-5.2';
        EXCEPTION WHEN others THEN NULL;
        END $$;

        DO $$ BEGIN
            ALTER TYPE ai_model_name ADD VALUE IF NOT EXISTS 'gpt-4o';
        EXCEPTION WHEN others THEN NULL;
        END $$;

        DO $$ BEGIN
            ALTER TYPE ai_model_name ADD VALUE IF NOT EXISTS 'claude-opus-4.5';
        EXCEPTION WHEN others THEN NULL;
        END $$;

        DO $$ BEGIN
            ALTER TYPE ai_model_name ADD VALUE IF NOT EXISTS 'claude-sonnet-4.5';
        EXCEPTION WHEN others THEN NULL;
        END $$;

        DO $$ BEGIN
            ALTER TYPE ai_model_name ADD VALUE IF NOT EXISTS 'gemini-3-pro';
        EXCEPTION WHEN others THEN NULL;
        END $$;

        DO $$ BEGIN
            ALTER TYPE ai_model_name ADD VALUE IF NOT EXISTS 'gemini-2.5-flash';
        EXCEPTION WHEN others THEN NULL;
        END $$;
    """))

    # ==========================================================================
    # GLOBAL QUESTIONS TABLE
    # ==========================================================================

    conn.execute(sa.text("""
        -- Global questions table for mode collapse detection
        -- Stores unique questions across all sessions for AI answer caching
        CREATE TABLE IF NOT EXISTS global_questions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

            -- Question identification
            question_hash VARCHAR(64) NOT NULL UNIQUE,
            question_text TEXT NOT NULL,
            normalized_text TEXT NOT NULL,

            -- Question categorization
            category VARCHAR(100),
            difficulty question_difficulty,
            domain VARCHAR(100),

            -- Embedding for semantic similarity matching
            embedding_json JSONB,

            -- Statistics
            times_asked INTEGER NOT NULL DEFAULT 1,
            first_asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- AI answers generated
            ai_answers_generated BOOLEAN NOT NULL DEFAULT FALSE,
            ai_answers_count INTEGER NOT NULL DEFAULT 0,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Indexes for global_questions
        CREATE INDEX IF NOT EXISTS idx_global_questions_hash
            ON global_questions(question_hash);
        CREATE INDEX IF NOT EXISTS idx_global_questions_normalized
            ON global_questions USING gin(to_tsvector('english', normalized_text));
        CREATE INDEX IF NOT EXISTS idx_global_questions_category
            ON global_questions(category);
        CREATE INDEX IF NOT EXISTS idx_global_questions_times_asked
            ON global_questions(times_asked DESC);
        CREATE INDEX IF NOT EXISTS idx_global_questions_ai_generated
            ON global_questions(ai_answers_generated) WHERE ai_answers_generated = FALSE;
    """))

    # ==========================================================================
    # INTERVIEWER AUDIO TRANSCRIPTIONS TABLE
    # ==========================================================================

    conn.execute(sa.text("""
        -- Interviewer audio transcription table for mode collapse detection
        -- Captures what the interviewer says to detect questions
        CREATE TABLE IF NOT EXISTS interviewer_audio_transcriptions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

            -- Session reference
            session_id UUID NOT NULL,

            -- Audio metadata
            audio_chunk_index INTEGER NOT NULL,
            audio_start_time FLOAT NOT NULL,
            audio_end_time FLOAT NOT NULL,
            audio_duration_seconds FLOAT NOT NULL,

            -- Transcription content
            transcription_text TEXT NOT NULL,
            confidence FLOAT NOT NULL DEFAULT 0.0,

            -- Detected questions
            detected_questions JSONB NOT NULL DEFAULT '[]',
            question_count INTEGER NOT NULL DEFAULT 0,

            -- Processing metadata
            processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            processing_time_ms INTEGER,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Indexes for interviewer_audio_transcriptions
        CREATE INDEX IF NOT EXISTS idx_interviewer_audio_session
            ON interviewer_audio_transcriptions(session_id);
        CREATE INDEX IF NOT EXISTS idx_interviewer_audio_session_time
            ON interviewer_audio_transcriptions(session_id, audio_start_time);
        CREATE INDEX IF NOT EXISTS idx_interviewer_audio_questions
            ON interviewer_audio_transcriptions(question_count) WHERE question_count > 0;
    """))

    # ==========================================================================
    # SESSION QUESTIONS LINK TABLE
    # ==========================================================================

    conn.execute(sa.text("""
        -- Link table between sessions and global questions
        -- Tracks which global questions were asked in which sessions
        CREATE TABLE IF NOT EXISTS session_question_links (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

            -- References
            session_id UUID NOT NULL,
            global_question_id UUID NOT NULL REFERENCES global_questions(id) ON DELETE CASCADE,

            -- When the question was asked in this session
            asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Source of detection
            detected_from VARCHAR(50) NOT NULL DEFAULT 'interviewer_audio',
            transcription_id UUID REFERENCES interviewer_audio_transcriptions(id) ON DELETE SET NULL,

            -- Question order within session
            question_order INTEGER,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Ensure unique question per session (can be asked once per session)
            UNIQUE(session_id, global_question_id)
        );

        -- Indexes for session_question_links
        CREATE INDEX IF NOT EXISTS idx_session_question_links_session
            ON session_question_links(session_id);
        CREATE INDEX IF NOT EXISTS idx_session_question_links_global
            ON session_question_links(global_question_id);
        CREATE INDEX IF NOT EXISTS idx_session_question_links_asked
            ON session_question_links(asked_at);
    """))

    # ==========================================================================
    # GLOBAL AI ANSWER CACHE TABLE
    # ==========================================================================

    conn.execute(sa.text("""
        -- Global AI answer cache linked to global questions
        -- Stores AI-generated answers for mode collapse comparison
        CREATE TABLE IF NOT EXISTS global_ai_answers (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

            -- Reference to global question
            global_question_id UUID NOT NULL REFERENCES global_questions(id) ON DELETE CASCADE,

            -- AI model that generated this answer
            model_name VARCHAR(50) NOT NULL,
            model_version VARCHAR(50),

            -- Generated answer
            answer_text TEXT NOT NULL,

            -- Embedding for similarity comparison
            embedding_json JSONB,

            -- Quality metrics
            perplexity_score DECIMAL(10, 6),
            token_count INTEGER,
            generation_time_ms INTEGER,

            -- Metadata
            generation_params JSONB DEFAULT '{}',

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Unique constraint: one answer per model per question
            UNIQUE(global_question_id, model_name)
        );

        -- Indexes for global_ai_answers
        CREATE INDEX IF NOT EXISTS idx_global_ai_answers_question
            ON global_ai_answers(global_question_id);
        CREATE INDEX IF NOT EXISTS idx_global_ai_answers_model
            ON global_ai_answers(model_name);
    """))

    # ==========================================================================
    # MODE COLLAPSE ANALYSIS RESULTS TABLE
    # ==========================================================================

    conn.execute(sa.text("""
        -- Mode collapse analysis results
        -- Stores comparison results between user answers and AI answers
        CREATE TABLE IF NOT EXISTS mode_collapse_analysis (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

            -- References
            session_id UUID NOT NULL,
            global_question_id UUID NOT NULL REFERENCES global_questions(id) ON DELETE CASCADE,

            -- User's answer
            user_answer_text TEXT NOT NULL,
            user_answer_embedding_json JSONB,

            -- Similarity scores to AI answers
            similarity_scores JSONB NOT NULL DEFAULT '{}',
            max_similarity_score DECIMAL(5, 4),
            avg_similarity_score DECIMAL(5, 4),
            most_similar_model VARCHAR(50),

            -- Risk assessment
            risk_score DECIMAL(5, 4) CHECK (risk_score >= 0 AND risk_score <= 1),
            risk_level VARCHAR(20),
            is_mode_collapse_suspected BOOLEAN NOT NULL DEFAULT FALSE,

            -- Detailed analysis
            analysis_details JSONB DEFAULT '{}',
            flags JSONB DEFAULT '[]',
            recommendation TEXT,

            -- Processing metadata
            analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            processing_time_ms INTEGER,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Indexes for mode_collapse_analysis
        CREATE INDEX IF NOT EXISTS idx_mode_collapse_session
            ON mode_collapse_analysis(session_id);
        CREATE INDEX IF NOT EXISTS idx_mode_collapse_question
            ON mode_collapse_analysis(global_question_id);
        CREATE INDEX IF NOT EXISTS idx_mode_collapse_risk
            ON mode_collapse_analysis(risk_score DESC);
        CREATE INDEX IF NOT EXISTS idx_mode_collapse_suspected
            ON mode_collapse_analysis(is_mode_collapse_suspected) WHERE is_mode_collapse_suspected = TRUE;
    """))

    # ==========================================================================
    # UPDATED_AT TRIGGERS
    # ==========================================================================

    conn.execute(sa.text("""
        -- Add updated_at trigger for global_questions
        DROP TRIGGER IF EXISTS update_global_questions_updated_at ON global_questions;
        CREATE TRIGGER update_global_questions_updated_at
            BEFORE UPDATE ON global_questions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """))

    # ==========================================================================
    # HELPER FUNCTIONS
    # ==========================================================================

    conn.execute(sa.text("""
        -- Function to find similar global questions by embedding
        CREATE OR REPLACE FUNCTION find_similar_global_questions(
            p_embedding JSONB,
            p_threshold FLOAT DEFAULT 0.85,
            p_limit INTEGER DEFAULT 5
        )
        RETURNS TABLE (
            question_id UUID,
            question_text TEXT,
            similarity_score FLOAT
        ) AS $$
        DECLARE
            v_embedding FLOAT[];
        BEGIN
            -- Convert JSONB to float array
            SELECT array_agg(value::FLOAT)
            INTO v_embedding
            FROM jsonb_array_elements_text(p_embedding);

            -- Find questions with high embedding similarity
            -- Note: This is a simplified version; for production use pgvector
            RETURN QUERY
            SELECT
                gq.id,
                gq.question_text,
                1.0::FLOAT AS similarity_score  -- Placeholder; actual implementation uses vector ops
            FROM global_questions gq
            WHERE gq.embedding_json IS NOT NULL
            LIMIT p_limit;
        END;
        $$ LANGUAGE plpgsql;

        -- Function to get or create a global question
        CREATE OR REPLACE FUNCTION get_or_create_global_question(
            p_question_text TEXT,
            p_question_hash VARCHAR(64),
            p_normalized_text TEXT,
            p_category VARCHAR(100) DEFAULT NULL,
            p_difficulty question_difficulty DEFAULT 'medium'
        )
        RETURNS UUID AS $$
        DECLARE
            v_question_id UUID;
        BEGIN
            -- Try to find existing question by hash
            SELECT id INTO v_question_id
            FROM global_questions
            WHERE question_hash = p_question_hash;

            IF v_question_id IS NOT NULL THEN
                -- Update times_asked counter
                UPDATE global_questions
                SET times_asked = times_asked + 1,
                    last_asked_at = NOW()
                WHERE id = v_question_id;

                RETURN v_question_id;
            END IF;

            -- Create new global question
            INSERT INTO global_questions (
                question_hash,
                question_text,
                normalized_text,
                category,
                difficulty
            ) VALUES (
                p_question_hash,
                p_question_text,
                p_normalized_text,
                p_category,
                p_difficulty
            )
            RETURNING id INTO v_question_id;

            RETURN v_question_id;
        END;
        $$ LANGUAGE plpgsql;
    """))

    print("Mode collapse detection tables created successfully")


def downgrade() -> None:
    """Drop mode collapse detection tables"""
    import re
    conn = op.get_bind()

    # Drop functions
    conn.execute(sa.text("""
        DROP FUNCTION IF EXISTS find_similar_global_questions(JSONB, FLOAT, INTEGER);
        DROP FUNCTION IF EXISTS get_or_create_global_question(TEXT, VARCHAR, TEXT, VARCHAR, question_difficulty);
    """))

    # Drop triggers
    conn.execute(sa.text("""
        DROP TRIGGER IF EXISTS update_global_questions_updated_at ON global_questions;
    """))

    # Drop tables in reverse order of dependencies
    # Note: Table names are hardcoded and validated for safety
    tables = [
        'mode_collapse_analysis',
        'global_ai_answers',
        'session_question_links',
        'interviewer_audio_transcriptions',
        'global_questions',
    ]

    for table in tables:
        # Validate table name contains only safe characters
        if not re.match(r'^[a-z_]+$', table):
            raise ValueError(f"Invalid table name: {table}")
        conn.execute(sa.text(f"DROP TABLE IF EXISTS {table} CASCADE"))

    # Note: Cannot remove values from PostgreSQL enums without recreating them
    # The new enum values will remain

    print("Mode collapse detection tables dropped successfully")
