-- Blockd Platform Database Schema
-- PostgreSQL 18.1 with TimescaleDB 2.x and pgvector 0.7.x
-- Created: 2025-11-24
-- Agent 1: Database Architect

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable vector similarity search (pgvector 0.7.x)
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable TimescaleDB for time-series data
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable cryptographic functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- CUSTOM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM ('admin', 'interviewer', 'interviewee');
CREATE TYPE subscription_tier AS ENUM ('free', 'professional', 'enterprise');
CREATE TYPE session_status AS ENUM ('scheduled', 'active', 'ended', 'cancelled');
CREATE TYPE security_event_type AS ENUM (
    'suspicious_process',
    'screen_recording_detected',
    'vm_detected',
    'window_focus_changed',
    'multi_monitor_detected',
    'unauthorized_browser',
    'copy_paste_detected',
    'keyboard_shortcut_blocked'
);
CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE question_difficulty AS ENUM ('easy', 'medium', 'hard', 'expert');
CREATE TYPE ai_model_name AS ENUM ('gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet', 'gemini-pro', 'llama-2');

-- ============================================================================
-- TABLES
-- ============================================================================

-- Organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subscription_tier subscription_tier NOT NULL DEFAULT 'free',
    settings JSONB DEFAULT '{}',
    max_concurrent_sessions INTEGER DEFAULT 5,
    monthly_session_limit INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'interviewee',
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Interview sessions table
CREATE TABLE interview_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    interviewee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    interviewee_email VARCHAR(255),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status session_status NOT NULL DEFAULT 'scheduled',
    session_token VARCHAR(255) UNIQUE,
    scheduled_start TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    duration_minutes INTEGER,
    risk_score DECIMAL(5,4) CHECK (risk_score >= 0 AND risk_score <= 1),
    video_url TEXT,
    recording_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Security events table
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    event_type security_event_type NOT NULL,
    severity severity_level NOT NULL DEFAULT 'medium',
    description TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Questions table
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_order INTEGER,
    expected_duration INTEGER, -- in seconds
    difficulty question_difficulty,
    asked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI answer cache table (with pgvector embeddings)
CREATE TABLE ai_answer_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_hash VARCHAR(64) NOT NULL,
    question_text TEXT NOT NULL,
    model_name ai_model_name NOT NULL,
    answer_text TEXT NOT NULL,
    embedding vector(384), -- 384-dimensional vector for sentence-transformers
    perplexity_score DECIMAL(10,6),
    token_count INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (question_hash, model_name)
);

-- Answer analysis table
CREATE TABLE answer_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    answer_audio_url TEXT,
    transcription_text TEXT,
    risk_score DECIMAL(5,4) CHECK (risk_score >= 0 AND risk_score <= 1),
    similarity_scores JSONB DEFAULT '{}', -- {model_name: score}
    response_timing JSONB DEFAULT '{}', -- {latency_ms, wpm, pause_count, filler_ratio}
    perplexity_score DECIMAL(10,6),
    is_ai_generated BOOLEAN,
    confidence_score DECIMAL(5,4),
    metadata JSONB DEFAULT '{}',
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gaze events table (TimescaleDB hypertable)
CREATE TABLE gaze_events (
    id UUID DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    gaze_x DECIMAL(10,8), -- normalized 0-1
    gaze_y DECIMAL(10,8), -- normalized 0-1
    is_off_screen BOOLEAN DEFAULT FALSE,
    off_screen_direction VARCHAR(20), -- 'left', 'right', 'up', 'down'
    confidence DECIMAL(5,4),
    pupil_diameter_left DECIMAL(10,6),
    pupil_diameter_right DECIMAL(10,6),
    metadata JSONB DEFAULT '{}'
);

-- Convert gaze_events to hypertable (partitioned by time)
SELECT create_hypertable('gaze_events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Browser telemetry table (TimescaleDB hypertable)
CREATE TABLE browser_telemetry (
    id UUID DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    cpu_percent DECIMAL(5,2),
    memory_mb INTEGER,
    active_processes JSONB DEFAULT '[]',
    window_title VARCHAR(500),
    browser_tabs_count INTEGER,
    network_requests JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}'
);

-- Convert browser_telemetry to hypertable (partitioned by time)
SELECT create_hypertable('browser_telemetry', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Session reports table
CREATE TABLE session_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    overall_risk_score DECIMAL(5,4) CHECK (overall_risk_score >= 0 AND overall_risk_score <= 1),
    ai_detection_score DECIMAL(5,4),
    gaze_anomaly_score DECIMAL(5,4),
    timing_anomaly_score DECIMAL(5,4),
    security_events_count INTEGER DEFAULT 0,
    recommendations JSONB DEFAULT '[]',
    detailed_analysis JSONB DEFAULT '{}',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id)
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_organization ON users(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role);

