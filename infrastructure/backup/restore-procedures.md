# Backup Restore Procedures

This document outlines step-by-step procedures for restoring Blockd platform from backups.

## Table of Contents
- [Database Restore](#database-restore)
- [Redis Restore](#redis-restore)
- [S3 Video Storage Restore](#s3-video-storage-restore)
- [Full System Restore](#full-system-restore)

## Database Restore

### List Available Backups

```bash
# List all database backups
aws s3 ls s3://blockd-backups-production/database/

# Get latest backup
LATEST_BACKUP=$(aws s3 ls s3://blockd-backups-production/database/ | sort | tail -n 1 | awk '{print $4}')
echo "Latest backup: $LATEST_BACKUP"
```

### Restore from Backup

#### Option 1: Restore to Existing Database (Destructive)

```bash
# Download backup
aws s3 cp s3://blockd-backups-production/database/$LATEST_BACKUP /tmp/backup.sql.gz

# Stop all services to prevent writes
kubectl scale deployment --all --replicas=0 -n production

# Drop and recreate database
psql -h $DB_HOST -U $DB_USER -c "DROP DATABASE IF EXISTS blockd;"
psql -h $DB_HOST -U $DB_USER -c "CREATE DATABASE blockd;"

# Restore backup
gunzip < /tmp/backup.sql.gz | psql -h $DB_HOST -U $DB_USER -d blockd

# Verify restore
psql -h $DB_HOST -U $DB_USER -d blockd -c "SELECT COUNT(*) FROM users;"

# Restart services
kubectl scale deployment --all --replicas=3 -n production
```

#### Option 2: Restore to New Database (Safe)

```bash
# Create new RDS instance using Terraform
cd infrastructure/terraform
terraform apply -target=module.database.aws_db_instance.postgresql_restore

# Download and restore backup to new instance
aws s3 cp s3://blockd-backups-production/database/$LATEST_BACKUP /tmp/backup.sql.gz
gunzip < /tmp/backup.sql.gz | psql -h $NEW_DB_HOST -U $DB_USER -d blockd

# Update database connection in secrets manager
aws secretsmanager update-secret \
  --secret-id blockd-production-db-connection-string \
  --secret-string "postgresql://$DB_USER:$DB_PASS@$NEW_DB_HOST:5432/blockd"

# Restart pods to pick up new connection string
kubectl rollout restart deployment -n production
```

#### Option 3: Point-in-Time Recovery (AWS RDS)

```bash
# Restore to specific point in time
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier blockd-production-postgres \
  --target-db-instance-identifier blockd-production-postgres-restored \
  --restore-time "2024-01-15T14:30:00Z"

# Wait for restore to complete
aws rds wait db-instance-available \
  --db-instance-identifier blockd-production-postgres-restored

# Get new endpoint
NEW_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier blockd-production-postgres-restored \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

echo "New database endpoint: $NEW_ENDPOINT"

# Update connection string
aws secretsmanager update-secret \
  --secret-id blockd-production-db-connection-string \
  --secret-string "postgresql://$DB_USER:$DB_PASS@$NEW_ENDPOINT:5432/blockd"
```

## Redis Restore

### Restore from AWS ElastiCache Snapshot

```bash
# List available snapshots
aws elasticache describe-snapshots \
  --cache-cluster-id blockd-production-redis

# Restore from snapshot
aws elasticache create-replication-group \
  --replication-group-id blockd-production-redis-restored \
  --replication-group-description "Restored Redis cluster" \
  --snapshot-name blockd-redis-backup-20240115 \
  --cache-node-type cache.r6g.large \
  --engine redis

# Wait for cluster to be available
aws elasticache wait replication-group-available \
  --replication-group-id blockd-production-redis-restored

# Get new endpoint
NEW_REDIS_ENDPOINT=$(aws elasticache describe-replication-groups \
  --replication-group-id blockd-production-redis-restored \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' \
  --output text)

echo "New Redis endpoint: $NEW_REDIS_ENDPOINT"

# Update connection string
aws secretsmanager update-secret \
  --secret-id blockd-production-redis-connection-string \
  --secret-string "redis://$NEW_REDIS_ENDPOINT:6379"
```

## S3 Video Storage Restore

### Restore from Cross-Region Replication

```bash
# List objects in replica bucket
aws s3 ls s3://blockd-videos-production-replica/

# Sync from replica to primary (if primary bucket was deleted)
aws s3 sync \
  s3://blockd-videos-production-replica/ \
  s3://blockd-videos-production/ \
  --storage-class STANDARD

# Verify sync
aws s3 ls s3://blockd-videos-production/ --recursive | wc -l
```

### Restore from Versioning

```bash
# List versions of a specific object
aws s3api list-object-versions \
  --bucket blockd-videos-production \
  --prefix sessions/session-123/video.mp4

# Restore specific version
aws s3api copy-object \
  --copy-source blockd-videos-production/sessions/session-123/video.mp4?versionId=VERSION_ID \
  --bucket blockd-videos-production \
  --key sessions/session-123/video.mp4
```

## Full System Restore

### Complete Disaster Recovery Scenario

**Recovery Time Objective (RTO):** 4 hours
**Recovery Point Objective (RPO):** 1 hour

#### Step 1: Provision Infrastructure (1 hour)

```bash
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Apply infrastructure
terraform apply -auto-approve

# Wait for all resources to be available
```

#### Step 2: Restore Database (1 hour)

```bash
# Get latest backup
LATEST_BACKUP=$(aws s3 ls s3://blockd-backups-production/database/ | sort | tail -n 1 | awk '{print $4}')

# Download and restore
aws s3 cp s3://blockd-backups-production/database/$LATEST_BACKUP /tmp/backup.sql.gz
gunzip < /tmp/backup.sql.gz | psql -h $(terraform output -raw db_endpoint) -U blockd_admin -d blockd
```

#### Step 3: Restore Redis (30 minutes)

```bash
# Redis will be restored from automatic snapshots via Terraform
# Or manually restore from snapshot if needed
```

#### Step 4: Deploy Application (1 hour)

```bash
# Configure kubectl
aws eks update-kubeconfig --name blockd-production-cluster --region us-east-1

# Deploy with Helm
cd k8s/helm/blockd
helm install blockd . \
  -f values-production.yaml \
  --namespace production \
  --create-namespace \
  --wait

# Wait for all pods to be ready
kubectl wait --for=condition=ready pod --all -n production --timeout=600s
```

#### Step 5: Verify System (30 minutes)

```bash
# Check all pods are running
kubectl get pods -n production

# Run smoke tests
curl https://blockd.io/api/health
curl https://blockd.io/api/auth/health
curl https://blockd.io/api/sessions/health

# Run full integration tests
cd tests/api
newman run sessions-api.postman_collection.json -e environments/production.json
```

#### Step 6: Enable Traffic (15 minutes)

```bash
# Update DNS if needed
aws route53 change-resource-record-sets \
  --hosted-zone-id ZONE_ID \
  --change-batch file://dns-update.json

# Monitor metrics
kubectl top pods -n production
watch -n 5 'kubectl get pods -n production'
```

## Testing Restore Procedures

### Monthly Restore Test

Run this test monthly to ensure backup and restore procedures work:

```bash
# 1. Create test namespace
kubectl create namespace restore-test

# 2. Restore latest backup to test database
LATEST_BACKUP=$(aws s3 ls s3://blockd-backups-production/database/ | sort | tail -n 1 | awk '{print $4}')
aws s3 cp s3://blockd-backups-production/database/$LATEST_BACKUP /tmp/test-restore.sql.gz

# 3. Restore to test database
gunzip < /tmp/test-restore.sql.gz | psql -h $TEST_DB_HOST -U $DB_USER -d blockd_test

# 4. Run validation queries
psql -h $TEST_DB_HOST -U $DB_USER -d blockd_test -f tests/validate-restore.sql

# 5. Clean up
psql -h $TEST_DB_HOST -U $DB_USER -c "DROP DATABASE blockd_test;"
kubectl delete namespace restore-test
```

## Rollback Procedures

### Rollback Deployment

```bash
# View rollout history
kubectl rollout history deployment/api-gateway -n production

# Rollback to previous version
kubectl rollout undo deployment/api-gateway -n production

# Rollback to specific revision
kubectl rollout undo deployment/api-gateway --to-revision=2 -n production

# Rollback all deployments (Helm)
helm rollback blockd --namespace production
```

## Emergency Contacts

- **DevOps Team Lead:** devops-lead@blockd.io
- **Database Admin:** dba@blockd.io
- **On-Call Engineer:** Pagerduty escalation
- **AWS Support:** Premium Support Case

## Post-Recovery Checklist

- [ ] All services running and healthy
- [ ] Database integrity verified
- [ ] Redis cache warmed up
- [ ] SSL certificates valid
- [ ] Monitoring and alerts functioning
- [ ] Backup jobs running
- [ ] Document incident in post-mortem
- [ ] Update disaster recovery procedures if needed
