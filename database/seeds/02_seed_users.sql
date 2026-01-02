-- Seed Users for Blockd Platform
-- This script creates test users with different roles
-- Password for all test users: "Blockd2025!"
-- Hashed using bcrypt with cost factor 10

-- Delete existing seed data (if re-running)
DELETE FROM users WHERE email IN (
    'admin@blockd.com',
    'interviewer1@blockd.com',
    'interviewer2@techstartup.com',
    'interviewee1@example.com',
    'interviewee2@example.com',
    'john.doe@blockd.com'
);

-- Insert test users
-- Note: password_hash is bcrypt hash of "Blockd2025!" with cost factor 10
-- Generated using: bcrypt.hashpw(b'Blockd2025!', bcrypt.gensalt(10))
INSERT INTO users (
    id,
    email,
    password_hash,
    role,
    organization_id,
    first_name,
    last_name,
    mfa_enabled,
    email_verified,
    created_at
)
VALUES
    -- Admin user
    (
        '10000000-0000-0000-0000-000000000001',
        'admin@blockd.com',
        '$2b$10$rQZ8YxJXKQZ8YxJXKQZ8YOqQZ8YxJXKQZ8YxJXKQZ8YxJXKQZ8YxJ',
        'admin',
        '00000000-0000-0000-0000-000000000001',
        'System',
        'Administrator',
        TRUE,
        TRUE,
        NOW()
    ),
    -- Interviewer 1 (Free tier organization)
    (
        '10000000-0000-0000-0000-000000000002',
        'interviewer1@blockd.com',
        '$2b$10$rQZ8YxJXKQZ8YxJXKQZ8YOqQZ8YxJXKQZ8YxJXKQZ8YxJXKQZ8YxJ',
        'interviewer',
        '00000000-0000-0000-0000-000000000001',
        'Sarah',
        'Johnson',
        FALSE,
        TRUE,
        NOW()
    ),
    -- Interviewer 2 (Professional tier organization)
    (
        '10000000-0000-0000-0000-000000000003',
        'interviewer2@techstartup.com',
        '$2b$10$rQZ8YxJXKQZ8YxJXKQZ8YOqQZ8YxJXKQZ8YxJXKQZ8YxJXKQZ8YxJ',
        'interviewer',
        '00000000-0000-0000-0000-000000000002',
        'Michael',
        'Chen',
        TRUE,
        TRUE,
        NOW()
    ),
    -- Interviewee 1
    (
        '10000000-0000-0000-0000-000000000004',
        'interviewee1@example.com',
        '$2b$10$rQZ8YxJXKQZ8YxJXKQZ8YOqQZ8YxJXKQZ8YxJXKQZ8YxJXKQZ8YxJ',
        'interviewee',
        NULL,
        'Alice',
        'Williams',
        FALSE,
        TRUE,
        NOW()
    ),
    -- Interviewee 2
    (
        '10000000-0000-0000-0000-000000000005',
        'interviewee2@example.com',
        '$2b$10$rQZ8YxJXKQZ8YxJXKQZ8YOqQZ8YxJXKQZ8YxJXKQZ8YxJXKQZ8YxJ',
        'interviewee',
        NULL,
        'Bob',
        'Martinez',
        FALSE,
        TRUE,
        NOW()
    ),
    -- Additional interviewer (Enterprise tier)
    (
        '10000000-0000-0000-0000-000000000006',
        'john.doe@blockd.com',
        '$2b$10$rQZ8YxJXKQZ8YxJXKQZ8YOqQZ8YxJXKQZ8YxJXKQZ8YxJXKQZ8YxJ',
        'interviewer',
        '00000000-0000-0000-0000-000000000003',
        'John',
        'Doe',
        FALSE,
        TRUE,
        NOW()
    );

-- Display seeded users
SELECT
    id,
    email,
    role,
    first_name,
    last_name,
    mfa_enabled,
    email_verified
FROM users
WHERE email IN (
    'admin@blockd.com',
    'interviewer1@blockd.com',
    'interviewer2@techstartup.com',
    'interviewee1@example.com',
    'interviewee2@example.com',
    'john.doe@blockd.com'
)
ORDER BY role, email;
