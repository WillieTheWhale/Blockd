# Blockd Database Infrastructure

**Agent 1: Database Architect**
**PostgreSQL 18.1 + TimescaleDB 2.x + pgvector 0.7.x**
**Created: 2025-11-24**

## Overview

This directory contains the complete production-grade database infrastructure for the Blockd platform, including:

- ✅ Complete PostgreSQL schema with 11 tables
- ✅ TimescaleDB hypertables for time-series data (gaze events, browser telemetry)
- ✅ pgvector integration for AI answer similarity detection
- ✅ Alembic migrations for version control
- ✅ Comprehensive seed data for testing
- ✅ Automated initialization scripts

## Quick Start

### 1. Prerequisites

Install the following on your system:

```bash
# PostgreSQL 18.1
sudo apt install postgresql-18  # Ubuntu/Debian
# or
brew install postgresql@18      # macOS

# TimescaleDB extension
sudo apt install postgresql-18-timescaledb  # Ubuntu/Debian
# or follow: https://docs.timescale.com/install/latest/

# pgvector extension
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make && sudo make install
```

### 2. Initialize Database

```bash
cd /home/user/Blockd/database
./init.sh
```

This will:
- Create the `blockd` database
- Install required extensions (uuid-ossp, vector, timescaledb, pgcrypto)
- Apply complete schema with tables, indexes, triggers, views, and functions
- Create application user with appropriate permissions
- Load seed data (organizations, users, sample sessions)

### 3. Verify Installation

```bash
# Connect to database
psql -d blockd

# Check tables
\dt

# Check extensions
\dx

# Check TimescaleDB hypertables
SELECT * FROM timescaledb_information.hypertables;

# Check pgvector embeddings
SELECT tablename, attname FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_type t ON a.atttypid = t.oid
WHERE t.typname = 'vector';
```

## Directory Structure

```
database/
├── schema.sql                      # Complete database schema (550 lines)
├── init.sh                         # Database initialization script
├── test_schema.sh                  # Schema validation tests
├── alembic.ini                     # Alembic configuration
├── migrations/
│   ├── README.md                   # Migration instructions
│   ├── env.py                      # Alembic environment
│   ├── script.py.mako              # Migration template
│   └── versions/
│       └── 20251124_0000_001_initial_schema.py
└── seeds/
    ├── README.md                   # Seed data documentation
    ├── 01_seed_organizations.sql   # 3 test organizations
    ├── 02_seed_users.sql           # 6 test users
    ├── 03_seed_ai_cache.sql        # 6 AI answer cache entries
    ├── 04_seed_sample_sessions.sql # 3 sample sessions + telemetry
    └── seed_all.sh                 # Run all seeds
```

## Database Schema

### Tables (11 total)

1. **organizations** - Organization accounts and subscription tiers
2. **users** - User accounts with authentication (admin, interviewer, interviewee)
3. **interview_sessions** - Interview session lifecycle tracking
4. **security_events** - Security monitoring events
5. **questions** - Interview questions
6. **ai_answer_cache** - AI-generated answers with vector embeddings
7. **answer_analysis** - AI detection analysis results
8. **gaze_events** ⏱️ - TimescaleDB hypertable for eye tracking data
9. **browser_telemetry** ⏱️ - TimescaleDB hypertable for browser monitoring
10. **session_reports** - Final session analysis reports
11. **audit_logs** - User action audit trail

### Indexes (31 total)

- **B-tree indexes**: Fast lookups and range queries
- **IVFFlat vector index**: Cosine similarity search for AI detection
- **TimescaleDB indexes**: Optimized time-series queries

### Views (3 total)

- `active_sessions` - Currently active interview sessions
- `session_analytics` - Aggregated session metrics
- `high_risk_sessions` - Sessions with risk score ≥ 0.75

### Functions (5 total)

- `get_session_risk_summary()` - Session risk analysis
- `find_similar_ai_answers()` - Vector similarity search
- `generate_session_token()` - Auto-generate session tokens
- `calculate_session_duration()` - Auto-calculate duration
- `update_updated_at_column()` - Auto-update timestamps

