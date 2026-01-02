# External Secrets Configuration

This directory contains External Secrets Operator configuration for managing secrets in Kubernetes using AWS Secrets Manager.

## Prerequisites

1. Install External Secrets Operator:
```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets-system --create-namespace
```

2. Create IAM roles with IRSA (IAM Roles for Service Accounts):
```bash
# Production
eksctl create iamserviceaccount \
  --name external-secrets-sa \
  --namespace production \
  --cluster blockd-production-cluster \
  --attach-policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite \
  --approve

# Staging
eksctl create iamserviceaccount \
  --name external-secrets-sa \
  --namespace staging \
  --cluster blockd-staging-cluster \
  --attach-policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite \
  --approve
```

## Secrets List

### Required Secrets in AWS Secrets Manager

#### Production Environment
- `blockd-production-db-connection-string` - PostgreSQL connection string
- `blockd-production-db-password` - PostgreSQL password
- `blockd-production-redis-connection-string` - Redis connection string
- `blockd-production-rabbitmq-connection-string` - RabbitMQ connection string
- `blockd-production-jwt-secret` - JWT signing secret
- `blockd-production-openai-api-key` - OpenAI API key
- `blockd-production-anthropic-api-key` - Anthropic API key
- `blockd-production-google-api-key` - Google AI API key
- `blockd-production-aws-access-key-id` - AWS access key for S3
- `blockd-production-aws-secret-access-key` - AWS secret key for S3
- `blockd-production-google-oauth-client-id` - Google OAuth client ID
- `blockd-production-google-oauth-client-secret` - Google OAuth client secret

#### Staging Environment
(Same secrets with `-staging-` prefix)

## Creating Secrets in AWS Secrets Manager

```bash
# Example: Create database connection string
aws secretsmanager create-secret \
  --name blockd-production-db-connection-string \
  --description "PostgreSQL connection string for Blockd production" \
  --secret-string "postgresql://user:pass@host:5432/dbname"

# Example: Create JWT secret
aws secretsmanager create-secret \
  --name blockd-production-jwt-secret \
  --description "JWT signing secret for Blockd production" \
  --secret-string "$(openssl rand -base64 32)"
```

## Applying External Secrets

```bash
# Apply SecretStore
kubectl apply -f secret-store.yaml

# Apply External Secrets
kubectl apply -f external-secret-database.yaml
kubectl apply -f external-secret-application.yaml

# Verify secrets were created
kubectl get secrets -n production
kubectl get externalsecrets -n production
```

## Secret Rotation

Secrets are automatically rotated every hour (refreshInterval: 1h). To manually trigger rotation:

```bash
kubectl annotate externalsecret application-secrets \
  force-sync=$(date +%s) \
  -n production
```

## Troubleshooting

Check ExternalSecret status:
```bash
kubectl describe externalsecret application-secrets -n production
```

Check External Secrets Operator logs:
```bash
kubectl logs -n external-secrets-system \
  -l app.kubernetes.io/name=external-secrets
```
