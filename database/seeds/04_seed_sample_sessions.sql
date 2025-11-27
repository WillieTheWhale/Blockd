-- Seed Sample Interview Sessions for Blockd Platform
-- This script creates sample interview sessions with associated data

-- Delete existing seed data (if re-running)
DELETE FROM interview_sessions WHERE id IN (
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003'
);

-- Insert sample interview sessions
INSERT INTO interview_sessions (
    id,
    interviewer_id,
    interviewee_id,
    interviewee_email,
    organization_id,
    status,
    scheduled_start,
    actual_start,
    actual_end,
    duration_minutes,
    risk_score,
    metadata,
    created_at
)
VALUES
    -- Completed session with low risk
    (
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000002', -- Sarah Johnson
        '10000000-0000-0000-0000-000000000004', -- Alice Williams
        'interviewee1@example.com',
        '00000000-0000-0000-0000-000000000001',
        'ended',
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '2 days' + INTERVAL '5 minutes',
        NOW() - INTERVAL '2 days' + INTERVAL '65 minutes',
        60,
        0.15,
        '{"position": "Senior Software Engineer", "department": "Engineering"}',
        NOW() - INTERVAL '3 days'
    ),
    -- Active session with medium risk
    (
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000003', -- Michael Chen
        '10000000-0000-0000-0000-000000000005', -- Bob Martinez
        'interviewee2@example.com',
        '00000000-0000-0000-0000-000000000002',
        'active',
        NOW() - INTERVAL '30 minutes',
        NOW() - INTERVAL '25 minutes',
        NULL,
        NULL,
        0.68,
        '{"position": "DevOps Engineer", "department": "Infrastructure"}',
        NOW() - INTERVAL '1 day'
    ),
    -- Scheduled session
    (
        '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000006', -- John Doe
        NULL,
        'candidate@example.com',
        '00000000-0000-0000-0000-000000000003',
        'scheduled',
        NOW() + INTERVAL '2 days',
        NULL,
        NULL,
        NULL,
        NULL,
        '{"position": "Product Manager", "department": "Product"}',
        NOW()
    );

-- Insert questions for session 1
INSERT INTO questions (session_id, question_text, question_order, expected_duration, difficulty, asked_at)
VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        'What is a closure in JavaScript?',
        1,
        300,
        'medium',
        NOW() - INTERVAL '2 days' + INTERVAL '10 minutes'
    ),
    (
        '20000000-0000-0000-0000-000000000001',
        'Explain database indexing and its benefits',
        2,
        360,
        'medium',
        NOW() - INTERVAL '2 days' + INTERVAL '25 minutes'
    ),
    (
        '20000000-0000-0000-0000-000000000001',
        'Describe your experience with microservices architecture',
        3,
        480,
        'hard',
        NOW() - INTERVAL '2 days' + INTERVAL '40 minutes'
    );

-- Insert security events for session 2 (active session with medium risk)
INSERT INTO security_events (session_id, event_type, severity, description, metadata, timestamp)
VALUES
    (
        '20000000-0000-0000-0000-000000000002',
        'window_focus_changed',
        'medium',
        'Browser window lost focus for 3 seconds',
        '{"duration_ms": 3200, "previous_window": "chrome", "new_window": "unknown"}',
        NOW() - INTERVAL '20 minutes'
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        'suspicious_process',
        'high',
        'ChatGPT browser tab detected',
        '{"process_name": "chrome", "window_title": "ChatGPT", "tab_url": "https://chat.openai.com"}',
        NOW() - INTERVAL '15 minutes'
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        'copy_paste_detected',
        'medium',
        'Paste operation detected in answer field',
        '{"clipboard_length": 245, "field_id": "answer_textarea"}',
        NOW() - INTERVAL '10 minutes'
    );

-- Insert gaze events for session 2 (sample data)
INSERT INTO gaze_events (session_id, timestamp, gaze_x, gaze_y, is_off_screen, off_screen_direction, confidence)
SELECT
    '20000000-0000-0000-0000-000000000002',
    NOW() - INTERVAL '25 minutes' + (n || ' seconds')::INTERVAL,
    (random() * 0.8 + 0.1)::DECIMAL(10,8), -- Random x between 0.1 and 0.9
    (random() * 0.8 + 0.1)::DECIMAL(10,8), -- Random y between 0.1 and 0.9
    CASE WHEN random() > 0.9 THEN TRUE ELSE FALSE END,
    CASE WHEN random() > 0.9 THEN (ARRAY['left', 'right', 'up', 'down'])[floor(random() * 4 + 1)] ELSE NULL END,
    (random() * 0.3 + 0.7)::DECIMAL(5,4) -- Confidence between 0.7 and 1.0
FROM generate_series(1, 100) AS n;

-- Insert browser telemetry for session 2
INSERT INTO browser_telemetry (session_id, timestamp, cpu_percent, memory_mb, active_processes, browser_tabs_count)
SELECT
    '20000000-0000-0000-0000-000000000002',
    NOW() - INTERVAL '25 minutes' + (n || ' seconds')::INTERVAL,
    (random() * 40 + 20)::DECIMAL(5,2), -- CPU 20-60%
    (random() * 500 + 1000)::INTEGER, -- Memory 1000-1500 MB
    '[]'::JSONB,
    floor(random() * 3 + 2)::INTEGER -- 2-4 tabs
FROM generate_series(1, 50) AS n;

-- Insert session report for completed session
INSERT INTO session_reports (
    session_id,
    overall_risk_score,
    ai_detection_score,
    gaze_anomaly_score,
    timing_anomaly_score,
    security_events_count,
    recommendations,
    detailed_analysis
)
VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        0.15,
        0.10,
        0.05,
        0.08,
        0,
        '["Candidate demonstrated strong technical knowledge", "Response patterns appear natural", "No security concerns detected"]',
        '{"total_questions": 3, "avg_response_time_sec": 180, "gaze_stability_score": 0.95, "ai_similarity_avg": 0.12}'
    );

-- Display seeded sessions
SELECT
    s.id,
    s.status,
    i.email AS interviewer,
    COALESCE(ie.email, s.interviewee_email) AS interviewee,
    s.risk_score,
    s.scheduled_start
FROM interview_sessions s
INNER JOIN users i ON s.interviewer_id = i.id
LEFT JOIN users ie ON s.interviewee_id = ie.id
WHERE s.id IN (
    '20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003'
)
ORDER BY s.created_at;

-- Show statistics
SELECT
    'Sessions' AS entity,
    COUNT(*) AS count
FROM interview_sessions
WHERE id LIKE '20000000-%'
UNION ALL
SELECT
    'Questions' AS entity,
    COUNT(*) AS count
FROM questions
WHERE session_id LIKE '20000000-%'
UNION ALL
SELECT
    'Security Events' AS entity,
    COUNT(*) AS count
FROM security_events
WHERE session_id LIKE '20000000-%'
UNION ALL
SELECT
    'Gaze Events' AS entity,
    COUNT(*) AS count
FROM gaze_events
WHERE session_id LIKE '20000000-%'
UNION ALL
SELECT
    'Browser Telemetry' AS entity,
    COUNT(*) AS count
FROM browser_telemetry
WHERE session_id LIKE '20000000-%';
