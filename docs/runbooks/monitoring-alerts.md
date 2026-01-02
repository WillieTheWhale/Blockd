# Monitoring Alerts Guide

Guide for interpreting and responding to monitoring alerts.

## Alert Interpretation

### HighErrorRate

**Alert:** Error rate > 1% for 5 minutes

**Possible Causes:**
- Bad deployment
- Database connection issues
- External API failures (OpenAI, Anthropic)
- Network issues

**Response:**
```bash
# Check error distribution
kubectl logs -l app=api-gateway -n production --tail=500 | grep ERROR

# Check which endpoints are failing
# Access Grafana: API Gateway dashboard -> Errors by endpoint

# If recent deployment, rollback
helm rollback blockd -n production

# Check external service status
curl https://status.openai.com/api/v2/status.json
```

### HighLatency

**Alert:** p95 latency > 500ms for 5 minutes

**Possible Causes:**
- Database slow queries
- Insufficient resources
- External API slow
- Cache miss rate high

**Response:**
```bash
# Check pod resource usage
kubectl top pods -n production

# Check database performance
kubectl exec -it deploy/api-gateway -n production -- \
  psql $DATABASE_URL -c "
    SELECT query, calls, mean_exec_time
    FROM pg_stat_statements
    ORDER BY mean_exec_time DESC
    LIMIT 10;"

# Check Redis cache hit rate
# Grafana: Redis dashboard -> Cache Hit Rate

# Scale up if resource constrained
kubectl scale deployment api-gateway --replicas=10 -n production
```

### ServiceDown

**Alert:** Service health check failing for 2 minutes

**Possible Causes:**
- Pod crashed
- Out of memory
- Deployment failed
- Image pull error

**Response:**
```bash
# Check pod status
kubectl get pods -n production -l app=<service>

# Check pod events
kubectl describe pod <pod-name> -n production

# Check logs
kubectl logs <pod-name> -n production --tail=100

# If crashed, check previous logs
kubectl logs <pod-name> -n production --previous

# Restart if needed
kubectl rollout restart deployment/<service> -n production
```

### DatabaseConnectionPoolExhausted

**Alert:** Database connections > 90% of max

**Possible Causes:**
- Connection leak
- Too many concurrent requests
- Insufficient pool size

**Response:**
```bash
# Check active connections
kubectl exec -it deploy/api-gateway -n production -- \
  psql $DATABASE_URL -c "
    SELECT pid, state, query_start, state_change, query
    FROM pg_stat_activity
    WHERE datname = 'blockd'
    ORDER BY query_start;"

# Kill idle connections
kubectl exec -it deploy/api-gateway -n production -- \
  psql $DATABASE_URL -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE state = 'idle'
    AND state_change < now() - interval '5 minutes';"

# Increase connection pool size
kubectl set env deployment/api-gateway \
  DATABASE_POOL_MAX=100 \
  -n production

# Scale up RDS if needed
aws rds modify-db-instance \
  --db-instance-identifier blockd-production-postgres \
  --max-allocated-storage 200 \
  --apply-immediately
```

### RedisMemoryHigh

**Alert:** Redis memory usage > 80%

**Possible Causes:**
- Memory leak
- Cache growing too large
- Insufficient eviction

**Response:**
```bash
# Check memory usage
kubectl exec -it redis-master-0 -n production -- \
  redis-cli INFO memory

# Check key count
kubectl exec -it redis-master-0 -n production -- \
  redis-cli DBSIZE

# Check eviction policy
kubectl exec -it redis-master-0 -n production -- \
  redis-cli CONFIG GET maxmemory-policy

# Clear cache if safe (careful!)
kubectl exec -it redis-master-0 -n production -- \
  redis-cli FLUSHDB

# Scale up Redis
aws elasticache modify-replication-group \
  --replication-group-id blockd-production-redis \
  --cache-node-type cache.r6g.2xlarge \
  --apply-immediately
```

### PodCPUUsageHigh

**Alert:** Pod CPU usage > 90% for 10 minutes

**Possible Causes:**
- High traffic
- Inefficient code
- Resource limits too low

