-- Blockd Database Schema
-- PostgreSQL 15.x with TimescaleDB extension
-- Created: 2024-01-15
-- Description: Complete schema for Blockd interview monitoring system

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search
CREATE EXTENSION IF NOT EXISTS "vector"; -- For AI embeddings (pgvector)

-- ============================================================================
-- TABLE 1: ORGANIZATIONS
-- ============================================================================
-- Companies/teams using Blockd

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    subscription_tier VARCHAR(50) NOT NULL DEFAULT 'free'
        CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    max_monthly_sessions INTEGER NOT NULL DEFAULT 10,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_tier ON organizations(subscription_tier) WHERE is_active = true;

COMMENT ON TABLE organizations IS 'Companies and teams using the Blockd platform';
COMMENT ON COLUMN organizations.slug IS 'URL-friendly unique identifier for organization';
COMMENT ON COLUMN organizations.settings IS 'JSON object for org-specific configuration';

-- ============================================================================
-- TABLE 2: USERS
-- ============================================================================
-- Interviewers, interviewees, and administrators

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('interviewer', 'interviewee', 'admin')),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization ON users(organization_id);
CREATE INDEX idx_users_role ON users(role) WHERE is_active = true;
CREATE INDEX idx_users_full_name_trgm ON users USING gin(full_name gin_trgm_ops);

COMMENT ON TABLE users IS 'All user accounts including interviewers, interviewees, and admins';
COMMENT ON COLUMN users.metadata IS 'JSON object for user preferences, profile data, etc.';

-- ============================================================================
-- TABLE 3: SESSIONS
-- ============================================================================
-- Individual interview sessions

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    interviewee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    session_token VARCHAR(255) UNIQUE NOT NULL, -- Used by browser extension for auth
    interview_url TEXT, -- Google Meet/Zoom link

    status VARCHAR(50) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),

    scheduled_start_time TIMESTAMPTZ,
    actual_start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_seconds INTEGER,

    detection_settings JSONB DEFAULT '{
        "eye_tracking_enabled": true,
        "keystroke_analysis_enabled": true,
        "ai_detection_enabled": true,
        "screen_monitoring_enabled": true,
        "sensitivity": "medium"
    }'::jsonb,

    notes TEXT, -- Post-interview notes from interviewer

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_interviewer ON sessions(interviewer_id);
CREATE INDEX idx_sessions_interviewee ON sessions(interviewee_id);
CREATE INDEX idx_sessions_organization ON sessions(organization_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_scheduled_time ON sessions(scheduled_start_time)
    WHERE status IN ('scheduled', 'active');
CREATE INDEX idx_sessions_actual_start ON sessions(actual_start_time DESC)
    WHERE status IN ('active', 'completed');

COMMENT ON TABLE sessions IS 'Individual interview sessions with monitoring settings';
COMMENT ON COLUMN sessions.session_token IS 'Secure token used by browser extension to authenticate';
COMMENT ON COLUMN sessions.detection_settings IS 'JSON configuration for what to monitor in this session';

-- ============================================================================
-- TABLE 4: DETECTION_EVENTS
-- ============================================================================
-- Time-series data of all detection events (optimized with TimescaleDB)

CREATE TABLE detection_events (
    id BIGSERIAL,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'eye_tracking',
        'keystroke',
        'screen_change',
        'ai_similarity',
        'multi_monitor',
        'suspicious_pattern',
        'tab_switch',
        'window_blur'
    )),

    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confidence_score NUMERIC(4, 3) CHECK (confidence_score BETWEEN 0 AND 1),

    event_data JSONB NOT NULL, -- Flexible storage for different event types

    severity VARCHAR(20) NOT NULL DEFAULT 'low'
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    is_false_positive BOOLEAN DEFAULT false,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,

    PRIMARY KEY (timestamp, id)
);

