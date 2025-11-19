# Blockd Database Documentation

Complete PostgreSQL database schema and utilities for the Blockd interview monitoring platform.

## 📊 Overview

The Blockd database is designed to support:
- **High-frequency inserts** for real-time detection events (using TimescaleDB)
- **Real-time queries** for live dashboards and monitoring
- **Analytical reporting** for session analytics and insights
- **AI/LLM response caching** for similarity detection

## 🏗️ Architecture

### Technology Stack

- **PostgreSQL 15.x** - Primary database
- **TimescaleDB** - Time-series optimization for detection_events
- **pgvector** - Vector embeddings for AI similarity detection
- **Alembic** - Database migration management
- **psycopg2** - Python database adapter with connection pooling

### Database Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- Cryptographic functions
CREATE EXTENSION IF NOT EXISTS "timescaledb";  -- Time-series optimization
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Fuzzy text search
CREATE EXTENSION IF NOT EXISTS "vector";       -- AI embeddings (pgvector)
```

## 📐 Entity Relationship Diagram

```
┌─────────────────────┐
│   organizations     │
│─────────────────────│
│ id (PK)             │
│ name                │
│ slug (unique)       │
│ subscription_tier   │
│ max_monthly_sessions│
│ settings (JSONB)    │
└──────────┬──────────┘
           │
           │ 1:N
           │
┌──────────▼──────────┐        ┌─────────────────────┐
│       users         │        │     sessions        │
│─────────────────────│        │─────────────────────│
│ id (PK)             │◄──────┬│ id (PK)             │
│ email (unique)      │ N:1   ││ interviewer_id (FK) │
│ password_hash       │       │├ interviewee_id (FK) │
│ full_name           │       ││ organization_id (FK)│───┐
│ role                │       ││ session_token       │   │
│ organization_id (FK)│───────┘│ status              │   │
│ metadata (JSONB)    │        │ detection_settings  │   │
└─────────────────────┘        └──────────┬──────────┘   │
                                          │              │
                                          │ 1:N          │ 1:N
                                          │              │
                         ┌────────────────┼──────────────┼───────────┐
                         │                │              │           │
                         │                │              │           │
              ┌──────────▼──────────┐  ┌──▼─────────┐ ┌─▼─────────┐ │
              │  detection_events   │  │   alerts   │ │ session_  │ │
              │  (TimescaleDB)      │  │            │ │ analytics │ │
              │─────────────────────│  │────────────│ │───────────│ │
              │ id (PK)             │  │ id (PK)    │ │ id (PK)   │ │
              │ session_id (FK)     │  │ session_id │ │ session_id│ │
              │ event_type          │  │ alert_type │ │ risk_score│ │
              │ timestamp (PK)      │  │ severity   │ │ metrics   │ │
              │ confidence_score    │  │ triggered_ │ └───────────┘ │
              │ event_data (JSONB)  │  │   at       │               │
              │ severity            │  └────────────┘               │
              └─────────────────────┘                               │
                                                                    │
                                       ┌────────────────────────────┘
                                       │
                                ┌──────▼──────┐
                                │  ai_cache   │
                                │─────────────│
                                │ id (PK)     │
                                │ question_   │
                                │   hash      │
                                │ response_   │
                                │   embedding │
                                │   (vector)  │
                                └─────────────┘
