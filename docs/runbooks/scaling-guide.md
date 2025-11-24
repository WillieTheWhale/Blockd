# Scaling Guide

Guide for scaling Blockd platform to handle increased load.

## Horizontal Pod Autoscaling (HPA)

### Check Current HPA Status

```bash
# View all HPAs
kubectl get hpa -n production

# Detailed view
kubectl describe hpa api-gateway -n production
```

### Configure HPA

```bash
# Update HPA thresholds
kubectl patch hpa api-gateway -n production --patch '
spec:
  minReplicas: 5
  maxReplicas: 30
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
'
```

### Manual Scaling

```bash
# Scale specific deployment
kubectl scale deployment api-gateway --replicas=20 -n production

# Scale all deployments
kubectl scale deployment --all --replicas=5 -n production

# Check scaling status
kubectl get deployments -n production
```

## Database Scaling

### Vertical Scaling (Increase Instance Size)

```bash
# Modify RDS instance class
aws rds modify-db-instance \
  --db-instance-identifier blockd-production-postgres \
  --db-instance-class db.r6g.2xlarge \
  --apply-immediately

# Monitor modification
aws rds describe-db-instances \
  --db-instance-identifier blockd-production-postgres \
  --query 'DBInstances[0].DBInstanceStatus'
```

### Read Replicas

```bash
# Create read replica
aws rds create-db-instance-read-replica \
  --db-instance-identifier blockd-production-postgres-replica-1 \
  --source-db-instance-identifier blockd-production-postgres \
  --db-instance-class db.r6g.xlarge

# Update application to use read replica for queries
kubectl set env deployment/session-service \
  READ_DATABASE_URL="postgresql://user:pass@replica-endpoint:5432/blockd" \
  -n production
```

### Connection Pooling

Update `values-production.yaml`:
```yaml
sessionService:
  env:
    DATABASE_POOL_MIN: 10
    DATABASE_POOL_MAX: 50
```

## Redis Scaling

### Vertical Scaling

```bash
# Modify Redis node type
aws elasticache modify-replication-group \
  --replication-group-id blockd-production-redis \
  --cache-node-type cache.r6g.2xlarge \
  --apply-immediately
```

### Add Cache Nodes

```bash
# Increase number of cache nodes
aws elasticache increase-replica-count \
  --replication-group-id blockd-production-redis \
  --new-replica-count 5 \
  --apply-immediately
```

## EKS Node Group Scaling

### Auto Scaling

```bash
# Update node group auto-scaling
aws eks update-nodegroup-config \
  --cluster-name blockd-production-cluster \
  --nodegroup-name blockd-general \
  --scaling-config minSize=5,maxSize=30,desiredSize=10
```

### Add New Node Group

```bash
# Create new node group with larger instances
eksctl create nodegroup \
  --cluster=blockd-production-cluster \
  --name=high-performance \
  --instance-types=c5.2xlarge \
  --nodes=3 \
  --nodes-min=2 \
  --nodes-max=10
```

## Load Testing

### Prepare for Load

```bash
# Scale up in advance
kubectl scale deployment api-gateway --replicas=20 -n production
kubectl scale deployment ai-detection --replicas=15 -n production

# Warm up caches
curl https://blockd.io/api/health
```

### Run Load Test

```bash
# Install k6
brew install k6  # macOS

# Run load test
cd tests/load
k6 run --vus 1000 --duration 10m peak-load.js

# Monitor during test
watch -n 2 'kubectl top pods -n production'
```

### Scale Down After Test

```bash
# Return to normal levels
kubectl scale deployment api-gateway --replicas=3 -n production
kubectl scale deployment ai-detection --replicas=3 -n production
```

## Cost Optimization

### Use Spot Instances

```yaml
# In Terraform
node_groups = {
  spot = {
    capacity_type = "SPOT"
    instance_types = ["t3.xlarge", "t3a.xlarge", "t3.2xlarge"]
    min_size = 2
    max_size = 20
  }
}
```

### Right-Size Resources

```bash
# Analyze resource usage
kubectl top pods -n production

# Reduce resource requests if over-provisioned
kubectl set resources deployment api-gateway \
  --requests=cpu=250m,memory=256Mi \
  --limits=cpu=500m,memory=512Mi \
  -n production
```

## Monitoring During Scaling

```bash
# Watch pod status
watch -n 5 'kubectl get pods -n production'

# Monitor resource usage
kubectl top pods -n production
kubectl top nodes

# Check HPA behavior
kubectl get hpa -w -n production

# View scaling events
kubectl get events -n production --sort-by='.lastTimestamp'
```

## Scaling Checklist

### Before Scaling Up
- [ ] Check current resource utilization
- [ ] Identify bottleneck (CPU, memory, database, network)
- [ ] Review cost impact
- [ ] Test in staging first
- [ ] Notify team

### During Scaling
- [ ] Monitor pod status
- [ ] Check error rates
- [ ] Verify response times
- [ ] Monitor database connections

### After Scaling
- [ ] Verify improved performance
- [ ] Document changes
- [ ] Update capacity planning docs
- [ ] Schedule scale-down if temporary