-- Convert to TimescaleDB hypertable for time-series optimization
SELECT create_hypertable('detection_events', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX idx_detection_events_session ON detection_events(session_id, timestamp DESC);
CREATE INDEX idx_detection_events_type ON detection_events(event_type, timestamp DESC);
CREATE INDEX idx_detection_events_severity ON detection_events(severity, timestamp DESC)
    WHERE is_false_positive = false;
CREATE INDEX idx_detection_events_event_data ON detection_events USING gin(event_data);

COMMENT ON TABLE detection_events IS 'Time-series table storing all detection events (TimescaleDB hypertable)';
COMMENT ON COLUMN detection_events.event_data IS 'JSON payload specific to event type (e.g., gaze coordinates, keystroke timing)';
COMMENT ON COLUMN detection_events.confidence_score IS 'ML model confidence score between 0 and 1';

-- ============================================================================
-- TABLE 5: ALERTS
-- ============================================================================
-- High-level alerts generated from detection_events

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,

    related_event_ids BIGINT[] DEFAULT ARRAY[]::BIGINT[], -- References detection_events.id

    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_alerts_session ON alerts(session_id, triggered_at DESC);
CREATE INDEX idx_alerts_severity ON alerts(severity, triggered_at DESC)
    WHERE acknowledged_at IS NULL;
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged_at)
    WHERE acknowledged_at IS NOT NULL;

COMMENT ON TABLE alerts IS 'Aggregated alerts generated from patterns in detection_events';
COMMENT ON COLUMN alerts.related_event_ids IS 'Array of detection_event IDs that triggered this alert';

-- ============================================================================
-- TABLE 6: SESSION_ANALYTICS
-- ============================================================================
-- Pre-computed analytics and risk scores for each session

CREATE TABLE session_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

    total_events_detected INTEGER DEFAULT 0,
    high_severity_events INTEGER DEFAULT 0,
    critical_severity_events INTEGER DEFAULT 0,

    avg_eye_tracking_confidence NUMERIC(4, 3),
    suspicious_keystroke_patterns INTEGER DEFAULT 0,
    ai_similarity_incidents INTEGER DEFAULT 0,
    screen_switches INTEGER DEFAULT 0,
    tab_switches INTEGER DEFAULT 0,
    window_blur_events INTEGER DEFAULT 0,

    overall_risk_score NUMERIC(4, 3) CHECK (overall_risk_score BETWEEN 0 AND 1),
    risk_category VARCHAR(20) CHECK (risk_category IN ('low', 'medium', 'high', 'critical')),

    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    raw_metrics JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_session_analytics_session ON session_analytics(session_id);
CREATE INDEX idx_session_analytics_risk ON session_analytics(risk_category, overall_risk_score DESC);
CREATE INDEX idx_session_analytics_calculated ON session_analytics(calculated_at DESC);

COMMENT ON TABLE session_analytics IS 'Aggregated analytics and risk assessment for each session';
COMMENT ON COLUMN session_analytics.overall_risk_score IS 'Composite risk score calculated from all detection events';
COMMENT ON COLUMN session_analytics.raw_metrics IS 'Additional computed metrics stored as JSON';

-- ============================================================================
-- TABLE 7: AI_CACHE
-- ============================================================================
-- Cache for AI/LLM responses to detect answer reuse

CREATE TABLE ai_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 of normalized question
    question_text TEXT NOT NULL,
    model_name VARCHAR(100) NOT NULL, -- e.g., "gpt-4", "claude-3-opus"

    response_embedding VECTOR(1536), -- OpenAI ada-002 embedding dimension
    response_text TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_count INTEGER DEFAULT 0,

    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_ai_cache_hash ON ai_cache(question_hash);
CREATE INDEX idx_ai_cache_model ON ai_cache(model_name);
CREATE INDEX idx_ai_cache_accessed ON ai_cache(last_accessed_at DESC);
CREATE INDEX idx_ai_cache_embedding ON ai_cache USING ivfflat (response_embedding vector_cosine_ops);

COMMENT ON TABLE ai_cache IS 'Cache of AI-generated responses for similarity detection';
COMMENT ON COLUMN ai_cache.question_hash IS 'SHA-256 hash of normalized question text for quick lookups';
COMMENT ON COLUMN ai_cache.response_embedding IS 'Vector embedding of response for semantic similarity search';

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-calculate session duration on completion
CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND NEW.actual_start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.end_time - NEW.actual_start_time))::INTEGER;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_session_duration_trigger
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION calculate_session_duration();