-- Organizations indexes
CREATE INDEX idx_organizations_tier ON organizations(subscription_tier) WHERE deleted_at IS NULL;

-- Interview sessions indexes
CREATE INDEX idx_sessions_interviewer ON interview_sessions(interviewer_id);
CREATE INDEX idx_sessions_interviewee ON interview_sessions(interviewee_id);
CREATE INDEX idx_sessions_org_status ON interview_sessions(organization_id, status);
CREATE INDEX idx_sessions_status ON interview_sessions(status);
CREATE INDEX idx_sessions_scheduled_start ON interview_sessions(scheduled_start);
CREATE INDEX idx_sessions_token ON interview_sessions(session_token);

-- Security events indexes
CREATE INDEX idx_security_events_session ON security_events(session_id);
CREATE INDEX idx_security_events_session_time ON security_events(session_id, timestamp DESC);
CREATE INDEX idx_security_events_type ON security_events(event_type);
CREATE INDEX idx_security_events_severity ON security_events(severity);

-- Questions indexes
CREATE INDEX idx_questions_session ON questions(session_id);
CREATE INDEX idx_questions_session_order ON questions(session_id, question_order);

-- AI answer cache indexes
CREATE INDEX idx_ai_answer_cache_hash ON ai_answer_cache(question_hash);
CREATE INDEX idx_ai_answer_cache_model ON ai_answer_cache(model_name);
-- IVFFlat index for vector similarity search (cosine distance)
CREATE INDEX idx_ai_answer_embedding ON ai_answer_cache
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Answer analysis indexes
CREATE INDEX idx_answer_analysis_question ON answer_analysis(question_id);
CREATE INDEX idx_answer_analysis_risk_score ON answer_analysis(risk_score DESC);
CREATE INDEX idx_answer_analysis_ai_generated ON answer_analysis(is_ai_generated);

-- Gaze events indexes (TimescaleDB optimized)
CREATE INDEX idx_gaze_events_session_time ON gaze_events(session_id, timestamp DESC);
CREATE INDEX idx_gaze_events_off_screen ON gaze_events(session_id, is_off_screen) WHERE is_off_screen = TRUE;

-- Browser telemetry indexes (TimescaleDB optimized)
CREATE INDEX idx_browser_telemetry_session_time ON browser_telemetry(session_id, timestamp DESC);

-- Session reports indexes
CREATE INDEX idx_session_reports_session ON session_reports(session_id);
CREATE INDEX idx_session_reports_risk_score ON session_reports(overall_risk_score DESC);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- ============================================================================
-- TIMESCALEDB CONFIGURATIONS
-- ============================================================================

-- Add retention policy to gaze_events (30 days)
SELECT add_retention_policy('gaze_events', INTERVAL '30 days', if_not_exists => TRUE);

-- Add retention policy to browser_telemetry (30 days)
SELECT add_retention_policy('browser_telemetry', INTERVAL '30 days', if_not_exists => TRUE);

-- Add compression policy for gaze_events (compress after 7 days)
ALTER TABLE gaze_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'session_id',
    timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('gaze_events', INTERVAL '7 days', if_not_exists => TRUE);

-- Add compression policy for browser_telemetry (compress after 7 days)
ALTER TABLE browser_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'session_id',
    timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('browser_telemetry', INTERVAL '7 days', if_not_exists => TRUE);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interview_sessions_updated_at
    BEFORE UPDATE ON interview_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at
    BEFORE UPDATE ON questions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to generate session token
