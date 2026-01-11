# Blockd Platform - Database Migration Guide

This document provides comprehensive guidance for managing database migrations, testing procedures, and rollback strategies for the Blockd platform.

## Table of Contents

1. [Overview](#overview)
2. [Migration Strategy](#migration-strategy)
3. [Prisma Migration Workflow](#prisma-migration-workflow)
4. [Testing Migrations](#testing-migrations)
5. [Production Deployment](#production-deployment)
6. [Rollback Procedures](#rollback-procedures)
7. [Common Migration Patterns](#common-migration-patterns)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### Database Stack

- **Primary Database**: PostgreSQL 18.1
- **Extensions**:
  - `uuid-ossp` - UUID generation
  - `pgvector` - Vector embeddings for AI similarity
  - `pgcrypto` - Cryptographic functions
- **ORM**: Prisma 6.x (Node.js services)
- **Time-series**: TimescaleDB 2.x (gaze_events, browser_telemetry)

### Services with Database Access

| Service | Schema Location | Database |
|---------|-----------------|----------|
| api-gateway | `backend/api-gateway/prisma/schema.prisma` | blockd |
| auth-service | `backend/auth-service/prisma/schema.prisma` | blockd |
| session-service | `backend/session-service/prisma/schema.prisma` | blockd |
| websocket-service | `backend/websocket-service/prisma/schema.prisma` | blockd |

---

## Migration Strategy

### Principles

1. **Schema-first**: All schema changes go through Prisma schema files
2. **Backward compatible**: Migrations should not break running services
3. **Testable**: All migrations tested on staging before production
4. **Reversible**: Every migration should have a documented rollback procedure
5. **Atomic**: Migrations should be atomic operations when possible

### Migration Workflow

```
Developer -> Local Test -> PR Review -> Staging -> Production
    │            │            │            │            │
    └── prisma   └── prisma   └── Review   └── prisma   └── prisma
        migrate      migrate      migration    migrate      migrate
        dev          reset        SQL          deploy       deploy
```

---

## Prisma Migration Workflow

### Initial Setup

```bash
# Navigate to service directory
cd backend/websocket-service

# Initialize Prisma (if not already done)
npx prisma init

# Generate Prisma client
npx prisma generate
```

### Creating a Migration

```bash
# Create migration from schema changes
npx prisma migrate dev --name descriptive_migration_name

# Example names:
# add_chat_messages_table
# add_session_metadata_column
# create_security_events_indexes
```

### Migration Naming Convention

```
YYYYMMDDHHMMSS_action_entity_details
```

Examples:
- `20250110120000_add_chat_messages_table`
- `20250110130000_add_session_risk_score_column`
- `20250110140000_create_gaze_events_hypertable`

### Reviewing Migrations

Before committing, review the generated SQL:

```bash
# View pending migrations
npx prisma migrate status

# Review migration SQL
cat prisma/migrations/20250110120000_add_chat_messages_table/migration.sql
```

---

## Testing Migrations

### Local Testing Checklist

```markdown
## Migration Testing Checklist

### Pre-migration
- [ ] Backup local database
- [ ] Review migration SQL for correctness
- [ ] Check for breaking changes to existing data

### Migration Execution
- [ ] Run `npx prisma migrate dev`
- [ ] Verify migration completed without errors
- [ ] Check database schema matches expected state

### Post-migration Testing
- [ ] Run unit tests: `npm test`
- [ ] Run integration tests: `npm run test:integration`
- [ ] Verify all CRUD operations work
- [ ] Check API endpoints respond correctly
- [ ] Verify existing data is preserved/transformed correctly

### Performance Testing
- [ ] Check query performance on affected tables
- [ ] Verify indexes are created correctly
- [ ] Test with production-like data volume
```

### Local Testing Script

```bash
#!/bin/bash
# scripts/test-migration.sh

set -e

SERVICE_DIR=$1
MIGRATION_NAME=$2

if [ -z "$SERVICE_DIR" ] || [ -z "$MIGRATION_NAME" ]; then
    echo "Usage: ./test-migration.sh <service-dir> <migration-name>"
    exit 1
fi

echo "=== Testing migration for $SERVICE_DIR ==="

cd backend/$SERVICE_DIR

# Create test database
echo "Creating test database..."
psql -U postgres -c "DROP DATABASE IF EXISTS blockd_migration_test;"
psql -U postgres -c "CREATE DATABASE blockd_migration_test;"

# Set test database URL
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/blockd_migration_test"

# Run migrations
echo "Running migrations..."
npx prisma migrate deploy

# Run tests
echo "Running tests..."
npm test

# Verify schema
echo "Verifying schema..."
npx prisma db pull --print

# Cleanup
echo "Cleaning up..."
psql -U postgres -c "DROP DATABASE blockd_migration_test;"

echo "=== Migration test complete ==="
```

### Staging Environment Testing

```bash
# Deploy to staging
kubectl apply -f k8s/staging/migrations-job.yaml

# Wait for job completion
kubectl wait --for=condition=complete job/migration-job -n staging --timeout=300s

# Run smoke tests
./scripts/run-smoke-tests.sh staging

# Check application logs
kubectl logs -l app=api-gateway -n staging --tail=100
```

---

## Production Deployment

### Pre-deployment Checklist

```markdown
## Production Migration Checklist

### 24 Hours Before
- [ ] Migration tested on staging
- [ ] Rollback procedure documented
- [ ] Database backup scheduled
- [ ] Maintenance window communicated

### 1 Hour Before
- [ ] Verify staging migration success
- [ ] Take production database snapshot
- [ ] Alert on-call team

### During Migration
- [ ] Put application in maintenance mode (optional)
- [ ] Run migration job
- [ ] Monitor migration progress
- [ ] Verify migration completion

### Post-migration
- [ ] Verify application health
- [ ] Run smoke tests
- [ ] Check error rates in monitoring
- [ ] Keep snapshot for 24 hours
```

### Kubernetes Migration Job

```yaml
# k8s/production/migrations/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: prisma-migrate-{{ .Values.migrationVersion }}
  namespace: blockd
spec:
  ttlSecondsAfterFinished: 86400  # Cleanup after 24h
  backoffLimit: 1  # Don't retry failed migrations
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: blockd/api-gateway:{{ .Values.imageTag }}
        command: ["npx", "prisma", "migrate", "deploy"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: blockd-secrets
              key: DATABASE_URL
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

### Deployment Script

```bash
#!/bin/bash
# scripts/deploy-migration.sh

set -e

ENV=${1:-staging}

echo "=== Deploying migration to $ENV ==="

# Take database snapshot
echo "Taking database snapshot..."
aws rds create-db-snapshot \
    --db-instance-identifier blockd-$ENV \
    --db-snapshot-identifier blockd-$ENV-pre-migration-$(date +%Y%m%d%H%M%S)

# Wait for snapshot
echo "Waiting for snapshot..."
aws rds wait db-snapshot-available \
    --db-snapshot-identifier blockd-$ENV-pre-migration-$(date +%Y%m%d%H%M%S)

# Run migration job
echo "Running migration..."
kubectl apply -f k8s/$ENV/migrations/migration-job.yaml

# Wait for completion
kubectl wait --for=condition=complete job/prisma-migrate -n blockd --timeout=600s

# Verify
echo "Verifying migration..."
kubectl logs job/prisma-migrate -n blockd

# Restart services to pick up schema changes
echo "Rolling restart of services..."
kubectl rollout restart deployment/api-gateway -n blockd
kubectl rollout restart deployment/session-service -n blockd

echo "=== Migration deployment complete ==="
```

---

## Rollback Procedures

### Automatic Rollback (Prisma)

```bash
# Rollback last migration
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# Reset database (DEVELOPMENT ONLY)
npx prisma migrate reset
```

### Manual Rollback SQL

For each migration, create a corresponding rollback script:

```sql
-- migrations/rollback/20250110120000_add_chat_messages_table.sql

-- Rollback: Remove chat_messages table
BEGIN;

-- Drop indexes first
DROP INDEX IF EXISTS idx_chat_messages_session_id;
DROP INDEX IF EXISTS idx_chat_messages_session_created;

-- Drop table
DROP TABLE IF EXISTS chat_messages;

COMMIT;
```

### Database Restore from Snapshot

```bash
# For catastrophic failures, restore from snapshot
#!/bin/bash
# scripts/restore-snapshot.sh

SNAPSHOT_ID=$1
NEW_INSTANCE="blockd-prod-restored"

# Create new instance from snapshot
aws rds restore-db-instance-from-db-snapshot \
    --db-instance-identifier $NEW_INSTANCE \
    --db-snapshot-identifier $SNAPSHOT_ID

# Wait for instance
aws rds wait db-instance-available --db-instance-identifier $NEW_INSTANCE

# Update DNS/endpoint in Kubernetes secrets
kubectl create secret generic blockd-secrets \
    --from-literal=DATABASE_URL="postgresql://..." \
    --dry-run=client -o yaml | kubectl apply -f -

# Restart services
kubectl rollout restart deployment --all -n blockd
```

---

## Common Migration Patterns

### Adding a New Column

```prisma
// schema.prisma
model InterviewSession {
  // existing fields...

  // New nullable column (safe migration)
  riskScore Decimal? @map("risk_score") @db.Decimal(5, 4)
}
```

### Adding a New Table

```prisma
model ChatMessage {
  id        String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  sessionId String   @map("session_id") @db.Uuid
  senderId  String   @map("sender_id") @db.VarChar(255)
  message   String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([sessionId])
  @@index([sessionId, createdAt(sort: Desc)])
  @@map("chat_messages")
}
```

### Adding an Index

```prisma
model SecurityEvent {
  // fields...

  // Add composite index
  @@index([sessionId, timestamp(sort: Desc)])
  @@index([eventType, severity])
}
```

### Renaming a Column (Two-phase)

**Phase 1: Add new column**
```prisma
model User {
  fullName  String? @map("full_name")      // Old
  firstName String? @map("first_name")     // New
  lastName  String? @map("last_name")      // New
}
```

**Phase 2: Data migration**
```sql
UPDATE users SET first_name = split_part(full_name, ' ', 1);
UPDATE users SET last_name = split_part(full_name, ' ', 2);
```

**Phase 3: Remove old column** (after application updated)
```prisma
model User {
  firstName String? @map("first_name")
  lastName  String? @map("last_name")
  // fullName removed
}
```

### Creating TimescaleDB Hypertables

```sql
-- Custom migration SQL for TimescaleDB
-- prisma/migrations/20250110150000_create_gaze_hypertable/migration.sql

-- Create regular table first
CREATE TABLE gaze_events (
  id UUID DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  gaze_x DECIMAL(10, 8),
  gaze_y DECIMAL(10, 8),
  is_off_screen BOOLEAN DEFAULT FALSE,
  confidence DECIMAL(5, 4)
);

-- Convert to hypertable
SELECT create_hypertable('gaze_events', 'timestamp');

-- Add retention policy (30 days)
SELECT add_retention_policy('gaze_events', INTERVAL '30 days');

-- Add compression policy (compress after 7 days)
SELECT add_compression_policy('gaze_events', INTERVAL '7 days');

-- Create indexes
CREATE INDEX idx_gaze_events_session ON gaze_events(session_id, timestamp DESC);
```

---

## Troubleshooting

### Common Issues

#### Migration Lock

```bash
# Check for lock
SELECT * FROM _prisma_migrations WHERE finished_at IS NULL;

# Remove stale lock (careful!)
DELETE FROM _prisma_migrations WHERE migration_name = 'stuck_migration' AND finished_at IS NULL;
```

#### Schema Drift

```bash
# Check for drift between Prisma schema and database
npx prisma db pull --print

# Fix drift by creating a migration
npx prisma migrate dev --name fix_schema_drift
```

#### Failed Migration

```bash
# Mark migration as rolled back
npx prisma migrate resolve --rolled-back MIGRATION_NAME

# Or mark as applied (if manually fixed)
npx prisma migrate resolve --applied MIGRATION_NAME
```

#### Large Table Migration

For large tables (>1M rows), use batched updates:

```sql
-- Batch update to avoid long locks
DO $$
DECLARE
  batch_size INT := 10000;
  total_updated INT := 0;
BEGIN
  LOOP
    WITH to_update AS (
      SELECT id FROM users
      WHERE new_column IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    )
    UPDATE users SET new_column = 'default'
    WHERE id IN (SELECT id FROM to_update);

    GET DIAGNOSTICS total_updated = ROW_COUNT;
    EXIT WHEN total_updated = 0;

    COMMIT;
    PERFORM pg_sleep(0.1);  -- Brief pause
  END LOOP;
END $$;
```

### Monitoring Migrations

```sql
-- Check migration status
SELECT * FROM _prisma_migrations ORDER BY started_at DESC LIMIT 10;

-- Monitor long-running queries during migration
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';

-- Check table locks
SELECT relation::regclass, mode, granted
FROM pg_locks
WHERE relation::regclass::text LIKE 'public.%';
```

---

## Migration Template

```sql
-- Migration: YYYYMMDDHHMMSS_description
-- Author: [name]
-- Ticket: [JIRA-XXX]
--
-- Description:
-- [Detailed description of what this migration does]
--
-- Rollback:
-- [How to rollback this migration]

BEGIN;

-- Pre-checks (optional)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'my_table') THEN
    RAISE NOTICE 'Table already exists, skipping...';
    RETURN;
  END IF;
END $$;

-- Main migration
CREATE TABLE IF NOT EXISTS my_table (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_my_table_created
ON my_table(created_at DESC);

-- Verify
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'my_table') THEN
    RAISE EXCEPTION 'Migration verification failed: table not created';
  END IF;
END $$;

COMMIT;
```

---

*Last updated: January 2025*
