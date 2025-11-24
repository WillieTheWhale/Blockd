# Blockd Database Migrations

This directory contains Alembic database migrations for the Blockd platform.

## Prerequisites

- PostgreSQL 18.1+
- TimescaleDB 2.x extension
- pgvector 0.7.x extension
- Python 3.11+
- Alembic 1.x

## Setup

1. Install Alembic:
```bash
pip install alembic psycopg2-binary
```

2. Configure database connection:
   - Edit `alembic.ini` to set your database URL, or
   - Set environment variable: `export DATABASE_URL=postgresql://user:password@host:port/database`

## Running Migrations

### Upgrade to latest version
```bash
cd /home/user/Blockd/database
alembic upgrade head
```

### Downgrade one version
```bash
alembic downgrade -1
```

### Show current version
```bash
alembic current
```

### Show migration history
```bash
alembic history
```

## Creating New Migrations

### Auto-generate migration from schema changes
```bash
alembic revision --autogenerate -m "Description of changes"
```

### Create empty migration file
```bash
alembic revision -m "Description of changes"
```

## Migration Files

- `env.py` - Alembic environment configuration
- `script.py.mako` - Template for generating migration files
- `versions/` - Directory containing migration scripts
  - `20251124_0000_001_initial_schema.py` - Initial database schema

## Important Notes

1. **TimescaleDB**: The initial migration sets up TimescaleDB hypertables for `gaze_events` and `browser_telemetry`
2. **pgvector**: Vector embeddings are configured for `ai_answer_cache` table with 384 dimensions
3. **Retention Policies**: 30-day retention is configured for time-series data
4. **Compression**: Data older than 7 days is automatically compressed

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (overrides alembic.ini)
- Example: `postgresql://blockd_user:password@localhost:5432/blockd`

## Troubleshooting

### Extension not found
If you get errors about missing extensions, ensure they are installed:
```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;
```

### Permission denied
Ensure your database user has appropriate permissions:
```sql
GRANT ALL PRIVILEGES ON DATABASE blockd TO your_user;
GRANT ALL ON SCHEMA public TO your_user;
```
