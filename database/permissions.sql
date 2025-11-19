-- ============================================================================
-- Blockd Database Permissions
-- ============================================================================
-- This script grants appropriate permissions to the application user.
-- Execute this after schema.sql has been loaded.
--
-- For Docker: Name this 03-permissions.sql in /docker-entrypoint-initdb.d/
-- ============================================================================

\c blockd_db;

-- Grant table permissions to application user
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO blockd_app;

-- Grant sequence permissions (for SERIAL/BIGSERIAL columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO blockd_app;

-- Grant execute permissions on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO blockd_app;

-- Grant permissions on future tables (for migrations)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO blockd_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO blockd_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO blockd_app;

-- Grant permissions on views
GRANT SELECT ON ALL TABLES IN SCHEMA public TO blockd_app;

-- Create read-only user for analytics/reporting
CREATE USER blockd_readonly WITH PASSWORD 'readonly_changeme';
GRANT CONNECT ON DATABASE blockd_db TO blockd_readonly;
GRANT USAGE ON SCHEMA public TO blockd_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO blockd_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO blockd_readonly;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Permissions granted to blockd_app and blockd_readonly';
END $$;
