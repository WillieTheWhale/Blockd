# Blockd Platform - Environment Variables Documentation

This document provides a comprehensive list of all environment variables required for the Blockd platform. Variables are organized by service and category.

## Table of Contents

1. [Global Variables](#global-variables)
2. [Database Configuration](#database-configuration)
3. [Redis Configuration](#redis-configuration)
4. [RabbitMQ Configuration](#rabbitmq-configuration)
5. [JWT Authentication](#jwt-authentication)
6. [Email Configuration](#email-configuration)
7. [AWS/S3 Configuration](#awss3-configuration)
8. [Service URLs](#service-urls)
9. [Video/WebRTC Configuration](#videowebrtc-configuration)
10. [AI/ML Services](#aiml-services)
11. [Monitoring/Alerting](#monitoringalerting)
12. [Service-Specific Variables](#service-specific-variables)

---

## Global Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Environment: `development`, `staging`, `production` |
| `ENV` | Yes | `development` | Python services environment |
| `DEBUG` | No | `false` | Enable debug mode |
| `LOG_LEVEL` | No | `info` | Logging level: `debug`, `info`, `warn`, `error` |
| `SERVICE_VERSION` | No | `1.0.0` | Service version for health checks |
| `HOSTNAME` | No | OS hostname | Container/service hostname |

---

## Database Configuration

### PostgreSQL

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | - | PostgreSQL connection string: `postgresql://user:pass@host:5432/dbname` |
| `DATABASE_CONNECTION_LIMIT` | No | `10` | Max connections in pool |
| `DATABASE_POOL_TIMEOUT` | No | `30000` | Pool timeout in ms |
| `DATABASE_CONNECT_TIMEOUT` | No | `5000` | Connection timeout in ms |
| `DATABASE_STATEMENT_TIMEOUT` | No | `30000` | Query statement timeout in ms |
| `DATABASE_IDLE_TIMEOUT` | No | `30000` | Idle connection timeout in ms |

**Example:**
```bash
DATABASE_URL=postgresql://blockd_user:secure_password@postgres:5432/blockd
```

---

## Redis Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | - | Full Redis URL (alternative to individual settings) |
| `REDIS_HOST` | Yes* | `localhost` | Redis server hostname |
| `REDIS_PORT` | Yes* | `6379` | Redis server port |
| `REDIS_PASSWORD` | No | - | Redis authentication password |
| `REDIS_DB` | No | `0` | Redis database number |
| `REDIS_CLUSTER_ENABLED` | No | `false` | Enable Redis cluster mode |
| `REDIS_CLUSTER_NODES` | No | - | Comma-separated list of cluster nodes |
| `REDIS_CLUSTER_SERVICE` | No | `redis-cluster-headless` | K8s cluster service name |
| `REDIS_CLUSTER_NAMESPACE` | No | `blockd` | K8s namespace for cluster |
| `REDIS_CLUSTER_PORT` | No | `6379` | Cluster node port |
| `REDIS_CLUSTER_REPLICAS` | No | `6` | Number of cluster replicas |

**Example (Standalone):**
```bash
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis_password
```

**Example (Cluster):**
```bash
REDIS_CLUSTER_ENABLED=true
REDIS_CLUSTER_NODES=redis-0:6379,redis-1:6379,redis-2:6379
```

---

## RabbitMQ Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RABBITMQ_HOST` | Yes | `rabbitmq` | RabbitMQ server hostname |
| `RABBITMQ_PORT` | No | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_USER` | Yes | `blockd_user` | RabbitMQ username |
| `RABBITMQ_PASS` | **Yes** | - | RabbitMQ password |
| `RABBITMQ_VHOST` | No | `blockd` | Virtual host name |

**Example:**
```bash
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=blockd_user
RABBITMQ_PASS=secure_rabbitmq_password
RABBITMQ_VHOST=blockd
```

---

## JWT Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes* | - | Secret key for HS256 (development only) |
| `JWT_PRIVATE_KEY` | Yes* | - | RSA private key for RS256 signing |
| `JWT_PUBLIC_KEY` | Yes* | - | RSA public key for RS256 verification |
| `JWT_PRIVATE_KEY_PATH` | No | `./keys/private.pem` | Path to private key file |
| `JWT_PUBLIC_KEY_PATH` | No | `./keys/public.pem` | Path to public key file |
| `JWT_ALGORITHM` | No | `RS256` | JWT signing algorithm |
| `JWT_ISSUER` | No | `blockd-auth` | Token issuer claim |
| `JWT_AUDIENCE` | No | `blockd-api` | Token audience claim |
| `JWT_ACCESS_TOKEN_TTL` | No | `3600` | Access token TTL in seconds (1 hour) |
| `JWT_REFRESH_TOKEN_TTL` | No | `604800` | Refresh token TTL in seconds (7 days) |
| `JWT_VALID_ISSUERS` | No | `blockd-auth` | Comma-separated valid issuers |
| `JWT_VALID_AUDIENCES` | No | `blockd-api` | Comma-separated valid audiences |

**Production Example:**
```bash
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_ISSUER=blockd-auth
JWT_AUDIENCE=blockd-api
JWT_ACCESS_TOKEN_TTL=3600
JWT_REFRESH_TOKEN_TTL=604800
```

---

## Email Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMAIL_ENABLED` | No | `false` | Enable email sending |
| `EMAIL_PROVIDER` | No | `console` | Provider: `sendgrid`, `smtp`, `console` |
| `SENDGRID_API_KEY` | Yes* | - | SendGrid API key (if using SendGrid) |
| `EMAIL_FROM` | No | `noreply@blockd.io` | From email address |
| `EMAIL_FROM_NAME` | No | `Blockd` | From display name |
| `SMTP_HOST` | Yes* | - | SMTP server host (if using SMTP) |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_SECURE` | No | `false` | Use TLS |
| `SMTP_USER` | Yes* | - | SMTP username |
| `SMTP_PASS` | Yes* | - | SMTP password |

**SendGrid Example:**
```bash
EMAIL_ENABLED=true
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxx
EMAIL_FROM=security@blockd.io
EMAIL_FROM_NAME=Blockd Security
```

**SMTP Example:**
```bash
EMAIL_ENABLED=true
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=alerts@example.com
SMTP_PASS=app_password
```

---

## AWS/S3 Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | **Yes** | - | AWS access key ID |
| `AWS_SECRET_ACCESS_KEY` | **Yes** | - | AWS secret access key |
| `AWS_REGION` | No | `us-east-1` | AWS region |
| `S3_BUCKET` | **Yes** | `blockd-videos` | S3 bucket for recordings |
| `S3_ENDPOINT` | No | - | Custom S3 endpoint (for MinIO) |

**Example:**
```bash
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
S3_BUCKET=blockd-production-videos
```

**MinIO Example:**
```bash
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://minio:9000
S3_BUCKET=blockd-videos
```

---

## Service URLs

Internal service communication endpoints.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AI_DETECTION_URL` | No | `http://ai-detection:8004` | AI Detection service URL |
| `AI_DETECTION_SERVICE_URL` | No | `http://ai-detection:3003` | AI Detection (alternate) |
| `EYE_TRACKING_URL` | No | `http://eye-tracking:8005` | Eye Tracking service URL |
| `EYE_TRACKING_SERVICE_URL` | No | `http://eye-tracking:3004` | Eye Tracking (alternate) |
| `RESPONSE_TIMING_URL` | No | `http://response-timing:8006` | Response Timing service |
| `SESSION_SERVICE_URL` | No | `http://session-service:3002` | Session Service URL |
| `WEBSOCKET_SERVICE_URL` | No | `http://websocket-service:3007` | WebSocket Service URL |
| `VIDEO_SERVICE_URL` | No | `http://video-service:3006` | Video Service URL |
| `WEBSOCKET_PORT` | No | `3003` | WebSocket service port |

---

## Video/WebRTC Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MEDIASOUP_HOST` | No | `localhost` | mediasoup server host |
| `MEDIASOUP_PORT` | No | `3000` | mediasoup server port |
| `ANNOUNCED_IP` | **Yes** | `127.0.0.1` | Public IP for WebRTC ICE |
| `RTC_MIN_PORT` | No | `10000` | Min RTP port range |
| `RTC_MAX_PORT` | No | `10100` | Max RTP port range |
| `FFMPEG_PATH` | No | `/usr/bin/ffmpeg` | FFmpeg binary path |
| `FFPROBE_PATH` | No | `/usr/bin/ffprobe` | FFprobe binary path |

**Production Example:**
```bash
MEDIASOUP_HOST=0.0.0.0
MEDIASOUP_PORT=3000
ANNOUNCED_IP=203.0.113.50
RTC_MIN_PORT=40000
RTC_MAX_PORT=49999
```

---

## AI/ML Services

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | **Yes** | - | OpenAI API key for GPT-4 |
| `ANTHROPIC_API_KEY` | **Yes** | - | Anthropic API key for Claude |
| `GOOGLE_AI_API_KEY` | No | - | Google AI API key for Gemini |
| `WHISPER_MODEL` | No | `base` | Whisper model size: `tiny`, `base`, `small`, `medium`, `large` |
| `EMBEDDING_CACHE_TTL` | No | `86400` | Embedding cache TTL (24h) |
| `AI_ANSWER_CACHE_TTL` | No | `3600` | AI answer cache TTL (1h) |

**Example:**
```bash
OPENAI_API_KEY=sk-xxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx
GOOGLE_AI_API_KEY=AIzaSyxxxxx
WHISPER_MODEL=medium
```

---

## Monitoring/Alerting

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLACK_WEBHOOK_URL` | No | - | Slack webhook for alerts |
| `PAGERDUTY_ROUTING_KEY` | No | - | PagerDuty routing key |
| `SENTRY_DSN` | No | - | Sentry error tracking DSN |
| `SERVICE_NAME` | No | `blockd` | Service name for metrics |

**Example:**
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
PAGERDUTY_ROUTING_KEY=xxxxxxx
SENTRY_DSN=https://xxx@sentry.io/yyy
```

---

## Service-Specific Variables

### API Gateway

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENABLE_SWAGGER` | No | `false` | Enable Swagger UI in production |
| `CORS_ORIGINS` | No | `*` | Allowed CORS origins |
| `RATE_LIMIT_REQUESTS` | No | `100` | Rate limit per minute |

### Eye Tracking

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OFF_SCREEN_THRESHOLD` | No | `0.2` | Off-screen percentage threshold |
| `RAPID_MOVEMENT_THRESHOLD` | No | `500` | Rapid movement px/sec threshold |
| `FIXATION_MIN_DURATION` | No | `0.1` | Minimum fixation duration (sec) |

---

## Environment File Templates

### Development (.env.development)

```bash
# Global
NODE_ENV=development
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://blockd:blockd_dev@localhost:5432/blockd_dev

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT (dev only - use proper keys in production)
JWT_SECRET=dev-secret-key-not-for-production

# Email (console output)
EMAIL_ENABLED=false
EMAIL_PROVIDER=console

# Video
MEDIASOUP_HOST=localhost
MEDIASOUP_PORT=3000
ANNOUNCED_IP=127.0.0.1

# AI (mock in dev)
OPENAI_API_KEY=sk-test-key
```

### Production (.env.production)

```bash
# Global
NODE_ENV=production
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://blockd:${DB_PASSWORD}@postgres-primary:5432/blockd
DATABASE_CONNECTION_LIMIT=50

# Redis Cluster
REDIS_CLUSTER_ENABLED=true
REDIS_CLUSTER_NODES=redis-0:6379,redis-1:6379,redis-2:6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# RabbitMQ
RABBITMQ_HOST=rabbitmq
RABBITMQ_USER=blockd_user
RABBITMQ_PASS=${RABBITMQ_PASSWORD}

# JWT (RS256)
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY=${JWT_PRIVATE_KEY}
JWT_PUBLIC_KEY=${JWT_PUBLIC_KEY}
JWT_ACCESS_TOKEN_TTL=3600
JWT_REFRESH_TOKEN_TTL=604800

# Email
EMAIL_ENABLED=true
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=${SENDGRID_API_KEY}
EMAIL_FROM=security@blockd.io

# AWS
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_REGION=us-east-1
S3_BUCKET=blockd-production-videos

# Video
ANNOUNCED_IP=${PUBLIC_IP}
RTC_MIN_PORT=40000
RTC_MAX_PORT=49999

# AI Services
OPENAI_API_KEY=${OPENAI_API_KEY}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
WHISPER_MODEL=medium

# Monitoring
SENTRY_DSN=${SENTRY_DSN}
SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
```

---

## Kubernetes Secrets

For Kubernetes deployments, create the following secrets:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: blockd-secrets
  namespace: blockd
type: Opaque
stringData:
  DATABASE_PASSWORD: "your-db-password"
  REDIS_PASSWORD: "your-redis-password"
  RABBITMQ_PASSWORD: "your-rabbitmq-password"
  JWT_PRIVATE_KEY: |
    -----BEGIN RSA PRIVATE KEY-----
    ...
    -----END RSA PRIVATE KEY-----
  JWT_PUBLIC_KEY: |
    -----BEGIN PUBLIC KEY-----
    ...
    -----END PUBLIC KEY-----
  SENDGRID_API_KEY: "SG.xxxxx"
  AWS_ACCESS_KEY_ID: "AKIA..."
  AWS_SECRET_ACCESS_KEY: "xxxxx"
  OPENAI_API_KEY: "sk-xxxxx"
  ANTHROPIC_API_KEY: "sk-ant-xxxxx"
```

---

## Security Considerations

1. **Never commit secrets to version control** - Use `.env.local` files or secret management
2. **Use strong passwords** - Minimum 32 characters for database and Redis passwords
3. **Rotate credentials regularly** - Especially API keys and JWT signing keys
4. **Use RSA keys in production** - Never use HS256 with shared secrets
5. **Encrypt secrets at rest** - Use Kubernetes secrets or HashiCorp Vault
6. **Limit permissions** - Use IAM roles with least privilege for AWS

---

*Last updated: January 2025*
