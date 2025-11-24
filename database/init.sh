#!/bin/bash
# Blockd Database Initialization Script
# PostgreSQL 18.1 with TimescaleDB 2.x and pgvector 0.7.x
# Agent 1: Database Architect

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Blockd Database Initialization${NC}"
echo -e "${BLUE}  PostgreSQL 18.1 + TimescaleDB + pgvector${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-blockd}"
DB_USER="${DB_USER:-postgres}"
DB_APP_USER="${DB_APP_USER:-blockd_app}"
DB_APP_PASSWORD="${DB_APP_PASSWORD:-blockd_secure_password_2025}"
export PGPASSWORD="${DB_PASSWORD:-postgres}"

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Flags
SKIP_CREATE_DB=${SKIP_CREATE_DB:-false}
SKIP_EXTENSIONS=${SKIP_EXTENSIONS:-false}
SKIP_SCHEMA=${SKIP_SCHEMA:-false}
SKIP_SEEDS=${SKIP_SEEDS:-false}
RUN_MIGRATIONS=${RUN_MIGRATIONS:-false}

# Function to print step
print_step() {
    echo -e "${YELLOW}[$1] $2${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Check if PostgreSQL is running
print_step "1/8" "Checking PostgreSQL connection..."
if pg_isready -h "$DB_HOST" -p "$DB_PORT" > /dev/null 2>&1; then
    print_success "PostgreSQL is running"
else
    print_error "PostgreSQL is not running or not accessible"
    echo "Please ensure PostgreSQL is installed and running:"
    echo "  sudo systemctl start postgresql"
    exit 1
fi
echo ""

# Create database
if [ "$SKIP_CREATE_DB" = "false" ]; then
    print_step "2/8" "Creating database '$DB_NAME'..."

    # Check if database exists
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        print_success "Database '$DB_NAME' already exists"
    else
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;" > /dev/null 2>&1; then
            print_success "Database '$DB_NAME' created"
        else
            print_error "Failed to create database '$DB_NAME'"
            exit 1
        fi
    fi
else
    print_step "2/8" "Skipping database creation (SKIP_CREATE_DB=true)"
fi
echo ""

# Install extensions
if [ "$SKIP_EXTENSIONS" = "false" ]; then
    print_step "3/8" "Installing PostgreSQL extensions..."

    # Check and install extensions
    extensions=("uuid-ossp" "vector" "timescaledb" "pgcrypto")
    for ext in "${extensions[@]}"; do
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS $ext;" > /dev/null 2>&1; then
            print_success "Extension '$ext' installed"
        else
            print_error "Failed to install extension '$ext'"
            echo "Note: Make sure the extension is available in your PostgreSQL installation"
            if [ "$ext" = "timescaledb" ]; then
                echo "  TimescaleDB installation: https://docs.timescale.com/install/latest/"
            elif [ "$ext" = "vector" ]; then
                echo "  pgvector installation: https://github.com/pgvector/pgvector"
            fi
            exit 1
        fi
    done
else
    print_step "3/8" "Skipping extension installation (SKIP_EXTENSIONS=true)"
fi
echo ""

# Create application user
print_step "4/8" "Creating application user '$DB_APP_USER'..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_APP_USER'" | grep -q 1; then
    print_success "User '$DB_APP_USER' already exists"
else
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "CREATE USER $DB_APP_USER WITH PASSWORD '$DB_APP_PASSWORD';" > /dev/null 2>&1; then
        print_success "User '$DB_APP_USER' created"
    else
        print_error "Failed to create user '$DB_APP_USER'"
        exit 1
    fi
fi
echo ""

# Apply schema
if [ "$SKIP_SCHEMA" = "false" ]; then
    print_step "5/8" "Applying database schema..."

    if [ "$RUN_MIGRATIONS" = "true" ]; then
        print_success "Using Alembic migrations..."

        # Check if alembic is installed
        if ! command -v alembic &> /dev/null; then
            print_error "Alembic is not installed. Install it with: pip install alembic"
            exit 1
        fi

        cd "$SCRIPT_DIR"
        if alembic upgrade head; then
            print_success "Migrations applied successfully"
        else
            print_error "Failed to apply migrations"
            exit 1
        fi
    else
        print_success "Using schema.sql..."

        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCRIPT_DIR/schema.sql" > /dev/null 2>&1; then
            print_success "Schema applied successfully"
        else
            print_error "Failed to apply schema"
            exit 1
        fi
    fi
else
    print_step "5/8" "Skipping schema creation (SKIP_SCHEMA=true)"
fi
echo ""

# Grant permissions to application user
print_step "6/8" "Granting permissions to '$DB_APP_USER'..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1 <<EOF
GRANT CONNECT ON DATABASE $DB_NAME TO $DB_APP_USER;
GRANT USAGE ON SCHEMA public TO $DB_APP_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $DB_APP_USER;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO $DB_APP_USER;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO $DB_APP_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $DB_APP_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $DB_APP_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO $DB_APP_USER;
EOF
print_success "Permissions granted to '$DB_APP_USER'"
echo ""

# Load seed data
if [ "$SKIP_SEEDS" = "false" ]; then
    print_step "7/8" "Loading seed data..."

    # Make seed script executable
    chmod +x "$SCRIPT_DIR/seeds/seed_all.sh"

    # Run seed script
    if "$SCRIPT_DIR/seeds/seed_all.sh"; then
        print_success "Seed data loaded successfully"
    else
        print_error "Failed to load seed data"
        exit 1
    fi
else
    print_step "7/8" "Skipping seed data (SKIP_SEEDS=true)"
fi
echo ""

# Verify installation
print_step "8/8" "Verifying installation..."

# Check extensions
echo -e "${BLUE}Extensions installed:${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector', 'timescaledb', 'pgcrypto') ORDER BY extname;"

# Check tables
echo -e "${BLUE}Tables created:${NC}"
table_count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
print_success "$table_count tables created"

# Check hypertables
echo -e "${BLUE}TimescaleDB hypertables:${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT hypertable_name, num_dimensions FROM timescaledb_information.hypertables;"

# Check vector dimensions
echo -e "${BLUE}Vector columns:${NC}"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT tablename, attname AS column_name FROM pg_attribute a JOIN pg_class c ON a.attrelid = c.oid JOIN pg_type t ON a.atttypid = t.oid WHERE t.typname = 'vector' AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Database Initialization Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Connection Information:${NC}"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  Admin User: $DB_USER"
echo "  App User: $DB_APP_USER"
echo ""
echo -e "${YELLOW}Connection String:${NC}"
echo "  postgresql://$DB_APP_USER:$DB_APP_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
echo ""
echo -e "${YELLOW}Test the connection:${NC}"
echo "  psql -h $DB_HOST -p $DB_PORT -U $DB_APP_USER -d $DB_NAME"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Update your application's DATABASE_URL environment variable"
echo "  2. Test database connectivity from your application"
echo "  3. Run application-specific migrations if needed"
echo "  4. Review seed data in database/seeds/README.md"
echo ""