```

## 📋 Table Descriptions

### 1. **organizations**

Companies and teams using the Blockd platform.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Organization name |
| `slug` | VARCHAR(100) | URL-friendly identifier (unique) |
| `subscription_tier` | VARCHAR(50) | free, pro, enterprise |
| `max_monthly_sessions` | INTEGER | Session limit per month |
| `settings` | JSONB | Organization-specific configuration |

**Indexes:**
- Primary key on `id`
- Unique index on `slug`
- Index on `subscription_tier`

---

### 2. **users**

All user accounts: interviewers, interviewees, and administrators.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `email` | VARCHAR(255) | Unique email address |
| `password_hash` | VARCHAR(255) | Hashed password (SHA-256) |
| `full_name` | VARCHAR(255) | User's full name |
| `role` | VARCHAR(50) | interviewer, interviewee, admin |
| `organization_id` | UUID | Foreign key to organizations |
| `last_login_at` | TIMESTAMPTZ | Last login timestamp |
| `is_active` | BOOLEAN | Account status |
| `metadata` | JSONB | User preferences, profile data |

**Indexes:**
- Primary key on `id`
- Unique index on `email`
- Index on `organization_id`
- GIN index on `full_name` for fuzzy search

---

### 3. **sessions**

Individual interview sessions with monitoring settings.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `interviewer_id` | UUID | Foreign key to users |
| `interviewee_id` | UUID | Foreign key to users (nullable) |
| `organization_id` | UUID | Foreign key to organizations |
| `session_token` | VARCHAR(255) | Unique token for browser extension auth |
| `status` | VARCHAR(50) | scheduled, active, completed, cancelled |
| `scheduled_start_time` | TIMESTAMPTZ | Planned start time |
| `actual_start_time` | TIMESTAMPTZ | Actual start time |
| `end_time` | TIMESTAMPTZ | Session end time |
| `duration_seconds` | INTEGER | Auto-calculated duration |
| `detection_settings` | JSONB | Monitoring configuration |
| `interview_url` | TEXT | Google Meet/Zoom link |

**Indexes:**
- Primary key on `id`
- Unique index on `session_token`
- Indexes on `interviewer_id`, `interviewee_id`, `organization_id`, `status`

**Triggers:**
- Auto-update `updated_at` on modification
- Auto-calculate `duration_seconds` on completion

---

### 4. **detection_events** (TimescaleDB Hypertable)

Time-series table storing all detection events.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL | Auto-incrementing ID |
| `session_id` | UUID | Foreign key to sessions |
| `event_type` | VARCHAR(50) | eye_tracking, keystroke, ai_similarity, etc. |
| `timestamp` | TIMESTAMPTZ | Event timestamp (partition key) |
| `confidence_score` | NUMERIC(4,3) | ML confidence (0-1) |
| `event_data` | JSONB | Event-specific payload |
| `severity` | VARCHAR(20) | low, medium, high, critical |
| `is_false_positive` | BOOLEAN | Manual review flag |
| `reviewed_by` | UUID | Foreign key to users |
| `reviewed_at` | TIMESTAMPTZ | Review timestamp |

**Primary Key:** Composite `(timestamp, id)`

**TimescaleDB Configuration:**
- Hypertable partitioned by `timestamp`
- Chunk interval: 1 day
- Retention policy: 90 days (configurable)

**Indexes:**
- Index on `(session_id, timestamp DESC)`
- Index on `(event_type, timestamp DESC)`
- GIN index on `event_data`

**Event Types:**
- `eye_tracking` - Gaze tracking data
- `keystroke` - Typing pattern analysis
- `screen_change` - Monitor/window switches
- `ai_similarity` - Detected AI-generated responses
- `multi_monitor` - Multiple display detection
- `tab_switch` - Browser tab changes
- `window_blur` - Focus loss events

---

### 5. **alerts**

High-level alerts generated from detection event patterns.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `session_id` | UUID | Foreign key to sessions |
| `alert_type` | VARCHAR(50) | Type of alert |
| `title` | VARCHAR(255) | Alert title |
| `description` | TEXT | Detailed description |
| `severity` | VARCHAR(20) | low, medium, high, critical |
| `triggered_at` | TIMESTAMPTZ | Alert creation time |
| `acknowledged_at` | TIMESTAMPTZ | When alert was acknowledged |
| `acknowledged_by` | UUID | Foreign key to users |
| `related_event_ids` | BIGINT[] | Array of detection_event IDs |
| `metadata` | JSONB | Additional alert data |

**Indexes:**
- Primary key on `id`
- Index on `(session_id, triggered_at DESC)`
- Index on `severity` where not acknowledged

---

### 6. **session_analytics**

Pre-computed analytics and risk scores for sessions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `session_id` | UUID | Foreign key to sessions (unique) |
| `total_events_detected` | INTEGER | Total event count |
| `high_severity_events` | INTEGER | High severity count |
| `critical_severity_events` | INTEGER | Critical severity count |
| `avg_eye_tracking_confidence` | NUMERIC(4,3) | Average eye tracking score |
| `suspicious_keystroke_patterns` | INTEGER | Suspicious typing count |
| `ai_similarity_incidents` | INTEGER | AI detection count |
| `screen_switches` | INTEGER | Screen change count |
| `overall_risk_score` | NUMERIC(4,3) | Composite risk (0-1) |
| `risk_category` | VARCHAR(20) | low, medium, high, critical |
| `calculated_at` | TIMESTAMPTZ | Last calculation time |
| `raw_metrics` | JSONB | Additional metrics |

**Indexes:**
- Primary key on `id`
- Unique index on `session_id`
- Index on `(risk_category, overall_risk_score DESC)`

---

### 7. **ai_cache**

Cache for AI/LLM responses to detect answer reuse.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `question_hash` | VARCHAR(64) | SHA-256 of normalized question |
| `question_text` | TEXT | Original question |
| `model_name` | VARCHAR(100) | AI model used (gpt-4, claude-3, etc.) |
| `response_embedding` | VECTOR(1536) | OpenAI embedding for similarity |
| `response_text` | TEXT | Cached response |
| `created_at` | TIMESTAMPTZ | Cache entry creation |
| `last_accessed_at` | TIMESTAMPTZ | Last access time |
| `access_count` | INTEGER | Number of cache hits |
| `metadata` | JSONB | Additional cache data |

**Indexes:**
- Primary key on `id`
- Unique index on `question_hash`
- IVFFlat index on `response_embedding` for vector similarity

**Triggers:**
- Auto-update `last_accessed_at` and increment `access_count` on read

---

## 🔍 Views

### v_active_sessions

Active and scheduled sessions with denormalized user information.

```sql
SELECT * FROM v_active_sessions WHERE organization_id = ?;
```

### v_session_summary

Session overview with aggregated analytics and alert counts.

```sql
SELECT * FROM v_session_summary WHERE id = ?;
```

---

## 🚀 Quick Start

### 1. Setup with Docker

```yaml
# docker-compose.yml
services:
  postgres:
    image: timescale/timescaledb-ha:pg15
    environment:
      POSTGRES_USER: blockd
      POSTGRES_PASSWORD: password
      POSTGRES_DB: blockd_db
    volumes:
      - ./database/init.sql:/docker-entrypoint-initdb.d/01-init.sql
      - ./database/schema.sql:/docker-entrypoint-initdb.d/02-schema.sql
      - ./database/permissions.sql:/docker-entrypoint-initdb.d/03-permissions.sql
    ports:
      - "5432:5432"
