# Blockd Platform Database Documentation

**Version**: 1.0.0
**Created**: 2025-11-24
**Status**: Production Ready
**Agent**: Agent 1: Database Architect

---

## Table of Contents

1. [Overview](#overview)
2. [Connection Configuration](#connection-configuration)
3. [Database Tables](#database-tables)
4. [Entity Relationships](#entity-relationships)
5. [Indexes and Query Performance](#indexes-and-query-performance)
6. [TimescaleDB Configuration](#timescaledb-configuration)
7. [pgvector Setup](#pgvector-setup)
8. [Enums and Data Types](#enums-and-data-types)
9. [Views and Functions](#views-and-functions)
10. [Migration Instructions](#migration-instructions)
11. [Seed Data](#seed-data)
12. [Setup Checklist](#setup-checklist)

---

## Overview

The Blockd platform database is built on **PostgreSQL 18.1** with advanced extensions for time-series data and AI-powered vector search. This database supports high-security interview sessions with comprehensive monitoring, AI detection, and analytics.

### Key Features

- **PostgreSQL 18.1**: Reliable, scalable relational database
- **TimescaleDB 2.x**: Optimized time-series data for eye tracking and browser telemetry
- **pgvector 0.7.x**: Vector similarity search for AI answer detection
- **Connection Pooling**: Recommended 5-20 concurrent connections
- **Audit Logging**: Complete audit trail of all user actions
- **Data Retention**: Automatic cleanup of time-series data after 30 days

### Extensions

| Extension | Version | Purpose |
|-----------|---------|---------|
| `uuid-ossp` | Latest | UUID generation functions |
| `pgvector` | 0.7.x | Vector similarity search for AI answer detection |
| `timescaledb` | 2.x | Time-series data optimization for gaze events and telemetry |
| `pgcrypto` | Latest | Cryptographic functions for secure token generation |

---

## Connection Configuration

### Connection String Format

```
postgresql://user:password@host:port/database
```

### Default Connection

```
postgresql://blockd_app:blockd_secure_password_2025@localhost:5432/blockd
```

### Environment Variables

Set these in your application environment:

```bash
# Primary connection string
export DATABASE_URL="postgresql://blockd_app:blockd_secure_password_2025@localhost:5432/blockd"

# Or individually:
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=blockd
export DB_USER=blockd_app
export DB_PASSWORD=blockd_secure_password_2025
```

### Connection Pooling Configuration

**Recommended settings** for production:

```javascript
// Node.js with pg
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: 5,              // Minimum idle connections
  max: 20,             // Maximum connections
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

**Connection Pool Parameters**:
- `min_connections`: 5
- `max_connections`: 20
- `connection_timeout`: 30000ms
- `pooling`: Recommended for all environments

---

## Database Tables

### Table Summary

The database includes **11 tables** (2 hypertables + 9 standard tables) totaling approximately 40+ indexes.

| # | Table | Type | Purpose |
|---|-------|------|---------|
| 1 | `organizations` | Standard | Organization accounts and subscription tiers |
| 2 | `users` | Standard | User accounts with authentication |
| 3 | `interview_sessions` | Standard | Interview session lifecycle tracking |
| 4 | `security_events` | Standard | Security monitoring events |
| 5 | `questions` | Standard | Interview questions |
| 6 | `ai_answer_cache` | Standard | AI-generated answers with vector embeddings |
| 7 | `answer_analysis` | Standard | AI detection analysis results |
| 8 | `gaze_events` | Hypertable | Eye tracking data (time-series) |
| 9 | `browser_telemetry` | Hypertable | Browser monitoring data (time-series) |
| 10 | `session_reports` | Standard | Final session analysis reports |
| 11 | `audit_logs` | Standard | User action audit trail |

### Detailed Table Schemas

#### 1. organizations

Stores organization information and subscription details.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `uuid_generate_v4()` | Primary key |
| name | VARCHAR(255) | NO | - | Organization name |
| subscription_tier | subscription_tier ENUM | NO | `'free'` | Subscription level (free, professional, enterprise) |
| settings | JSONB | YES | `'{}'` | Organization-specific settings |
| max_concurrent_sessions | INTEGER | YES | 5 | Maximum concurrent sessions allowed |
| monthly_session_limit | INTEGER | YES | 100 | Monthly session limit |
| created_at | TIMESTAMPTZ | NO | `NOW()` | Created timestamp |
| updated_at | TIMESTAMPTZ | NO | `NOW()` | Updated timestamp |
| deleted_at | TIMESTAMPTZ | YES | - | Soft delete timestamp |

**Indexes**: `idx_organizations_tier` (subscription_tier)

**Relationships**:
- Has many: `users`
- Has many: `interview_sessions`

---

#### 2. users

Stores user accounts with authentication and MFA support.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `uuid_generate_v4()` | Primary key |
| email | VARCHAR(255) | NO | - | Email address (UNIQUE) |
| password_hash | VARCHAR(255) | NO | - | bcrypt hashed password |
| role | user_role ENUM | NO | `'interviewee'` | User role (admin, interviewer, interviewee) |
| organization_id | UUID | YES | - | FK to organizations.id |
| first_name | VARCHAR(100) | YES | - | First name |
| last_name | VARCHAR(100) | YES | - | Last name |
| mfa_enabled | BOOLEAN | YES | false | Multi-factor authentication enabled |
| mfa_secret | VARCHAR(255) | YES | - | MFA secret (TOTP) |
| email_verified | BOOLEAN | YES | false | Email verification status |
| last_login_at | TIMESTAMPTZ | YES | - | Last login timestamp |
| created_at | TIMESTAMPTZ | NO | `NOW()` | Created timestamp |
| updated_at | TIMESTAMPTZ | NO | `NOW()` | Updated timestamp |
| deleted_at | TIMESTAMPTZ | YES | - | Soft delete timestamp |

**Indexes**:
- `idx_users_email` (email)
- `idx_users_organization` (organization_id)
- `idx_users_role` (role)

**Relationships**:
- Belongs to: `organizations`
- Has many: `interview_sessions` (as interviewer)
- Has many: `interview_sessions` (as interviewee, optional)

---

#### 3. interview_sessions

Tracks all interview sessions with status and metadata.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `uuid_generate_v4()` | Primary key |
| interviewer_id | UUID | NO | - | FK to users.id |
| interviewee_id | UUID | YES | - | FK to users.id (optional) |
| interviewee_email | VARCHAR(255) | YES | - | Interviewee email (for invited participants) |
| organization_id | UUID | NO | - | FK to organizations.id |
| status | session_status ENUM | NO | `'scheduled'` | Session status |
| session_token | VARCHAR(255) | YES | - | Auto-generated unique token |
| scheduled_start | TIMESTAMPTZ | YES | - | Scheduled start time |
| actual_start | TIMESTAMPTZ | YES | - | Actual start time |
| actual_end | TIMESTAMPTZ | YES | - | Actual end time |
| duration_minutes | INTEGER | YES | - | Auto-calculated duration |
| risk_score | DECIMAL(5,4) | YES | - | Overall risk score (0-1) |
| video_url | TEXT | YES | - | Video recording URL |
| recording_url | TEXT | YES | - | Recording URL |
| metadata | JSONB | YES | `'{}'` | Additional session metadata |
| created_at | TIMESTAMPTZ | NO | `NOW()` | Created timestamp |
| updated_at | TIMESTAMPTZ | NO | `NOW()` | Updated timestamp |

**Indexes**:
- `idx_sessions_interviewer` (interviewer_id)
- `idx_sessions_interviewee` (interviewee_id)
- `idx_sessions_org_status` (organization_id, status) - COMPOSITE
- `idx_sessions_status` (status)
- `idx_sessions_scheduled_start` (scheduled_start)
- `idx_sessions_token` (session_token)

**Triggers**:
- `generate_interview_session_token` - Auto-generate session token before insert
- `calculate_interview_duration` - Auto-calculate duration before update

**Relationships**:
- Belongs to: `organizations`
- Belongs to: `users` (interviewer)
- Belongs to: `users` (interviewee, optional)
- Has many: `questions`
- Has many: `security_events`
- Has many: `gaze_events` (hypertable)
- Has many: `browser_telemetry` (hypertable)
- Has one: `session_reports`

---

#### 4. security_events

Records security-related events during sessions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `uuid_generate_v4()` | Primary key |
| session_id | UUID | NO | - | FK to interview_sessions.id |
| event_type | security_event_type ENUM | NO | - | Type of security event |
| severity | severity_level ENUM | NO | `'medium'` | Severity level (low, medium, high, critical) |
| description | TEXT | YES | - | Event description |
| metadata | JSONB | YES | `'{}'` | Additional event metadata |
| timestamp | TIMESTAMPTZ | NO | `NOW()` | Event timestamp |
| created_at | TIMESTAMPTZ | NO | `NOW()` | Created timestamp |

**Indexes**:
- `idx_security_events_session` (session_id)
- `idx_security_events_session_time` (session_id, timestamp DESC) - COMPOSITE
- `idx_security_events_type` (event_type)
- `idx_security_events_severity` (severity)

**Relationships**:
- Belongs to: `interview_sessions`

---

#### 5. questions

Stores interview questions asked during sessions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `uuid_generate_v4()` | Primary key |
| session_id | UUID | NO | - | FK to interview_sessions.id |
| question_text | TEXT | NO | - | Question text |
| question_order | INTEGER | YES | - | Question order in session |
| expected_duration | INTEGER | YES | - | Expected answer duration (seconds) |
| difficulty | question_difficulty ENUM | YES | - | Question difficulty |
| asked_at | TIMESTAMPTZ | YES | - | When question was asked |
| created_at | TIMESTAMPTZ | NO | `NOW()` | Created timestamp |
| updated_at | TIMESTAMPTZ | NO | `NOW()` | Updated timestamp |

**Indexes**:
- `idx_questions_session` (session_id)
- `idx_questions_session_order` (session_id, question_order) - COMPOSITE

**Relationships**:
- Belongs to: `interview_sessions`
- Has many: `answer_analysis`

---

#### 6. ai_answer_cache

Caches AI-generated answers with vector embeddings for similarity search.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `uuid_generate_v4()` | Primary key |
| question_hash | VARCHAR(64) | NO | - | SHA256 hash of question |
| question_text | TEXT | NO | - | Full question text |
| model_name | ai_model_name ENUM | NO | - | AI model used |
| answer_text | TEXT | NO | - | Generated answer |
| embedding | vector(384) | YES | - | 384-dimensional vector embedding |
| perplexity_score | DECIMAL(10,6) | YES | - | Perplexity score of answer |
| token_count | INTEGER | YES | - | Token count of answer |
| metadata | JSONB | YES | `'{}'` | Additional metadata |
| created_at | TIMESTAMPTZ | NO | `NOW()` | Created timestamp |

**Indexes**:
- `idx_ai_answer_cache_hash` (question_hash)
- `idx_ai_answer_cache_model` (model_name)
- `idx_ai_answer_embedding` (embedding) - IVFFlat vector index with cosine_ops, lists=100

**Constraints**:
- UNIQUE: (question_hash, model_name)

**Relationships**:
- Referenced by: `answer_analysis` for similarity comparison

---

#### 7. answer_analysis

Stores analysis results for interviewee answers.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `uuid_generate_v4()` | Primary key |
| question_id | UUID | NO | - | FK to questions.id |
| answer_text | TEXT | NO | - | Interviewee's answer |
| answer_audio_url | TEXT | YES | - | Audio recording URL |
| transcription_text | TEXT | YES | - | Transcribed answer text |
| risk_score | DECIMAL(5,4) | YES | - | AI detection risk score (0-1) |
| similarity_scores | JSONB | YES | `'{}'` | Model similarity scores {model_name: score} |
| response_timing | JSONB | YES | `'{}'` | Timing metrics {latency_ms, wpm, pause_count, filler_ratio} |
| perplexity_score | DECIMAL(10,6) | YES | - | Perplexity of answer text |
| is_ai_generated | BOOLEAN | YES | - | AI generation confidence flag |
| confidence_score | DECIMAL(5,4) | YES | - | Confidence in detection (0-1) |
| metadata | JSONB | YES | `'{}'` | Additional analysis metadata |
| analyzed_at | TIMESTAMPTZ | NO | `NOW()` | When analysis was performed |
| created_at | TIMESTAMPTZ | NO | `NOW()` | Created timestamp |

**Indexes**:
- `idx_answer_analysis_question` (question_id)
- `idx_answer_analysis_risk_score` (risk_score DESC)
- `idx_answer_analysis_ai_generated` (is_ai_generated)

**Relationships**:
- Belongs to: `questions`

---

#### 8. gaze_events (TimescaleDB Hypertable)

Eye tracking data with automatic time-series optimization.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | YES | `uuid_generate_v4()` | Event ID (optional) |
| session_id | UUID | NO | - | FK to interview_sessions.id |
| timestamp | TIMESTAMPTZ | NO | - | Event timestamp (PARTITION KEY) |
| gaze_x | DECIMAL(10,8) | YES | - | Gaze X coordinate (normalized 0-1) |
| gaze_y | DECIMAL(10,8) | YES | - | Gaze Y coordinate (normalized 0-1) |
| is_off_screen | BOOLEAN | YES | false | Whether gaze is off-screen |
| off_screen_direction | VARCHAR(20) | YES | - | Direction if off-screen (left, right, up, down) |
| confidence | DECIMAL(5,4) | YES | - | Eye tracking confidence (0-1) |
| pupil_diameter_left | DECIMAL(10,6) | YES | - | Left pupil diameter (mm) |
| pupil_diameter_right | DECIMAL(10,6) | YES | - | Right pupil diameter (mm) |
| metadata | JSONB | YES | `'{}'` | Additional metadata |

**Indexes**:
- `idx_gaze_events_session_time` (session_id, timestamp DESC) - COMPOSITE
- `idx_gaze_events_off_screen` (session_id, is_off_screen) - COMPOSITE

**Hypertable Configuration**:
- **Partition Key**: timestamp
- **Chunk Interval**: 1 day
- **Retention Policy**: 30 days (automatic deletion)
- **Compression**: Enabled after 7 days
- **Compression Ratio**: Expected 10-20x
- **Segment By**: session_id (for efficient session queries)
- **Order By**: timestamp DESC

**Relationships**:
- Belongs to: `interview_sessions`

---

#### 9. browser_telemetry (TimescaleDB Hypertable)

Browser monitoring data with automatic time-series optimization.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | YES | `uuid_generate_v4()` | Event ID (optional) |
| session_id | UUID | NO | - | FK to interview_sessions.id |
| timestamp | TIMESTAMPTZ | NO | - | Event timestamp (PARTITION KEY) |
| cpu_percent | DECIMAL(5,2) | YES | - | CPU usage percentage (0-100) |
| memory_mb | INTEGER | YES | - | Memory usage in MB |
| active_processes | JSONB | YES | `'[]'` | List of active processes |
| window_title | VARCHAR(500) | YES | - | Current window title |
| browser_tabs_count | INTEGER | YES | - | Number of open browser tabs |
| network_requests | JSONB | YES | `'[]'` | Network request metadata |
| metadata | JSONB | YES | `'{}'` | Additional metadata |

**Indexes**:
- `idx_browser_telemetry_session_time` (session_id, timestamp DESC) - COMPOSITE

**Hypertable Configuration**:
- **Partition Key**: timestamp
- **Chunk Interval**: 1 day
- **Retention Policy**: 30 days (automatic deletion)
- **Compression**: Enabled after 7 days
- **Compression Ratio**: Expected 10-20x
- **Segment By**: session_id (for efficient session queries)
- **Order By**: timestamp DESC

**Relationships**:
- Belongs to: `interview_sessions`

---

#### 10. session_reports

Stores final session analysis reports.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `uuid_generate_v4()` | Primary key |
| session_id | UUID | NO | - | FK to interview_sessions.id (UNIQUE) |
| overall_risk_score | DECIMAL(5,4) | YES | - | Final risk score (0-1) |
| ai_detection_score | DECIMAL(5,4) | YES | - | AI detection score (0-1) |
| gaze_anomaly_score | DECIMAL(5,4) | YES | - | Gaze anomaly score (0-1) |
| timing_anomaly_score | DECIMAL(5,4) | YES | - | Timing anomaly score (0-1) |
| security_events_count | INTEGER | YES | 0 | Total security events |
| recommendations | JSONB | YES | `'[]'` | Array of recommendations |
| detailed_analysis | JSONB | YES | `'{}'` | Detailed analysis object |
| generated_at | TIMESTAMPTZ | NO | `NOW()` | Report generation timestamp |
| created_at | TIMESTAMPTZ | NO | `NOW()` | Created timestamp |

**Indexes**:
- `idx_session_reports_session` (session_id)
- `idx_session_reports_risk_score` (overall_risk_score DESC)

**Relationships**:
- Belongs to: `interview_sessions` (one-to-one)

---

#### 11. audit_logs

Tracks all user actions for security and compliance.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | `uuid_generate_v4()` | Primary key |
| user_id | UUID | YES | - | FK to users.id |
| action | VARCHAR(100) | NO | - | Action performed (e.g., CREATE, UPDATE, DELETE) |
| resource_type | VARCHAR(100) | NO | - | Type of resource (e.g., session, user) |
| resource_id | UUID | YES | - | ID of resource affected |
| ip_address | INET | YES | - | IP address of request |
| user_agent | TEXT | YES | - | User agent string |
| metadata | JSONB | YES | `'{}'` | Additional audit metadata |
| timestamp | TIMESTAMPTZ | NO | `NOW()` | Action timestamp |
| created_at | TIMESTAMPTZ | NO | `NOW()` | Created timestamp |

**Indexes**:
- `idx_audit_logs_user` (user_id)
- `idx_audit_logs_resource` (resource_type, resource_id) - COMPOSITE
- `idx_audit_logs_timestamp` (timestamp DESC)
- `idx_audit_logs_action` (action)

**Relationships**:
- Belongs to: `users` (optional)

---

## Entity Relationships

### Entity Relationship Diagram (Text Format)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  organizations                                                      │
│  ├─ 1 ─────────────────→ * users                                   │
│  ├─ 1 ─────────────────→ * interview_sessions                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │                                    │
         │                                    │
    * ─────── 1                           * ─────── 1
    │                                         │
    │                                         │
    │                                     users
    │                                     (as interviewer)
    │
users ◄──────────────────────────────────┐
├─ 1 ──────────────────→ * interview_sessions (as interviewer_id)
├─ 0..1 ────────────────→ * interview_sessions (as interviewee_id, optional)
│
│
└─ relationships to other tables ──→
    │
    └─→ questions
    │   └─→ answer_analysis
    │
    └─→ security_events
    │
    └─→ gaze_events (hypertable)
    │
    └─→ browser_telemetry (hypertable)
    │
    └─→ session_reports (one-to-one)
    │
    └─→ audit_logs


interview_sessions (central hub)
│
├─ * ─────────────────────→ 1 organizations
├─ * ─────────────────────→ 1 users (interviewer)
├─ * ─────────────────────→ 0..1 users (interviewee, optional)
├─ 1 ─────────────────────→ * questions
│                           │
│                           └─→ * answer_analysis
│
├─ 1 ─────────────────────→ * security_events
├─ 1 ─────────────────────→ * gaze_events (hypertable)
├─ 1 ─────────────────────→ * browser_telemetry (hypertable)
└─ 1 ─────────────────────→ 0..1 session_reports
```

### Foreign Key Relationships Summary

| Relation | From Table | From Column | To Table | To Column | Type |
|----------|-----------|-------------|----------|-----------|------|
| FK_users_org | users | organization_id | organizations | id | Many-to-One |
| FK_sessions_org | interview_sessions | organization_id | organizations | id | Many-to-One |
| FK_sessions_interviewer | interview_sessions | interviewer_id | users | id | Many-to-One |
| FK_sessions_interviewee | interview_sessions | interviewee_id | users | id | Many-to-One (Optional) |
| FK_security_events_session | security_events | session_id | interview_sessions | id | Many-to-One |
| FK_questions_session | questions | session_id | interview_sessions | id | Many-to-One |
| FK_answer_analysis_question | answer_analysis | question_id | questions | id | Many-to-One |
| FK_gaze_events_session | gaze_events | session_id | interview_sessions | id | Many-to-One |
| FK_browser_telemetry_session | browser_telemetry | session_id | interview_sessions | id | Many-to-One |
| FK_session_reports_session | session_reports | session_id | interview_sessions | id | One-to-One |
| FK_audit_logs_user | audit_logs | user_id | users | id | Many-to-One (Optional) |

---

## Indexes and Query Performance

### Index Strategy

The database uses a multi-pronged indexing strategy to optimize different query patterns:

#### B-tree Indexes (31 indexes)

Standard indexes for exact match lookups and range queries.

| Index Name | Table | Columns | Purpose | Selectivity |
|------------|-------|---------|---------|-------------|
| `idx_organizations_tier` | organizations | subscription_tier | Filter orgs by tier | Medium |
| `idx_users_email` | users | email | Fast user lookup | High |
| `idx_users_organization` | users | organization_id | Find users in org | Medium |
| `idx_users_role` | users | role | Filter by role | Low |
| `idx_sessions_interviewer` | interview_sessions | interviewer_id | Find sessions by interviewer | Medium |
| `idx_sessions_interviewee` | interview_sessions | interviewee_id | Find sessions by interviewee | Medium |
| `idx_sessions_org_status` | interview_sessions | organization_id, status | Composite: Org + Status | High |
| `idx_sessions_status` | interview_sessions | status | Filter by status | Low |
| `idx_sessions_scheduled_start` | interview_sessions | scheduled_start | Range queries on dates | Medium |
| `idx_sessions_token` | interview_sessions | session_token | Lookup by token | High |
| `idx_security_events_session` | security_events | session_id | Find events for session | Medium |
| `idx_security_events_session_time` | security_events | session_id, timestamp DESC | Composite: Session + Time | High |
| `idx_security_events_type` | security_events | event_type | Filter by event type | Low |
| `idx_security_events_severity` | security_events | severity | Filter by severity | Low |
| `idx_questions_session` | questions | session_id | Find questions in session | Medium |
| `idx_questions_session_order` | questions | session_id, question_order | Composite: Session + Order | High |
| `idx_ai_answer_cache_hash` | ai_answer_cache | question_hash | Lookup by hash | High |
| `idx_ai_answer_cache_model` | ai_answer_cache | model_name | Filter by model | Low |
| `idx_answer_analysis_question` | answer_analysis | question_id | Find analysis for question | Medium |
| `idx_answer_analysis_risk_score` | answer_analysis | risk_score DESC | Highest risk scores first | Medium |
| `idx_answer_analysis_ai_generated` | answer_analysis | is_ai_generated | Filter AI generated | Medium |
| `idx_gaze_events_session_time` | gaze_events | session_id, timestamp DESC | Composite: Session + Time | High |
| `idx_gaze_events_off_screen` | gaze_events | session_id, is_off_screen | Composite: Session + Off-screen | High |
| `idx_browser_telemetry_session_time` | browser_telemetry | session_id, timestamp DESC | Composite: Session + Time | High |
| `idx_session_reports_session` | session_reports | session_id | One-to-one lookup | High |
| `idx_session_reports_risk_score` | session_reports | overall_risk_score DESC | Highest risk reports first | Medium |
| `idx_audit_logs_user` | audit_logs | user_id | Find user actions | Medium |
| `idx_audit_logs_resource` | audit_logs | resource_type, resource_id | Composite: Resource lookup | High |
| `idx_audit_logs_timestamp` | audit_logs | timestamp DESC | Recent actions first | Medium |
| `idx_audit_logs_action` | audit_logs | action | Filter by action type | Low |

#### Vector Indexes (1 index)

IVFFlat index for AI answer similarity search.

| Index Name | Table | Column | Type | Distance Metric | Parameters |
|------------|-------|--------|------|-----------------|------------|
| `idx_ai_answer_embedding` | ai_answer_cache | embedding | IVFFlat | cosine | lists=100 |

**Notes**:
- Vector dimensions: 384 (compatible with sentence-transformers)
- Adjust `lists` parameter based on dataset size: sqrt(number_of_rows) is a good starting point
- Provides sub-second similarity search on 100k+ vectors

#### TimescaleDB Automatic Indexes

TimescaleDB automatically creates indexes on partition keys for hypertables:

| Table | Partition Key | Automatic Index | Purpose |
|-------|---------------|-----------------|---------|
| gaze_events | timestamp | Auto-created | Fast range queries on time |
| browser_telemetry | timestamp | Auto-created | Fast range queries on time |

### Query Performance Targets

| Query Type | Target Latency | Typical Queries |
|-----------|-----------------|-----------------|
| Simple lookups (by ID/email) | < 5ms | `SELECT * FROM users WHERE id = ?` |
| Indexed range queries | < 50ms | `SELECT * FROM sessions WHERE status = ? AND created_at > ?` |
| Vector similarity search | < 500ms | Find similar AI answers (100k+ vectors) |
| Time-series aggregations | < 200ms | Count gaze events per minute |
| Join queries (2-3 tables) | < 100ms | Session with questions and answers |

### Query Optimization Tips

1. **Always use indexes**: Check query plans with `EXPLAIN ANALYZE`
   ```sql
   EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'user@example.com';
   ```

2. **Batch inserts**: Use `COPY` or bulk `INSERT` for large datasets
   ```sql
   COPY gaze_events (session_id, timestamp, gaze_x, gaze_y) FROM STDIN;
   ```

3. **Connection pooling**: Reuse connections, never create per-request
   ```javascript
   // Good: Pool reused
   const result = await pool.query(sql);

   // Bad: New connection per query
   const client = new Client(); // Don't do this
   ```

4. **Prepared statements**: Prevent SQL injection and improve performance
   ```javascript
   pool.query('SELECT * FROM users WHERE email = $1', [email]);
   ```

5. **TimescaleDB compression**: Data automatically compresses after 7 days
   ```sql
   -- Check compression status
   SELECT * FROM timescaledb_information.compressed_chunks_stats;
   ```

---

## TimescaleDB Configuration

### Why TimescaleDB?

TimescaleDB optimizes PostgreSQL for time-series data, providing:
- **10-20x compression** on old data
- **Automatic data retention** (delete old data automatically)
- **Fast time-range queries** on millions of records
- **Automatic partitioning** (chunking) by time period

### Hypertables Overview

Two hypertables store time-series data:

1. **gaze_events**: Eye tracking data from interview sessions
2. **browser_telemetry**: Browser monitoring data from interview sessions

### gaze_events Hypertable

**Configuration**:
```
Partition Key:  timestamp
Chunk Interval: 1 day
Retention:      30 days (automatic deletion)
Compression:    Enabled after 7 days
Compression Ratio: 10-20x expected
```

**Compression Settings**:
- **Segment By**: session_id (compress data per session)
- **Order By**: timestamp DESC (optimize for recent data access)

**Typical Data Volume**:
- Eye tracker runs at ~120 samples/second
- 1 hour session = 432,000 data points
- 1 month (30 days): 31,104,000,000 data points
- After 7 days: Compressed from ~2GB to ~100-200MB

**Key Queries**:
```sql
-- Off-screen events during a session
SELECT timestamp, is_off_screen, off_screen_direction
FROM gaze_events
WHERE session_id = 'uuid' AND is_off_screen = true
ORDER BY timestamp;

-- Average pupil diameter over time
SELECT time_bucket('1 minute', timestamp) AS minute,
       AVG(pupil_diameter_left) AS avg_pupil_left,
       AVG(pupil_diameter_right) AS avg_pupil_right
FROM gaze_events
WHERE session_id = 'uuid'
GROUP BY minute
ORDER BY minute;
```

### browser_telemetry Hypertable

**Configuration**:
```
Partition Key:  timestamp
Chunk Interval: 1 day
Retention:      30 days (automatic deletion)
Compression:    Enabled after 7 days
Compression Ratio: 10-20x expected
```

**Compression Settings**:
- **Segment By**: session_id (compress data per session)
- **Order By**: timestamp DESC (optimize for recent data access)

**Typical Data Volume**:
- Collected every 5 seconds during interview
- 1 hour session = 720 data points
- 1 month (30 days): 31,104,000 data points

**Key Queries**:
```sql
-- CPU and memory usage over time
SELECT time_bucket('1 minute', timestamp) AS minute,
       AVG(cpu_percent) AS avg_cpu,
       AVG(memory_mb) AS avg_memory
FROM browser_telemetry
WHERE session_id = 'uuid'
GROUP BY minute
ORDER BY minute;

-- Active processes during session
SELECT timestamp, active_processes
FROM browser_telemetry
WHERE session_id = 'uuid'
ORDER BY timestamp;
```

### Data Retention Management

**Automatic Retention Policies**:

```sql
-- Both hypertables have 30-day retention
-- Older data is automatically deleted

-- View retention policies
SELECT * FROM timescaledb_information.retention_policies;

-- To query retention status:
SELECT
    schemaname,
    tablename,
    (SELECT max(time) FROM gaze_events) AS latest_data,
    (SELECT min(time) FROM gaze_events) AS oldest_data
FROM pg_tables
WHERE tablename IN ('gaze_events', 'browser_telemetry');
```

### Compression Status

```sql
-- Check compression statistics
SELECT * FROM timescaledb_information.compressed_chunks_stats;

-- View uncompressed chunks
SELECT chunk_name, chunk_size, compressed_chunk_name, compressed_chunk_size
FROM timescaledb_information.chunks
WHERE is_compressed = false
ORDER BY chunk_size DESC;

-- Manually trigger compression for old chunks
SELECT compress_chunk(chunk) FROM show_chunks('gaze_events',
  newer_than => INTERVAL '7 days ago');
```

### TimescaleDB Troubleshooting

**Enable TimescaleDB extension**:
```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

**Verify hypertables are created**:
```sql
SELECT * FROM timescaledb_information.hypertables;
-- Should return gaze_events and browser_telemetry
```

**Check chunk information**:
```sql
SELECT chunk_schema, chunk_name, table_name,
       start_time, end_time
FROM timescaledb_information.chunks
WHERE hypertable_name IN ('gaze_events', 'browser_telemetry')
ORDER BY start_time DESC
LIMIT 10;
```

---

## pgvector Setup

### Vector Embeddings for AI Detection

pgvector enables fast similarity search on AI-generated answers to detect when candidates use AI assistance during interviews.

### Embedding Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **Dimensions** | 384 | Vector size for sentence-transformers |
| **Model** | sentence-transformers (all-MiniLM-L6-v2) | Open-source, lightweight, fast |
| **Storage Table** | ai_answer_cache | Caches AI answers with embeddings |
| **Index Type** | IVFFlat | Approximate nearest neighbor search |
| **Distance Metric** | Cosine | Measures angle between vectors |
| **Index Parameter (lists)** | 100 | Number of clusters in IVFFlat |

### Why 384 Dimensions?

- **sentence-transformers/all-MiniLM-L6-v2**: 384 dimensions
- Lightweight (133MB model)
- Fast inference (~1-2ms per sentence)
- Good semantic understanding for interview answers
- Alternative: Use 768 dimensions with larger models for better accuracy

### Using Vector Search

#### 1. Generating Embeddings

When caching an AI answer:

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

question = "What is your experience with Python?"
answer = "I have 5 years of professional Python experience..."

# Generate 384-dimensional embedding
embedding = model.encode(answer)  # Returns numpy array of shape (384,)

# Store in database
INSERT INTO ai_answer_cache
  (question_text, answer_text, embedding, model_name)
VALUES
  ('What is your experience with Python?', 'I have 5 years...', embedding, 'gpt-4');
```

#### 2. Finding Similar AI Answers

Query for similar cached AI answers:

```sql
-- Find top 10 similar AI answers using cosine distance
SELECT
    id,
    question_text,
    answer_text,
    model_name,
    1 - (embedding <=> %s::vector) AS similarity_score
FROM ai_answer_cache
WHERE embedding IS NOT NULL
ORDER BY embedding <=> %s::vector
LIMIT 10;

-- Where %s is the candidate's answer embedding
```

The `<=>` operator calculates cosine distance, and `1 - distance` gives similarity score (0-1).

#### 3. Using the find_similar_ai_answers Function

Built-in function for similarity search:

```sql
-- Find similar answers with threshold
SELECT
    id,
    question_text,
    answer_text,
    model_name,
    similarity_score
FROM find_similar_ai_answers(
    '[0.1, 0.2, ..., 0.05]'::vector(384),  -- Candidate's answer embedding
    10,     -- Limit to 10 results
    0.8     -- Minimum similarity threshold
)
ORDER BY similarity_score DESC;
```

### Vector Index Performance

**Index Configuration**:
```sql
CREATE INDEX idx_ai_answer_embedding
ON ai_answer_cache
USING ivfflat (embedding vector_cosine_ops)
WITH (lists=100);
```

**Performance Characteristics**:
- **Dataset Size: 1,000 vectors**: ~1-5ms per query
- **Dataset Size: 10,000 vectors**: ~5-20ms per query
- **Dataset Size: 100,000 vectors**: ~50-200ms per query
- **Dataset Size: 1,000,000 vectors**: ~200-500ms per query

**Tuning the `lists` Parameter**:
```
lists = sqrt(number_of_rows)

Examples:
- 1,000 rows: lists = 32
- 10,000 rows: lists = 100
- 100,000 rows: lists = 316
```

### AI Detection Workflow

1. **Interview Answer**: Candidate gives an answer
2. **Transcription**: Speech-to-text converts answer to text
3. **Generate Embedding**: Create 384-dim vector from candidate's answer
4. **Vector Search**: Find similar answers in `ai_answer_cache`
5. **Calculate Similarity**: Compare embeddings with cosine distance
6. **Risk Assessment**: High similarity to known AI answers increases risk score
7. **Store Result**: Save analysis in `answer_analysis` table

### Similarity Scoring

```sql
-- Example: Compare answer to cached AI answers
WITH candidate_embedding AS (
    SELECT '[candidate_embedding_vector]'::vector(384) AS embedding
),
similarity_results AS (
    SELECT
        model_name,
        1 - (embedding <=> (SELECT embedding FROM candidate_embedding)) AS similarity
    FROM ai_answer_cache
    WHERE embedding IS NOT NULL
)
SELECT
    model_name,
    COUNT(*) AS high_similarity_count,
    AVG(similarity) AS avg_similarity,
    MAX(similarity) AS max_similarity
FROM similarity_results
WHERE similarity > 0.75  -- High similarity threshold
GROUP BY model_name;
```

### pgvector Extension Management

**Install Extension**:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Check Installation**:
```sql
-- Verify extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Check vector type
SELECT * FROM pg_type WHERE typname = 'vector';

-- List vector indexes
SELECT * FROM pg_indexes
WHERE indexdef LIKE '%vector%';
```

**Disable/Uninstall**:
```sql
DROP EXTENSION vector CASCADE;
```

---

## Enums and Data Types

### Enum Types

Enums provide type-safe, efficient storage of categorical values.

#### user_role

User roles in the system.

| Value | Purpose |
|-------|---------|
| `admin` | Full system access, can manage organizations |
| `interviewer` | Can create and conduct interview sessions |
| `interviewee` | Participates in interview sessions |

```sql
CREATE TYPE user_role AS ENUM ('admin', 'interviewer', 'interviewee');
```

#### subscription_tier

Organization subscription levels.

| Value | Max Sessions | Monthly Limit | Features |
|-------|-------------|---------------|----------|
| `free` | 5 | 100 | Basic monitoring |
| `professional` | 25 | 500 | Advanced analytics |
| `enterprise` | 100+ | Unlimited | Full feature set + support |

```sql
CREATE TYPE subscription_tier AS ENUM ('free', 'professional', 'enterprise');
```

#### session_status

Session lifecycle states.

| Value | Meaning |
|-------|---------|
| `scheduled` | Session created, not yet started |
| `active` | Session is currently in progress |
| `ended` | Session completed normally |
| `cancelled` | Session was cancelled |

```sql
CREATE TYPE session_status AS ENUM ('scheduled', 'active', 'ended', 'cancelled');
```

**Status Transitions**:
```
scheduled  ──→  active  ──→  ended
   │                            ↑
   └──→  cancelled  ────→  ended (optional)
```

#### security_event_type

Types of security events detected.

| Value | Description |
|-------|-------------|
| `suspicious_process` | Unusual process detected running |
| `screen_recording_detected` | Screen recording software detected |
| `vm_detected` | Virtual machine environment detected |
| `window_focus_changed` | Focus switched to different window |
| `multi_monitor_detected` | Multiple displays detected |
| `unauthorized_browser` | Browser is not whitelisted |
| `copy_paste_detected` | Copy/paste operation attempted |
| `keyboard_shortcut_blocked` | Restricted keyboard shortcut used |

```sql
CREATE TYPE security_event_type AS ENUM (
    'suspicious_process',
    'screen_recording_detected',
    'vm_detected',
    'window_focus_changed',
    'multi_monitor_detected',
    'unauthorized_browser',
    'copy_paste_detected',
    'keyboard_shortcut_blocked'
);
```

#### severity_level

Event severity classification.

| Value | Risk Score Impact | Example |
|-------|------------------|---------|
| `low` | +0.05 | Window focus change |
| `medium` | +0.20 | Multi-monitor detected |
| `high` | +0.40 | Screen recording detected |
| `critical` | +0.60 | Suspicious process detected |

```sql
CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical');
```

#### question_difficulty

Interview question difficulty levels.

| Value | Purpose |
|-------|---------|
| `easy` | Warm-up, basic knowledge |
| `medium` | Standard job-related questions |
| `hard` | Advanced technical skills |
| `expert` | Specialized knowledge required |

```sql
CREATE TYPE question_difficulty AS ENUM ('easy', 'medium', 'hard', 'expert');
```

#### ai_model_name

Supported AI models for answer generation.

| Value | Provider | Notes |
|-------|----------|-------|
| `gpt-4` | OpenAI | Most capable |
| `gpt-3.5-turbo` | OpenAI | Fast, cost-effective |
| `claude-3-opus` | Anthropic | Excellent reasoning |
| `claude-3-sonnet` | Anthropic | Balanced |
| `gemini-pro` | Google | Multimodal support |
| `llama-2` | Meta | Open-source |

```sql
CREATE TYPE ai_model_name AS ENUM (
    'gpt-4',
    'gpt-3.5-turbo',
    'claude-3-opus',
    'claude-3-sonnet',
    'gemini-pro',
    'llama-2'
);
```

### Custom Data Types

#### JSONB Columns

Semi-structured data stored as JSON Binary format.

| Table | Column | Contents | Example |
|-------|--------|----------|---------|
| organizations | settings | Organization config | `{"theme": "dark", "lang": "en"}` |
| interview_sessions | metadata | Session info | `{"session_type": "technical", "rounds": 3}` |
| security_events | metadata | Event details | `{"process_name": "obs.exe", "pid": 1234}` |
| questions | (none) | - | - |
| ai_answer_cache | metadata | Model config | `{"temperature": 0.7, "max_tokens": 500}` |
| answer_analysis | similarity_scores | Per-model scores | `{"gpt-4": 0.92, "gpt-3.5-turbo": 0.88}` |
| answer_analysis | response_timing | Timing metrics | `{"latency_ms": 2500, "wpm": 120, "pauses": 3}` |
| session_reports | recommendations | Report suggestions | `[{"severity": "high", "text": "Suspicious process detected"}]` |
| session_reports | detailed_analysis | Full analysis | `{"ai_detection": {...}, "gaze": {...}}` |
| browser_telemetry | active_processes | Running processes | `[{"name": "chrome", "memory": 512}, ...]` |
| browser_telemetry | network_requests | Network data | `[{"url": "api.openai.com", "status": 200}, ...]` |
| gaze_events | metadata | Event metadata | `{"device": "tobii", "firmware": "1.2.3"}` |
| audit_logs | metadata | Audit details | `{"old_value": "...", "new_value": "..."}` |

**Querying JSONB**:
```sql
-- Extract value
SELECT metadata->>'session_type' AS session_type
FROM interview_sessions;

-- Search in array
SELECT * FROM answer_analysis
WHERE similarity_scores->>'gpt-4' > '0.9';

-- Filter by keys
SELECT * FROM browser_telemetry
WHERE active_processes @> '[{"name": "obs.exe"}]';
```

#### DECIMAL Columns

High-precision decimal numbers for scores (0-1).

| Table | Column | Precision | Range | Purpose |
|-------|--------|-----------|-------|---------|
| interview_sessions | risk_score | DECIMAL(5,4) | 0.0000 - 1.0000 | Overall session risk |
| security_events | (severity is ENUM) | - | - | - |
| answer_analysis | risk_score | DECIMAL(5,4) | 0.0000 - 1.0000 | AI detection risk |
| answer_analysis | confidence_score | DECIMAL(5,4) | 0.0000 - 1.0000 | Detection confidence |
| session_reports | overall_risk_score | DECIMAL(5,4) | 0.0000 - 1.0000 | Final risk |
| session_reports | ai_detection_score | DECIMAL(5,4) | 0.0000 - 1.0000 | AI score |
| session_reports | gaze_anomaly_score | DECIMAL(5,4) | 0.0000 - 1.0000 | Gaze score |
| session_reports | timing_anomaly_score | DECIMAL(5,4) | 0.0000 - 1.0000 | Timing score |

**Why DECIMAL(5,4)?**
- Total digits: 5
- Decimal places: 4
- Range: 0.0000 to 9.9999 (but we use 0-1)
- Prevents floating-point precision errors

---

## Views and Functions

### Views

Pre-computed views for common query patterns.

#### active_sessions

Shows all currently active interview sessions with participant details.

```sql
SELECT
    s.id,
    s.session_token,
    s.scheduled_start,
    s.actual_start,
    i.email AS interviewer_email,
    i.first_name AS interviewer_first_name,
    i.last_name AS interviewer_last_name,
    COALESCE(ie.email, s.interviewee_email) AS interviewee_email,
    ie.first_name AS interviewee_first_name,
    ie.last_name AS interviewee_last_name,
    o.name AS organization_name,
    s.risk_score,
    COALESCE((SELECT COUNT(*) FROM security_events
              WHERE session_id = s.id), 0) AS security_events_count
FROM interview_sessions s
JOIN users i ON s.interviewer_id = i.id
LEFT JOIN users ie ON s.interviewee_id = ie.id
JOIN organizations o ON s.organization_id = o.id
WHERE s.status = 'active';
```

**Usage**:
```sql
SELECT * FROM active_sessions;
-- Returns all currently active sessions with full participant info
```

#### session_analytics

Aggregated analytics for all sessions.

```sql
SELECT
    s.id AS session_id,
    s.organization_id,
    s.status,
    EXTRACT(EPOCH FROM (s.actual_end - s.actual_start))/60 AS duration_minutes,
    s.risk_score,
    COALESCE((SELECT COUNT(*) FROM questions WHERE session_id = s.id), 0) AS questions_count,
    COALESCE((SELECT COUNT(*) FROM answer_analysis WHERE question_id IN
              (SELECT id FROM questions WHERE session_id = s.id)), 0) AS answers_count,
    COALESCE((SELECT COUNT(*) FROM security_events WHERE session_id = s.id), 0) AS security_events_count,
    COALESCE((SELECT AVG(risk_score) FROM answer_analysis WHERE question_id IN
              (SELECT id FROM questions WHERE session_id = s.id)), 0) AS avg_answer_risk_score,
    COALESCE((SELECT COUNT(*) FROM gaze_events WHERE session_id = s.id), 0) AS gaze_events_count,
    COALESCE((SELECT COUNT(*) FROM gaze_events WHERE session_id = s.id
              AND is_off_screen = true), 0) AS off_screen_events_count
FROM interview_sessions s;
```

**Usage**:
```sql
SELECT * FROM session_analytics WHERE status = 'ended' ORDER BY risk_score DESC;
-- Returns comprehensive analytics for all sessions
```

#### high_risk_sessions

Sessions with risk score >= 0.75 flagged for review.

```sql
SELECT
    s.id,
    s.session_token,
    s.actual_start,
    s.actual_end,
    s.risk_score,
    i.email AS interviewer_email,
    o.name AS organization_name,
    COALESCE((SELECT COUNT(*) FROM security_events WHERE session_id = s.id), 0) AS security_events_count,
    sr.recommendations
FROM interview_sessions s
JOIN users i ON s.interviewer_id = i.id
JOIN organizations o ON s.organization_id = o.id
LEFT JOIN session_reports sr ON s.id = sr.session_id
WHERE s.risk_score >= 0.75 AND s.status IN ('active', 'ended')
ORDER BY s.risk_score DESC;
```

**Usage**:
```sql
SELECT * FROM high_risk_sessions;
-- Returns high-risk sessions for manual review
```

### Functions

Custom PostgreSQL functions for common operations.

#### get_session_risk_summary(p_session_id UUID)

Returns comprehensive risk summary for a session.

```sql
CREATE OR REPLACE FUNCTION get_session_risk_summary(p_session_id UUID)
RETURNS TABLE (
    session_id UUID,
    overall_risk_score DECIMAL,
    security_events_count INTEGER,
    high_severity_events INTEGER,
    ai_answers_count INTEGER,
    off_screen_count INTEGER,
    total_duration_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    COALESCE(sr.overall_risk_score, 0),
    COALESCE((SELECT COUNT(*) FROM security_events WHERE session_id = s.id), 0),
    COALESCE((SELECT COUNT(*) FROM security_events
              WHERE session_id = s.id AND severity IN ('high', 'critical')), 0),
    COALESCE((SELECT COUNT(*) FROM answer_analysis aa
              JOIN questions q ON aa.question_id = q.id
              WHERE q.session_id = s.id AND aa.is_ai_generated = true), 0),
    COALESCE((SELECT COUNT(*) FROM gaze_events
              WHERE session_id = s.id AND is_off_screen = true), 0),
    EXTRACT(EPOCH FROM (s.actual_end - s.actual_start))/60::INTEGER
  FROM interview_sessions s
  LEFT JOIN session_reports sr ON s.id = sr.session_id
  WHERE s.id = p_session_id;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Usage**:
```sql
SELECT * FROM get_session_risk_summary('20000000-0000-0000-0000-000000000001');
-- Returns: | session_id | overall_risk_score | security_events_count | ... |
```

#### find_similar_ai_answers(p_embedding vector(384), p_limit INTEGER, p_threshold DECIMAL)

Finds similar AI answers using vector similarity search.

```sql
CREATE OR REPLACE FUNCTION find_similar_ai_answers(
  p_embedding vector(384),
  p_limit INTEGER DEFAULT 10,
  p_threshold DECIMAL DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  question_text TEXT,
  model_name ai_model_name,
  answer_text TEXT,
  similarity_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    aa.id,
    aa.question_text,
    aa.model_name,
    aa.answer_text,
    (1 - (aa.embedding <=> p_embedding))::DECIMAL(5,4) AS similarity_score
  FROM ai_answer_cache aa
  WHERE aa.embedding IS NOT NULL
    AND (1 - (aa.embedding <=> p_embedding)) > p_threshold
  ORDER BY aa.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Usage**:
```sql
SELECT * FROM find_similar_ai_answers(
  (SELECT embedding FROM ai_answer_cache LIMIT 1),
  10,
  0.8
);
-- Returns: | id | question_text | model_name | answer_text | similarity_score |
```

#### generate_session_token()

Auto-generates a unique session token before insert.

```sql
CREATE OR REPLACE FUNCTION generate_session_token()
RETURNS TRIGGER AS $$
BEGIN
  NEW.session_token := encode(
    gen_random_bytes(32),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_interview_session_token
BEFORE INSERT ON interview_sessions
FOR EACH ROW
EXECUTE FUNCTION generate_session_token();
```

#### calculate_session_duration()

Auto-calculates session duration before update.

```sql
CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.actual_start IS NOT NULL AND NEW.actual_end IS NOT NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.actual_end - NEW.actual_start))/60;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_interview_duration
BEFORE UPDATE ON interview_sessions
FOR EACH ROW
WHEN (OLD.actual_end IS DISTINCT FROM NEW.actual_end)
EXECUTE FUNCTION calculate_session_duration();
```

#### update_updated_at_column()

Auto-updates `updated_at` timestamp on table modifications.

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied to multiple tables:
-- organizations, users, interview_sessions, questions
```

---

## Migration Instructions

### Initial Setup (First Time)

#### Step 1: Install PostgreSQL 18.1

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install postgresql-18 postgresql-contrib-18
```

**macOS**:
```bash
brew install postgresql@18
```

**Windows**:
Download from [postgresql.org](https://www.postgresql.org/download/)

#### Step 2: Install TimescaleDB Extension

**Ubuntu/Debian**:
```bash
sudo apt install postgresql-18-timescaledb
```

**macOS**:
```bash
brew install timescaledb
```

**Other Systems**: Follow [TimescaleDB Installation Guide](https://docs.timescale.com/install/latest/)

#### Step 3: Install pgvector Extension

```bash
cd /tmp
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make
sudo make install

# For development
make install
```

**Verify Installation**:
```bash
psql -d postgres -c "CREATE EXTENSION vector;"
```

#### Step 4: Create Database and User

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Create database
CREATE DATABASE blockd;

# Create application user
CREATE USER blockd_app WITH PASSWORD 'blockd_secure_password_2025';

# Grant permissions
GRANT ALL PRIVILEGES ON DATABASE blockd TO blockd_app;
GRANT ALL ON SCHEMA public TO blockd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO blockd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO blockd_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO blockd_app;

# Exit psql
\q
```

#### Step 5: Initialize Schema

**Option A: Using init.sh Script**

```bash
cd /home/user/Blockd/database
chmod +x init.sh
./init.sh
```

This automatically:
- Creates extensions
- Creates all tables
- Creates indexes
- Creates hypertables
- Creates views and functions
- Loads seed data

**Option B: Using SQL Schema Directly**

```bash
psql -d blockd -f database/schema.sql
```

**Option C: Using Alembic**

```bash
cd /home/user/Blockd/database
pip install alembic psycopg2-binary
export DATABASE_URL="postgresql://blockd_app:blockd_secure_password_2025@localhost:5432/blockd"
alembic upgrade head
```

#### Step 6: Verify Installation

```bash
psql -d blockd

-- Check tables
\dt

-- Check extensions
\dx

-- Check hypertables
SELECT * FROM timescaledb_information.hypertables;

-- Check vector columns
SELECT tablename, attname FROM pg_attribute a
JOIN pg_class c ON a.attrelid = c.oid
JOIN pg_type t ON a.atttypid = t.oid
WHERE t.typname = 'vector';
```

### Using Alembic for Migrations

Alembic provides version control for database schema changes.

#### Configuration

**Edit alembic.ini**:
```ini
sqlalchemy.url = postgresql://blockd_app:blockd_secure_password_2025@localhost:5432/blockd
```

Or use environment variable:
```bash
export DATABASE_URL="postgresql://blockd_app:blockd_secure_password_2025@localhost:5432/blockd"
```

#### Common Commands

```bash
cd /home/user/Blockd/database

# Show current version
alembic current

# Show migration history
alembic history

# Upgrade to latest
alembic upgrade head

# Upgrade N versions
alembic upgrade +2

# Downgrade one version
alembic downgrade -1

# Downgrade N versions
alembic downgrade -2

# Create new migration (empty)
alembic revision -m "add new column to users"

# Create new migration (autogenerate from model)
alembic revision --autogenerate -m "add new column to users"
```

#### Creating New Migrations

1. **Edit your models/schema**

2. **Generate migration**:
```bash
alembic revision --autogenerate -m "Description of changes"
```

3. **Review generated migration** in `versions/`:
```python
def upgrade():
    # Auto-generated SQL here
    pass

def downgrade():
    # Reversal SQL here
    pass
```

4. **Apply migration**:
```bash
alembic upgrade head
```

5. **Test migration**:
```bash
# Test downgrade
alembic downgrade -1
# Test upgrade
alembic upgrade head
```

### Using schema.sql Directly

For manual or initial setup:

```bash
# Create fresh database
dropdb blockd 2>/dev/null || true
createdb blockd

# Apply schema
psql -d blockd -f database/schema.sql

# Load seed data
cd database/seeds
./seed_all.sh
```

### Environment Setup

Create `.env` file or export variables:

```bash
export DATABASE_URL="postgresql://blockd_app:blockd_secure_password_2025@localhost:5432/blockd"
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=blockd
export DB_USER=blockd_app
export DB_PASSWORD=blockd_secure_password_2025
```

### Troubleshooting Setup

**Error: Extension not found**
```bash
# Install extension
sudo apt install postgresql-18-timescaledb
# Or
brew install timescaledb

# Verify in PostgreSQL
psql -d blockd -c "CREATE EXTENSION timescaledb;"
```

**Error: Connection refused**
```bash
# Start PostgreSQL
sudo systemctl start postgresql

# Check status
sudo systemctl status postgresql

# Check if listening on port 5432
netstat -tlnp | grep 5432
```

**Error: Permission denied**
```sql
-- Grant all permissions
GRANT ALL PRIVILEGES ON DATABASE blockd TO blockd_app;
GRANT ALL ON SCHEMA public TO blockd_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO blockd_app;
```

---

## Seed Data

### Organizations

Pre-created test organizations with different subscription tiers:

| Name | Tier | Max Sessions | Monthly Limit | Features |
|------|------|-------------|--------------|----------|
| Blockd Demo Corp | Free | 5 | 100 | Basic monitoring |
| Tech Startup Inc | Professional | 25 | 500 | Analytics, AI detection |
| Enterprise Solutions Ltd | Enterprise | 100 | Unlimited | All features, priority support |

### Users

Test users for different roles (password: `Blockd2025!`):

| Email | Role | Organization | MFA | Notes |
|-------|------|--------------|-----|-------|
| admin@blockd.com | admin | Blockd Demo Corp | ✓ | Full system access |
| interviewer1@blockd.com | interviewer | Blockd Demo Corp | ✗ | Can conduct interviews |
| interviewer2@techstartup.com | interviewer | Tech Startup Inc | ✓ | Can conduct interviews |
| john.doe@blockd.com | interviewer | Enterprise Solutions Ltd | ✗ | Can conduct interviews |
| interviewee1@example.com | interviewee | None | ✗ | Invited participant |
| interviewee2@example.com | interviewee | None | ✗ | Invited participant |

### Sample Sessions

Three sample sessions demonstrating different scenarios:

1. **Completed Session** (Low Risk: 0.15)
   - Status: `ended`
   - Interviewer: interviewer1@blockd.com
   - Duration: 45 minutes
   - Risk Score: 0.15 (low, clean interview)
   - Security Events: 1 minor event

2. **Active Session** (Medium Risk: 0.68)
   - Status: `active`
   - Interviewer: interviewer2@techstartup.com
   - Duration: 30 minutes (ongoing)
   - Risk Score: 0.68 (medium, some suspicious activity)
   - Security Events: 5 events
   - Gaze Events: 5,400+ samples
   - Browser Telemetry: 360+ records

3. **Scheduled Session** (No Risk)
   - Status: `scheduled`
   - Interviewer: john.doe@blockd.com
   - Scheduled Start: 2025-12-01 10:00:00
   - Not started yet

### Sample AI Answers

Six cached AI answers for similarity testing:

1. **GPT-4**: "I have 5 years of experience with Python..."
2. **GPT-3.5-turbo**: "My expertise includes full-stack development..."
3. **Claude-3-Opus**: "In my professional career, I've worked on..."
4. **Claude-3-Sonnet**: "I specialize in machine learning projects..."
5. **Gemini-Pro**: "My background includes cloud infrastructure..."
6. **Llama-2**: "I have extensive experience with containerization..."

Each includes:
- 384-dimensional embedding
- Question hash
- Model name
- Perplexity score
- Token count

### Loading Seed Data

**Using seed script**:
```bash
cd database/seeds
./seed_all.sh
```

**Manually**:
```bash
psql -d blockd -f database/seeds/01_seed_organizations.sql
psql -d blockd -f database/seeds/02_seed_users.sql
psql -d blockd -f database/seeds/03_seed_ai_cache.sql
psql -d blockd -f database/seeds/04_seed_sample_sessions.sql
```

**Clear and reload**:
```bash
# Delete all data (keeps schema)
psql -d blockd -f database/seeds/cleanup.sql

# Reload seed data
cd database/seeds && ./seed_all.sh
```

### Testing Seed Data

```sql
-- Count organizations
SELECT COUNT(*) FROM organizations;
-- Expected: 3

-- Count users
SELECT COUNT(*) FROM users;
-- Expected: 6

-- Count sessions
SELECT COUNT(*) FROM interview_sessions;
-- Expected: 3

-- Count AI answers
SELECT COUNT(*) FROM ai_answer_cache;
-- Expected: 6

-- View active sessions
SELECT * FROM active_sessions;

-- View high-risk sessions
SELECT * FROM high_risk_sessions;
```

---

## Setup Checklist

Use this checklist to ensure your database is properly configured:

### Prerequisites
- [ ] PostgreSQL 18.1 installed and running
- [ ] TimescaleDB 2.x extension installed
- [ ] pgvector 0.7.x extension installed
- [ ] PostgreSQL development tools available (psql, pg_dump, etc.)

### Initial Setup
- [ ] Database `blockd` created
- [ ] User `blockd_app` created with password
- [ ] All extensions installed and enabled:
  - [ ] uuid-ossp
  - [ ] vector
  - [ ] timescaledb
  - [ ] pgcrypto
- [ ] Database schema applied (11 tables)
- [ ] All indexes created (31 B-tree + 1 vector)
- [ ] Hypertables created (gaze_events, browser_telemetry)
- [ ] Views created (active_sessions, session_analytics, high_risk_sessions)
- [ ] Functions created (get_session_risk_summary, find_similar_ai_answers, etc.)

### Connection Configuration
- [ ] Environment variables set (DATABASE_URL)
- [ ] Connection pooling configured (5-20 connections)
- [ ] SSL certificates configured (production)
- [ ] Firewall rules allow 5432 access

### Data
- [ ] Seed data loaded (3 organizations, 6 users, 6 AI answers)
- [ ] Sample sessions created for testing
- [ ] Gaze events and telemetry data populated

### Testing
- [ ] All tables accessible with `\dt`
- [ ] Hypertables verified with `timescaledb_information.hypertables`
- [ ] Vector index verified
- [ ] Views return expected results
- [ ] Functions execute without errors
- [ ] Sample queries return data

### Performance
- [ ] Connection pooling working
- [ ] Query performance < 100ms for basic queries
- [ ] Vector similarity search < 500ms
- [ ] Indexes being used (EXPLAIN ANALYZE)

### Monitoring
- [ ] Monitoring/alerting configured
- [ ] Slow query logging enabled
- [ ] Connection pool monitoring in place
- [ ] Backup schedule configured

### Documentation
- [ ] Database documentation reviewed
- [ ] Migration procedures documented
- [ ] Connection strings documented
- [ ] Team trained on database access

---

## Quick Reference

### Connection String
```
postgresql://blockd_app:blockd_secure_password_2025@localhost:5432/blockd
```

### Common Queries

**Active Sessions Count**:
```sql
SELECT COUNT(*) FROM interview_sessions WHERE status = 'active';
```

**High-Risk Sessions**:
```sql
SELECT * FROM high_risk_sessions ORDER BY risk_score DESC LIMIT 10;
```

**AI Answer Similarity**:
```sql
SELECT * FROM find_similar_ai_answers(embedding_vector, 10, 0.8);
```

**Session Analytics**:
```sql
SELECT * FROM session_analytics WHERE status = 'ended' ORDER BY risk_score DESC;
```

**TimescaleDB Chunks**:
```sql
SELECT * FROM timescaledb_information.chunks
WHERE hypertable_name IN ('gaze_events', 'browser_telemetry')
ORDER BY range_start DESC;
```

### Useful Commands

```bash
# Connect to database
psql -d blockd

# Backup database
pg_dump -Fc blockd > blockd_backup_$(date +%Y%m%d).dump

# Restore database
pg_restore -d blockd blockd_backup_20251124.dump

# Apply migrations
cd database && alembic upgrade head

# Load seed data
cd database/seeds && ./seed_all.sh
```

---

**Created**: 2025-11-24
**Version**: 1.0.0
**Status**: Production Ready
**Last Updated**: 2025-11-24
