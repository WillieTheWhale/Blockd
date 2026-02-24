# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## AI Agent Rules

**CRITICAL: Never ask clarifying questions.** Make reasonable assumptions and proceed with implementation. If multiple valid approaches exist, choose the most sensible one based on context and existing patterns in the codebase.

## Project Overview

**Blockd** is an enterprise interview security platform combining:
- Custom Chromium browser with native security monitoring
- AI-powered answer detection using multi-LLM analysis
- Eye tracking & gaze analysis for attention monitoring
- Real-time video streaming and session management

This is a **native Chromium fork**, not a browser extension. Security features are embedded at the browser process level.

## Recent Changes (February 2026)

A comprehensive code review was completed with 376 fixes across all services. Key changes:

### Security Hardening
- `crypto.randomInt()` for password generation (not `Math.random()`)
- `crypto.timingSafeEqual()` for OAuth state comparison
- MFA verification encoded in JWT claims (not headers)
- XSS sanitization for WebSocket chat messages
- Connection rate limiting (10 per IP, 10K global)
- Path traversal prevention with UUID validation

### TypeScript Strict Mode
All Node.js services now use TypeScript strict mode. Before making changes:
```bash
cd backend/api-gateway  # or auth-service, session-service
npx tsc --noEmit        # Check for type errors
npm run build           # Verify compilation
```

### Docker Health Checks
All services now have health checks configured. Check status with:
```bash
docker compose ps       # Shows (healthy) status
```

### New API Endpoints
- `GET /users/me`, `PUT /users/me` - User profile management
- `POST /auth/change-password`, `/forgot-password`, `/reset-password`
- `PUT /sessions/:id`, `DELETE /sessions/:id`
- `GET /reports`, `DELETE /reports/:id`, `GET /reports/:id/download`

See [CHANGELOG.md](./CHANGELOG.md) for complete details.

---

## Build & Development Commands

### Quick Start (Docker)
```bash
# Copy environment file first
cp .env.example .env
# Edit .env and set required secrets (POSTGRES_PASSWORD, REDIS_PASSWORD, etc.)

# Start all services
docker compose up -d

# View logs
docker compose logs -f api-gateway
```

### Individual Services

**Frontend (Interviewer App):**
```bash
cd frontend/interviewer-app
npm install
npm run dev          # Development server (Vite)
npm run build        # Production build
npm run test         # Run tests (Vitest)
npm run lint         # ESLint
```

**API Gateway (Node.js/Fastify):**
```bash
cd backend/api-gateway
npm install
npm run dev          # Development with hot reload
npm run build        # TypeScript compile
npm run test         # Vitest tests
npm run lint         # ESLint
npm run prisma:migrate  # Run database migrations
npm run prisma:studio   # Open Prisma Studio
```

**Python Services (AI Detection, Eye Tracking, Response Timing, Video):**
```bash
cd backend/ai-detection  # or eye-tracking, response-timing, video-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000

# Tests
pytest tests/
pytest tests/ --cov=src --cov-report=html
```

### Testing

**Full Test Suite:**
```bash
cd tests
npm install
npm run test:all     # Unit + Integration + E2E + Load

# Individual test types
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
npm run test:api     # Newman API tests (Postman collections)
npm run test:load    # k6 load tests
```

**E2E Tests (Playwright):**
```bash
cd tests
npm run test:e2e              # All browsers
npm run test:e2e:chromium     # Chromium only
npm run test:e2e:headed       # With browser UI
npm run test:e2e:debug        # Debug mode
```

### Database

```bash
cd database
alembic upgrade head     # Run migrations
alembic downgrade -1     # Rollback one migration
```

### Chromium Browser Build (Blockd Features)

**CRITICAL: This build MUST include Blockd features. A vanilla Chromium build is useless.**

#### Prerequisites
- 100+ GB disk space
- 16+ GB RAM (use `-j6` if less than 32GB to avoid OOM)
- Visual Studio 2022 with C++ workload (Windows)
- depot_tools in PATH
- Environment: `DEPOT_TOOLS_WIN_TOOLCHAIN=0` (use local VS)

#### Step 1: Environment Setup
```bash
cd chromium
export PATH="$PWD/depot_tools:$PATH"
export DEPOT_TOOLS_WIN_TOOLCHAIN=0
```