## TimescaleDB Configuration

### Hypertables

- **gaze_events**: Partitioned by timestamp (1-day chunks)
- **browser_telemetry**: Partitioned by timestamp (1-day chunks)

### Data Retention

- Automatic deletion after **30 days**
- Compression enabled after **7 days**
- Expected 10-20x compression ratio

### Compression

```sql
-- Segment by session_id for efficient queries
-- Order by timestamp DESC for time-range queries
```

## pgvector Configuration

### Vector Embeddings

- **Dimensions**: 384 (compatible with sentence-transformers)
- **Model**: all-MiniLM-L6-v2 (recommended)
- **Index Type**: IVFFlat with cosine distance
- **Performance**: Sub-second similarity search on 100k+ vectors

### Similarity Search Example

```sql
-- Find similar AI answers
SELECT * FROM find_similar_ai_answers(
    (SELECT embedding FROM ai_answer_cache WHERE id = 'some-uuid'),
    10,  -- limit
    0.8  -- similarity threshold
);
```

## Seed Data

### Test Users (All passwords: `Blockd2025!`)

| Email | Role | Organization | MFA |
|-------|------|--------------|-----|
| admin@blockd.com | admin | Blockd Demo Corp | ✓ |
| interviewer1@blockd.com | interviewer | Blockd Demo Corp | ✗ |
| interviewer2@techstartup.com | interviewer | Tech Startup Inc | ✓ |
| john.doe@blockd.com | interviewer | Enterprise Solutions Ltd | ✗ |
| interviewee1@example.com | interviewee | None | ✗ |
| interviewee2@example.com | interviewee | None | ✗ |

### Organizations

- **Blockd Demo Corp** (Free): 5 concurrent, 100/month
- **Tech Startup Inc** (Professional): 25 concurrent, 500/month
- **Enterprise Solutions Ltd** (Enterprise): 100 concurrent, unlimited

### Sample Sessions

- 1 completed session (low risk: 0.15)
- 1 active session (medium risk: 0.68)
- 1 scheduled session (future)

## Connection Information

### Environment Variables

```bash
export DATABASE_URL="postgresql://blockd_app:blockd_secure_password_2025@localhost:5432/blockd"

# Or individually:
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=blockd
export DB_USER=blockd_app
export DB_PASSWORD=blockd_secure_password_2025
```

### Connection Pooling (Recommended)

```javascript
// Node.js with pg
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: 5,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

```python
# Python with psycopg2
import psycopg2.pool
pool = psycopg2.pool.SimpleConnectionPool(
    minconn=5,
    maxconn=20,
    dsn=os.environ['DATABASE_URL']
)
```

## Migrations

### Using Alembic

```bash
# Upgrade to latest
cd database
alembic upgrade head

# Downgrade one version
alembic downgrade -1

# Create new migration
alembic revision -m "add new column"

# Show current version
alembic current

# Show history
alembic history
```

### Using schema.sql directly

```bash
# Apply schema
psql -d blockd -f database/schema.sql

# Drop and recreate
psql -c "DROP DATABASE blockd;"
psql -c "CREATE DATABASE blockd;"
psql -d blockd -f database/schema.sql
```

## Testing

### Run Schema Tests

```bash
cd database
./test_schema.sh
```

Expected output:
```
✓ All tests passed!
Database schema is ready for deployment
```

### Manual Testing

```sql
-- Test TimescaleDB
SELECT * FROM timescaledb_information.hypertables;

-- Test pgvector
SELECT * FROM ai_answer_cache WHERE embedding IS NOT NULL LIMIT 5;

-- Test vector similarity
SELECT
    question_text,
    1 - (embedding <=> (SELECT embedding FROM ai_answer_cache LIMIT 1)) AS similarity
FROM ai_answer_cache
ORDER BY embedding <=> (SELECT embedding FROM ai_answer_cache LIMIT 1)
LIMIT 5;

-- Test session analytics view
SELECT * FROM session_analytics;

