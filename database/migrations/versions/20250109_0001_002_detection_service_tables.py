"""Add detection service tables for response timing, eye tracking, and AI detection

Revision ID: 002
Revises: 001
Create Date: 2025-01-09 00:01:00.000000

This migration adds comprehensive tables for the detection services:
- Response Timing Service: timing analysis, transcriptions, pauses, fillers, anomalies
- Eye Tracking Service: gaze events, sessions, summaries, anomalies
- AI Detection Service: answer cache, analysis results

All tables use UUID primary keys and include proper indexes for query performance.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create all detection service tables"""
    conn = op.get_bind()

    # ==========================================================================
    # ENUMS
    # ==========================================================================

    conn.execute(sa.text("""
        -- Analysis status enum
        DO $$ BEGIN
            CREATE TYPE analysis_status AS ENUM (
                'pending', 'processing', 'completed', 'failed'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        -- Difficulty level enum
        DO $$ BEGIN
            CREATE TYPE difficulty_level AS ENUM (
                'simple', 'analytical', 'complex'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        -- Anomaly type enum
        DO $$ BEGIN
            CREATE TYPE anomaly_type AS ENUM (
                'instant_response', 'unnatural_consistency', 'delayed_then_fluent',
                'robotic_speech_pattern', 'abnormal_speech_rate', 'low_filler_ratio',
                'excessive_pauses'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        -- Risk level enum
        DO $$ BEGIN
            CREATE TYPE risk_level AS ENUM (
                'minimal', 'low', 'medium', 'high', 'critical'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        -- Gaze anomaly type enum
        DO $$ BEGIN
            CREATE TYPE gaze_anomaly_type AS ENUM (
                'lstm', 'pattern', 'statistical', 'off_screen', 'rapid_movement'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """))

    # ==========================================================================
    # RESPONSE TIMING TABLES
    # ==========================================================================

    # Main response timing analysis table
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS response_timing_analysis (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

            -- Foreign keys
            session_id UUID NOT NULL,
            question_id UUID NOT NULL,

            -- Audio source
            audio_url TEXT NOT NULL,
            audio_duration_seconds FLOAT,
            audio_format VARCHAR(20),
            audio_size_bytes INTEGER,

            -- Timing context
            question_asked_at TIMESTAMPTZ NOT NULL,
            answer_start_at TIMESTAMPTZ NOT NULL,
            difficulty difficulty_level NOT NULL DEFAULT 'analytical',
            expected_latency_ms INTEGER,

            -- Core timing metrics
            response_latency_ms INTEGER,
            speech_duration_seconds FLOAT,
            total_duration_seconds FLOAT,
            speech_rate_wpm FLOAT,

            -- Pause metrics
            pause_count INTEGER DEFAULT 0,
            pause_percentage FLOAT,
            avg_pause_duration_seconds FLOAT,
            max_pause_duration_seconds FLOAT,
            pause_duration_std_dev FLOAT,

            -- Filler word metrics
            filler_word_count INTEGER DEFAULT 0,
            filler_word_ratio FLOAT,
            unique_filler_types INTEGER,

            -- Word statistics
            total_word_count INTEGER,
            unique_word_count INTEGER,
            avg_word_length FLOAT,

            -- Anomaly flags
            has_instant_response BOOLEAN NOT NULL DEFAULT FALSE,
            has_unnatural_consistency BOOLEAN NOT NULL DEFAULT FALSE,
            has_delayed_then_fluent BOOLEAN NOT NULL DEFAULT FALSE,
            has_robotic_pattern BOOLEAN NOT NULL DEFAULT FALSE,

            -- Risk assessment
            risk_score DECIMAL(5, 4) CHECK (risk_score >= 0 AND risk_score <= 1),
            risk_level risk_level,
            risk_factors JSONB DEFAULT '{}',
            recommendation TEXT,

            -- Processing metadata
            status analysis_status NOT NULL DEFAULT 'pending',
            error_message TEXT,
            processing_time_ms INTEGER,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            analyzed_at TIMESTAMPTZ
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_timing_analysis_session_question
            ON response_timing_analysis(session_id, question_id);
        CREATE INDEX IF NOT EXISTS idx_timing_analysis_risk_score
            ON response_timing_analysis(risk_score);
        CREATE INDEX IF NOT EXISTS idx_timing_analysis_status
            ON response_timing_analysis(status);
        CREATE INDEX IF NOT EXISTS idx_timing_analysis_created
            ON response_timing_analysis(created_at);
    """))

    # Transcriptions table
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS transcriptions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            analysis_id UUID NOT NULL UNIQUE REFERENCES response_timing_analysis(id) ON DELETE CASCADE,

            -- Transcription content
            text TEXT NOT NULL,
            text_normalized TEXT,

            -- Confidence
            confidence FLOAT NOT NULL,
            avg_word_confidence FLOAT,
            min_word_confidence FLOAT,

            -- Statistics
            word_count INTEGER NOT NULL,
            sentence_count INTEGER,
            character_count INTEGER,

            -- Language detection
            detected_language VARCHAR(10) DEFAULT 'en',
            language_confidence FLOAT,

            -- Transcription method
            transcription_method VARCHAR(50) NOT NULL DEFAULT 'whisper_api',
            model_used VARCHAR(50),

            -- Raw word timestamps stored as JSONB
            word_timestamps JSONB DEFAULT '[]',

            -- Processing metadata
            processing_time_ms INTEGER,
            audio_duration_seconds FLOAT,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_transcription_analysis ON transcriptions(analysis_id);
        CREATE INDEX IF NOT EXISTS idx_transcription_confidence ON transcriptions(confidence);
    """))

    # Word timestamps table (for detailed analysis)
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS word_timestamps (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            transcription_id UUID NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,

            -- Word data
            word VARCHAR(100) NOT NULL,
            word_normalized VARCHAR(100),
            word_index INTEGER NOT NULL,

            -- Timing
            start_time FLOAT NOT NULL,
            end_time FLOAT NOT NULL CHECK (end_time >= start_time),
            duration FLOAT NOT NULL,

            -- Confidence
            confidence FLOAT NOT NULL DEFAULT 1.0,

            -- Classification flags
            is_filler_word BOOLEAN NOT NULL DEFAULT FALSE,
            is_hesitation BOOLEAN NOT NULL DEFAULT FALSE,

            -- Gap to next word
            gap_to_next FLOAT
        );

        CREATE INDEX IF NOT EXISTS idx_word_timestamps_transcription
            ON word_timestamps(transcription_id);
        CREATE INDEX IF NOT EXISTS idx_word_timestamps_timing
            ON word_timestamps(start_time, end_time);
        CREATE INDEX IF NOT EXISTS idx_word_timestamps_transcription_index
            ON word_timestamps(transcription_id, word_index);
    """))

    # Pause events table
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS pause_events (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            analysis_id UUID NOT NULL REFERENCES response_timing_analysis(id) ON DELETE CASCADE,

            -- Pause timing
            start_time FLOAT NOT NULL,
            end_time FLOAT NOT NULL CHECK (end_time > start_time),
            duration FLOAT NOT NULL CHECK (duration > 0),

            -- Pause position
            pause_index INTEGER NOT NULL,
            word_before VARCHAR(100),
            word_after VARCHAR(100),
            word_index_before INTEGER,

            -- Classification
            is_sentence_boundary BOOLEAN NOT NULL DEFAULT FALSE,
            is_breathing_pause BOOLEAN NOT NULL DEFAULT FALSE,
            is_hesitation_pause BOOLEAN NOT NULL DEFAULT FALSE,

            -- Analysis flags
            is_unusually_long BOOLEAN NOT NULL DEFAULT FALSE,
            is_unusually_short BOOLEAN NOT NULL DEFAULT FALSE,

            -- Audio metrics
            silence_db FLOAT,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_pause_events_analysis ON pause_events(analysis_id);
        CREATE INDEX IF NOT EXISTS idx_pause_events_duration ON pause_events(duration);
    """))

    # Filler word events table
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS filler_word_events (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            analysis_id UUID NOT NULL REFERENCES response_timing_analysis(id) ON DELETE CASCADE,

            -- Filler word
            filler_word VARCHAR(50) NOT NULL,
            filler_type VARCHAR(30) NOT NULL,

            -- Timing
            start_time FLOAT NOT NULL,
            end_time FLOAT NOT NULL,
            duration FLOAT NOT NULL,

            -- Position
            word_index INTEGER NOT NULL,

            -- Context
            preceding_word VARCHAR(100),
            following_word VARCHAR(100),
            sentence_position VARCHAR(20),

            -- Confidence
            detection_confidence FLOAT NOT NULL DEFAULT 1.0,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_filler_events_analysis ON filler_word_events(analysis_id);
        CREATE INDEX IF NOT EXISTS idx_filler_events_type ON filler_word_events(filler_type);
    """))

    # Timing anomalies table
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS timing_anomalies (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            analysis_id UUID NOT NULL REFERENCES response_timing_analysis(id) ON DELETE CASCADE,

            -- Anomaly classification
            anomaly_type anomaly_type NOT NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'medium',

            -- Detection details
            confidence FLOAT NOT NULL,
            description TEXT NOT NULL,

            -- Evidence
            expected_value FLOAT,
            actual_value FLOAT,
            deviation_percentage FLOAT,

            -- Risk contribution
            risk_weight FLOAT NOT NULL DEFAULT 0.0,
            risk_contribution FLOAT,

            -- Context data
            context_data JSONB DEFAULT '{}',

            -- Timestamps
            detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_timing_anomalies_analysis ON timing_anomalies(analysis_id);
        CREATE INDEX IF NOT EXISTS idx_timing_anomalies_type ON timing_anomalies(anomaly_type);
        CREATE INDEX IF NOT EXISTS idx_timing_anomalies_severity ON timing_anomalies(severity);
    """))

    # Timing sessions table (aggregates)
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS timing_sessions (
            session_id UUID PRIMARY KEY,
            user_id UUID NOT NULL,

            -- Session metadata
            started_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ,

            -- Answer counts
            total_answers INTEGER NOT NULL DEFAULT 0,
            analyzed_answers INTEGER NOT NULL DEFAULT 0,
            failed_analyses INTEGER NOT NULL DEFAULT 0,

            -- Aggregate timing metrics
            avg_response_latency_ms FLOAT,
            avg_speech_rate_wpm FLOAT,
            avg_pause_percentage FLOAT,
            avg_filler_ratio FLOAT,

            -- Consistency metrics
            latency_std_dev FLOAT,
            speech_rate_std_dev FLOAT,
            pause_duration_std_dev FLOAT,

            -- Anomaly aggregates
            total_anomalies INTEGER NOT NULL DEFAULT 0,
            instant_response_count INTEGER NOT NULL DEFAULT 0,
            unnatural_consistency_count INTEGER NOT NULL DEFAULT 0,
            delayed_fluent_count INTEGER NOT NULL DEFAULT 0,
            robotic_pattern_count INTEGER NOT NULL DEFAULT 0,

            -- Risk assessment
            avg_risk_score DECIMAL(5, 4),
            max_risk_score DECIMAL(5, 4),
            overall_risk_level risk_level,
            risk_factors JSONB DEFAULT '{}',

            -- Speech profile
            speech_profile JSONB DEFAULT '{}',

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_timing_sessions_user ON timing_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_timing_sessions_risk ON timing_sessions(avg_risk_score);
        CREATE INDEX IF NOT EXISTS idx_timing_sessions_created ON timing_sessions(created_at);
    """))

    # Filler word reference table
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS filler_word_reference (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            word VARCHAR(50) NOT NULL,
            language VARCHAR(10) NOT NULL DEFAULT 'en',
            filler_type VARCHAR(30) NOT NULL,
            frequency_weight FLOAT NOT NULL DEFAULT 1.0,
            suspicion_weight FLOAT NOT NULL DEFAULT 1.0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            UNIQUE (word, language)
        );

        CREATE INDEX IF NOT EXISTS idx_filler_reference_language ON filler_word_reference(language);

        -- Insert default filler words
        INSERT INTO filler_word_reference (word, language, filler_type, frequency_weight, suspicion_weight)
        VALUES
            ('um', 'en', 'hesitation', 1.0, 1.0),
            ('uh', 'en', 'hesitation', 1.0, 1.0),
            ('er', 'en', 'hesitation', 0.8, 1.0),
            ('ah', 'en', 'hesitation', 0.7, 0.8),
            ('like', 'en', 'discourse_marker', 1.0, 0.6),
            ('you know', 'en', 'discourse_marker', 0.9, 0.8),
            ('i mean', 'en', 'discourse_marker', 0.8, 0.7),
            ('basically', 'en', 'verbal_tic', 0.7, 0.9),
            ('actually', 'en', 'verbal_tic', 0.8, 0.5),
            ('literally', 'en', 'verbal_tic', 0.6, 0.8),
            ('kind of', 'en', 'hedge', 0.7, 0.6),
            ('sort of', 'en', 'hedge', 0.6, 0.6),
            ('right', 'en', 'tag', 0.5, 0.5),
            ('okay', 'en', 'tag', 0.6, 0.5),
            ('well', 'en', 'discourse_marker', 0.8, 0.4),
            ('so', 'en', 'discourse_marker', 0.9, 0.3),
            ('hmm', 'en', 'hesitation', 0.5, 0.8),
            ('yeah', 'en', 'backchannel', 0.6, 0.5)
        ON CONFLICT (word, language) DO NOTHING;
    """))

    # ==========================================================================
    # EYE TRACKING TABLES (if not already exist)
    # ==========================================================================

    conn.execute(sa.text("""
        -- Gaze sessions table
        CREATE TABLE IF NOT EXISTS gaze_sessions (
            session_id UUID PRIMARY KEY,
            user_id UUID NOT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ended_at TIMESTAMPTZ,

            -- Calibration data
            is_calibrated BOOLEAN NOT NULL DEFAULT FALSE,
            calibration_points JSONB,

            -- Device info
            camera_resolution_width INTEGER,
            camera_resolution_height INTEGER,
            screen_resolution_width INTEGER,
            screen_resolution_height INTEGER,

            -- Summary statistics
            total_duration_seconds FLOAT,
            on_screen_percentage FLOAT,
            average_confidence FLOAT,
            risk_score FLOAT
        );

        CREATE INDEX IF NOT EXISTS idx_gaze_sessions_user ON gaze_sessions(user_id);

        -- Gaze events table (TimescaleDB hypertable)
        CREATE TABLE IF NOT EXISTS gaze_events (
            id UUID DEFAULT uuid_generate_v4(),
            session_id UUID NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Gaze coordinates (normalized 0-1)
            gaze_x FLOAT NOT NULL,
            gaze_y FLOAT NOT NULL,

            -- Screen state
            is_off_screen BOOLEAN NOT NULL DEFAULT FALSE,
            off_screen_direction VARCHAR(10),

            -- Confidence and quality
            confidence FLOAT NOT NULL,

            -- Raw gaze vector (3D)
            gaze_vector_x FLOAT,
            gaze_vector_y FLOAT,
            gaze_vector_z FLOAT,

            -- Head pose (rotation angles)
            head_pitch FLOAT,
            head_yaw FLOAT,
            head_roll FLOAT,

            -- Filtering state
            is_filtered BOOLEAN NOT NULL DEFAULT TRUE,
            raw_gaze_x FLOAT,
            raw_gaze_y FLOAT,

            PRIMARY KEY (id, timestamp)
        );

        -- Convert to hypertable if TimescaleDB is available
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM create_hypertable('gaze_events', 'timestamp', if_not_exists => TRUE);
            END IF;
        EXCEPTION
            WHEN others THEN
                RAISE NOTICE 'TimescaleDB hypertable creation skipped: %', SQLERRM;
        END
        $$;

        CREATE INDEX IF NOT EXISTS idx_gaze_events_session ON gaze_events(session_id);
        CREATE INDEX IF NOT EXISTS idx_gaze_events_timestamp ON gaze_events(timestamp DESC);

        -- Gaze summaries table
        CREATE TABLE IF NOT EXISTS gaze_summaries (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            session_id UUID NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Statistics
            total_duration_seconds FLOAT NOT NULL,
            on_screen_percentage FLOAT NOT NULL,
            average_confidence FLOAT NOT NULL,

            -- Pattern detection results
            patterns_detected JSONB NOT NULL DEFAULT '{}',

            -- Off-screen events
            off_screen_events JSONB NOT NULL DEFAULT '[]',

            -- Anomalies detected
            anomalies JSONB NOT NULL DEFAULT '[]',

            -- Heatmap
            heatmap_url VARCHAR(500),

            -- Risk assessment
            risk_score FLOAT NOT NULL,
            risk_factors JSONB NOT NULL DEFAULT '{}'
        );

        CREATE INDEX IF NOT EXISTS idx_gaze_summaries_session ON gaze_summaries(session_id);

        -- Gaze anomalies table
        CREATE TABLE IF NOT EXISTS gaze_anomalies (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            session_id UUID NOT NULL,
            timestamp TIMESTAMPTZ NOT NULL,

            -- Anomaly details
            anomaly_type VARCHAR(50) NOT NULL,
            anomaly_score FLOAT NOT NULL,
            description VARCHAR(500) NOT NULL,

            -- Context
            sequence_data JSONB
        );

        CREATE INDEX IF NOT EXISTS idx_gaze_anomalies_session ON gaze_anomalies(session_id);
        CREATE INDEX IF NOT EXISTS idx_gaze_anomalies_timestamp ON gaze_anomalies(timestamp);
    """))

    # ==========================================================================
    # AI DETECTION TABLES (if not already exist)
    # ==========================================================================

    conn.execute(sa.text("""
        -- AI answer cache with pgvector embeddings
        CREATE TABLE IF NOT EXISTS ai_answer_cache (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            question_hash VARCHAR(64) NOT NULL,
            question_text TEXT NOT NULL,
            model_name VARCHAR(50) NOT NULL,
            answer_text TEXT NOT NULL,
            embedding vector(384),
            perplexity_score DECIMAL(10, 6),
            token_count INTEGER,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (question_hash, model_name)
        );

        CREATE INDEX IF NOT EXISTS idx_ai_answer_cache_hash ON ai_answer_cache(question_hash);
        CREATE INDEX IF NOT EXISTS idx_ai_answer_cache_model ON ai_answer_cache(model_name);

        -- pgvector index for similarity search (if not exists)
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
                CREATE INDEX IF NOT EXISTS idx_ai_answer_embedding
                    ON ai_answer_cache USING ivfflat (embedding vector_cosine_ops)
                    WITH (lists = 100);
            END IF;
        EXCEPTION
            WHEN others THEN
                RAISE NOTICE 'Vector index creation skipped: %', SQLERRM;
        END
        $$;

        -- Answer analysis results table
        CREATE TABLE IF NOT EXISTS answer_analysis (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            question_id UUID NOT NULL,
            answer_text TEXT NOT NULL,
            answer_audio_url TEXT,
            transcription_text TEXT,
            risk_score DECIMAL(5, 4),
            similarity_scores JSONB DEFAULT '{}',
            response_timing JSONB DEFAULT '{}',
            perplexity_score DECIMAL(10, 6),
            is_ai_generated VARCHAR(10),
            confidence_score DECIMAL(5, 4),
            metadata JSONB DEFAULT '{}',
            analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_answer_analysis_question ON answer_analysis(question_id);
        CREATE INDEX IF NOT EXISTS idx_answer_analysis_risk ON answer_analysis(risk_score);
    """))

    # ==========================================================================
    # UPDATED_AT TRIGGERS
    # ==========================================================================

    conn.execute(sa.text("""
        -- Create trigger function for updated_at if not exists
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';

        -- Add triggers for tables with updated_at
        DROP TRIGGER IF EXISTS update_response_timing_analysis_updated_at ON response_timing_analysis;
        CREATE TRIGGER update_response_timing_analysis_updated_at
            BEFORE UPDATE ON response_timing_analysis
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_timing_sessions_updated_at ON timing_sessions;
        CREATE TRIGGER update_timing_sessions_updated_at
            BEFORE UPDATE ON timing_sessions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """))

    print("Detection service tables created successfully")


