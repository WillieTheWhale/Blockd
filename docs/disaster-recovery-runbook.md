# Disaster Recovery Runbook

## Blockd Platform - Production DR Procedures

**Last Updated:** 2024-01-15
**Version:** 1.0
**Owner:** Platform Engineering Team

---

## Table of Contents

1. [Overview](#overview)
2. [Recovery Time Objectives](#recovery-time-objectives)
3. [Contact Information](#contact-information)
4. [Incident Classification](#incident-classification)
5. [DR Procedures](#dr-procedures)
6. [Database Recovery](#database-recovery)
7. [Service Recovery](#service-recovery)
8. [Rollback Procedures](#rollback-procedures)
9. [Post-Incident](#post-incident)

---

## Overview

This runbook provides step-by-step procedures for recovering the Blockd platform from various disaster scenarios. All on-call engineers should be familiar with these procedures.

### Architecture Summary

```
Primary Region: us-east-1
DR Region: us-west-2

Components:
- EKS Cluster (production)
- RDS PostgreSQL (Multi-AZ)
- ElastiCache Redis (Cluster mode)
- S3 Buckets (Cross-region replication)
- Route 53 (Health checks + failover)
```

---

## Recovery Time Objectives

| Scenario | RTO | RPO | Priority |
|----------|-----|-----|----------|
| Single pod failure | 30s | 0 | P4 |
| Single node failure | 2 min | 0 | P3 |
| AZ failure | 5 min | 0 | P2 |
| Database primary failure | 5 min | 0 | P1 |
| Region failure | 30 min | 5 min | P0 |
| Data corruption | 2 hr | varies | P0 |

---

## Contact Information

### Escalation Path

1. **On-Call Engineer** - PagerDuty (blockd-oncall)
2. **Platform Lead** - @platform-lead (Slack)
3. **VP Engineering** - Emergency only

### External Contacts

| Service | Contact | Account ID |
|---------|---------|------------|
| AWS Support | Premium Support Portal | 123456789012 |
| Cloudflare | support@cloudflare.com | blockd.io |
| PagerDuty | Admin Console | blockd |

---

## Incident Classification

### P0 - Critical (Complete Outage)
- All users affected
- Revenue impact
- Requires immediate action
- Auto-pages VP Engineering

### P1 - High (Major Degradation)
- >50% users affected
- Core functionality impaired
- Requires immediate attention

### P2 - Medium (Partial Degradation)
- <50% users affected
- Non-core functionality impaired
- Response within 30 minutes

### P3 - Low (Minor Issue)
- Minimal user impact
- Cosmetic issues
- Response within 4 hours

---

## DR Procedures

### Scenario 1: Pod/Container Failure

**Symptoms:**
- Alert: `KubePodNotReady`
- Increased error rates for specific service
- Health check failures

**Resolution:**

```bash
# 1. Check pod status
kubectl get pods -n production -l app=<service-name>

# 2. Check pod logs
kubectl logs -n production <pod-name> --tail=100

# 3. Check events
kubectl describe pod -n production <pod-name>

# 4. If CrashLoopBackOff, check resource limits
kubectl top pod -n production <pod-name>

# 5. Force restart if needed
kubectl delete pod -n production <pod-name>

# 6. Scale up if capacity issue
kubectl scale deployment/<service-name> -n production --replicas=<N+1>
```

**Verification:**
- [ ] Pod running and ready
- [ ] Health endpoint returning 200
- [ ] No error spikes in metrics

---

### Scenario 2: Node Failure

**Symptoms:**
- Alert: `KubeNodeNotReady`
- Multiple pods affected
- Pods in Pending state

**Resolution:**

```bash
# 1. Identify affected node
kubectl get nodes
kubectl describe node <node-name>

# 2. Cordon node to prevent new pods
kubectl cordon <node-name>

# 3. Drain pods (with grace period for WebSocket)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data --grace-period=120

# 4. If EKS, check ASG health
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names blockd-production-nodes

# 5. Terminate unhealthy node (ASG will replace)
aws autoscaling terminate-instance-in-auto-scaling-group \
  --instance-id <instance-id> \
  --should-decrement-desired-capacity=false

# 6. Verify new node joins
kubectl get nodes -w
```

---

### Scenario 3: Availability Zone Failure

**Symptoms:**
- Alert: `AZDown`
- Multiple nodes unreachable
- Significant capacity loss

**Resolution:**

```bash
# 1. Verify AZ status
aws ec2 describe-availability-zones --region us-east-1

# 2. Cordon all nodes in affected AZ
kubectl get nodes -l topology.kubernetes.io/zone=us-east-1a -o name | \
  xargs -I {} kubectl cordon {}

# 3. Check pod distribution
kubectl get pods -n production -o wide

# 4. Scale up in healthy AZs
kubectl scale deployment --all -n production --replicas=<N>

# 5. Verify topology spread
kubectl get pods -n production -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,ZONE:.spec.nodeSelector

# 6. If needed, add capacity to healthy AZs
aws autoscaling update-auto-scaling-group \
  --auto-scaling-group-name blockd-production-nodes-us-east-1b \
  --desired-capacity 10
```

---

### Scenario 4: Database Failure

**Symptoms:**
- Alert: `PostgresPrimaryDown`
- Connection errors in application logs
- High latency or timeouts

**Resolution for RDS Multi-AZ:**

```bash
# 1. Check RDS status
aws rds describe-db-instances --db-instance-identifier blockd-production

# 2. Check for ongoing failover
aws rds describe-events \
  --source-identifier blockd-production \
  --source-type db-instance \
  --duration 60

# 3. If failover stuck, initiate manual failover
aws rds reboot-db-instance \
  --db-instance-identifier blockd-production \
  --force-failover

# 4. Monitor failover progress
watch -n 5 "aws rds describe-db-instances --db-instance-identifier blockd-production --query 'DBInstances[0].DBInstanceStatus'"

# 5. Verify application connectivity
kubectl exec -n production deploy/api-gateway -- \
  psql $DATABASE_URL -c "SELECT 1"

# 6. Clear connection pools (restart pods)
kubectl rollout restart deployment -n production -l app.kubernetes.io/component=backend
```

---

### Scenario 5: Region Failure

**Symptoms:**
- Alert: `RegionDown`
- Complete loss of primary region
- Route 53 health checks failing

**Resolution:**

```bash
# 1. Verify region status
aws ec2 describe-regions --region us-west-2

# 2. Trigger Route 53 failover (if not automatic)
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch file://failover-to-dr.json

# 3. In DR region, verify cluster status
aws eks --region us-west-2 update-kubeconfig --name blockd-dr-cluster
kubectl get nodes
kubectl get pods -n production

# 4. Scale up DR cluster
kubectl scale deployment --all -n production --replicas=3

# 5. Verify database replica promotion
aws rds describe-db-instances \
  --region us-west-2 \
  --db-instance-identifier blockd-dr

# 6. Promote read replica to primary
aws rds promote-read-replica \
  --db-instance-identifier blockd-dr

# 7. Update application config to use DR database
kubectl set env deployment --all -n production \
  DATABASE_URL=<dr-database-url>

# 8. Verify all services
./scripts/health-check.sh --region us-west-2
```

---

## Database Recovery

### Point-in-Time Recovery (Data Corruption)

```bash
# 1. Identify corruption time
# Check application logs and metrics

# 2. Create new instance from backup
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier blockd-production \
  --target-db-instance-identifier blockd-recovery \
  --restore-time 2024-01-15T10:30:00Z \
  --db-instance-class db.r6g.xlarge

# 3. Wait for instance creation
aws rds wait db-instance-available \
  --db-instance-identifier blockd-recovery

# 4. Verify data integrity
psql -h <recovery-endpoint> -U admin -d blockd -c "
  SELECT COUNT(*) FROM users;
  SELECT COUNT(*) FROM interview_sessions;
  SELECT MAX(created_at) FROM interview_sessions;
"

# 5. Plan migration window
# - Notify users of maintenance
# - Stop new session creation

# 6. Switch application to recovered database
kubectl set env deployment --all -n production \
  DATABASE_URL=postgresql://...@<recovery-endpoint>/blockd

# 7. Verify application
kubectl rollout restart deployment -n production
./scripts/health-check.sh
```

### Restore from S3 Backup

```bash
# 1. List available backups
aws s3 ls s3://blockd-backups-production/backups/postgresql/

# 2. Download latest backup
BACKUP_NAME="blockd_backup_20240115_020000"
aws s3 cp s3://blockd-backups-production/backups/postgresql/${BACKUP_NAME}/ \
  /tmp/restore/ --recursive

# 3. Verify checksum
cd /tmp/restore && sha256sum -c checksums.sha256

# 4. Create new database
psql -h <db-host> -U admin -d postgres -c "
  CREATE DATABASE blockd_restored;
"

# 5. Restore
pg_restore \
  --host=<db-host> \
  --username=admin \
  --dbname=blockd_restored \
  --verbose \
  --jobs=4 \
  /tmp/restore/database.dump

# 6. Verify
psql -h <db-host> -U admin -d blockd_restored -c "
  SELECT COUNT(*) FROM users;
"
```

---

## Service Recovery

### API Gateway Recovery

```bash
# 1. Check deployment status
kubectl get deployment api-gateway -n production -o yaml

# 2. Check recent changes
kubectl rollout history deployment/api-gateway -n production

# 3. Rollback if needed
kubectl rollout undo deployment/api-gateway -n production

# 4. Or rollback to specific revision
kubectl rollout undo deployment/api-gateway -n production --to-revision=5

# 5. Verify
kubectl rollout status deployment/api-gateway -n production
```

### WebSocket Service Recovery

```bash
# Important: WebSocket connections are stateful
# Gradual restart to minimize disruption

# 1. Scale up first
kubectl scale deployment/websocket-service -n production --replicas=6

# 2. Wait for new pods
kubectl rollout status deployment/websocket-service -n production

# 3. Restart one pod at a time
kubectl delete pod -n production websocket-service-xxx --wait=false
sleep 60
kubectl delete pod -n production websocket-service-yyy --wait=false
# Continue for each pod

# 4. Scale back down
kubectl scale deployment/websocket-service -n production --replicas=3
```

### Redis Recovery

```bash
# For ElastiCache Redis cluster

# 1. Check cluster status
aws elasticache describe-replication-groups \
  --replication-group-id blockd-redis

# 2. Failover to replica
aws elasticache modify-replication-group \
  --replication-group-id blockd-redis \
  --primary-cluster-id blockd-redis-002 \
  --apply-immediately

# 3. If need to rebuild
aws elasticache create-cache-cluster \
  --cache-cluster-id blockd-redis-new \
  --replication-group-id blockd-redis

# 4. Application may need restart
kubectl rollout restart deployment -n production -l app.kubernetes.io/component=backend
```

---

## Rollback Procedures

### Helm Rollback

```bash
# 1. List release history
helm history blockd -n production

# 2. Rollback to previous
helm rollback blockd -n production

# 3. Or rollback to specific revision
helm rollback blockd 5 -n production

# 4. Verify
helm status blockd -n production
```

### Full Environment Rollback

```bash
# Using GitHub Actions
gh workflow run auto-rollback.yml \
  -f environment=production \
  -f reason="Manual rollback due to incident"

# Or manually
kubectl scale deployment --all -n production --replicas=0
helm rollback blockd -n production
kubectl scale deployment --all -n production --replicas=3
```

---

## Post-Incident

### Immediate Actions

1. [ ] Verify all services healthy
2. [ ] Clear any incident alerts
3. [ ] Notify stakeholders (Slack #blockd-incidents)
4. [ ] Document timeline in incident channel

### Within 24 Hours

1. [ ] Create incident report (template in Confluence)
2. [ ] Gather metrics and logs
3. [ ] Identify root cause
4. [ ] Document what worked/didn't work

### Within 1 Week

1. [ ] Schedule post-mortem meeting
2. [ ] Create action items for prevention
3. [ ] Update runbook if needed
4. [ ] Test any new procedures

### Post-Mortem Template

```markdown
## Incident Summary
- **Date:**
- **Duration:**
- **Severity:**
- **Impact:**

## Timeline
- HH:MM - Event
- HH:MM - Detection
- HH:MM - Response
- HH:MM - Resolution

## Root Cause

## Resolution

## Lessons Learned

## Action Items
- [ ] Item 1 - Owner - Due Date
- [ ] Item 2 - Owner - Due Date
```

---

## Appendix

### Useful Commands

```bash
# Quick health check
kubectl get pods -n production -o wide
kubectl top pods -n production
curl -s https://blockd.io/api/v1/health | jq

# Logs
kubectl logs -n production -l app=api-gateway --tail=100 -f
stern -n production api-gateway

# Events
kubectl get events -n production --sort-by='.lastTimestamp'

# Network debugging
kubectl run debug --image=nicolaka/netshoot -it --rm -- bash
```

### Emergency Contacts

- **AWS TAM:** [AWS Support Portal]
- **PagerDuty Admin:** admin@blockd.com
- **Security Team:** security@blockd.com