**Response:**
```bash
# Check CPU usage
kubectl top pods -n production

# Check HPA status
kubectl get hpa -n production

# Scale horizontally
kubectl scale deployment <service> --replicas=10 -n production

# Or increase CPU limits
kubectl set resources deployment <service> \
  --limits=cpu=2000m \
  -n production

# Profile application to find CPU hotspots
kubectl exec -it deploy/<service> -n production -- node --prof index.js
```

### PodMemoryUsageHigh

**Alert:** Pod memory usage > 90% for 10 minutes

**Possible Causes:**
- Memory leak
- Large objects in memory
- Resource limits too low

**Response:**
```bash
# Check memory usage
kubectl top pods -n production

# Check for memory leaks
kubectl exec -it deploy/<service> -n production -- \
  node --expose-gc --inspect=0.0.0.0:9229 index.js

# Restart pod to free memory
kubectl delete pod <pod-name> -n production

# Increase memory limits
kubectl set resources deployment <service> \
  --limits=memory=2Gi \
  -n production
```

### DiskSpaceLow

**Alert:** Disk space < 20%

**Possible Causes:**
- Logs filling disk
- Data growth
- Temporary files

**Response:**
```bash
# SSH to node (via SSM or kubectl debug)
kubectl debug node/<node-name> -it --image=alpine

# Check disk usage
df -h

# Find large directories
du -sh /* | sort -h

# Clean up logs
journalctl --vacuum-time=7d

# Clean Docker images
docker system prune -a -f

# Increase disk size (EBS volume)
aws ec2 modify-volume --volume-id vol-xxx --size 200
```

### AIDetectionServiceSlow

**Alert:** AI detection p95 analysis time > 5s

**Possible Causes:**
- OpenAI/Anthropic API slow
- Cache miss rate high
- Insufficient resources

**Response:**
```bash
# Check cache hit rate
# Grafana: AI Detection dashboard -> Cache Hit Rate

# Scale up AI detection
kubectl scale deployment ai-detection --replicas=20 -n production

# Check external API latency
curl -w "@curl-format.txt" -o /dev/null -s https://api.openai.com/v1/models

# Increase timeout temporarily
kubectl set env deployment/ai-detection \
  ANALYSIS_TIMEOUT=10000 \
  -n production
```

### WebSocketConnectionIssues

**Alert:** WebSocket connection error rate > 0.1 errors/sec

**Possible Causes:**
- Network issues
- Server overload
- Client disconnects

**Response:**
```bash
# Check WebSocket service logs
kubectl logs -l app=websocket-service -n production --tail=200

# Check pod status
kubectl get pods -l app=websocket-service -n production

# Check active connections
kubectl exec -it deploy/websocket-service -n production -- \
  curl localhost:3004/metrics | grep websocket_connections

# Scale up if needed
kubectl scale deployment websocket-service --replicas=10 -n production
```

## Alert Severity Guidelines

### Critical (Page immediately)
- ServiceDown
- DatabaseConnectionPoolExhausted
- HighErrorRate (>5%)
- VideoUploadFailures

### Warning (Page during business hours)
- HighLatency
- RedisMemoryHigh
- PodCPUUsageHigh
- AIDetectionServiceSlow

### Info (Ticket only)
- DiskSpaceLow (>10% free)
- SSLCertificateExpiring (>14 days)

## Silencing Alerts

### Temporary Silence (During Maintenance)

```bash
# Access Alertmanager
kubectl port-forward -n monitoring svc/alertmanager 9093:9093

# Create silence via UI or API
curl -X POST http://localhost:9093/api/v2/silences -d '{
  "matchers": [
    {
      "name": "alertname",
      "value": "HighLatency",
      "isRegex": false
    }
  ],
  "startsAt": "2024-01-15T10:00:00Z",
  "endsAt": "2024-01-15T11:00:00Z",
  "createdBy": "john@blockd.io",
  "comment": "Planned maintenance"
}'
```

## On-Call Checklist

- [ ] Acknowledge alert in PagerDuty
- [ ] Check Grafana dashboards
- [ ] Review recent changes (deployments, config)
- [ ] Check service logs
- [ ] Determine severity
- [ ] Take immediate action if needed
- [ ] Escalate if unsure
- [ ] Update incident channel
- [ ] Document resolution