def downgrade() -> None:
    """Drop all detection service tables"""
    conn = op.get_bind()

    # Allowlist of valid table names to prevent SQL injection
    ALLOWED_TABLES = frozenset([
        # Response timing tables
        'filler_word_reference',
        'timing_anomalies',
        'filler_word_events',
        'pause_events',
        'word_timestamps',
        'transcriptions',
        'timing_sessions',
        'response_timing_analysis',
        # Eye tracking tables
        'gaze_anomalies',
        'gaze_summaries',
        'gaze_events',
        'gaze_sessions',
        # AI detection tables
        'answer_analysis',
        'ai_answer_cache',
    ])

    # Allowlist of valid enum names to prevent SQL injection
    ALLOWED_ENUMS = frozenset([
        'analysis_status',
        'difficulty_level',
        'anomaly_type',
        'risk_level',
        'gaze_anomaly_type',
    ])

    # Drop tables in reverse order of dependencies
    tables = [
        # Response timing tables
        'filler_word_reference',
        'timing_anomalies',
        'filler_word_events',
        'pause_events',
        'word_timestamps',
        'transcriptions',
        'timing_sessions',
        'response_timing_analysis',
        # Eye tracking tables
        'gaze_anomalies',
        'gaze_summaries',
        'gaze_events',
        'gaze_sessions',
        # AI detection tables
        'answer_analysis',
        'ai_answer_cache',
    ]

    for table in tables:
        if table not in ALLOWED_TABLES:
            raise ValueError(f"Invalid table name: {table}")
        conn.execute(sa.text(f"DROP TABLE IF EXISTS {table} CASCADE"))

    # Drop triggers
    conn.execute(sa.text("""
        DROP TRIGGER IF EXISTS update_response_timing_analysis_updated_at ON response_timing_analysis;
        DROP TRIGGER IF EXISTS update_timing_sessions_updated_at ON timing_sessions;
    """))

    # Drop enums
    enums = [
        'analysis_status',
        'difficulty_level',
        'anomaly_type',
        'risk_level',
        'gaze_anomaly_type',
    ]

    for enum in enums:
        if enum not in ALLOWED_ENUMS:
            raise ValueError(f"Invalid enum name: {enum}")
        conn.execute(sa.text(f"DROP TYPE IF EXISTS {enum} CASCADE"))

    print("Detection service tables dropped successfully")
