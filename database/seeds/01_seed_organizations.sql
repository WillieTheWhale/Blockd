-- Seed Organizations for Blockd Platform
-- This script creates test organizations with different subscription tiers

-- Delete existing seed data (if re-running)
DELETE FROM organizations WHERE name IN ('Blockd Demo Corp', 'Tech Startup Inc', 'Enterprise Solutions Ltd');

-- Insert test organizations
INSERT INTO organizations (id, name, subscription_tier, settings, max_concurrent_sessions, monthly_session_limit, created_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        'Blockd Demo Corp',
        'free',
        '{"notifications_enabled": true, "auto_reports": false, "retention_days": 30}',
        5,
        100,
        NOW()
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Tech Startup Inc',
        'professional',
        '{"notifications_enabled": true, "auto_reports": true, "retention_days": 90, "custom_branding": true}',
        25,
        500,
        NOW()
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Enterprise Solutions Ltd',
        'enterprise',
        '{"notifications_enabled": true, "auto_reports": true, "retention_days": 365, "custom_branding": true, "dedicated_support": true, "sso_enabled": true}',
        100,
        -1,
        NOW()
    );

-- Display seeded organizations
SELECT id, name, subscription_tier, max_concurrent_sessions, monthly_session_limit
FROM organizations
WHERE name IN ('Blockd Demo Corp', 'Tech Startup Inc', 'Enterprise Solutions Ltd');