#### Step 2: Integrate Blockd Code (REQUIRED)
```bash
# Copy Blockd modules from backup to src
cp -r blocked_backup/chrome/browser/blocked src/chrome/browser/
cp -r blocked_backup/chrome/browser/ui/blocked src/chrome/browser/ui/
cp -r blocked_backup/chrome/browser/resources/blocked src/chrome/browser/resources/
cp -r blocked_backup/chrome/app/theme/blocked src/chrome/app/theme/
cp -r blocked_backup/content/renderer/blocked_* src/content/renderer/
```

#### Step 3: Verify Integration Files Exist
```bash
# MUST verify these directories exist before building:
ls src/chrome/browser/blocked/blocked_security/
ls src/chrome/browser/blocked/blocked_ipc/
ls src/chrome/browser/blocked/blocked_video/
ls src/chrome/browser/blocked/blocked_telemetry/
ls src/chrome/browser/blocked/blocked_meeting/
ls src/chrome/browser/blocked/public/mojom/
ls src/chrome/browser/ui/blocked/
ls src/content/renderer/blocked_eye_tracking/
ls src/content/renderer/blocked_ipc/
ls src/content/renderer/blocked_video/
```

#### Step 4: Configure Build (args.gn)
```bash
cd src
gn gen out/Blockd
```

**Required args.gn content:**
```gn
# Core Build Settings
is_component_build = false
is_official_build = false
is_debug = false
symbol_level = 1
chrome_pgo_phase = 0

# Branding - Use Blockd branding
is_chrome_branded = false

# Codecs & Media (required for video capture)
proprietary_codecs = true
ffmpeg_branding = "Chrome"
enable_widevine = false

# Platform Features
enable_nacl = false
enable_pdf = true
enable_print_preview = true
enable_extensions = true

# Build Performance
use_goma = false

# Disable unused features
enable_vr = false
enable_mdns = false

# BLOCKD FEATURE FLAGS (CRITICAL)
blocked_enable_security_monitoring = true
blocked_enable_eye_tracking = true
blocked_enable_telemetry = true
blocked_enable_meeting_detection = true
blocked_backend_url = "wss://api.blockd.app/ws/blocked"
```

#### Step 5: Build
```bash
# Use -j6 on machines with <32GB RAM to avoid OOM errors
autoninja -C out/Blockd chrome -j6
```

#### Step 6: Verify Blockd Features (REQUIRED)
```bash
# After build, verify Blockd symbols are present:
# Windows:
dumpbin /EXPORTS out/Blockd/chrome.dll | findstr -i "blocked"

# Linux/Mac:
nm out/Blockd/chrome | grep -i "blocked"

# Expected symbols include:
# - BlockedSecurityService
# - BlockedTelemetryService
# - BlockedBackendConnector
# - BlockedVideoCaptureService
# - MeetingPlatformDetector
# - EyeTracker
# - GazeDataSender
```

#### Build Verification Checklist
- [ ] `blocked_backup/` contents copied to `src/`
- [ ] All Blockd directories exist in `src/chrome/browser/blocked/`
- [ ] `args.gn` contains `blocked_enable_*` flags set to `true`
- [ ] Build completes without errors
- [ ] `chrome.dll` contains Blockd symbols (verify with dumpbin/nm)
- [ ] Browser shows "Blockd" branding (not "Chromium")

#### Common Build Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `components_blocked_strings.grd missing` | Branding not integrated | Copy blocked branding files to src |
| `LLVM ERROR: out of memory` | Too many parallel jobs | Use `-j6` instead of default |
| `401 Anonymous caller` | No Google auth | Set `DEPOT_TOOLS_WIN_TOOLCHAIN=0` |
| `blocked_security_service.h not found` | Code not copied | Run Step 2 integration |
| `undefined reference to blocked::*` | BUILD.gn not updated | Add Blockd to chrome/browser/BUILD.gn |

## Architecture

