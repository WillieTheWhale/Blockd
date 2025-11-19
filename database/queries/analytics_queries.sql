-- ============================================================================
-- Blockd Analytics Queries
-- ============================================================================
-- Complex analytical queries for reporting, dashboards, and insights.
-- These queries aggregate data across multiple tables.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- DASHBOARD METRICS
-- ----------------------------------------------------------------------------

-- Real-time dashboard overview for organization
-- Parameters: $1 = organization_id
SELECT
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') as active_sessions,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'scheduled') as upcoming_sessions,
    COUNT(DISTINCT s.id) FILTER (
        WHERE s.status = 'completed'
        AND s.end_time >= NOW() - INTERVAL '7 days'
    ) as completed_last_7_days,
    COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'interviewer') as total_interviewers,
    COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'interviewee') as total_interviewees
FROM organizations o
LEFT JOIN sessions s ON s.organization_id = o.id
LEFT JOIN users u ON u.organization_id = o.id AND u.is_active = true
WHERE o.id = $1
GROUP BY o.id;

-- Active sessions with real-time event counts
-- Parameters: $1 = organization_id
SELECT
    s.id,
    s.interview_url,
    s.actual_start_time,
    i.full_name as interviewer_name,
    ie.full_name as interviewee_name,
    COUNT(de.id) as total_events,
    COUNT(de.id) FILTER (WHERE de.severity IN ('high', 'critical')) as critical_events,
    MAX(de.timestamp) as last_event_time
FROM sessions s
JOIN users i ON s.interviewer_id = i.id
LEFT JOIN users ie ON s.interviewee_id = ie.id
LEFT JOIN detection_events de ON de.session_id = s.id
WHERE s.organization_id = $1
  AND s.status = 'active'
GROUP BY s.id, i.full_name, ie.full_name
ORDER BY s.actual_start_time DESC;

-- ----------------------------------------------------------------------------
-- SESSION ANALYTICS
-- ----------------------------------------------------------------------------

-- Comprehensive session report
-- Parameters: $1 = session_id
SELECT
    s.id,
    s.scheduled_start_time,
    s.actual_start_time,
    s.end_time,
    s.duration_seconds,
    s.status,
    i.full_name as interviewer_name,
    ie.full_name as interviewee_name,
    o.name as organization_name,

    -- Event statistics
    COUNT(DISTINCT de.id) as total_events,
    COUNT(DISTINCT de.id) FILTER (WHERE de.severity = 'low') as low_severity_events,
    COUNT(DISTINCT de.id) FILTER (WHERE de.severity = 'medium') as medium_severity_events,
    COUNT(DISTINCT de.id) FILTER (WHERE de.severity = 'high') as high_severity_events,
    COUNT(DISTINCT de.id) FILTER (WHERE de.severity = 'critical') as critical_severity_events,

    -- Event type breakdown
    COUNT(DISTINCT de.id) FILTER (WHERE de.event_type = 'eye_tracking') as eye_tracking_events,
    COUNT(DISTINCT de.id) FILTER (WHERE de.event_type = 'keystroke') as keystroke_events,
    COUNT(DISTINCT de.id) FILTER (WHERE de.event_type = 'ai_similarity') as ai_similarity_events,
    COUNT(DISTINCT de.id) FILTER (WHERE de.event_type = 'screen_change') as screen_change_events,

    -- Alert statistics
    COUNT(DISTINCT a.id) as total_alerts,
    COUNT(DISTINCT a.id) FILTER (WHERE a.severity = 'critical') as critical_alerts,
    COUNT(DISTINCT a.id) FILTER (WHERE a.acknowledged_at IS NULL) as unacknowledged_alerts,

    -- Analytics
    sa.overall_risk_score,
    sa.risk_category

FROM sessions s
JOIN users i ON s.interviewer_id = i.id
LEFT JOIN users ie ON s.interviewee_id = ie.id
JOIN organizations o ON s.organization_id = o.id
LEFT JOIN detection_events de ON de.session_id = s.id AND de.is_false_positive = false
LEFT JOIN alerts a ON a.session_id = s.id
LEFT JOIN session_analytics sa ON sa.session_id = s.id
WHERE s.id = $1
GROUP BY s.id, i.full_name, ie.full_name, o.name, sa.overall_risk_score, sa.risk_category;

-- Event timeline for session (grouped by minute)
-- Parameters: $1 = session_id
SELECT
    date_trunc('minute', timestamp) as minute,
    event_type,
    COUNT(*) as event_count,
    AVG(confidence_score) as avg_confidence,
    MAX(severity) as max_severity
FROM detection_events
WHERE session_id = $1
  AND is_false_positive = false
GROUP BY date_trunc('minute', timestamp), event_type
ORDER BY minute ASC, event_type;

