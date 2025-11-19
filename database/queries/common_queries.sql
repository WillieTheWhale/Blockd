-- ============================================================================
-- Blockd Common Queries
-- ============================================================================
-- Frequently used queries for the Blockd application.
-- These can be used directly or adapted for the application code.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- USER QUERIES
-- ----------------------------------------------------------------------------

-- Get user by email
-- Parameters: $1 = email
SELECT id, email, full_name, role, organization_id, last_login_at, is_active, metadata
FROM users
WHERE email = $1 AND is_active = true;

-- Get all users in an organization
-- Parameters: $1 = organization_id
SELECT id, email, full_name, role, created_at, last_login_at
FROM users
WHERE organization_id = $1 AND is_active = true
ORDER BY created_at DESC;

-- Update user last login
-- Parameters: $1 = user_id
UPDATE users
SET last_login_at = NOW()
WHERE id = $1;

-- Search users by name (fuzzy search)
-- Parameters: $1 = search_term
SELECT id, email, full_name, role, organization_id
FROM users
WHERE is_active = true
  AND full_name ILIKE '%' || $1 || '%'
ORDER BY full_name
LIMIT 20;

-- ----------------------------------------------------------------------------
-- ORGANIZATION QUERIES
-- ----------------------------------------------------------------------------

-- Get organization details
-- Parameters: $1 = organization_id
SELECT id, name, slug, subscription_tier, max_monthly_sessions, settings
FROM organizations
WHERE id = $1 AND is_active = true;

-- Get organization by slug
-- Parameters: $1 = slug
SELECT id, name, subscription_tier, max_monthly_sessions, settings
FROM organizations
WHERE slug = $1 AND is_active = true;

-- Count sessions this month for organization
-- Parameters: $1 = organization_id
SELECT COUNT(*) as session_count
FROM sessions
WHERE organization_id = $1
  AND created_at >= date_trunc('month', CURRENT_TIMESTAMP);

-- Check if organization has reached session limit
-- Parameters: $1 = organization_id
SELECT
    o.max_monthly_sessions,
    COUNT(s.id) as current_month_sessions,
    (COUNT(s.id) >= o.max_monthly_sessions) as limit_reached
FROM organizations o
LEFT JOIN sessions s ON s.organization_id = o.id
    AND s.created_at >= date_trunc('month', CURRENT_TIMESTAMP)
WHERE o.id = $1
GROUP BY o.id, o.max_monthly_sessions;

-- ----------------------------------------------------------------------------
-- SESSION QUERIES
-- ----------------------------------------------------------------------------

-- Get session by ID with full details
-- Parameters: $1 = session_id
SELECT
    s.*,
    i.full_name as interviewer_name,
    i.email as interviewer_email,
    ie.full_name as interviewee_name,
    ie.email as interviewee_email,
    o.name as organization_name,
    o.subscription_tier
FROM sessions s
JOIN users i ON s.interviewer_id = i.id
LEFT JOIN users ie ON s.interviewee_id = ie.id
JOIN organizations o ON s.organization_id = o.id
WHERE s.id = $1;

-- Get session by token
-- Parameters: $1 = session_token
SELECT id, status, interviewer_id, interviewee_id, detection_settings
FROM sessions
WHERE session_token = $1;

-- Get active sessions for user
-- Parameters: $1 = user_id
SELECT
    s.id,
    s.status,
    s.scheduled_start_time,
    s.actual_start_time,
    s.interview_url,
    CASE
        WHEN s.interviewer_id = $1 THEN ie.full_name
        ELSE i.full_name
    END as other_participant_name
FROM sessions s
LEFT JOIN users i ON s.interviewer_id = i.id
LEFT JOIN users ie ON s.interviewee_id = ie.id
WHERE (s.interviewer_id = $1 OR s.interviewee_id = $1)
  AND s.status IN ('scheduled', 'active')
ORDER BY s.scheduled_start_time ASC;

-- Get completed sessions for interviewer
-- Parameters: $1 = interviewer_id, $2 = limit
SELECT
    s.id,
    s.scheduled_start_time,
    s.end_time,
    s.duration_seconds,
    ie.full_name as interviewee_name,
    sa.overall_risk_score,
    sa.risk_category
FROM sessions s
LEFT JOIN users ie ON s.interviewee_id = ie.id
LEFT JOIN session_analytics sa ON s.id = sa.session_id
WHERE s.interviewer_id = $1
  AND s.status = 'completed'
ORDER BY s.end_time DESC
LIMIT $2;

-- Update session status
-- Parameters: $1 = new_status, $2 = session_id
UPDATE sessions
SET status = $1
WHERE id = $2;

-- Start session (mark as active)
-- Parameters: $1 = session_id
UPDATE sessions
SET status = 'active',
    actual_start_time = NOW()
WHERE id = $1
  AND status = 'scheduled';

-- Complete session
-- Parameters: $1 = session_id
UPDATE sessions
SET status = 'completed',
    end_time = NOW()
WHERE id = $1
  AND status = 'active';

-- ----------------------------------------------------------------------------
-- DETECTION EVENT QUERIES
-- ----------------------------------------------------------------------------