-- Auto-update AI cache access tracking
CREATE OR REPLACE FUNCTION update_ai_cache_access()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed_at = NOW();
    NEW.access_count = NEW.access_count + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ai_cache_access_trigger
    BEFORE UPDATE ON ai_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_cache_access();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active sessions with user details
CREATE VIEW v_active_sessions AS
SELECT
    s.id,
    s.session_token,
    s.status,
    s.scheduled_start_time,
    s.actual_start_time,
    s.interview_url,
    i.full_name AS interviewer_name,
    i.email AS interviewer_email,
    ie.full_name AS interviewee_name,
    ie.email AS interviewee_email,
    o.name AS organization_name,
    o.subscription_tier
FROM sessions s
JOIN users i ON s.interviewer_id = i.id
LEFT JOIN users ie ON s.interviewee_id = ie.id
JOIN organizations o ON s.organization_id = o.id
WHERE s.status IN ('scheduled', 'active');

COMMENT ON VIEW v_active_sessions IS 'Active and scheduled sessions with denormalized user information';

-- Session summary with analytics
CREATE VIEW v_session_summary AS
SELECT
    s.id,
    s.interviewer_id,
    s.interviewee_id,
    s.status,
    s.actual_start_time,
    s.end_time,
    s.duration_seconds,
    sa.total_events_detected,
    sa.overall_risk_score,
    sa.risk_category,
    COUNT(DISTINCT a.id) as total_alerts,
    COUNT(DISTINCT a.id) FILTER (WHERE a.severity = 'critical') as critical_alerts
FROM sessions s
LEFT JOIN session_analytics sa ON s.id = sa.session_id
LEFT JOIN alerts a ON s.id = a.session_id
GROUP BY s.id, sa.id;

COMMENT ON VIEW v_session_summary IS 'Session overview with aggregated analytics and alert counts';

-- ============================================================================
-- GRANT PERMISSIONS (for application user)
-- ============================================================================

-- This section would be uncommented in production with actual user
-- CREATE USER blockd_app WITH PASSWORD 'secure_password_here';
-- GRANT CONNECT ON DATABASE blockd_db TO blockd_app;
-- GRANT USAGE ON SCHEMA public TO blockd_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO blockd_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO blockd_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO blockd_app;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Additional composite indexes for common query patterns
CREATE INDEX idx_sessions_org_status ON sessions(organization_id, status, scheduled_start_time);
CREATE INDEX idx_detection_events_session_type ON detection_events(session_id, event_type, timestamp DESC);
CREATE INDEX idx_alerts_session_severity ON alerts(session_id, severity, triggered_at DESC);

-- ============================================================================
-- CLEANUP & MAINTENANCE
-- ============================================================================

-- Retention policy for detection_events (keep only 90 days)
-- This would be managed by TimescaleDB retention policy:
-- SELECT add_retention_policy('detection_events', INTERVAL '90 days');

-- ============================================================================
-- SAMPLE DATA VALIDATION CONSTRAINTS
-- ============================================================================

-- Ensure sessions have valid time ranges
ALTER TABLE sessions ADD CONSTRAINT check_session_times
    CHECK (
        (scheduled_start_time IS NULL OR actual_start_time IS NULL OR actual_start_time >= scheduled_start_time - INTERVAL '1 hour')
        AND (actual_start_time IS NULL OR end_time IS NULL OR end_time > actual_start_time)
    );

-- Ensure analytics metrics are non-negative
ALTER TABLE session_analytics ADD CONSTRAINT check_analytics_non_negative
    CHECK (
        total_events_detected >= 0
        AND high_severity_events >= 0
        AND critical_severity_events >= 0
        AND suspicious_keystroke_patterns >= 0
        AND ai_similarity_incidents >= 0
        AND screen_switches >= 0
    );

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
