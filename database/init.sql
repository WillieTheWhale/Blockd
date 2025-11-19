-- ============================================================================
-- Blockd Database Initialization Script
-- ============================================================================
-- This script is executed automatically when the PostgreSQL Docker container
-- is first initialized. It creates the database and runs the schema.
--
-- Usage in docker-compose.yml:
--   volumes:
--     - ./database/init.sql:/docker-entrypoint-initdb.d/01-init.sql
--     - ./database/schema.sql:/docker-entrypoint-initdb.d/02-schema.sql
--
-- Note: Files in /docker-entrypoint-initdb.d/ are executed in alphabetical order
-- ============================================================================

-- Create the Blockd database
CREATE DATABASE blockd_db;

-- Create dedicated application user
CREATE USER blockd_app WITH PASSWORD 'changeme_in_production';

-- Grant connection privileges
GRANT CONNECT ON DATABASE blockd_db TO blockd_app;

-- Connect to the newly created database
\c blockd_db;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO blockd_app;

-- Note: Table permissions will be granted after schema.sql runs
-- This can be done in a separate initialization script (03-permissions.sql)

-- ============================================================================
-- Database Configuration
-- ============================================================================

-- Optimize for time-series workload
ALTER DATABASE blockd_db SET timezone TO 'UTC';
ALTER DATABASE blockd_db SET log_statement TO 'mod';  -- Log all modifications

-- Set connection limits
ALTER DATABASE blockd_db CONNECTION LIMIT 100;

-- ============================================================================
-- Extensions (will be installed by schema.sql, but we can pre-load here)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- TimescaleDB extension (requires timescaledb image)
-- CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- pgvector extension (requires pgvector image)
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- Monitoring & Maintenance
-- ============================================================================

-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Configure autovacuum for time-series workload
ALTER SYSTEM SET autovacuum_naptime = '10s';
ALTER SYSTEM SET autovacuum_vacuum_scale_factor = 0.05;
ALTER SYSTEM SET autovacuum_analyze_scale_factor = 0.02;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║                                                            ║';
    RAISE NOTICE '║           ✅  Blockd Database Initialized                  ║';
    RAISE NOTICE '║                                                            ║';
    RAISE NOTICE '║  Database: blockd_db                                       ║';
    RAISE NOTICE '║  User: blockd_app                                          ║';
    RAISE NOTICE '║  Next: Schema will be loaded from schema.sql               ║';
    RAISE NOTICE '║                                                            ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
END $$;

-- ============================================================================
-- End of initialization script
-- The schema.sql file will be executed next by Docker
-- ============================================================================