```

```bash
docker-compose up -d
```

### 2. Run Migrations with Alembic

```bash
cd database/migrations
export BLOCKD_DATABASE_URL="postgresql://blockd:password@localhost:5432/blockd_db"
alembic upgrade head
```

### 3. Seed Test Data

```bash
cd database/seeds
python seed_data.py
```

Test credentials:
- Admin: `admin@blockd.ai` / `admin123`
- All users: `password123`

### 4. Test Connection

```bash
python database/connection.py
```

---

## 🛠️ Using the Connection Utility

### Basic Usage

```python
from database.connection import get_db_cursor, RealDictCursor

# Simple query with dictionary cursor
with get_db_cursor(cursor_factory=RealDictCursor) as cur:
    cur.execute("SELECT * FROM users WHERE email = %s", ('admin@blockd.ai',))
    user = cur.fetchone()
    print(user['full_name'])  # Dictionary access
```

### Using Query Helper

```python
from database.connection import DatabaseQueryHelper

# Execute SELECT query
users = DatabaseQueryHelper.execute_query(
    "SELECT * FROM users WHERE organization_id = %s",
    (org_id,)
)

# Insert with RETURNING
new_user = DatabaseQueryHelper.execute_insert(
    """
    INSERT INTO users (email, password_hash, full_name, role, organization_id)
    VALUES (%s, %s, %s, %s, %s)
    RETURNING id, email
    """,
    (email, password_hash, name, role, org_id),
    returning=True
)
```

---

## 📊 Common Query Examples

### Get Active Sessions

```sql
-- From queries/common_queries.sql
SELECT
    s.id,
    s.status,
    s.actual_start_time,
    i.full_name as interviewer_name,
    ie.full_name as interviewee_name
