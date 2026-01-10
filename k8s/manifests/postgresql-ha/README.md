# PostgreSQL High Availability Setup

This directory contains the Kubernetes manifests for deploying a production-grade PostgreSQL HA cluster for the Blockd platform.

## Architecture

```
                                    ┌─────────────────────────────────────────┐
                                    │           Application Services           │
                                    └───────────────────┬─────────────────────┘
                                                        │
                                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                              PgBouncer (Connection Pooler)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                                   │
│  │  pgbouncer-0 │  │  pgbouncer-1 │  │  pgbouncer-2 │  (HPA: 3-10 replicas)           │
│  └─────────────┘  └─────────────┘  └─────────────┘                                   │
│                                                                                       │
│  Pool Mode: Transaction | Max Clients: 2000 | Default Pool: 50                       │
└────────────────────────────────────┬──────────────────────────────────────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           │                         │                         │
           ▼                         ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│   PostgreSQL-HA-0   │   │   PostgreSQL-HA-1   │   │   PostgreSQL-HA-2   │
│      (PRIMARY)      │◀──│     (REPLICA)       │   │     (REPLICA)       │
│                     │   │                     │   │                     │
│  Patroni Leader     │   │  Streaming Rep.     │   │  Streaming Rep.     │
│  Read-Write         │   │  Read-Only          │   │  Read-Only          │
└──────────┬──────────┘   └─────────────────────┘   └─────────────────────┘
           │
           │ WAL Archiving
           ▼
┌─────────────────────┐
│       AWS S3        │
│  WAL + Base Backups │
│  (PITR Support)     │
└─────────────────────┘

┌───────────────────────────────────────────────────────────────────────────────────────┐
│                              etcd Cluster (Consensus)                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                                   │
│  │   etcd-0    │──│   etcd-1    │──│   etcd-2    │  Leader Election                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                                   │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

## Components

| Component | Replicas | Purpose |
|-----------|----------|---------|
| PostgreSQL (Patroni) | 3 | 1 Primary + 2 Read Replicas with automatic failover |
| PgBouncer | 3-10 (HPA) | Connection pooling for 2000+ concurrent connections |
| etcd | 3 | Distributed consensus for leader election |
| Backup Jobs | CronJobs | Daily base backups + continuous WAL archiving |

## Prerequisites

- Kubernetes 1.28+
- Storage class `fast-ssd` with SSD-backed volumes
- AWS S3 bucket for backups
- External Secrets Operator (optional, for secret management)

## Deployment

### 1. Create Secrets

Before deploying, create the required secrets:

```bash
kubectl create secret generic postgresql-ha-secrets \
  --namespace=blockd \
  --from-literal=postgres-password=<STRONG_PASSWORD> \
  --from-literal=replication-password=<STRONG_PASSWORD> \
  --from-literal=blockd-user-password=<STRONG_PASSWORD>

kubectl create secret generic blockd-secrets \
  --namespace=blockd \
  --from-literal=aws-access-key-id=<AWS_KEY> \
  --from-literal=aws-secret-access-key=<AWS_SECRET> \
  --from-literal=pgbouncer_stats_password=<STATS_PASSWORD>
```

### 2. Deploy PostgreSQL HA

```bash
# Deploy all components
kubectl apply -k k8s/manifests/postgresql-ha/

# Or deploy individually:
kubectl apply -f k8s/manifests/postgresql-ha/etcd-cluster.yaml
kubectl apply -f k8s/manifests/postgresql-ha/postgresql-ha-statefulset.yaml
kubectl apply -f k8s/manifests/postgresql-ha/postgresql-ha-services.yaml
kubectl apply -f k8s/manifests/postgresql-ha/pgbouncer-deployment.yaml
kubectl apply -f k8s/manifests/postgresql-ha/postgresql-backup-pitr.yaml
```

### 3. Verify Deployment

```bash
# Check etcd cluster
kubectl exec -it etcd-0 -n blockd -- etcdctl endpoint health

# Check Patroni cluster status
kubectl exec -it postgresql-ha-0 -n blockd -- patronictl list

# Expected output:
# + Cluster: blockd-postgres ----+---------+---------+----+-----------+
# | Member            | Host      | Role    | State   | TL | Lag in MB |
# +-------------------+-----------+---------+---------+----+-----------+
# | postgresql-ha-0   | 10.x.x.x  | Leader  | running |  1 |           |
# | postgresql-ha-1   | 10.x.x.x  | Replica | running |  1 |         0 |
# | postgresql-ha-2   | 10.x.x.x  | Replica | running |  1 |         0 |
# +-------------------+-----------+---------+---------+----+-----------+

# Check PgBouncer
kubectl exec -it deploy/pgbouncer -n blockd -- psql -h localhost -p 6432 -U pgbouncer_stats pgbouncer -c "SHOW POOLS"
```

## Connection Endpoints

| Service | Port | Use Case |
|---------|------|----------|
| `pgbouncer:5432` | 5432 | **Primary endpoint** - Use for all application connections |
| `pgbouncer:5432/blockd_readonly` | 5432 | Read-only queries (load balanced across replicas) |
| `postgresql-ha-primary:5432` | 5432 | Direct primary connection (migrations, bypasses pooling) |
| `postgresql-ha-replica:5432` | 5432 | Direct replica connection (debugging) |

### Connection Strings

```bash
# Read-write (via PgBouncer - RECOMMENDED)
DATABASE_URL=postgresql://blockd_user:password@pgbouncer:5432/blockd

# Read-only (via PgBouncer, load balanced)
DATABASE_URL_READONLY=postgresql://blockd_user:password@pgbouncer:5432/blockd_readonly

