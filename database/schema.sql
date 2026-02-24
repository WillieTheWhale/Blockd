-- Blockd Platform Database Schema
-- PostgreSQL 16+ (simplified for standard PostgreSQL without extensions)
-- Created: 2025-11-24
-- Modified: 2025-11-30 - Simplified for local development

-- ============================================================================
-- EXTENSIONS (only standard PostgreSQL extensions)
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- AI answer cache table (without vector embeddings for simplicity)
CREATE TABLE ai_answer_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_hash VARCHAR(64) NOT NULL,
    question_text TEXT NOT NULL,
    model_name ai_model_name NOT NULL,
    answer_text TEXT NOT NULL,
    embedding_json JSONB, -- Store embeddings as JSON array instead of vector type
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

-- Gaze events table (standard table without TimescaleDB)
CREATE TABLE gaze_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Browser telemetry table (standard table without TimescaleDB)
CREATE TABLE browser_telemetry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- Refresh tokens table (for JWT refresh token management)
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

-- OAuth provider type
CREATE TYPE oauth_provider AS ENUM ('google', 'microsoft');

-- OAuth accounts table (for Google/Microsoft account linking)
CREATE TABLE oauth_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider oauth_provider NOT NULL,
    provider_id VARCHAR(255) NOT NULL, -- Provider's unique user ID
    access_token TEXT, -- Encrypted access token
    refresh_token TEXT, -- Encrypted refresh token
    token_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_id),
    UNIQUE (user_id, provider)
);

-- Chat messages table (for interview session chat)
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
    sender_id VARCHAR(255) NOT NULL, -- Can be user UUID or 'system' for system messages
    sender_role VARCHAR(50) NOT NULL, -- 'interviewer', 'interviewee', 'admin'
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ, -- Soft delete timestamp
    deleted_by UUID -- User who deleted the message
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
CREATE INDEX idx_sessions_created_at ON interview_sessions(created_at DESC);

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

-- Answer analysis indexes
CREATE INDEX idx_answer_analysis_question ON answer_analysis(question_id);
CREATE INDEX idx_answer_analysis_risk_score ON answer_analysis(risk_score DESC);
CREATE INDEX idx_answer_analysis_ai_generated ON answer_analysis(is_ai_generated);
CREATE INDEX idx_answer_analysis_question_analyzed ON answer_analysis(question_id, analyzed_at DESC);

-- Gaze events indexes
CREATE INDEX idx_gaze_events_session_time ON gaze_events(session_id, timestamp DESC);
CREATE INDEX idx_gaze_events_off_screen ON gaze_events(session_id, is_off_screen) WHERE is_off_screen = TRUE;

-- Browser telemetry indexes
CREATE INDEX idx_browser_telemetry_session_time ON browser_telemetry(session_id, timestamp DESC);

-- Session reports indexes
CREATE INDEX idx_session_reports_session ON session_reports(session_id);
CREATE INDEX idx_session_reports_risk_score ON session_reports(overall_risk_score DESC);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- Refresh tokens indexes
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- OAuth accounts indexes
CREATE INDEX idx_oauth_accounts_user ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider, provider_id);

-- Chat messages indexes
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_session_time ON chat_messages(session_id, created_at DESC);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);

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

-- ============================================================================
-- MATERIALIZED VIEW (Optional - for performance optimization)
-- ============================================================================

-- Materialized view for active_sessions (optional performance optimization)
-- Uncomment if the regular active_sessions view causes performance issues
-- Note: Requires periodic refresh via: REFRESH MATERIALIZED VIEW CONCURRENTLY active_sessions_mat;

/*
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

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_active_sessions_mat()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY active_sessions_mat;
END;
$$ LANGUAGE plpgsql;
*/

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

-- ============================================================================
-- SEED DATA (for development)
-- ============================================================================

-- Insert default organization
INSERT INTO organizations (id, name, subscription_tier, max_concurrent_sessions, monthly_session_limit)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'Blockd Development', 'enterprise', 100, 1000),
    ('00000000-0000-0000-0000-000000000002', 'Test Organization', 'professional', 10, 100)
ON CONFLICT DO NOTHING;

-- Insert test admin user (password: Admin123!)
INSERT INTO users (id, email, password_hash, role, organization_id, first_name, last_name, email_verified)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@blockd.site',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.q5q5q5q5q5q5q5q', -- bcrypt hash for Admin123!
    'admin',
    '00000000-0000-0000-0000-000000000001',
    'Admin',
    'User',
    true
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE organizations IS 'Stores organization information and subscription details';
COMMENT ON TABLE users IS 'Stores user accounts with authentication and MFA support';
COMMENT ON TABLE interview_sessions IS 'Tracks all interview sessions with status and metadata';
COMMENT ON TABLE security_events IS 'Records security-related events during sessions';
COMMENT ON TABLE questions IS 'Stores interview questions asked during sessions';
COMMENT ON TABLE ai_answer_cache IS 'Caches AI-generated answers for comparison';
COMMENT ON TABLE answer_analysis IS 'Stores analysis results for interviewee answers';
COMMENT ON TABLE gaze_events IS 'Eye tracking data collected during sessions';
COMMENT ON TABLE browser_telemetry IS 'Browser telemetry data from interviewee sessions';
COMMENT ON TABLE session_reports IS 'Stores final session analysis reports';
COMMENT ON TABLE audit_logs IS 'Tracks all user actions for security and compliance';
COMMENT ON TABLE refresh_tokens IS 'Stores JWT refresh tokens for authentication';
COMMENT ON TABLE oauth_accounts IS 'Stores linked OAuth accounts for Google and Microsoft SSO';
COMMENT ON TABLE chat_messages IS 'Stores chat messages exchanged during interview sessions';

-- Analyze tables for query optimization
ANALYZE;