-- Test risk summary function
SELECT * FROM get_session_risk_summary('20000000-0000-0000-0000-000000000001');
```

## Performance Optimization

### Query Performance Targets

- Simple lookups (by ID): **< 5ms**
- Indexed queries: **< 50ms**
- Vector similarity search: **< 500ms**
- Time-series aggregations: **< 200ms**

### Optimization Tips

1. **Always use indexes**: Check query plans with `EXPLAIN ANALYZE`
2. **Batch inserts**: Use `COPY` or bulk `INSERT` for large datasets
3. **Connection pooling**: Reuse connections, avoid per-request connections
4. **Query optimization**: Use prepared statements and parameterized queries
5. **TimescaleDB compression**: Automatically compresses data after 7 days

## Security

### Permissions

- **postgres** (superuser): Schema creation and migrations
- **blockd_app** (application): SELECT, INSERT, UPDATE, DELETE on tables
- **Read-only user** (optional): SELECT only for reporting/analytics

### Best Practices

1. ✅ Use bcrypt for password hashing (cost factor 10+)
2. ✅ Always use SSL connections in production
3. ✅ Store credentials in environment variables or secret manager
4. ✅ Enable audit logging for compliance
5. ✅ Regular backups with point-in-time recovery
6. ✅ Monitor for suspicious queries and slow queries

## Backup & Recovery

### Backup

```bash
# Full database backup
pg_dump -Fc blockd > blockd_backup_$(date +%Y%m%d).dump

# Schema only
pg_dump -s blockd > blockd_schema.sql

# Data only
pg_dump -a blockd > blockd_data.sql
```

### Restore

```bash
# Restore from custom format
pg_restore -d blockd blockd_backup_20251124.dump

# Restore from SQL
psql -d blockd -f blockd_backup.sql
```

## Monitoring

### Key Metrics to Monitor

- Connection pool utilization
- Query performance (slow query log)
- Table sizes and growth rate
- Index usage statistics
- TimescaleDB chunk compression status
- Replication lag (if using replicas)

### Useful Queries

```sql
-- Table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan AS scans,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Slow queries
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

## Troubleshooting

### Extension not found

```bash
# Check available extensions
psql -c "SELECT * FROM pg_available_extensions WHERE name IN ('timescaledb', 'vector');"

# Install TimescaleDB
sudo apt install postgresql-18-timescaledb

# Install pgvector
cd /tmp
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make && sudo make install
```

### Connection refused

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql

# Check if listening
sudo netstat -tlnp | grep 5432
```

### Permission denied

```sql
-- Grant all permissions to app user
GRANT ALL PRIVILEGES ON DATABASE blockd TO blockd_app;
GRANT ALL ON SCHEMA public TO blockd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO blockd_app;
```

## Documentation

- **Schema Documentation**: `/docs/agent1-database-schema.json`
- **Migration Guide**: `/database/migrations/README.md`
- **Seed Data Guide**: `/database/seeds/README.md`

## Next Steps for Other Agents

### Agent 2 (Redis & Cache Infrastructure)
- Cache session data from `interview_sessions` table
- Cache AI answer results from `ai_answer_cache` table
- Implement rate limiting with Redis

### Agent 5 (API Gateway)
- Connect to database using `DATABASE_URL`
- Implement connection pooling
- Create endpoints for CRUD operations

### Agent 6 (Authentication Service)
- Query `users` table for authentication
- Validate bcrypt password hashes
- Implement MFA with `mfa_secret` field

### Agent 9 (AI Detection Service)
- Query `ai_answer_cache` for similarity detection
- Use `find_similar_ai_answers()` function
- Store results in `answer_analysis` table

### Agent 10 (Eye Tracking Service)
- Insert gaze data into `gaze_events` hypertable
- Use batch inserts for performance
- Query with TimescaleDB time-based functions

## Support

For database-related questions, contact **Agent 1: Database Architect** or refer to the comprehensive documentation in `/docs/agent1-database-schema.json`.

---

**Database Infrastructure Created**: 2025-11-24
**Version**: 1.0.0
**Status**: ✅ Production Ready
