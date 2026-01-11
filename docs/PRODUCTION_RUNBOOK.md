# Blockd Platform - Production Runbook

This runbook provides comprehensive guidance for deploying, operating, and troubleshooting the Blockd platform in production.

## Table of Contents

1. [System Overview](#system-overview)
2. [Deployment Procedures](#deployment-procedures)
3. [Health Checks & Monitoring](#health-checks--monitoring)
4. [Incident Response](#incident-response)
5. [Common Issues & Resolutions](#common-issues--resolutions)
6. [Scaling Procedures](#scaling-procedures)
7. [Backup & Recovery](#backup--recovery)
8. [Security Procedures](#security-procedures)
9. [On-Call Guide](#on-call-guide)

---

## System Overview

### Architecture Diagram

```
                                    ┌─────────────────┐
                                    │   CloudFlare    │
                                    │   (CDN/WAF)     │
                                    └────────┬────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              │      Load Balancer          │
                              │   (AWS ALB / GCP GLB)       │
                              └──────────────┬──────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
            ┌───────┴───────┐       ┌───────┴───────┐       ┌───────┴───────┐
            │  API Gateway  │       │   WebSocket   │       │    Video      │
            │   (3 pods)    │       │   (3 pods)    │       │   (3 pods)    │
            └───────┬───────┘       └───────┬───────┘       └───────┬───────┘
                    │                        │                        │
        ┌───────────┼───────────┬───────────┼───────────┬────────────┼────────────┐
        │           │           │           │           │            │            │
  ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐ ┌────┴────┐ ┌────┴────┐
  │   Auth    │ │Session│ │    AI     │ │  Eye  │ │ Response  │ │PostgreSQL│ │  Redis  │
  │  Service  │ │Service│ │ Detection │ │Track  │ │  Timing   │ │ (Primary)│ │ Cluster │
  └───────────┘ └───────┘ └───────────┘ └───────┘ └───────────┘ └──────────┘ └─────────┘
```

### Service Endpoints

| Service | Internal Port | External Port | Path |
|---------|---------------|---------------|------|
| API Gateway | 3001 | 443 | `/api/*` |
| WebSocket | 3003 | 443 | `/ws/*` |
| Video/WebRTC | 3006 | 443 | `/video/*` |
| Auth Service | 3002 | - | Internal only |
| Session Service | 3004 | - | Internal only |
| AI Detection | 8004 | - | Internal only |
| Eye Tracking | 8005 | - | Internal only |
| Response Timing | 8006 | - | Internal only |

### Critical Dependencies

| Dependency | Priority | Impact if Down |
|------------|----------|----------------|
| PostgreSQL | P0 | Complete outage |
| Redis | P0 | Auth failures, rate limiting broken |
| RabbitMQ | P1 | Background jobs fail, delayed processing |
| S3 | P1 | Video recordings fail |
| OpenAI API | P2 | AI detection degraded |
| SendGrid | P3 | Email alerts fail |

---

## Deployment Procedures

### Pre-deployment Checklist

```markdown
## Pre-deployment Verification

### Code Changes
- [ ] All tests passing in CI
- [ ] Code review approved
- [ ] Security scan completed
- [ ] Breaking changes documented

### Infrastructure
- [ ] Database migrations tested on staging
- [ ] Resource limits verified
- [ ] Secrets updated if needed
- [ ] Feature flags configured

### Communication
- [ ] Deployment window scheduled
- [ ] Stakeholders notified
- [ ] On-call team aware
```

### Standard Deployment

```bash
#!/bin/bash
# scripts/deploy-production.sh

set -e

VERSION=$1
if [ -z "$VERSION" ]; then
    echo "Usage: ./deploy-production.sh <version>"
    exit 1
fi

echo "=== Deploying Blockd v$VERSION to Production ==="

# 1. Run database migrations first
echo "Step 1: Running database migrations..."
kubectl apply -f k8s/production/migrations/migration-job.yaml
kubectl wait --for=condition=complete job/prisma-migrate -n blockd --timeout=600s

# 2. Deploy backend services
echo "Step 2: Deploying backend services..."
helm upgrade blockd-backend ./k8s/helm/blockd \
    --namespace blockd \
    --set image.tag=$VERSION \
    --set env=production \
    --wait \
    --timeout=10m

# 3. Verify deployment
echo "Step 3: Verifying deployment..."
kubectl rollout status deployment/api-gateway -n blockd
kubectl rollout status deployment/websocket-service -n blockd
kubectl rollout status deployment/video-service -n blockd

# 4. Run smoke tests
echo "Step 4: Running smoke tests..."
./scripts/run-smoke-tests.sh production

# 5. Verify metrics
echo "Step 5: Checking metrics..."
./scripts/check-deployment-metrics.sh

echo "=== Deployment Complete ==="
```

### Blue-Green Deployment

```bash
#!/bin/bash
# scripts/blue-green-deploy.sh

VERSION=$1
CURRENT_SLOT=$(kubectl get ingress blockd-ingress -n blockd -o jsonpath='{.metadata.annotations.active-slot}')

if [ "$CURRENT_SLOT" == "blue" ]; then
    NEW_SLOT="green"
else
    NEW_SLOT="blue"
fi

echo "Current slot: $CURRENT_SLOT"
echo "Deploying to: $NEW_SLOT"

# Deploy to new slot
helm upgrade blockd-$NEW_SLOT ./k8s/helm/blockd \
    --namespace blockd \
    --set slot=$NEW_SLOT \
    --set image.tag=$VERSION \
    --wait

# Verify new deployment
kubectl rollout status deployment/api-gateway-$NEW_SLOT -n blockd

# Run smoke tests on new slot
./scripts/run-smoke-tests.sh $NEW_SLOT

# Switch traffic
echo "Switching traffic to $NEW_SLOT..."
kubectl patch ingress blockd-ingress -n blockd \
    --type=json \
    -p='[{"op": "replace", "path": "/metadata/annotations/active-slot", "value": "'$NEW_SLOT'"}]'

# Wait and verify
sleep 30
./scripts/verify-traffic.sh $NEW_SLOT

echo "Deployment complete. Old slot ($CURRENT_SLOT) available for rollback."
```

### Rollback Procedure

```bash
#!/bin/bash
# scripts/rollback.sh

echo "=== Initiating Rollback ==="

# Get previous revision
CURRENT=$(helm history blockd-backend -n blockd | tail -1 | awk '{print $1}')
PREVIOUS=$((CURRENT - 1))

echo "Rolling back from revision $CURRENT to $PREVIOUS..."

# Rollback Helm release
helm rollback blockd-backend $PREVIOUS -n blockd --wait

# Verify rollback
kubectl rollout status deployment/api-gateway -n blockd

# Run smoke tests
./scripts/run-smoke-tests.sh production

echo "=== Rollback Complete ==="
```

---

## Health Checks & Monitoring

### Health Endpoints

| Service | Health Endpoint | Expected Response |
|---------|-----------------|-------------------|
| API Gateway | `GET /health` | `{"status": "healthy"}` |
| WebSocket | `GET /health` | `{"status": "healthy"}` |
| Video Service | `GET /health` | `{"status": "healthy", "workers": N}` |
| AI Detection | `GET /health` | `{"status": "healthy"}` |

### Kubernetes Probes

```yaml
# Configured in deployments
livenessProbe:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 3001
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Key Metrics to Monitor

| Metric | Warning Threshold | Critical Threshold |
|--------|-------------------|-------------------|
| API Response Time (p95) | >500ms | >2000ms |
| Error Rate (5xx) | >1% | >5% |
| CPU Usage | >70% | >90% |
| Memory Usage | >80% | >95% |
| Database Connections | >80% of pool | >95% of pool |
| WebSocket Connections | >80% capacity | >95% capacity |
| Redis Memory | >70% | >90% |
| Disk Usage | >75% | >90% |

### Grafana Dashboards

1. **System Overview** - High-level health
2. **API Performance** - Latency, error rates
3. **WebSocket Metrics** - Connection counts, message rates
4. **Video Streaming** - Bandwidth, packet loss
5. **AI Detection** - Processing times, cache hits
6. **Database Performance** - Query times, connections

### Alert Configuration

```yaml
# Prometheus alert rules
groups:
- name: blockd-alerts
  rules:
  - alert: HighErrorRate
    expr: |
      sum(rate(http_requests_total{status=~"5.."}[5m])) /
      sum(rate(http_requests_total[5m])) > 0.05
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected"
      description: "Error rate is {{ humanizePercentage $value }}"

  - alert: ServiceDown
    expr: up{job=~"blockd-.*"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Service {{ $labels.job }} is down"

  - alert: HighLatency
    expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High latency on {{ $labels.service }}"
```

---

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| P0 | Complete outage | 15 min | All services down, data loss |
| P1 | Major degradation | 30 min | Auth broken, video not working |
| P2 | Partial degradation | 2 hours | AI detection slow, some errors |
| P3 | Minor issues | 24 hours | UI glitch, non-critical feature |

### Incident Response Procedure

```markdown
## Incident Response Checklist

### 1. Detection & Assessment (5 min)
- [ ] Acknowledge alert
- [ ] Verify impact scope
- [ ] Determine severity level
- [ ] Start incident timer

### 2. Communication (10 min)
- [ ] Notify on-call team
- [ ] Update status page (if P0/P1)
- [ ] Create incident channel

### 3. Investigation (ongoing)
- [ ] Check monitoring dashboards
- [ ] Review recent deployments
- [ ] Examine application logs
- [ ] Check external dependencies

### 4. Mitigation
- [ ] Implement immediate fix
- [ ] Or rollback if deployment-related
- [ ] Scale resources if needed
- [ ] Enable maintenance mode if required

### 5. Resolution
- [ ] Verify fix
- [ ] Clear all alerts
- [ ] Update status page
- [ ] Notify stakeholders

### 6. Post-Incident
- [ ] Schedule post-mortem (P0/P1)
- [ ] Document timeline
- [ ] Identify root cause
- [ ] Create follow-up tickets
```

### Quick Diagnostic Commands

```bash
# Check all pod status
kubectl get pods -n blockd -o wide

# Check recent events
kubectl get events -n blockd --sort-by='.lastTimestamp' | tail -20

# View service logs
kubectl logs -l app=api-gateway -n blockd --tail=100 -f

# Check resource usage
kubectl top pods -n blockd

# Check database connections
kubectl exec -it postgres-0 -n blockd -- psql -U blockd -c "SELECT count(*) FROM pg_stat_activity;"

# Check Redis memory
kubectl exec -it redis-0 -n blockd -- redis-cli INFO memory

# Test service connectivity
kubectl run test --rm -it --image=curlimages/curl -- curl -s http://api-gateway:3001/health
```

---

## Common Issues & Resolutions

### API Gateway Issues

#### High Latency

```bash
# Check if database is slow
kubectl exec -it postgres-0 -n blockd -- psql -U blockd -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds';"

# Check Redis connectivity
kubectl exec -it api-gateway-xxx -n blockd -- redis-cli -h redis ping

# Scale if needed
kubectl scale deployment api-gateway --replicas=5 -n blockd
```

#### Authentication Failures

```bash
# Check JWT verification
kubectl logs -l app=api-gateway -n blockd | grep -i "jwt\|auth\|token"

# Verify secrets are mounted
kubectl exec -it api-gateway-xxx -n blockd -- env | grep JWT

# Check Redis session store
kubectl exec -it redis-0 -n blockd -- redis-cli KEYS "session:*" | head
```

### WebSocket Issues

#### Connection Drops

```bash
# Check connection counts
kubectl exec -it websocket-xxx -n blockd -- curl localhost:3003/health

# Check memory usage (connection leak?)
kubectl top pods -l app=websocket-service -n blockd

# Check for networking issues
kubectl exec -it websocket-xxx -n blockd -- netstat -an | grep ESTABLISHED | wc -l
```

### Video Service Issues

#### High Packet Loss

```bash
# Check mediasoup stats
curl http://video-service:3006/stats

# Check network policies
kubectl get networkpolicies -n blockd

# Verify RTC port range is open
kubectl exec -it video-xxx -n blockd -- netstat -uln | grep -E "4[0-9]{4}"
```

### Database Issues

#### Connection Pool Exhausted

```bash
# Check current connections
kubectl exec -it postgres-0 -n blockd -- psql -U blockd -c "
SELECT count(*) as total,
       count(*) FILTER (WHERE state = 'active') as active,
       count(*) FILTER (WHERE state = 'idle') as idle
FROM pg_stat_activity;"

# Kill idle connections
kubectl exec -it postgres-0 -n blockd -- psql -U blockd -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND query_start < now() - interval '30 minutes';"

# Scale up connection pool
kubectl set env deployment/api-gateway DATABASE_CONNECTION_LIMIT=100 -n blockd
```

### Redis Issues

#### Memory Exhaustion

```bash
# Check memory
kubectl exec -it redis-0 -n blockd -- redis-cli INFO memory

# Clear expired keys
kubectl exec -it redis-0 -n blockd -- redis-cli BGSAVE

# Flush cache (careful!)
kubectl exec -it redis-0 -n blockd -- redis-cli FLUSHDB
```

---

## Scaling Procedures

### Horizontal Scaling

```bash
# Scale deployment
kubectl scale deployment api-gateway --replicas=10 -n blockd

# Auto-scaling is configured via HPA
kubectl get hpa -n blockd
```

### Vertical Scaling

```yaml
# Update resource limits
kubectl patch deployment api-gateway -n blockd --type=json -p='[
  {"op": "replace", "path": "/spec/template/spec/containers/0/resources/limits/memory", "value": "2Gi"},
  {"op": "replace", "path": "/spec/template/spec/containers/0/resources/limits/cpu", "value": "2000m"}
]'
```

### Database Scaling

```bash
# Add read replica
aws rds create-db-instance-read-replica \
    --db-instance-identifier blockd-prod-read-1 \
    --source-db-instance-identifier blockd-prod

# Scale RDS instance (requires maintenance window)
aws rds modify-db-instance \
    --db-instance-identifier blockd-prod \
    --db-instance-class db.r6g.2xlarge \
    --apply-immediately
```

---

## Backup & Recovery

### Automated Backups

| Data | Backup Method | Frequency | Retention |
|------|---------------|-----------|-----------|
| PostgreSQL | RDS automated snapshots | Daily | 30 days |
| PostgreSQL | pg_dump to S3 | Hourly | 7 days |
| Redis | RDB snapshot | Hourly | 24 hours |
| S3 Videos | Cross-region replication | Continuous | 90 days |
| Secrets | AWS Secrets Manager versioning | On change | 30 versions |

### Manual Backup

```bash
# Database backup
kubectl exec -it postgres-0 -n blockd -- pg_dump -U blockd blockd | gzip > backup-$(date +%Y%m%d).sql.gz

# Upload to S3
aws s3 cp backup-$(date +%Y%m%d).sql.gz s3://blockd-backups/database/

# Redis backup
kubectl exec -it redis-0 -n blockd -- redis-cli BGSAVE
kubectl cp blockd/redis-0:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb
```

### Recovery Procedure

```bash
# Database restore from backup
kubectl exec -it postgres-0 -n blockd -- psql -U blockd -c "DROP DATABASE blockd; CREATE DATABASE blockd;"
gunzip < backup.sql.gz | kubectl exec -it postgres-0 -n blockd -- psql -U blockd blockd

# Redis restore
kubectl cp redis-backup.rdb blockd/redis-0:/data/dump.rdb
kubectl exec -it redis-0 -n blockd -- redis-cli SHUTDOWN NOSAVE
# Redis will restart and load dump.rdb
```

---

## Security Procedures

### Certificate Rotation

```bash
# Check certificate expiry
kubectl get certificate -n blockd

# Force renewal
kubectl patch certificate blockd-tls -n blockd -p '{"spec":{"renewBefore":"720h"}}'
```

### Secret Rotation

```bash
# Rotate database password
1. Update password in RDS/Postgres
2. Update Kubernetes secret
3. Restart affected services

kubectl create secret generic blockd-secrets \
    --from-literal=DATABASE_URL="new-url" \
    --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart deployment -l requires-db=true -n blockd
```

### Security Incident Response

```markdown
## Security Incident Checklist

### Immediate Actions
- [ ] Contain: Revoke compromised credentials
- [ ] Preserve: Capture logs and evidence
- [ ] Notify: Security team and leadership

### Investigation
- [ ] Identify attack vector
- [ ] Determine data exposure
- [ ] Check for lateral movement
- [ ] Review audit logs

### Remediation
- [ ] Patch vulnerabilities
- [ ] Rotate all credentials
- [ ] Review access controls
- [ ] Update security policies
```

---

## On-Call Guide

### On-Call Responsibilities

1. **Monitor alerts** - Respond to pages within 15 minutes
2. **Triage incidents** - Assess severity and escalate if needed
3. **Document actions** - Record all troubleshooting steps
4. **Handoff** - Brief next on-call at rotation

### Escalation Path

```
L1: On-call Engineer (15 min response)
    ↓ After 30 min or if P0
L2: Team Lead / Senior Engineer
    ↓ After 1 hour or critical business impact
L3: Engineering Manager + VP of Engineering
    ↓ If data breach or extended outage
Executive: CEO, CTO, Legal
```

### Useful Aliases

```bash
# Add to ~/.bashrc or ~/.zshrc

# Quick pod access
alias kpods='kubectl get pods -n blockd'
alias klogs='kubectl logs -n blockd -f'

# Quick debugging
alias kexec='kubectl exec -it -n blockd'
alias kevents='kubectl get events -n blockd --sort-by=.lastTimestamp'

# Service health
alias khealth='for svc in api-gateway websocket video-service; do echo "=== $svc ===" && kubectl exec -it -n blockd $(kubectl get pod -n blockd -l app=$svc -o jsonpath="{.items[0].metadata.name}") -- curl -s localhost:3001/health; done'

# Quick scale
kscale() {
    kubectl scale deployment $1 --replicas=$2 -n blockd
}
```

### Post-Incident Template

```markdown
# Incident Report: [Title]

## Summary
- **Date/Time**:
- **Duration**:
- **Severity**: P0/P1/P2/P3
- **Services Affected**:

## Timeline
| Time | Event |
|------|-------|
| HH:MM | Alert triggered |
| HH:MM | Investigation started |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Incident resolved |

## Root Cause
[Description]

## Impact
- Users affected:
- Revenue impact:
- Data loss:

## Resolution
[What was done to fix it]

## Action Items
| Action | Owner | Due Date |
|--------|-------|----------|
| | | |

## Lessons Learned
- What went well:
- What could be improved:
```

---

## Contact Information

### Internal Teams

| Team | Slack Channel | PagerDuty |
|------|---------------|-----------|
| Platform | #platform-eng | platform-oncall |
| Security | #security | security-oncall |
| Infrastructure | #infra | infra-oncall |

### External Support

| Service | Support Contact |
|---------|-----------------|
| AWS | support.aws.amazon.com |
| SendGrid | support.sendgrid.com |
| OpenAI | help.openai.com |

---

*Last updated: January 2025*
*Version: 1.0*
