# Production Deployment Guide

Detailed guide for deploying to production environment with zero downtime.

## Pre-Deployment Checklist

- [ ] All tests passing in CI/CD
- [ ] TypeScript compilation successful (`npm run build`)
- [ ] Code review approved and merged to main
- [ ] Security scan passed (no critical vulnerabilities)
- [ ] Database migrations tested in staging
- [ ] Secrets uploaded to AWS Secrets Manager
- [ ] Monitoring dashboards configured
- [ ] Health check endpoints verified
- [ ] Rollback plan documented
- [ ] Team notification sent
- [ ] Change window scheduled (if needed)

## Deployment Strategy: Blue-Green

Production uses blue-green deployment for zero-downtime releases:

1. **Blue** = Current production environment
2. **Green** = New version being deployed
3. Traffic switches from blue to green after validation
4. Blue kept running for quick rollback

## Step-by-Step Deployment

### 1. Pre-Deployment Tasks

```bash
# Ensure you're on the latest main branch
git checkout main
git pull origin main

# Tag the release
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3

# Build and push Docker images (automated via GitHub Actions)
# Or manually:
docker build -t ghcr.io/blockd/api-gateway:v1.2.3 backend/api-gateway
docker push ghcr.io/blockd/api-gateway:v1.2.3
```

### 2. Database Migrations

```bash
# Connect to production database (via bastion or RDS Proxy)
kubectl run -it --rm psql \
  --image=postgres:17 \
  --restart=Never \
  -- psql $DATABASE_URL

# Or run migrations via job
kubectl apply -f k8s/jobs/db-migration-job.yaml

# Verify migration
kubectl logs job/db-migration -n production
```

### 3. Deploy Green Environment

```bash
cd k8s/helm/blockd

# Deploy green
helm upgrade --install blockd-green . \
  -f values-production.yaml \
  --namespace production \
  --set deployment.version=green \
  --set image.tag=v1.2.3 \
  --wait \
  --timeout 15m \
  --atomic

# Verify green deployment
kubectl get pods -n production -l version=green
kubectl wait --for=condition=available \
  --timeout=10m \
  deployment -l version=green \
  -n production
```

### 4. Run Smoke Tests on Green

```bash
# Port-forward to green environment
kubectl port-forward \
  service/api-gateway-green \
  8080:3000 \
  -n production &

# Run health checks on all services
echo "Checking API Gateway..."
curl -f http://localhost:8080/health

echo "Checking Auth Service..."
curl -f http://localhost:8080/api/v1/auth/health

echo "Checking Session Service..."
curl -f http://localhost:8080/api/v1/sessions/health

# Check Python services (port-forward separately if needed)
# curl -f http://ai-detection:8000/health
# curl -f http://eye-tracking:8001/health
# curl -f http://response-timing:8002/health
# curl -f http://video-service:8003/health

# Run Newman API tests
cd tests/api
newman run auth-api.postman_collection.json \
  --env-var baseUrl=http://localhost:8080 \
  --bail

# Kill port-forward
kill %1
```

### 5. Switch Traffic to Green

```bash
# Switch services one by one, starting with less critical services
kubectl patch service frontend -n production \
  -p '{"spec":{"selector":{"version":"green"}}}'

# Wait 2 minutes and monitor
sleep 120

# Switch API Gateway (most traffic)
kubectl patch service api-gateway -n production \
  -p '{"spec":{"selector":{"version":"green"}}}'

# Switch remaining services
for service in auth-service session-service websocket-service ai-detection eye-tracking response-timing video-service; do
  echo "Switching $service to green..."
  kubectl patch service $service -n production \
    -p '{"spec":{"selector":{"version":"green"}}}'
  sleep 30
done
```

### 6. Monitor for 10 Minutes

```bash
# Watch pods
watch -n 5 'kubectl get pods -n production -l version=green'

# Monitor error rates
kubectl top pods -n production -l version=green

# Check logs for errors
kubectl logs -f -l version=green -n production --tail=100

# Access Grafana to monitor:
# - Request rate
# - Error rate (should be < 1%)
# - Response time (p95 < 500ms)
# - CPU/Memory usage
```

### 7. Cleanup Blue Environment

If everything is healthy after 10 minutes:

```bash
# Scale down blue to 1 replica (keep for quick rollback)
kubectl scale deployment \
  --replicas=1 \
  -l version=blue \
  -n production

# After 24 hours, delete blue if no issues
# helm uninstall blockd-blue -n production
```

## Rollback Procedure

If issues are detected:

### Immediate Rollback (Switch to Blue)

```bash
# Switch all services back to blue
for service in api-gateway auth-service session-service websocket-service ai-detection eye-tracking response-timing video-service frontend; do
  echo "Rolling back $service to blue..."
  kubectl patch service $service -n production \
    -p '{"spec":{"selector":{"version":"blue"}}}'
done

# Verify rollback
kubectl get pods -n production -l version=blue
```

### Database Rollback

See [rollback-procedure.md](./rollback-procedure.md) for database rollback steps.

## Post-Deployment Tasks

- [ ] Verify all services healthy
- [ ] Confirm zero error rate increase
- [ ] Check monitoring dashboards
- [ ] Verify backup jobs running
- [ ] Update release notes
- [ ] Notify team of successful deployment
- [ ] Schedule cleanup of blue environment (24h later)
- [ ] Document any issues encountered

## Emergency Contacts

- **DevOps Lead:** devops-lead@blockd.io
- **On-Call Engineer:** See PagerDuty
- **CTO:** cto@blockd.io

## Deployment Windows

- **Preferred:** Tuesday-Thursday, 10 AM - 2 PM EST
- **Avoid:** Monday, Friday, weekends
- **Emergency deploys:** Any time with approval

## Deployment Approval

Production deployments require:
1. Pull request approval from 2 senior engineers
2. Security scan passed
3. All tests passing
4. Manual approval in GitHub Actions (by DevOps or CTO)