-- Get recent events for session
-- Parameters: $1 = session_id, $2 = limit
SELECT
    id,
    event_type,
    timestamp,
    confidence_score,
    event_data,
    severity,
    is_false_positive
FROM detection_events
WHERE session_id = $1
ORDER BY timestamp DESC
LIMIT $2;

-- Get events by type for session
-- Parameters: $1 = session_id, $2 = event_type
SELECT
    timestamp,
    confidence_score,
    event_data,
    severity
FROM detection_events
WHERE session_id = $1
  AND event_type = $2
  AND is_false_positive = false
ORDER BY timestamp ASC;

-- Count events by severity for session
-- Parameters: $1 = session_id
SELECT
    severity,
    COUNT(*) as count
FROM detection_events
WHERE session_id = $1
  AND is_false_positive = false
GROUP BY severity
ORDER BY
    CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
    END;

-- Get high-confidence suspicious events
-- Parameters: $1 = session_id, $2 = min_confidence (e.g., 0.7)
SELECT
    event_type,
    timestamp,
    confidence_score,
    event_data,
    severity
FROM detection_events
WHERE session_id = $1
  AND confidence_score >= $2
  AND severity IN ('high', 'critical')
  AND is_false_positive = false
ORDER BY confidence_score DESC, timestamp DESC
LIMIT 50;

-- Mark event as false positive
-- Parameters: $1 = event_id (bigint), $2 = reviewer_id
UPDATE detection_events
SET is_false_positive = true,
    reviewed_by = $2,
    reviewed_at = NOW()
WHERE id = $1;

-- Get events in time range
-- Parameters: $1 = session_id, $2 = start_time, $3 = end_time
SELECT
    event_type,
    timestamp,
    confidence_score,
    severity,
    event_data
FROM detection_events
WHERE session_id = $1
  AND timestamp BETWEEN $2 AND $3
ORDER BY timestamp ASC;

-- ----------------------------------------------------------------------------
-- ALERT QUERIES
-- ----------------------------------------------------------------------------

-- Get unacknowledged alerts for session
-- Parameters: $1 = session_id
SELECT
    id,
    alert_type,
    title,
    description,
    severity,
    triggered_at,
    metadata
FROM alerts
WHERE session_id = $1
  AND acknowledged_at IS NULL
ORDER BY severity DESC, triggered_at DESC;

-- Get all alerts for session
-- Parameters: $1 = session_id
SELECT
    id,
    alert_type,
    title,
    severity,
    triggered_at,
    acknowledged_at,
    acknowledged_by
FROM alerts
WHERE session_id = $1
ORDER BY triggered_at DESC;

-- Acknowledge alert
-- Parameters: $1 = alert_id, $2 = user_id
UPDATE alerts
SET acknowledged_at = NOW(),
    acknowledged_by = $2
WHERE id = $1;

-- Create alert
-- Parameters: $1 = session_id, $2 = alert_type, $3 = title, $4 = description, $5 = severity
INSERT INTO alerts (session_id, alert_type, title, description, severity)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, triggered_at;

-- ----------------------------------------------------------------------------
-- SESSION ANALYTICS QUERIES
-- ----------------------------------------------------------------------------

-- Get session analytics
-- Parameters: $1 = session_id
SELECT
    total_events_detected,
    high_severity_events,
    critical_severity_events,
    avg_eye_tracking_confidence,
    suspicious_keystroke_patterns,
    ai_similarity_incidents,
    screen_switches,
    overall_risk_score,
    risk_category,
    calculated_at,
    raw_metrics
FROM session_analytics
WHERE session_id = $1;

-- Get or create session analytics
-- Parameters: $1 = session_id
INSERT INTO session_analytics (session_id)
VALUES ($1)
ON CONFLICT (session_id) DO NOTHING
RETURNING id;

-- ----------------------------------------------------------------------------
-- AI CACHE QUERIES
-- ----------------------------------------------------------------------------

-- Check if question exists in cache
-- Parameters: $1 = question_hash
SELECT
    id,
    question_text,
    response_text,
    model_name,
    response_embedding,
    created_at
FROM ai_cache
WHERE question_hash = $1;

-- Add to AI cache
-- Parameters: $1 = question_hash, $2 = question_text, $3 = model_name, $4 = response_text
INSERT INTO ai_cache (question_hash, question_text, model_name, response_text)
VALUES ($1, $2, $3, $4)
RETURNING id;

-- Update cache access stats
-- Parameters: $1 = cache_id
UPDATE ai_cache
SET last_accessed_at = NOW(),
    access_count = access_count + 1
WHERE id = $1;

-- Find similar responses (requires pgvector)
-- Parameters: $1 = embedding_vector, $2 = similarity_threshold, $3 = limit
SELECT
    question_text,
    response_text,
    1 - (response_embedding <=> $1::vector) as similarity
FROM ai_cache
WHERE response_embedding IS NOT NULL
  AND 1 - (response_embedding <=> $1::vector) >= $2
ORDER BY response_embedding <=> $1::vector
LIMIT $3;

-- ============================================================================
-- END OF COMMON QUERIES
-- ============================================================================
