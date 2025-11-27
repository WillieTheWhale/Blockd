# Blockd Deployment Guide

Complete guide for deploying the Blockd platform to staging and production environments.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Infrastructure Setup](#infrastructure-setup)
4. [Application Deployment](#application-deployment)
5. [Verification](#verification)
6. [Rollback](#rollback)

## Overview

Blockd uses a modern cloud-native architecture with:
- **Infrastructure:** Terraform-managed AWS resources (EKS, RDS, ElastiCache, S3)
- **Container Orchestration:** Kubernetes (Amazon EKS)
- **Deployment:** Helm charts with blue-green strategy for production
- **CI/CD:** GitHub Actions for automated testing, building, and deployment
- **Secrets:** AWS Secrets Manager via External Secrets Operator
- **Monitoring:** Prometheus + Grafana stack

## Prerequisites

### Required Tools

```bash
# AWS CLI
aws --version  # >= 2.13.0

# kubectl
kubectl version --client  # >= 1.28.0

# Helm
helm version  # >= 3.13.0

# Terraform
terraform version  # >= 1.6.0

# eksctl (optional, for advanced operations)
eksctl version  # >= 0.160.0
```

### AWS Credentials

```bash
# Configure AWS credentials
aws configure

# Verify access
aws sts get-caller-identity
```

### Repository Access

```bash
# Clone repository
git clone https://github.com/blockd/blockd.git
cd blockd

# Checkout appropriate branch
git checkout develop  # for staging
git checkout main     # for production
```

## Infrastructure Setup

### 1. Initialize Terraform

```bash
cd infrastructure/terraform

# Initialize Terraform backend
terraform init

# Select workspace
terraform workspace new production  # or staging
terraform workspace select production
```

### 2. Review and Apply Infrastructure

```bash
# Plan infrastructure changes
terraform plan -var-file=environments/production/terraform.tfvars

# Apply infrastructure
terraform apply -var-file=environments/production/terraform.tfvars

# Save outputs for later use
terraform output > outputs.txt
```

This creates:
- EKS Kubernetes cluster with autoscaling node groups
- RDS PostgreSQL database with automated backups
- ElastiCache Redis cluster
- Amazon MQ RabbitMQ broker
- S3 buckets for videos and backups
- CloudFront CDN
- CloudWatch monitoring
- IAM roles and security groups

**Time:** 30-45 minutes

### 3. Configure kubectl

```bash
# Get cluster name from Terraform output
CLUSTER_NAME=$(terraform output -raw cluster_name)

# Configure kubectl
aws eks update-kubeconfig --name $CLUSTER_NAME --region us-east-1

# Verify cluster access
kubectl get nodes
kubectl cluster-info
```

### 4. Install External Secrets Operator

```bash
# Add Helm repository
helm repo add external-secrets https://charts.external-secrets.io
helm repo update

# Install operator
helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets-system \
  --create-namespace \
  --wait

# Verify installation
kubectl get pods -n external-secrets-system
```

### 5. Create Secrets in AWS Secrets Manager

```bash
# Script to create all required secrets
./scripts/create-secrets.sh production

# Or manually create each secret
aws secretsmanager create-secret \
  --name blockd-production-db-connection-string \
  --secret-string "$(terraform output -raw db_connection_string)"

aws secretsmanager create-secret \
  --name blockd-production-jwt-secret \
  --secret-string "$(openssl rand -base64 32)"

# ... (create all other secrets)
```

### 6. Apply Secret Store and External Secrets

```bash
cd ../../k8s/external-secrets

# Apply SecretStore
kubectl apply -f secret-store.yaml

# Apply External Secrets
kubectl apply -f external-secret-database.yaml
kubectl apply -f external-secret-application.yaml

# Verify secrets were created
kubectl get secrets -n production
kubectl get externalsecrets -n production
```

## Application Deployment

### Staging Deployment (Automated)

Staging automatically deploys on push to `develop` branch via GitHub Actions.

**Manual deployment:**

```bash
cd k8s/helm/blockd

helm upgrade --install blockd . \
  -f values-staging.yaml \
  --namespace staging \
  --create-namespace \
  --set image.tag=develop-$(git rev-parse --short HEAD) \
  --wait \
  --timeout 10m

# Wait for rollout
kubectl rollout status deployment -n staging

# Verify deployment
kubectl get pods -n staging
```

### Production Deployment (Blue-Green)

Production uses blue-green deployment for zero-downtime releases.

#### Option 1: Automated via GitHub Actions

1. Push to `main` branch
2. GitHub Actions builds and pushes Docker images
3. Manual approval required in GitHub Actions
4. Workflow deploys green environment
5. Runs smoke tests
6. Switches traffic to green
7. Monitors for 10 minutes
8. Cleans up old environment

#### Option 2: Manual Deployment

```bash
cd k8s/helm/blockd

# Deploy green environment
helm upgrade --install blockd-green . \
  -f values-production.yaml \
  --namespace production \
  --set deployment.version=green \
  --set image.tag=main-$(git rev-parse --short HEAD) \
  --wait \
  --timeout 15m

# Wait for green to be ready
kubectl wait --for=condition=available \
  --timeout=10m \
  deployment -l version=green \
  -n production

# Run smoke tests on green
./scripts/smoke-tests.sh green

# Switch traffic to green
kubectl patch service api-gateway -n production \
  -p '{"spec":{"selector":{"version":"green"}}}'

kubectl patch service auth-service -n production \
  -p '{"spec":{"selector":{"version":"green"}}}'

# ... (patch all services)

# Monitor for issues
kubectl top pods -n production -l version=green
watch -n 5 'kubectl get pods -n production -l version=green'

# If healthy after 10 minutes, scale down blue
kubectl scale deployment --replicas=1 \
  -l version=blue \
  -n production

# If issues, rollback to blue
kubectl patch service api-gateway -n production \
  -p '{"spec":{"selector":{"version":"blue"}}}'
```

## Verification

### Health Checks

```bash
# Check all pods are running
kubectl get pods -n production
kubectl get pods -n production | grep -v Running

# Check services
kubectl get svc -n production

# Check ingress
kubectl get ingress -n production
```

### API Health Checks

```bash
# API Gateway
curl -f https://blockd.io/api/health

# Auth Service
curl -f https://blockd.io/api/auth/health

# Session Service
curl -f https://blockd.io/api/sessions/health

# All services
for service in api-gateway auth-service session-service websocket-service ai-detection eye-tracking response-timing video-service; do
  echo "Checking $service..."
  curl -f https://blockd.io/api/$service/health || echo "FAILED"
done
```

### Run Integration Tests

```bash
cd tests/api

# Install Newman
npm install -g newman

# Run tests against production
newman run sessions-api.postman_collection.json \
  -e environments/production.json \
  --bail

newman run auth-api.postman_collection.json \
  -e environments/production.json \
  --bail
```

### Monitor Metrics

```bash
# Access Grafana
kubectl port-forward -n monitoring svc/grafana 3000:80

# Open http://localhost:3000
# Username: admin
# Password: (retrieve from Secrets Manager)

# Check key metrics:
# - Request rate
# - Error rate
# - Response time (p95, p99)
# - CPU and memory usage
# - Database connections
# - Redis hit rate
```

## Rollback

### Helm Rollback

```bash
# View rollout history
helm history blockd -n production

# Rollback to previous release
helm rollback blockd -n production

# Rollback to specific revision
helm rollback blockd 5 -n production
```

### Blue-Green Rollback

```bash
# Switch traffic back to blue
kubectl patch service api-gateway -n production \
  -p '{"spec":{"selector":{"version":"blue"}}}'

# Patch all services back to blue
for service in auth-service session-service websocket-service ai-detection eye-tracking response-timing video-service frontend; do
  kubectl patch service $service -n production \
    -p '{"spec":{"selector":{"version":"blue"}}}'
done

# Verify rollback
kubectl get pods -n production
```

### Database Rollback

See [restore-procedures.md](../../infrastructure/backup/restore-procedures.md) for database rollback procedures.

## Troubleshooting

### Common Issues

**Pods not starting:**
```bash
# Check pod events
kubectl describe pod <pod-name> -n production

# Check logs
kubectl logs <pod-name> -n production

# Check previous logs if crashed
kubectl logs <pod-name> -n production --previous
```

**Secrets not available:**
```bash
# Check ExternalSecret status
kubectl describe externalsecret application-secrets -n production

# Check External Secrets Operator logs
kubectl logs -n external-secrets-system \
  -l app.kubernetes.io/name=external-secrets
```

**High latency or errors:**
```bash
# Check resource usage
kubectl top pods -n production

# Check HPA status
kubectl get hpa -n production

# Scale manually if needed
kubectl scale deployment api-gateway --replicas=10 -n production
```

### Getting Help

1. Check runbooks in `/docs/runbooks/`
2. Review logs in CloudWatch or Grafana
3. Contact on-call engineer via PagerDuty
4. Escalate to DevOps team lead

## Post-Deployment Checklist

- [ ] All pods running and healthy
- [ ] Health endpoints returning 200
- [ ] Integration tests passing
- [ ] Monitoring dashboards showing normal metrics
- [ ] No critical alerts firing
- [ ] Backup jobs scheduled and running
- [ ] SSL certificates valid
- [ ] DNS records correct
- [ ] Team notified of deployment
- [ ] Release notes published

## Next Steps

- [Production Deployment Guide](./production-deployment.md) - Detailed production procedures
- [Rollback Procedures](./rollback-procedure.md) - Emergency rollback guide
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions
- [Runbooks](../runbooks/) - Operational procedures
