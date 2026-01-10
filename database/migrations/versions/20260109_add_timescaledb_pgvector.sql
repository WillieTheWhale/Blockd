-- Migration: Add TimescaleDB and pgvector support for production
-- Date: 2026-01-09
-- Description: Adds TimescaleDB hypertables for time-series data and pgvector for embeddings
--
-- Prerequisites:
--   1. PostgreSQL 16+ with TimescaleDB 2.x extension installed
--   2. pgvector 0.7.x extension installed
--
-- To run: psql -d blockd -f 20260109_add_timescaledb_pgvector.sql
-- To rollback: See bottom of file for rollback commands

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Enable pgvector for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- MODIFY AI_ANSWER_CACHE FOR PGVECTOR
-- ============================================================================

-- Add vector column for embeddings (384 dimensions for sentence-transformers)
ALTER TABLE ai_answer_cache
ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_ai_answer_cache_embedding
ON ai_answer_cache
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Function to migrate JSON embeddings to vector format
CREATE OR REPLACE FUNCTION migrate_json_embeddings_to_vector()
RETURNS INTEGER AS $$
DECLARE
    migrated_count INTEGER := 0;
    rec RECORD;
    vec_array FLOAT[];
BEGIN
    FOR rec IN
        SELECT id, embedding_json
        FROM ai_answer_cache
        WHERE embedding_json IS NOT NULL
          AND embedding IS NULL
    LOOP
        BEGIN
            -- Convert JSON array to float array, then to vector
            SELECT array_agg(v::FLOAT) INTO vec_array
            FROM jsonb_array_elements_text(rec.embedding_json) AS v;

            IF array_length(vec_array, 1) = 384 THEN
                UPDATE ai_answer_cache
                SET embedding = vec_array::vector
                WHERE id = rec.id;
                migrated_count := migrated_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Skip rows with invalid embeddings
            RAISE NOTICE 'Skipping row % due to error: %', rec.id, SQLERRM;
        END;
    END LOOP;

    RETURN migrated_count;
END;
$$ LANGUAGE plpgsql;

-- Run migration (uncomment when ready)
-- SELECT migrate_json_embeddings_to_vector();

-- ============================================================================
-- CONVERT GAZE_EVENTS TO TIMESCALEDB HYPERTABLE
-- ============================================================================

-- Drop existing primary key and add new one compatible with hypertables
-- Note: This requires the table to be empty or data migration

-- First, create a backup table
CREATE TABLE IF NOT EXISTS gaze_events_backup AS SELECT * FROM gaze_events WHERE FALSE;

-- Check if table has data
DO $$
DECLARE
    row_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO row_count FROM gaze_events;
    IF row_count > 0 THEN
        -- Backup existing data
        INSERT INTO gaze_events_backup SELECT * FROM gaze_events;
        RAISE NOTICE 'Backed up % rows from gaze_events', row_count;
    END IF;
END $$;

-- Recreate gaze_events table for TimescaleDB
-- Drop the old table and recreate with proper structure
DROP TABLE IF EXISTS gaze_events CASCADE;

