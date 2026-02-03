# Incident Response Runbook

Guide for responding to production incidents and outages.

## Incident Severity Levels

### SEV1 - Critical
- Complete service outage
- Data loss or corruption
- Security breach
- **Response Time:** Immediate
- **Escalation:** Page on-call + DevOps lead + CTO

### SEV2 - High
- Partial service degradation
- High error rate (>5%)
- Database issues
- **Response Time:** 15 minutes
- **Escalation:** Page on-call + DevOps lead

### SEV3 - Medium
- Minor performance issues
- Single service degraded
- Non-critical feature broken
- **Response Time:** 1 hour
- **Escalation:** On-call engineer

### SEV4 - Low
- Minor bugs
- Cosmetic issues
- **Response Time:** Next business day
- **Escalation:** Regular ticket

## Incident Response Process

### 1. Detection & Alert

**Alert Sources:**
- PagerDuty page
- Monitoring alerts (Prometheus/Grafana)
- User reports
- Automated health checks

**Initial Actions:**
```bash
# Acknowledge alert
# Check monitoring dashboards
https://grafana.blockd.site

# Check service health
curl https://blockd.site/api/health

# Check recent deployments
kubectl rollout history deployment -n production
```

### 2. Initial Assessment (5 minutes)

**Questions to Answer:**
- What is broken?
- How many users affected?
- What changed recently?
- Is data at risk?

**Quick Checks:**
```bash
# Check all pods
kubectl get pods -n production

# Check recent events
kubectl get events -n production --sort-by='.lastTimestamp'

# Check logs
kubectl logs -l app=api-gateway -n production --tail=100

# Check error rates in Grafana
# Dashboard: API Gateway -> Error Rate panel
```

### 3. Communication

**Start Incident Channel:**
```
# In Slack #incidents channel
@here INCIDENT: [Brief description]
Severity: SEV[1-4]
Status: Investigating
Incident Commander: @engineer-name
War Room: https://zoom.us/j/incident-room
```

**Status Updates:**
- Every 15 minutes for SEV1
- Every 30 minutes for SEV2
- Every hour for SEV3

### 4. Mitigation

#### Common Issues and Quick Fixes

**High Error Rate:**
```bash
# Check pod status
kubectl get pods -n production

# Restart failing pods
kubectl delete pod <pod-name> -n production

# Scale up if overloaded
kubectl scale deployment api-gateway --replicas=10 -n production
```

**Database Connection Issues:**
```bash
# Check database connections
kubectl exec -it deploy/api-gateway -n production -- \
  psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Check RDS status
aws rds describe-db-instances \
  --db-instance-identifier blockd-production-postgres

# Restart connections
kubectl rollout restart deployment/api-gateway -n production
```

**Redis Issues:**
```bash
# Check Redis health
kubectl exec -it deploy/api-gateway -n production -- \
  redis-cli -h redis-master ping

# Check memory usage
kubectl exec -it deploy/api-gateway -n production -- \
  redis-cli -h redis-master INFO memory

# Flush cache if needed (careful!)
kubectl exec -it deploy/api-gateway -n production -- \
  redis-cli -h redis-master FLUSHALL
```

**High CPU/Memory:**
```bash
# Check resource usage
kubectl top pods -n production

# Scale horizontally
kubectl scale deployment api-gateway --replicas=20 -n production

# Check HPA status
kubectl get hpa -n production
```

### 5. Rollback if Needed

**Recent Deployment Causing Issues:**
```bash
# Rollback via Helm
helm rollback blockd -n production

# Or switch to blue environment
kubectl patch service api-gateway -n production \
  -p '{"spec":{"selector":{"version":"blue"}}}'
```

### 6. Root Cause Analysis

**Gather Evidence:**
```bash
# Export logs
kubectl logs deploy/api-gateway -n production --since=1h > incident-logs.txt

# Export events
kubectl get events -n production --sort-by='.lastTimestamp' > incident-events.txt

# Export metrics snapshot
# Download from Grafana dashboard

# Check recent changes
git log --since="1 hour ago" --oneline
```

### 7. Resolution & Post-Mortem

**Incident Resolution:**
```
# In Slack #incidents channel
RESOLVED: [Brief description]
Duration: XX minutes
Root Cause: [Brief explanation]
Post-mortem: [Link to doc]
```

**Post-Mortem Template:**
1. **Summary:** What happened?
2. **Impact:** How many users? How long?
3. **Root Cause:** Why did it happen?
4. **Timeline:** Detailed timeline of events
5. **Resolution:** How was it fixed?
6. **Action Items:** What changes will prevent this?
7. **Lessons Learned:** What did we learn?

## Common Incident Scenarios

### Scenario 1: Complete Outage

**Symptoms:**
- All health checks failing
- 503 errors
- No pods running

**Response:**
```bash
# Check cluster health
kubectl cluster-info
kubectl get nodes

# Check pods
kubectl get pods -n production

# Check recent changes
kubectl get events -n production --sort-by='.lastTimestamp' | head -20

# If deployment issue, rollback
helm rollback blockd -n production

# If infrastructure issue, check AWS
aws eks describe-cluster --name blockd-production-cluster
```

### Scenario 2: Database Performance Issues

**Symptoms:**
- Slow response times
- Database connection timeouts
- High p95 latency

**Response:**
```bash
# Check database metrics
aws rds describe-db-instances \
  --db-instance-identifier blockd-production-postgres

# Check slow queries
kubectl exec -it deploy/api-gateway -n production -- \
  psql $DATABASE_URL -c "
    SELECT pid, now() - pg_stat_activity.query_start AS duration, query
    FROM pg_stat_activity
    WHERE state = 'active'
    ORDER BY duration DESC
    LIMIT 10;"

# Kill slow queries if needed
kubectl exec -it deploy/api-gateway -n production -- \
  psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = <pid>;"

# Scale up RDS if needed
aws rds modify-db-instance \
  --db-instance-identifier blockd-production-postgres \
  --db-instance-class db.r6g.2xlarge \
  --apply-immediately
```

### Scenario 3: AI Detection Service Overload

**Symptoms:**
- AI detection timeouts
- Queue backup in RabbitMQ
- High CPU on AI detection pods

**Response:**
```bash
# Scale up AI detection
kubectl scale deployment ai-detection --replicas=20 -n production

# Check queue size
kubectl exec -it deploy/rabbitmq -n production -- \
  rabbitmqctl list_queues

# Temporarily increase timeout
kubectl set env deployment/api-gateway \
  AI_DETECTION_TIMEOUT=30000 \
  -n production
```

## Escalation Path

1. **On-Call Engineer** (0-15 min)
2. **DevOps Lead** (15-30 min)
3. **CTO** (30+ min, SEV1 only)
4. **AWS Premium Support** (for infrastructure issues)

## Tools & Access

- **Grafana:** https://grafana.blockd.site
- **PagerDuty:** https://blockd.pagerduty.com
- **AWS Console:** https://console.aws.amazon.com
- **Slack:** #incidents channel
- **Zoom War Room:** https://zoom.us/j/incident-room

## Post-Incident Actions

- [ ] Create post-mortem document
- [ ] Schedule post-mortem review meeting
- [ ] Create tickets for action items
- [ ] Update runbooks based on lessons learned
- [ ] Thank responders
- [ ] Communicate resolution to stakeholders