-- Risk score calculation (can be used to update session_analytics)
-- Parameters: $1 = session_id
SELECT
    s.id,
    -- Weighted risk score calculation
    LEAST(1.0, (
        (COUNT(de.id) FILTER (WHERE de.severity = 'critical') * 0.4) +
        (COUNT(de.id) FILTER (WHERE de.severity = 'high') * 0.2) +
        (COUNT(de.id) FILTER (WHERE de.severity = 'medium') * 0.1) +
        (COUNT(de.id) FILTER (WHERE de.severity = 'low') * 0.02)
    ) / 100.0) as calculated_risk_score,

    COUNT(de.id) as total_events,
    COUNT(de.id) FILTER (WHERE de.severity IN ('high', 'critical')) as high_severity_count

FROM sessions s
LEFT JOIN detection_events de ON de.session_id = s.id
    AND de.is_false_positive = false
WHERE s.id = $1
GROUP BY s.id;

-- ----------------------------------------------------------------------------
-- ORGANIZATION ANALYTICS
-- ----------------------------------------------------------------------------

-- Organization performance summary (last 30 days)
-- Parameters: $1 = organization_id
SELECT
    COUNT(DISTINCT s.id) as total_sessions,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'completed') as completed_sessions,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'cancelled') as cancelled_sessions,

    -- Average session metrics
    AVG(s.duration_seconds) FILTER (WHERE s.status = 'completed') as avg_duration_seconds,
    AVG(sa.overall_risk_score) as avg_risk_score,

    -- Risk distribution
    COUNT(DISTINCT s.id) FILTER (WHERE sa.risk_category = 'low') as low_risk_sessions,
    COUNT(DISTINCT s.id) FILTER (WHERE sa.risk_category = 'medium') as medium_risk_sessions,
    COUNT(DISTINCT s.id) FILTER (WHERE sa.risk_category = 'high') as high_risk_sessions,
    COUNT(DISTINCT s.id) FILTER (WHERE sa.risk_category = 'critical') as critical_risk_sessions,

    -- Detection statistics
    SUM(sa.total_events_detected) as total_events_all_sessions,
    SUM(sa.ai_similarity_incidents) as total_ai_incidents,
    SUM(sa.suspicious_keystroke_patterns) as total_suspicious_keystrokes

FROM sessions s
LEFT JOIN session_analytics sa ON sa.session_id = s.id
WHERE s.organization_id = $1
  AND s.created_at >= NOW() - INTERVAL '30 days'
GROUP BY s.organization_id;

-- Top interviewers by session count
-- Parameters: $1 = organization_id, $2 = limit
SELECT
    u.id,
    u.full_name,
    u.email,
    COUNT(DISTINCT s.id) as total_sessions,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'completed') as completed_sessions,
    AVG(sa.overall_risk_score) as avg_risk_score,
    COUNT(DISTINCT s.id) FILTER (
        WHERE sa.risk_category IN ('high', 'critical')
    ) as high_risk_sessions
FROM users u
JOIN sessions s ON s.interviewer_id = u.id
LEFT JOIN session_analytics sa ON sa.session_id = s.id
WHERE u.organization_id = $1
  AND u.role = 'interviewer'
  AND s.created_at >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.full_name, u.email
ORDER BY total_sessions DESC
LIMIT $2;

-- Sessions per day (last 30 days)
-- Parameters: $1 = organization_id
SELECT
    date_trunc('day', s.scheduled_start_time) as day,
    COUNT(DISTINCT s.id) as session_count,
    COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'completed') as completed_count,
    AVG(sa.overall_risk_score) as avg_risk_score
FROM sessions s
LEFT JOIN session_analytics sa ON sa.session_id = s.id
WHERE s.organization_id = $1
  AND s.scheduled_start_time >= NOW() - INTERVAL '30 days'
GROUP BY date_trunc('day', s.scheduled_start_time)
ORDER BY day DESC;

-- ----------------------------------------------------------------------------
-- DETECTION ANALYTICS
-- ----------------------------------------------------------------------------

-- Event type distribution across all sessions
-- Parameters: $1 = organization_id, $2 = date_from
SELECT
    de.event_type,
    COUNT(*) as total_count,
    AVG(de.confidence_score) as avg_confidence,
    COUNT(*) FILTER (WHERE de.severity = 'critical') as critical_count,
    COUNT(*) FILTER (WHERE de.severity = 'high') as high_count,
    COUNT(*) FILTER (WHERE de.is_false_positive = true) as false_positive_count
FROM detection_events de
JOIN sessions s ON s.id = de.session_id
WHERE s.organization_id = $1
  AND de.timestamp >= $2
GROUP BY de.event_type
ORDER BY total_count DESC;

-- AI similarity detection rate
-- Parameters: $1 = organization_id, $2 = days_back
SELECT
    COUNT(DISTINCT s.id) as sessions_with_ai_detection,
    COUNT(DISTINCT de.id) as total_ai_incidents,
    AVG(de.confidence_score) as avg_confidence,
    COUNT(DISTINCT de.id) FILTER (
        WHERE (de.event_data->>'similarity_score')::float > 0.8
    ) as high_similarity_count
FROM detection_events de
JOIN sessions s ON s.id = de.session_id
WHERE s.organization_id = $1
  AND de.event_type = 'ai_similarity'
  AND de.timestamp >= NOW() - ($2 || ' days')::INTERVAL
  AND de.is_false_positive = false;

