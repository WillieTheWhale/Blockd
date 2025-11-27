#!/bin/bash
# Seed All Data Script for Blockd Platform
# This script runs all seed files in order

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Blockd Database Seeding${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Database connection parameters
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-blockd}"
DB_USER="${DB_USER:-postgres}"
export PGPASSWORD="${DB_PASSWORD:-postgres}"

# Check if PostgreSQL is accessible
echo -e "${YELLOW}[1/5] Checking database connection...${NC}"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to PostgreSQL database${NC}"
    echo "Connection details:"
    echo "  Host: $DB_HOST"
    echo "  Port: $DB_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    exit 1
fi
echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Seed organizations
echo -e "${YELLOW}[2/5] Seeding organizations...${NC}"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/01_seed_organizations.sql" > /dev/null; then
    echo -e "${GREEN}✓ Organizations seeded successfully${NC}"
else
    echo -e "${RED}✗ Failed to seed organizations${NC}"
    exit 1
fi
echo ""

# Seed users
echo -e "${YELLOW}[3/5] Seeding users...${NC}"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/02_seed_users.sql" > /dev/null; then
    echo -e "${GREEN}✓ Users seeded successfully${NC}"
else
    echo -e "${RED}✗ Failed to seed users${NC}"
    exit 1
fi
echo ""

# Seed AI answer cache
echo -e "${YELLOW}[4/5] Seeding AI answer cache...${NC}"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/03_seed_ai_cache.sql" > /dev/null; then
    echo -e "${GREEN}✓ AI answer cache seeded successfully${NC}"
else
    echo -e "${RED}✗ Failed to seed AI answer cache${NC}"
    exit 1
fi
echo ""

# Seed sample sessions
echo -e "${YELLOW}[5/5] Seeding sample sessions...${NC}"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/04_seed_sample_sessions.sql" > /dev/null; then
    echo -e "${GREEN}✓ Sample sessions seeded successfully${NC}"
else
    echo -e "${RED}✗ Failed to seed sample sessions${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All seed data loaded successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Display summary
echo -e "${YELLOW}Database Summary:${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'Organizations' AS table_name, COUNT(*) AS count FROM organizations
UNION ALL
SELECT 'Users' AS table_name, COUNT(*) AS count FROM users
UNION ALL
SELECT 'Interview Sessions' AS table_name, COUNT(*) AS count FROM interview_sessions
UNION ALL
SELECT 'Questions' AS table_name, COUNT(*) AS count FROM questions
UNION ALL
SELECT 'Security Events' AS table_name, COUNT(*) AS count FROM security_events
UNION ALL
SELECT 'AI Answer Cache' AS table_name, COUNT(*) AS count FROM ai_answer_cache
UNION ALL
SELECT 'Gaze Events' AS table_name, COUNT(*) AS count FROM gaze_events
UNION ALL
SELECT 'Browser Telemetry' AS table_name, COUNT(*) AS count FROM browser_telemetry
ORDER BY table_name;
"

echo ""
echo -e "${YELLOW}Test Login Credentials:${NC}"
echo "  Admin: admin@blockd.com / Blockd2025!"
echo "  Interviewer 1: interviewer1@blockd.com / Blockd2025!"
echo "  Interviewer 2: interviewer2@techstartup.com / Blockd2025!"
echo "  Interviewee 1: interviewee1@example.com / Blockd2025!"
echo ""