# Direct to primary (migrations only)
DATABASE_URL_DIRECT=postgresql://blockd_user:password@postgresql-ha-primary:5432/blockd
```

## Backup & Recovery

### Daily Backups

- **Schedule**: Daily at 2:00 AM UTC
- **Retention**: 30 days
- **Location**: `s3://blockd-backups-production/base-backups/`

### WAL Archiving

- **Frequency**: Continuous (every 5 minutes or 16MB)
- **Retention**: 7 days
- **Location**: `s3://blockd-backups-production/wal-archive/`

### Point-in-Time Recovery (PITR)

To recover to a specific point in time:

```bash
# 1. Stop all application traffic

# 2. Get the recovery script
kubectl cp blockd/postgresql-ha-0:/scripts/pitr-restore.sh ./pitr-restore.sh

# 3. Execute recovery (example: recover to 10:30 AM on Jan 15)
kubectl exec -it postgresql-ha-0 -n blockd -- /scripts/pitr-restore.sh 20240115_020000 "2024-01-15 10:30:00"

# 4. Wait for recovery to complete
kubectl logs -f postgresql-ha-0 -n blockd

# 5. Resume application traffic
```

### Manual Backup

```bash
# Trigger immediate backup
kubectl create job --from=cronjob/postgresql-base-backup manual-backup-$(date +%Y%m%d) -n blockd
```

## Failover

Patroni automatically handles failover. To manually trigger:

```bash
# Switchover (planned, minimal downtime)
kubectl exec -it postgresql-ha-0 -n blockd -- patronictl switchover --master postgresql-ha-0 --candidate postgresql-ha-1 --force

# Failover (unplanned, when primary is down)
kubectl exec -it postgresql-ha-1 -n blockd -- patronictl failover --candidate postgresql-ha-1 --force
```

## Monitoring

### Prometheus Metrics

| Metric | Description |
|--------|-------------|
| `pg_stat_activity_count` | Active database connections |
| `pg_stat_replication_lag_bytes` | Replication lag in bytes |
| `pgbouncer_pools_client_active` | Active client connections |
| `pgbouncer_pools_server_active` | Active server connections |
| `pgbouncer_stats_queries_total` | Total queries processed |

### Grafana Dashboard

Import the PostgreSQL dashboard from `k8s/monitoring/grafana/dashboards/database.json`

### Alerts

Key alerts in `monitoring/prometheus/alerts.yml`:

- `DatabaseConnectionPoolExhausted` - PgBouncer pool > 90% utilized
- `HighDatabaseQueryTime` - Average query time > 1 second
- `PostgreSQLReplicationLag` - Replica lag > 1MB

## Scaling

### Vertical Scaling

Edit the StatefulSet resources:

```bash
kubectl edit statefulset postgresql-ha -n blockd
# Increase resources.requests.memory, resources.limits.cpu, etc.
```

### Horizontal Scaling (Read Replicas)

```bash
# Scale to 4 replicas (1 primary + 3 read replicas)
kubectl scale statefulset postgresql-ha --replicas=4 -n blockd
```

## Troubleshooting

### Check Patroni Status

```bash
kubectl exec -it postgresql-ha-0 -n blockd -- patronictl list
kubectl exec -it postgresql-ha-0 -n blockd -- patronictl show-config
```

### Check Replication Lag

```bash
kubectl exec -it postgresql-ha-0 -n blockd -- psql -U postgres -c "SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn FROM pg_stat_replication"
```

### Check PgBouncer Stats

```bash
kubectl exec -it deploy/pgbouncer -n blockd -- psql -h localhost -p 6432 -U pgbouncer_stats pgbouncer -c "SHOW STATS"
kubectl exec -it deploy/pgbouncer -n blockd -- psql -h localhost -p 6432 -U pgbouncer_stats pgbouncer -c "SHOW CLIENTS"
```

### View WAL Archive Status

```bash
aws s3 ls s3://blockd-backups-production/wal-archive/ --recursive | tail -20
```

### Force Leader Election

```bash
kubectl exec -it postgresql-ha-0 -n blockd -- patronictl pause
kubectl exec -it postgresql-ha-0 -n blockd -- patronictl resume
```

## Migration from Single Instance

To migrate from the basic single-instance PostgreSQL to this HA setup:

1. **Take a full backup of the existing database**
   ```bash
   kubectl exec -it postgres-0 -n blockd -- pg_dumpall -U postgres > full_backup.sql
   ```

2. **Deploy the HA cluster**
   ```bash
   kubectl apply -k k8s/manifests/postgresql-ha/
   ```

3. **Restore the backup to the new cluster**
   ```bash
   kubectl cp full_backup.sql blockd/postgresql-ha-0:/tmp/
   kubectl exec -it postgresql-ha-0 -n blockd -- psql -U postgres -f /tmp/full_backup.sql
   ```

4. **Update application DATABASE_URL to point to PgBouncer**
   ```bash
   # Update secret with new connection string
   kubectl patch secret blockd-secrets -n blockd -p '{"stringData":{"database-url":"postgresql://blockd_user:password@pgbouncer:5432/blockd"}}'
   ```

5. **Rolling restart of application pods**
   ```bash
   kubectl rollout restart deployment -n blockd
   ```

6. **Delete old PostgreSQL StatefulSet**
   ```bash
   kubectl delete statefulset postgres -n blockd
   ```

## Files Reference

| File | Description |
|------|-------------|
| `etcd-cluster.yaml` | etcd StatefulSet for Patroni consensus |
| `postgresql-ha-statefulset.yaml` | PostgreSQL + Patroni StatefulSet |
| `postgresql-ha-services.yaml` | Services for primary, replica, and read endpoints |
| `pgbouncer-deployment.yaml` | PgBouncer connection pooler |
| `postgresql-backup-pitr.yaml` | Backup CronJobs and scripts |
| `kustomization.yaml` | Kustomize configuration |