-- Eye tracking metrics summary
-- Parameters: $1 = session_id
SELECT
    COUNT(*) as total_eye_events,
    AVG(confidence_score) as avg_confidence,
    COUNT(*) FILTER (
        WHERE (event_data->>'looking_away')::boolean = true
    ) as looking_away_count,
    AVG((event_data->>'duration_ms')::integer) as avg_duration_ms,
    COUNT(*) FILTER (
        WHERE severity IN ('high', 'critical')
    ) as suspicious_count
FROM detection_events
WHERE session_id = $1
  AND event_type = 'eye_tracking'
  AND is_false_positive = false;

-- Keystroke pattern analysis
-- Parameters: $1 = session_id
SELECT
    COUNT(*) as total_keystroke_events,
    AVG((event_data->>'wpm')::integer) as avg_wpm,
    AVG((event_data->>'typing_rhythm_score')::float) as avg_rhythm_score,
    COUNT(*) FILTER (
        WHERE event_data->>'pattern' = 'suspicious'
    ) as suspicious_pattern_count,
    COUNT(*) FILTER (
        WHERE event_data->>'pattern' = 'copy_paste'
    ) as copy_paste_count
FROM detection_events
WHERE session_id = $1
  AND event_type = 'keystroke'
  AND is_false_positive = false;

-- ----------------------------------------------------------------------------
-- ALERT ANALYTICS
-- ----------------------------------------------------------------------------

-- Alert summary by type
-- Parameters: $1 = organization_id, $2 = days_back
SELECT
    a.alert_type,
    COUNT(*) as total_alerts,
    COUNT(*) FILTER (WHERE a.severity = 'critical') as critical_count,
    COUNT(*) FILTER (WHERE a.acknowledged_at IS NOT NULL) as acknowledged_count,
    AVG(EXTRACT(EPOCH FROM (a.acknowledged_at - a.triggered_at))) FILTER (
        WHERE a.acknowledged_at IS NOT NULL
    ) as avg_acknowledgement_time_seconds
FROM alerts a
JOIN sessions s ON s.id = a.session_id
WHERE s.organization_id = $1
  AND a.triggered_at >= NOW() - ($2 || ' days')::INTERVAL
GROUP BY a.alert_type
ORDER BY total_alerts DESC;

-- Unacknowledged critical alerts across organization
-- Parameters: $1 = organization_id
SELECT
    a.id,
    a.alert_type,
    a.title,
    a.severity,
    a.triggered_at,
    s.id as session_id,
    i.full_name as interviewer_name,
    ie.full_name as interviewee_name
FROM alerts a
JOIN sessions s ON s.id = a.session_id
JOIN users i ON s.interviewer_id = i.id
LEFT JOIN users ie ON s.interviewee_id = ie.id
WHERE s.organization_id = $1
  AND a.acknowledged_at IS NULL
  AND a.severity IN ('high', 'critical')
ORDER BY a.severity DESC, a.triggered_at DESC;

-- ----------------------------------------------------------------------------
-- AI CACHE ANALYTICS
-- ----------------------------------------------------------------------------

-- Most accessed cached responses
-- Parameters: $1 = limit
SELECT
    question_text,
    model_name,
    access_count,
    created_at,
    last_accessed_at
FROM ai_cache
ORDER BY access_count DESC
LIMIT $1;

-- Cache hit rate by model
SELECT
    model_name,
    COUNT(*) as cached_responses,
    SUM(access_count) as total_accesses,
    AVG(access_count) as avg_accesses_per_response
FROM ai_cache
GROUP BY model_name
ORDER BY cached_responses DESC;

-- ----------------------------------------------------------------------------
-- TREND ANALYSIS
-- ----------------------------------------------------------------------------

-- Risk score trends over time
-- Parameters: $1 = organization_id, $2 = days_back
SELECT
    date_trunc('day', s.end_time) as day,
    COUNT(DISTINCT s.id) as session_count,
    AVG(sa.overall_risk_score) as avg_risk_score,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sa.overall_risk_score) as median_risk_score,
    COUNT(DISTINCT s.id) FILTER (
        WHERE sa.risk_category IN ('high', 'critical')
    ) as high_risk_count
FROM sessions s
JOIN session_analytics sa ON sa.session_id = s.id
WHERE s.organization_id = $1
  AND s.status = 'completed'
  AND s.end_time >= NOW() - ($2 || ' days')::INTERVAL
GROUP BY date_trunc('day', s.end_time)
ORDER BY day DESC;

-- Event volume trends (hourly)
-- Parameters: $1 = session_id
SELECT
    date_trunc('hour', timestamp) as hour,
    event_type,
    COUNT(*) as event_count,
    AVG(confidence_score) as avg_confidence
FROM detection_events
WHERE session_id = $1
GROUP BY date_trunc('hour', timestamp), event_type
ORDER BY hour ASC;

-- ============================================================================
-- END OF ANALYTICS QUERIES
-- ============================================================================