CREATE TABLE gaze_events (
    id UUID DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    gaze_x DECIMAL(10,8),
    gaze_y DECIMAL(10,8),
    is_off_screen BOOLEAN DEFAULT FALSE,
    off_screen_direction VARCHAR(20),
    confidence DECIMAL(5,4),
    pupil_diameter_left DECIMAL(10,6),
    pupil_diameter_right DECIMAL(10,6),
    metadata JSONB DEFAULT '{}',
    PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable('gaze_events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Add foreign key (with ON DELETE CASCADE)
ALTER TABLE gaze_events
ADD CONSTRAINT fk_gaze_events_session
FOREIGN KEY (session_id)
REFERENCES interview_sessions(id)
ON DELETE CASCADE;

-- Create indexes optimized for time-series queries
CREATE INDEX idx_gaze_events_session_time
ON gaze_events(session_id, timestamp DESC);

CREATE INDEX idx_gaze_events_off_screen
ON gaze_events(session_id, is_off_screen, timestamp DESC)
WHERE is_off_screen = TRUE;

-- Restore data from backup
INSERT INTO gaze_events
SELECT * FROM gaze_events_backup
ON CONFLICT DO NOTHING;

-- ============================================================================
-- CONVERT BROWSER_TELEMETRY TO TIMESCALEDB HYPERTABLE
-- ============================================================================

-- Create backup table
CREATE TABLE IF NOT EXISTS browser_telemetry_backup AS SELECT * FROM browser_telemetry WHERE FALSE;

-- Backup existing data
DO $$
DECLARE
    row_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO row_count FROM browser_telemetry;
    IF row_count > 0 THEN
        INSERT INTO browser_telemetry_backup SELECT * FROM browser_telemetry;
        RAISE NOTICE 'Backed up % rows from browser_telemetry', row_count;
    END IF;
END $$;

-- Recreate browser_telemetry table for TimescaleDB
DROP TABLE IF EXISTS browser_telemetry CASCADE;

CREATE TABLE browser_telemetry (
    id UUID DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    cpu_percent DECIMAL(5,2),
    memory_mb INTEGER,
    active_processes JSONB DEFAULT '[]',
    window_title VARCHAR(500),
    browser_tabs_count INTEGER,
    network_requests JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    PRIMARY KEY (id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable('browser_telemetry', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Add foreign key
ALTER TABLE browser_telemetry
ADD CONSTRAINT fk_browser_telemetry_session
FOREIGN KEY (session_id)
REFERENCES interview_sessions(id)
ON DELETE CASCADE;

-- Create index
CREATE INDEX idx_browser_telemetry_session_time
ON browser_telemetry(session_id, timestamp DESC);

-- Restore data from backup
INSERT INTO browser_telemetry
SELECT * FROM browser_telemetry_backup
ON CONFLICT DO NOTHING;

-- ============================================================================
-- RETENTION AND COMPRESSION POLICIES
-- ============================================================================

-- Enable compression on hypertables
ALTER TABLE gaze_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'session_id',
    timescaledb.compress_orderby = 'timestamp DESC'
);

ALTER TABLE browser_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'session_id',
    timescaledb.compress_orderby = 'timestamp DESC'
);

-- Add compression policies (compress data older than 7 days)
SELECT add_compression_policy('gaze_events', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('browser_telemetry', INTERVAL '7 days', if_not_exists => TRUE);

-- Add retention policies (delete data older than 30 days)
-- Note: Adjust retention period based on compliance requirements
SELECT add_retention_policy('gaze_events', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('browser_telemetry', INTERVAL '30 days', if_not_exists => TRUE);

-- ============================================================================
-- CONTINUOUS AGGREGATES (Optional: for faster analytics)
-- ============================================================================

-- Gaze events summary per session per minute
CREATE MATERIALIZED VIEW IF NOT EXISTS gaze_events_1m_summary
WITH (timescaledb.continuous) AS
SELECT
    session_id,
    time_bucket('1 minute', timestamp) AS bucket,
    COUNT(*) AS event_count,
    AVG(gaze_x) AS avg_gaze_x,
    AVG(gaze_y) AS avg_gaze_y,
    COUNT(*) FILTER (WHERE is_off_screen = TRUE) AS off_screen_count,
    AVG(confidence) AS avg_confidence
FROM gaze_events
GROUP BY session_id, time_bucket('1 minute', timestamp)
WITH NO DATA;

-- Add refresh policy for continuous aggregate
SELECT add_continuous_aggregate_policy('gaze_events_1m_summary',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE
);

-- Browser telemetry summary per session per minute
CREATE MATERIALIZED VIEW IF NOT EXISTS browser_telemetry_1m_summary
WITH (timescaledb.continuous) AS
SELECT
    session_id,
    time_bucket('1 minute', timestamp) AS bucket,
    COUNT(*) AS event_count,
    AVG(cpu_percent) AS avg_cpu,
    AVG(memory_mb) AS avg_memory,
    MAX(cpu_percent) AS max_cpu,
    MAX(memory_mb) AS max_memory
FROM browser_telemetry
GROUP BY session_id, time_bucket('1 minute', timestamp)
WITH NO DATA;

-- Add refresh policy
SELECT add_continuous_aggregate_policy('browser_telemetry_1m_summary',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE
);

-- ============================================================================
-- CLEANUP
-- ============================================================================

-- Drop backup tables after successful migration
-- Uncomment these when you're confident the migration succeeded
-- DROP TABLE IF EXISTS gaze_events_backup;
-- DROP TABLE IF EXISTS browser_telemetry_backup;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify hypertables were created
SELECT hypertable_name, num_chunks, compression_enabled
FROM timescaledb_information.hypertables;

-- Verify pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Verify compression policies
SELECT * FROM timescaledb_information.jobs
WHERE proc_name = 'policy_compression';

-- Verify retention policies
SELECT * FROM timescaledb_information.jobs
WHERE proc_name = 'policy_retention';

-- ============================================================================
-- ROLLBACK COMMANDS (run separately if needed)
-- ============================================================================

/*
-- To rollback this migration:

-- 1. Drop continuous aggregates
DROP MATERIALIZED VIEW IF EXISTS gaze_events_1m_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS browser_telemetry_1m_summary CASCADE;

-- 2. Restore original tables from backup
DROP TABLE IF EXISTS gaze_events CASCADE;
CREATE TABLE gaze_events AS SELECT * FROM gaze_events_backup;

DROP TABLE IF EXISTS browser_telemetry CASCADE;
CREATE TABLE browser_telemetry AS SELECT * FROM browser_telemetry_backup;

-- 3. Drop vector column from ai_answer_cache
ALTER TABLE ai_answer_cache DROP COLUMN IF EXISTS embedding;

-- 4. Drop extensions (careful - may affect other objects)
-- DROP EXTENSION IF EXISTS timescaledb CASCADE;
-- DROP EXTENSION IF EXISTS vector CASCADE;

-- 5. Drop migration function
DROP FUNCTION IF EXISTS migrate_json_embeddings_to_vector();
*/

-- Record migration
INSERT INTO audit_logs (action, resource_type, metadata)
VALUES (
    'DATABASE_MIGRATION',
    'schema',
    jsonb_build_object(
        'migration', '20260109_add_timescaledb_pgvector',
        'description', 'Added TimescaleDB hypertables and pgvector support',
        'timestamp', NOW()
    )
);

ANALYZE;