```
/backend
├── api-gateway/        # Fastify 5.x - REST API, JWT auth, rate limiting
├── auth-service/       # JWT + MFA + OAuth authentication
├── session-service/    # Interview session lifecycle management
├── websocket-service/  # Socket.io real-time communication
├── ai-detection/       # Python/FastAPI - Multi-LLM similarity analysis
├── eye-tracking/       # Python - MediaPipe FaceMesh + gaze detection
├── response-timing/    # Python - Whisper STT + timing analysis
├── video-service/      # Python - mediasoup WebRTC + FFmpeg
└── shared/             # Shared TypeScript/Python libraries

/frontend
└── interviewer-app/    # React 19 + TypeScript + Vite + Tailwind + shadcn/ui
                        # (Interviewees use the custom Chromium browser directly)

/chromium               # Chromium 142 fork
├── blocked_backup/         # SOURCE: Blockd modifications (copy to src/)
├── src/chrome/browser/blocked/
│   ├── blocked_security/   # Process detection, VM detection, window focus
│   │   └── platform/       # Windows/macOS/Linux specific monitors
│   ├── blocked_video/      # Video capture service
│   ├── blocked_telemetry/  # System telemetry collection (CPU, memory, focus)
│   ├── blocked_ipc/        # Backend connector (WebSocket + Protobuf)
│   ├── blocked_meeting/    # Meeting platform detection (Meet, Zoom, Teams)
│   └── public/mojom/       # Mojo IPC interfaces (eye_tracking, video, session)
├── src/chrome/browser/ui/blocked/
│   └── blocked_browser_controller  # Session lockdown, navigation blocking
├── src/chrome/browser/resources/blocked/
│   └── blocked_api.js      # JavaScript API: window.BlockedAPI
├── src/chrome/app/theme/blocked/
│   └── BRANDING, logos     # Blockd branding assets
└── src/content/renderer/
    ├── blocked_eye_tracking/  # MediaPipe face/gaze detection
    ├── blocked_ipc/           # Renderer-side Mojo IPC (GazeDataSender)
    └── blocked_video/         # Camera capture, frame processing

/database               # PostgreSQL + TimescaleDB + pgvector
/infrastructure         # Redis, RabbitMQ configs
/k8s                    # Kubernetes manifests + Helm charts
/tests                  # E2E (Playwright), API (Newman), Load (k6)
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui, Zustand |
| API Gateway | Fastify 5, Node.js 20+, Prisma 6 |
| Python Services | FastAPI, Python 3.12+, PyTorch, sentence-transformers |
| Database | PostgreSQL 16+ with TimescaleDB + pgvector |
| Cache | Redis 7+ |
| Queue | RabbitMQ 3+ with Celery workers |
| Video | mediasoup (WebRTC SFU), FFmpeg |
| Browser | Chromium 142 (C++) |

## Key Conventions

### Git Commits
Follow Conventional Commits: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `security`

### Code Style
- **TypeScript:** Strict mode, avoid `any`, prefer interfaces
- **Python:** Type hints for all function signatures, Black formatting
- **C++:** Google C++ Style Guide, smart pointers over raw pointers

### Database
- Use parameterized queries (Prisma/SQLAlchemy) - never string concatenation
- Migration naming: `YYYYMMDD_HHMM_description.sql`
- Add indexes for frequently queried fields

### API Design
- RESTful: GET (read), POST (create), PUT (update), PATCH (partial), DELETE
- Version prefix: `/api/v1/`
- Use proper HTTP status codes (200, 201, 400, 401, 403, 404, 500)

### Chromium Development
- File naming: `blocked_feature_name.h`, `blocked_feature_name.cc`
- Use Mojo for IPC between processes
- Never block browser main thread - use `PostTask()` for async
- Follow browser vs renderer process architecture

## AI Detection Thresholds
- High risk: ≥0.85 (likely AI-generated)
- Medium risk: 0.70-0.84 (investigate further)
- Low risk: 0.50-0.69 (probably human)
- Minimal risk: <0.50 (human)

## Environment Variables

Required in `.env`:
- `POSTGRES_PASSWORD` - Database password
- `REDIS_PASSWORD` - Redis password
- `RABBITMQ_PASSWORD` - RabbitMQ password
- `JWT_SECRET` - JWT signing secret
- `MINIO_ROOT_PASSWORD` - MinIO/S3 password

Optional:
- `OPENAI_API_KEY` - For GPT-4 analysis
- `ANTHROPIC_API_KEY` - For Claude analysis

## Documentation

Detailed specifications are in `/docs/`:
- `agent1-database-schema.json` - Database schema
- `agent5-api-specification.json` - API endpoints
- `agent8-websocket-protocol.json` - WebSocket events
- `agent9-ai-detection-algorithm.json` - Detection algorithm details
- `agents16-18-chromium-architecture.json` - Browser implementation

## Current Development TODOs

### High Priority Tasks

1. **Interviewee Report Access (Web Portal)**
   - Interviewees access reports via web portal in Blockd Browser
   - Implement PDF/JSON export functionality
   - Display session summaries and analytics
   - Location: Backend serves reports, Blockd Browser navigates to portal

2. **Meeting Verification System**
   - Backend endpoint to verify interviewee is using Blockd browser
   - Heartbeat system during active sessions
   - Browser fingerprinting validation
   - Location: `backend/session-service/` and `chromium/src/chrome/browser/blocked/`

3. **Landing Page Integration**
   - Connect "Log In" button to auth service
   - Update navigation links (Product, Pricing, Documentation)
   - Implement OAuth redirect flow from landing to main app
   - Sync user data between Supabase waitlist and main platform
   - Location: `../Blockd_Landing/src/`

4. **Chromium Browser Branding**
   - Update BRANDING file: "Blocked" → "Blockd"
   - Replace all logo assets with Blockd logo
   - Set default homepage to Blockd interviewee portal
   - Configure installer names and metadata
   - Location: `chromium/blocked_backup/chrome/app/theme/blocked/BRANDING`

5. **Audio/Video Streaming to Backend**
   - Detect when user is on Google Meet, Zoom, or MS Teams
   - Capture audio/video streams using WebRTC
   - Stream to backend video-service for analysis
   - NOT in-browser analysis - security features are backend-only
   - Location: `chromium/src/chrome/browser/blocked/blocked_video/`

6. **Backend Test Configuration**
   - Ensure all TypeScript tests pass (Vitest)
   - Ensure all Python tests pass (pytest)
   - Configure CI/CD test pipeline
   - Location: `tests/` and service-specific test directories

7. **AWS Deployment**
   - Configure Terraform for AWS infrastructure
   - Set up ECS/EKS for container orchestration
   - Configure RDS for PostgreSQL
   - Set up ElastiCache for Redis
   - Configure S3 for video storage
   - Location: `infrastructure/terraform/`

### Branding Guidelines
- Always use "Blockd" (not "Blocked") in all user-facing text
- Logo should be the Blockd logo, not Chromium dev logo
- Product name: "Blockd Browser" or "Blockd Interview Browser"

### Meeting Platform Detection URLs
- Google Meet: `meet.google.com/*`
- Zoom: `*.zoom.us/*`, `zoom.us/*`
- Microsoft Teams: `teams.microsoft.com/*`, `teams.live.com/*`

---

## Blockd Chromium Module Reference

### Browser Process Modules (KeyedServices)

| Module | Files | Purpose |
|--------|-------|---------|
| `blocked_security` | `blocked_security_service.h/cc` | Security monitoring (processes, VM, screen recording, clipboard) |
| `blocked_telemetry` | `blocked_telemetry_service.h/cc` | System telemetry (CPU, memory, focus state) |
| `blocked_video` | `blocked_video_capture_service.h/cc` | Video capture state management |
| `blocked_ipc` | `blocked_backend_connector.h/cc`, `blocked_protocol.proto` | WebSocket backend communication |
| `blocked_meeting` | `meeting_platform_detector.h/cc`, `meeting_stream_controller.h/cc` | Detect Meet/Zoom/Teams and stream |
| `public/mojom` | `eye_tracking.mojom`, `video_capture.mojom`, `session.mojom` | Mojo IPC interfaces |

### Renderer Process Modules

| Module | Files | Purpose |
|--------|-------|---------|
| `blocked_eye_tracking` | `eye_tracker.h/cc`, `face_detector.h/cc`, `gaze_estimator.h/cc` | MediaPipe eye tracking |
| `blocked_ipc` | `gaze_data_sender.h/cc`, `renderer_host_connector.h/cc` | Send data to browser process |
| `blocked_video` | `camera_manager.h/cc`, `video_capturer.h/cc` | Webcam capture |

### JavaScript API (window.BlockedAPI)

```javascript
// Available methods in interview pages
BlockedAPI.startEyeTracking()      // Start eye tracking
BlockedAPI.stopEyeTracking()       // Stop eye tracking
BlockedAPI.calibrate()             // Run 9-point calibration
BlockedAPI.startVideoCapture()     // Start webcam capture
BlockedAPI.stopVideoCapture()      // Stop webcam capture
BlockedAPI.getSessionId()          // Get current session ID
BlockedAPI.isSessionActive()       // Check if session active
BlockedAPI.addEventListener()      // Listen for events
```

### Build System Integration Points

**Files that MUST be modified to include Blockd:**

1. `chrome/browser/BUILD.gn` - Add:
   ```gn
   deps += [ "//chrome/browser/blocked:blocked_browser_modules" ]
   ```

2. `content/renderer/BUILD.gn` - Add:
   ```gn
   deps += [
     "//content/renderer/blocked_eye_tracking",
     "//content/renderer/blocked_ipc",
     "//content/renderer/blocked_video",
   ]
   ```

3. `build/config/features.gni` - Add feature flags:
   ```gn
   declare_args() {
     blocked_enable_security_monitoring = true
     blocked_enable_eye_tracking = true
     blocked_enable_telemetry = true
     blocked_enable_meeting_detection = true
     blocked_backend_url = ""
   }
   ```

### Mojo Interface Binding Flow

```
RenderFrame created
  → BlockedSessionHost bound (browser side)
  → RendererHostConnector created (renderer side)
  → EyeTracker.BindEyeTracking() called
  → GazeDataSender sends batches to EyeTrackingHost
  → BlockedBackendConnector forwards to WebSocket backend
```

### Security Event Types (blocked_protocol.proto)

- `SUSPICIOUS_PROCESS` - Forbidden process detected
- `SCREEN_RECORDING` - Screen recording software active
- `VM_DETECTED` - Virtual machine environment
- `WINDOW_FOCUS_LOST` - Browser lost focus
- `CLIPBOARD_ACTIVITY` - Suspicious clipboard access
- `MULTIPLE_DISPLAYS` - Additional monitors detected

---

## AWS Production Deployment Guide

**Domain**: blockd.site
**Last Updated**: January 2026

### Deployment Readiness Status

| Component | Status |
|-----------|--------|
| Docker Images (9 services) | ✅ Ready |
| Kubernetes/Helm Charts | ✅ Ready (with fixes below) |
| Terraform Infrastructure | ✅ Ready (with fixes below) |
| CI/CD Pipelines | ✅ Ready |
| Database Schema | ✅ Ready |
| External Secrets | ✅ Ready |
| Monitoring Stack | ✅ Ready |

### ⚠️ Required Fixes Before Deployment

**Fix 1: Helm Port Mismatch** (`k8s/helm/blockd/templates/all-services.yaml`)
```yaml
# Change Python service ports to match Dockerfiles:
"ai-detection"    → port: 8000 (not 5000)
"eye-tracking"    → port: 8001 (not 5001)
"response-timing" → port: 8002 (not 5002)
"video-service"   → port: 8003 (not 3003)
"websocket-service" → port: 3003 (not 3004)
```

**Fix 2: Terraform ALB Outputs** (`infrastructure/terraform/modules/kubernetes-cluster/outputs.tf`)
```hcl
# Add missing ALB outputs (or install AWS Load Balancer Controller after EKS):
output "alb_dns_name" { ... }
output "alb_zone_id" { ... }
```

---

### Phase 1: Prerequisites

#### Required Tools
| Tool | Version | Purpose |
|------|---------|---------|
| AWS CLI | v2.x | AWS API access |
| Terraform | >= 1.6.0 | Infrastructure as Code |
| kubectl | v1.28+ | Kubernetes management |
| Helm | v3.13+ | K8s package manager |
| Docker | v27.x | Container builds |

#### Required Accounts & Keys
- AWS Account with admin permissions
- Domain `blockd.site` registered
- OpenAI API Key
- Anthropic API Key
- (Optional) Google AI API Key

---

### Phase 2: AWS Secrets Setup

```bash
# Generate secure secrets
DB_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
RABBITMQ_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -hex 32)
MFA_KEY=$(openssl rand -hex 32)

# Store in AWS Secrets Manager
aws secretsmanager create-secret --name blockd-production-db-password --secret-string "$DB_PASSWORD"
aws secretsmanager create-secret --name blockd-production-redis-password --secret-string "$REDIS_PASSWORD"
aws secretsmanager create-secret --name blockd-production-rabbitmq-password --secret-string "$RABBITMQ_PASSWORD"
aws secretsmanager create-secret --name blockd-production-jwt-secret --secret-string "$JWT_SECRET"
aws secretsmanager create-secret --name blockd-production-mfa-key --secret-string "$MFA_KEY"
aws secretsmanager create-secret --name blockd-production-openai-key --secret-string "sk-your-key"
aws secretsmanager create-secret --name blockd-production-anthropic-key --secret-string "sk-ant-your-key"
```

---

### Phase 3: Terraform Infrastructure

```bash
cd infrastructure/terraform

# Create backend resources
aws s3api create-bucket --bucket blockd-terraform-state --region us-east-1
aws s3api put-bucket-versioning --bucket blockd-terraform-state --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name blockd-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Deploy infrastructure
terraform init
terraform plan -var-file="environments/production.tfvars" -out=plan.out
terraform apply plan.out
```

**Resources Created:**
- VPC (10.0.0.0/16) with 3 AZs
- EKS Cluster v1.28 (3-20 nodes)
- RDS PostgreSQL Multi-AZ (db.r6g.xlarge)
- ElastiCache Redis Cluster (3 nodes)
- Amazon MQ RabbitMQ
- S3 + CloudFront CDN
- Route53 + ACM Certificates
- WAF with rate limiting

---

### Phase 4: DNS Configuration

```bash
# Get Route53 nameservers
aws route53 get-hosted-zone --id ZONE_ID --query 'DelegationSet.NameServers'

# Update domain registrar with these nameservers
# DNS records created automatically:
# - blockd.site → ALB
# - api.blockd.site → ALB
# - app.blockd.site → ALB
```

---

### Phase 5: Kubernetes Setup

```bash
# Configure kubectl
aws eks update-kubeconfig --name blockd-production-cluster --region us-east-1

# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# Install External Secrets Operator
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets-system --create-namespace

# Configure secrets
cd k8s/external-secrets
kubectl apply -f secret-store.yaml
kubectl apply -f external-secret-database.yaml
kubectl apply -f external-secret-application.yaml
```

---

### Phase 6: Build & Push Docker Images

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"
VERSION="1.0.0"

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $REGISTRY

# Build and push all services
for service in api-gateway auth-service session-service websocket-service; do
  docker build -f backend/$service/Dockerfile -t $REGISTRY/blockd/$service:$VERSION ./backend
  docker push $REGISTRY/blockd/$service:$VERSION
done

for service in ai-detection eye-tracking response-timing video-service; do
  docker build -f backend/$service/Dockerfile -t $REGISTRY/blockd/$service:$VERSION ./backend/$service
  docker push $REGISTRY/blockd/$service:$VERSION
done

docker build -f frontend/interviewer-app/Dockerfile -t $REGISTRY/blockd/frontend:$VERSION ./frontend/interviewer-app
docker push $REGISTRY/blockd/frontend:$VERSION
```

---

### Phase 7: Deploy with Helm

```bash
# Run database migrations first
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration-initial
  namespace: production
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: prisma-migrate
          image: ${REGISTRY}/blockd/api-gateway:${VERSION}
          command: ["npx", "prisma", "migrate", "deploy"]
          envFrom:
            - secretRef:
                name: blockd-database-secret
EOF

# Deploy all services
helm upgrade --install blockd ./k8s/helm/blockd \
  --namespace production \
  --values k8s/helm/blockd/values-production.yaml \
  --set global.imageRegistry=${REGISTRY} \
  --wait --timeout 20m
```

---

### Phase 8: Verify Deployment

```bash
# Check pods
kubectl get pods -n production

# Health checks
curl https://api.blockd.site/health
curl https://api.blockd.site/api/v1/auth/health
curl https://blockd.site

# SSL verification
openssl s_client -connect blockd.site:443 -servername blockd.site </dev/null 2>/dev/null | openssl x509 -noout -dates
```

---

### Service Port Reference

| Service | Docker Port | K8s Port | Health Endpoint |
|---------|-------------|----------|-----------------|
| api-gateway | 3000 | 3000 | /health |
| auth-service | 3001 | 3001 | /health |
| session-service | 3002 | 3002 | /health |
| websocket-service | 3003 | 3003 | /health |
| ai-detection | 8000 | 8000 | /health |
| eye-tracking | 8001 | 8001 | /health |
| response-timing | 8002 | 8002 | /health |
| video-service | 8003 | 8003 | /health |
| frontend | 80 | 80 | / |

---

### Estimated AWS Monthly Costs

| Resource | Cost |
|----------|------|
| EKS Cluster | ~$73 |
| EC2 Nodes (5x t3.xlarge) | ~$420 |
| RDS PostgreSQL Multi-AZ | ~$580 |
| ElastiCache Redis (3 nodes) | ~$330 |
| Amazon MQ RabbitMQ | ~$150 |
| S3 + CloudFront | ~$30 |
| NAT Gateway | ~$45 |
| Load Balancer | ~$25 |
| **Total** | **~$1,654/month** |

---

### Quick Commands Reference

```bash
# View pods
kubectl get pods -n production

# View logs
kubectl logs -f deployment/api-gateway -n production

# Scale deployment
kubectl scale deployment api-gateway --replicas=5 -n production

# Rollback
helm rollback blockd 1 -n production

# Access Grafana
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring
```
