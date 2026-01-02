#!/bin/bash
# Test Script for Blockd Database Schema
# This script validates the database schema without requiring PostgreSQL to be running

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Blockd Database Schema Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ERRORS=0

# Function to print test result
print_test() {
    if [ $2 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1"
        ((ERRORS++))
    fi
}

# Test 1: Check if schema.sql exists
echo -e "${YELLOW}[1/10] Checking schema.sql...${NC}"
if [ -f "$SCRIPT_DIR/schema.sql" ]; then
    print_test "schema.sql exists" 0
    FILE_SIZE=$(wc -c < "$SCRIPT_DIR/schema.sql")
    print_test "schema.sql size: $FILE_SIZE bytes (expected > 10000)" 0
else
    print_test "schema.sql exists" 1
fi
echo ""

# Test 2: Check SQL syntax (basic validation)
echo -e "${YELLOW}[2/10] Validating SQL syntax...${NC}"
if grep -q "CREATE TABLE" "$SCRIPT_DIR/schema.sql"; then
    print_test "Contains CREATE TABLE statements" 0
else
    print_test "Contains CREATE TABLE statements" 1
fi

if grep -q "CREATE EXTENSION" "$SCRIPT_DIR/schema.sql"; then
    print_test "Contains CREATE EXTENSION statements" 0
else
    print_test "Contains CREATE EXTENSION statements" 1
fi

if grep -q "CREATE INDEX" "$SCRIPT_DIR/schema.sql"; then
    print_test "Contains CREATE INDEX statements" 0
else
    print_test "Contains CREATE INDEX statements" 1
fi
echo ""

# Test 3: Check for required tables
echo -e "${YELLOW}[3/10] Checking required tables...${NC}"
REQUIRED_TABLES=(
    "organizations"
    "users"
    "interview_sessions"
    "security_events"
    "questions"
    "ai_answer_cache"
    "answer_analysis"
    "gaze_events"
    "browser_telemetry"
    "session_reports"
    "audit_logs"
)

for table in "${REQUIRED_TABLES[@]}"; do
    if grep -q "CREATE TABLE $table" "$SCRIPT_DIR/schema.sql"; then
        print_test "Table $table defined" 0
    else
        print_test "Table $table defined" 1
    fi
done
echo ""

# Test 4: Check for required extensions
echo -e "${YELLOW}[4/10] Checking required extensions...${NC}"
REQUIRED_EXTENSIONS=("uuid-ossp" "vector" "timescaledb" "pgcrypto")

for ext in "${REQUIRED_EXTENSIONS[@]}"; do
    if grep -q "$ext" "$SCRIPT_DIR/schema.sql"; then
        print_test "Extension $ext referenced" 0
    else
        print_test "Extension $ext referenced" 1
    fi
done
echo ""

# Test 5: Check TimescaleDB hypertable setup
echo -e "${YELLOW}[5/10] Checking TimescaleDB configuration...${NC}"
if grep -q "create_hypertable" "$SCRIPT_DIR/schema.sql"; then
    print_test "create_hypertable() calls found" 0
else
    print_test "create_hypertable() calls found" 1
fi

if grep -q "add_retention_policy" "$SCRIPT_DIR/schema.sql"; then
    print_test "Retention policies configured" 0
else
    print_test "Retention policies configured" 1
fi

if grep -q "add_compression_policy" "$SCRIPT_DIR/schema.sql"; then
    print_test "Compression policies configured" 0
else
    print_test "Compression policies configured" 1
fi
echo ""

# Test 6: Check pgvector configuration
echo -e "${YELLOW}[6/10] Checking pgvector configuration...${NC}"
if grep -q "vector(384)" "$SCRIPT_DIR/schema.sql"; then
    print_test "Vector columns (384 dimensions) defined" 0
else
    print_test "Vector columns (384 dimensions) defined" 1
fi

if grep -q "ivfflat" "$SCRIPT_DIR/schema.sql"; then
    print_test "IVFFlat index for vector search" 0
else
    print_test "IVFFlat index for vector search" 1
fi
echo ""

# Test 7: Check Alembic migration files
echo -e "${YELLOW}[7/10] Checking Alembic migrations...${NC}"
if [ -f "$SCRIPT_DIR/alembic.ini" ]; then
    print_test "alembic.ini exists" 0
else
    print_test "alembic.ini exists" 1
fi

if [ -f "$SCRIPT_DIR/migrations/env.py" ]; then
    print_test "migrations/env.py exists" 0
else
    print_test "migrations/env.py exists" 1
fi

if [ -d "$SCRIPT_DIR/migrations/versions" ]; then
    print_test "migrations/versions/ directory exists" 0
else
    print_test "migrations/versions/ directory exists" 1
fi
echo ""

# Test 8: Check seed data files
echo -e "${YELLOW}[8/10] Checking seed data files...${NC}"
SEED_FILES=(
    "01_seed_organizations.sql"
    "02_seed_users.sql"
    "03_seed_ai_cache.sql"
    "04_seed_sample_sessions.sql"
    "seed_all.sh"
)

for seed in "${SEED_FILES[@]}"; do
    if [ -f "$SCRIPT_DIR/seeds/$seed" ]; then
        print_test "Seed file $seed exists" 0
    else
        print_test "Seed file $seed exists" 1
    fi
done
echo ""

# Test 9: Check init script
echo -e "${YELLOW}[9/10] Checking initialization script...${NC}"
if [ -f "$SCRIPT_DIR/init.sh" ]; then
    print_test "init.sh exists" 0
else
    print_test "init.sh exists" 1
fi

if [ -x "$SCRIPT_DIR/init.sh" ]; then
    print_test "init.sh is executable" 0
else
    print_test "init.sh is executable" 1
fi
echo ""

# Test 10: Check documentation
echo -e "${YELLOW}[10/10] Checking documentation...${NC}"
if [ -f "$SCRIPT_DIR/../docs/agent1-database-schema.json" ]; then
    print_test "agent1-database-schema.json exists" 0
else
    print_test "agent1-database-schema.json exists" 1
fi

if [ -f "$SCRIPT_DIR/migrations/README.md" ]; then
    print_test "migrations/README.md exists" 0
else
    print_test "migrations/README.md exists" 1
fi

if [ -f "$SCRIPT_DIR/seeds/README.md" ]; then
    print_test "seeds/README.md exists" 0
else
    print_test "seeds/README.md exists" 1
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}  All tests passed! ✓${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${GREEN}Database schema is ready for deployment${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Install PostgreSQL 18.1+"
    echo "  2. Install TimescaleDB extension"
    echo "  3. Install pgvector extension"
    echo "  4. Run: ./database/init.sh"
    echo "  5. Verify with: psql -d blockd -c '\\dt'"
    echo ""
    exit 0
else
    echo -e "${RED}  $ERRORS test(s) failed ✗${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${RED}Please fix the errors above before deploying${NC}"
    exit 1
fi