FROM sessions s
JOIN users i ON s.interviewer_id = i.id
LEFT JOIN users ie ON s.interviewee_id = ie.id
WHERE s.status IN ('scheduled', 'active')
ORDER BY s.scheduled_start_time ASC;
```

### Get Session Analytics

```sql
-- From queries/analytics_queries.sql
SELECT
    sa.overall_risk_score,
    sa.risk_category,
    sa.total_events_detected,
    COUNT(a.id) as alert_count
FROM session_analytics sa
LEFT JOIN alerts a ON a.session_id = sa.session_id
WHERE sa.session_id = $1
GROUP BY sa.id;
```

See `database/queries/` for more examples.

---

## 🔒 Security Considerations

1. **Password Hashing**: Use SHA-256 (currently) or bcrypt for production
2. **Connection Pooling**: Max 20 connections per application instance
3. **Row-Level Security**: Can be enabled in production for multi-tenancy
4. **API User Permissions**: Limited to SELECT, INSERT, UPDATE, DELETE (no DDL)
5. **Read-Only User**: Separate `blockd_readonly` for analytics/reporting

---

## 📈 Performance Optimization

### TimescaleDB Optimizations

```sql
-- Retention policy (auto-delete old events)
SELECT add_retention_policy('detection_events', INTERVAL '90 days');

-- Compression (save disk space)
ALTER TABLE detection_events SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'session_id'
);

SELECT add_compression_policy('detection_events', INTERVAL '7 days');
```

### Continuous Aggregates (Materialized Views)

```sql
CREATE MATERIALIZED VIEW session_hourly_stats
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS hour,
    session_id,
    COUNT(*) as event_count,
    AVG(confidence_score) as avg_confidence
FROM detection_events
GROUP BY hour, session_id;
```

---

## 🧪 Testing

### Unit Tests

```bash
cd database/tests
pytest test_schema.py -v
```

### Load Testing

```bash
# Generate 10,000 events for a session
python database/seeds/generate_test_events.py <session_id> --count 10000
```

---

## 📦 Dependencies

See `database/requirements.txt`:

```txt
psycopg2-binary==2.9.9
alembic==1.12.1
Faker==20.1.0
SQLAlchemy==2.0.23
```

Install:

```bash
pip install -r database/requirements.txt
```

---

## 🔄 Migration Workflow

### Create New Migration

```bash
cd database/migrations
alembic revision -m "add_user_avatar_column"
```

Edit the generated file in `versions/`:

```python
def upgrade():
    op.add_column('users', sa.Column('avatar_url', sa.String(255)))

def downgrade():
    op.drop_column('users', 'avatar_url')
```

### Apply Migration

```bash
alembic upgrade head
```

### Rollback Migration

```bash
alembic downgrade -1
```

---

## 📝 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BLOCKD_DATABASE_URL` | Full PostgreSQL connection string | `postgresql://blockd:password@localhost:5432/blockd_db` |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `DB_NAME` | Database name | `blockd_db` |
| `DB_USER` | Database user | `blockd` |
| `DB_PASSWORD` | Database password | `password` |
| `DB_POOL_MIN` | Minimum pool connections | `2` |
| `DB_POOL_MAX` | Maximum pool connections | `20` |
| `DB_CONNECT_TIMEOUT` | Connection timeout (seconds) | `10` |

---

## 🎯 Integration with Other Agents

This database layer is used by:

- **Agent 6 (Authentication)**: `users`, `sessions` tables
- **Agent 7 (WebSocket)**: `sessions`, `detection_events` tables
- **Agents 8-11 (Detection Systems)**: Insert into `detection_events`
- **Agent 12 (Analytics)**: `session_analytics`, all tables for reporting
- **Agents 14-16 (Frontend)**: All tables via REST API

Connection string for other agents:

```
postgresql://blockd_app:changeme_in_production@postgres:5432/blockd_db
```

---

## 📞 Support

For database issues or questions:
1. Check logs: `docker logs blockd_postgres`
2. Review migrations: `alembic history`
3. Test connection: `python database/connection.py`

---

## 📄 License

Part of the Blockd project. See main README for license information.