CREATE OR REPLACE FUNCTION generate_session_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.session_token IS NULL THEN
        NEW.session_token = encode(gen_random_bytes(32), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply session token trigger
CREATE TRIGGER generate_interview_session_token
    BEFORE INSERT ON interview_sessions
    FOR EACH ROW
    EXECUTE FUNCTION generate_session_token();

-- Function to calculate session duration
CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.actual_end IS NOT NULL AND NEW.actual_start IS NOT NULL THEN
        NEW.duration_minutes = EXTRACT(EPOCH FROM (NEW.actual_end - NEW.actual_start)) / 60;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply duration calculation trigger
CREATE TRIGGER calculate_interview_duration
    BEFORE UPDATE ON interview_sessions
    FOR EACH ROW
    WHEN (NEW.actual_end IS NOT NULL AND OLD.actual_end IS DISTINCT FROM NEW.actual_end)
    EXECUTE FUNCTION calculate_session_duration();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active sessions view
CREATE VIEW active_sessions AS
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

-- Session analytics view
CREATE VIEW session_analytics AS
SELECT
    s.id AS session_id,
    s.organization_id,
    s.status,
    s.duration_minutes,
    s.risk_score,
    COUNT(DISTINCT q.id) AS questions_count,
    COUNT(DISTINCT aa.id) AS answers_count,
    COUNT(DISTINCT se.id) AS security_events_count,
    AVG(aa.risk_score) AS avg_answer_risk_score,
    COUNT(DISTINCT ge.id) AS gaze_events_count,
    COUNT(DISTINCT CASE WHEN ge.is_off_screen = TRUE THEN ge.id END) AS off_screen_events_count
FROM interview_sessions s
LEFT JOIN questions q ON s.id = q.session_id
LEFT JOIN answer_analysis aa ON q.id = aa.question_id
LEFT JOIN security_events se ON s.id = se.session_id
LEFT JOIN gaze_events ge ON s.id = ge.session_id
GROUP BY s.id;

-- High risk sessions view
CREATE VIEW high_risk_sessions AS
SELECT
    s.id,
    s.session_token,
    s.actual_start,
    s.actual_end,
    s.risk_score,
    i.email AS interviewer_email,
    o.name AS organization_name,
    sr.security_events_count,
    sr.recommendations
FROM interview_sessions s
INNER JOIN users i ON s.interviewer_id = i.id
INNER JOIN organizations o ON s.organization_id = o.id
LEFT JOIN session_reports sr ON s.id = sr.session_id
WHERE s.risk_score >= 0.75
ORDER BY s.risk_score DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get session risk summary
CREATE OR REPLACE FUNCTION get_session_risk_summary(p_session_id UUID)
RETURNS TABLE (
    session_id UUID,
    overall_risk_score DECIMAL(5,4),
    security_events_count BIGINT,
    high_severity_events BIGINT,
    ai_answers_count BIGINT,
    off_screen_count BIGINT,
    total_duration_minutes INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.risk_score,
        COUNT(DISTINCT se.id),
        COUNT(DISTINCT CASE WHEN se.severity IN ('high', 'critical') THEN se.id END),
        COUNT(DISTINCT CASE WHEN aa.is_ai_generated = TRUE THEN aa.id END),
        COUNT(DISTINCT CASE WHEN ge.is_off_screen = TRUE THEN ge.id END),
        s.duration_minutes
    FROM interview_sessions s
    LEFT JOIN security_events se ON s.id = se.session_id
    LEFT JOIN questions q ON s.id = q.session_id
    LEFT JOIN answer_analysis aa ON q.id = aa.question_id
    LEFT JOIN gaze_events ge ON s.id = ge.session_id
    WHERE s.id = p_session_id
    GROUP BY s.id;
END;
$$ LANGUAGE plpgsql;

-- Function to find similar AI answers using vector similarity
CREATE OR REPLACE FUNCTION find_similar_ai_answers(
    p_embedding vector(384),
    p_limit INTEGER DEFAULT 10,
    p_threshold DECIMAL DEFAULT 0.8
)
RETURNS TABLE (
    id UUID,
    question_text TEXT,
    model_name ai_model_name,
    answer_text TEXT,
    similarity_score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ac.id,
        ac.question_text,
        ac.model_name,
        ac.answer_text,
        (1 - (ac.embedding <=> p_embedding))::DECIMAL AS similarity_score
    FROM ai_answer_cache ac
    WHERE ac.embedding IS NOT NULL
        AND (1 - (ac.embedding <=> p_embedding)) >= p_threshold
    ORDER BY ac.embedding <=> p_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANTS (for application user)
-- ============================================================================

-- Create application user (uncomment in production)
-- CREATE USER blockd_app WITH PASSWORD 'your_secure_password';
-- GRANT CONNECT ON DATABASE blockd TO blockd_app;
-- GRANT USAGE ON SCHEMA public TO blockd_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO blockd_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO blockd_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO blockd_app;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE organizations IS 'Stores organization information and subscription details';
COMMENT ON TABLE users IS 'Stores user accounts with authentication and MFA support';
COMMENT ON TABLE interview_sessions IS 'Tracks all interview sessions with status and metadata';
COMMENT ON TABLE security_events IS 'Records security-related events during sessions';
COMMENT ON TABLE questions IS 'Stores interview questions asked during sessions';
COMMENT ON TABLE ai_answer_cache IS 'Caches AI-generated answers with vector embeddings for similarity search';
COMMENT ON TABLE answer_analysis IS 'Stores analysis results for interviewee answers';
COMMENT ON TABLE gaze_events IS 'TimescaleDB hypertable for eye tracking data';
COMMENT ON TABLE browser_telemetry IS 'TimescaleDB hypertable for browser telemetry data';
COMMENT ON TABLE session_reports IS 'Stores final session analysis reports';
COMMENT ON TABLE audit_logs IS 'Tracks all user actions for security and compliance';

COMMENT ON INDEX idx_ai_answer_embedding IS 'IVFFlat index for fast vector similarity search using cosine distance';

-- ============================================================================
-- DATABASE STATISTICS
-- ============================================================================

-- Analyze tables for query optimization
ANALYZE;
