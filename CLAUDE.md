# CLAUDE.md - AI Assistant Guide for Blockd Platform

## Project Overview

**Project Name:** Blockd (Blocked)
**Type:** Enterprise Interview Security & AI-Powered Anti-Cheating Platform
**Budget:** $35,000
**Expected Scale:** Thousands of concurrent users
**Current Phase:** Phase 4 Complete - 75% Implementation (15/20 Agents)

### Purpose

Blockd is a sophisticated interview security platform combining:
- **Custom Chromium browser** with native security monitoring
- **AI-powered answer detection** using multi-LLM analysis
- **Eye tracking & gaze analysis** for attention monitoring
- **Real-time video streaming** and session management
- **Comprehensive security telemetry** and reporting

This is a **native Chromium fork**, not a browser extension. All security features are embedded at the browser process level.

---

## Repository Structure

```
/Blockd
├── blockd_plan.xml                    # Original specification (3,018 lines)
├── CLAUDE.md                          # This file - AI assistant guide
├── DEVELOPMENT_PLAN.json              # 20-agent coordination plan
├── TECHNOLOGY_VERSIONS.json           # Verified tech stack (2025-11-24)
├── IMPLEMENTATION_STATUS.md           # Detailed progress report
├── .git/                              # Git repository
└── docs/                              # Comprehensive JSON specifications
    ├── agent1-database-schema.json
    ├── agent2-caching-strategy.json
    ├── agent3-message-queue-topology.json
    ├── agent4-deployment-guide.json
    ├── agent5-api-specification.json
    ├── agent6-auth-flows.json
    ├── agent7-session-lifecycle.json
    ├── agent8-websocket-protocol.json
    ├── agent9-ai-detection-algorithm.json
    ├── agent10-eye-tracking-algorithm.json
    ├── agent11-response-timing-metrics.json
    ├── agent12-video-processing-pipeline.json
    ├── agent13-frontend-architecture.json
    ├── agents14-15-frontend-complete.json
    ├── agents16-18-chromium-architecture.json
    └── agents19-20-testing-cicd.json

IMPLEMENTED STRUCTURE:
/database                              # PostgreSQL + TimescaleDB + pgvector
  /migrations/                         # Alembic migrations
  /schema.sql                          # Complete database schema (11 tables, 31 indexes)
  /seed_data.sql                       # Test data
/infrastructure
  /redis/                              # Redis 8.4 cluster config
  /rabbitmq/                           # RabbitMQ 4.x topology
  /docker/                             # 8 Dockerfiles (multi-stage builds)
/k8s                                   # Kubernetes 1.31 deployment
  /manifests/                          # 15 YAML manifests
  /helm/                               # Helm charts (dev/staging/prod)
/backend                               # 8 microservices implemented
  /api-gateway/                        # Fastify 5.x (34 files, production-ready)
  /auth-service/                       # JWT + MFA + OAuth (40 files, 4,445 lines)
  /session-service/                    # Session lifecycle (38 files, 8,000+ lines)
  /websocket-service/                  # Socket.io (36 files, 4,161 lines)
  /ai-detection/                       # Multi-LLM analysis (37 files, 4,391 lines)
  /eye-tracking/                       # MediaPipe + LSTM (31 files)
  /response-timing/                    # Whisper + anomaly detection (27 files, 3,977 lines)
  /video-service/                      # mediasoup WebRTC (24 files, 4,114 lines)
/frontend
  /interviewer-app/                    # React 19.2.0 complete (75+ files, 12,000+ lines)
    /src/components/                   # UI components + shadcn/ui
    /src/pages/                        # All pages implemented
    /src/hooks/                        # useWebSocket, useWebRTC, useAuth, useSession
    /src/stores/                       # Zustand stores (auth, session, realtime)
    /src/lib/                          # API client, validations, utilities

PLANNED (Specs Complete):
/src
  /chrome/browser/blocked/
    /blocked_security/          # Security monitoring module
    /blocked_video/             # Video capture module
    /blocked_telemetry/         # System telemetry module
    /blocked_ipc/               # Backend communication module
  /chrome/browser/resources/blocked/   # UI components
  /content/renderer/blocked_eye_tracking/  # Eye tracking renderer
/backend
  /api-gateway/               # Fastify or Go/Gin API
  /video-service/             # Python FastAPI + mediasoup
  /ai-detection/              # Python FastAPI + PyTorch
  /eye-tracking/              # Python with MediaPipe
  /auth-service/              # Node.js or Go authentication
/frontend
  /interviewer-app/           # React 18+ TypeScript SPA
/database
  /migrations/                # PostgreSQL + TimescaleDB migrations
  /schemas/                   # Database schema definitions
/k8s
  /manifests/                 # Kubernetes deployment configs
  /helm/                      # Helm charts
/ci-cd
  /github-actions/            # CI/CD pipeline definitions
```

### Key Files

- **blockd_plan.xml**: Complete architectural specification containing:
  - All component designs (19 development phases)
  - API endpoint definitions
  - Database schemas (PostgreSQL, TimescaleDB, Redis)
  - Chromium browser modifications (15+ targets)
  - Security monitoring specifications
  - AI detection algorithms
  - Eye tracking implementation details
  - Infrastructure and deployment configs

---

## Current Development State

### ✅ IMPLEMENTATION STATUS: 75% Complete (15/20 Agents)

**Overall Status:** Phase 4 Complete - Production-ready backend and frontend implemented

**Git History:**
- `eee4ee7` - Initial commit: Original PostgreSQL database schema
- `06dfb34` - Prototype reset
- `e7701b7` - Added `blockd_plan.xml` (3,018 lines architectural specification)
- `a83dbc4` - Created CLAUDE.md and DEVELOPMENT_PLAN.json
- `26913a6` - **Phase 1 Complete:** Infrastructure & Database (Agents 1-4)
- `f60bba3` - **Phase 2 Complete:** Core Backend Services (Agents 5-8)
- `70b6615` - **Phase 3 Complete:** AI/ML Services (Agents 9-12)
- `bce6c07` - Phase 4 Progress: Frontend foundation + specs (Agent 13)
- `2bb790a` - **Phase 4 Complete:** Frontend Application (Agents 14-15)

**Implementation Metrics:**
- **Files Created:** 490+ TypeScript/Python/SQL/YAML files
- **Lines of Code:** 62,000+ lines of production code
- **Services Implemented:** 12 microservices + frontend app
- **Documentation:** 16 comprehensive JSON specification files
- **Technologies Verified:** 30+ latest versions (as of 2025-11-24)

### Completed Phases

#### ✅ Phase 1: Infrastructure & Database (Agents 1-4)
- PostgreSQL 18.1 schema with TimescaleDB + pgvector
- Redis 8.4 cluster (6 nodes) with TypeScript/Python clients
- RabbitMQ 4.x cluster with Celery workers
- Docker + Kubernetes infrastructure with Helm charts
- **Deliverables:** 94 files, 6,000+ lines

#### ✅ Phase 2: Core Backend Services (Agents 5-8)
- Fastify 5.x API Gateway with 30+ endpoints
- Authentication service (JWT, MFA, OAuth 2.0)
- Session management with state machine
- WebSocket infrastructure (Socket.io, 500+ concurrent connections)
- **Deliverables:** 148 files, 20,000+ lines

#### ✅ Phase 3: AI/ML Services (Agents 9-12)
- AI Detection with multi-LLM comparison (GPT-4, Claude, Gemini)
- Eye Tracking with MediaPipe FaceMesh + LSTM
- Response Timing with Whisper STT
- Video Processing with mediasoup WebRTC SFU
- **Deliverables:** 119 files, 16,500+ lines

#### ✅ Phase 4: Frontend Application (Agents 13-15)
- React 19.2.0 + TypeScript 5.9.3 complete application
- Authentication & Session Management UI
- Real-time features with WebSocket + WebRTC
- Video player, security dashboard, gaze heatmap, AI results
- **Deliverables:** 75+ files, 12,000+ lines

### Remaining Work

#### ⏳ Phase 5: Chromium Browser Architecture (Agents 16-18)
**Status:** Complete specifications, implementation pending
- Chromium 142 fork architecture designed
- Browser/renderer process modifications specified
- IPC protocol with Protocol Buffers defined
- Platform-specific security monitoring detailed
- **Note:** Requires dedicated build environment (100GB disk, 16GB RAM)

#### ⏳ Phase 6: Integration & Testing (Agents 19-20)
**Status:** Complete specifications, implementation pending
- E2E testing with Playwright
- API testing with Newman
- Load testing with k6
- GitHub Actions CI/CD workflows
- Blue-green deployment strategy

### Current Development Priorities

1. **Phase 5: Chromium Browser Implementation** (Agents 16-18)
   - Set up Chromium build environment
   - Implement browser security monitoring
   - Add renderer eye tracking integration
   - Build platform-specific installers

2. **Phase 6: Testing & CI/CD** (Agents 19-20)
   - Implement E2E test suites
   - Set up CI/CD pipelines
   - Deploy to staging environment
   - Production deployment automation

3. **Integration & QA**
   - End-to-end testing of all services
   - Performance optimization
   - Security hardening
   - User acceptance testing

---

## Architecture & Components

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERVIEWEE EXPERIENCE                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │      Blocked Chromium Browser (Desktop Native)        │  │
│  │  • Security Monitoring    • Eye Tracking              │  │
│  │  • Video Capture          • System Telemetry          │  │
│  │  • Fullscreen Lock        • Process Detection         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket + Protocol Buffers
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND MICROSERVICES                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ API Gateway │  │   Video     │  │     AI      │        │
│  │  (Fastify)  │  │  Service    │  │  Detection  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │     Eye     │  │  Response   │  │    Auth     │        │
│  │  Tracking   │  │   Timing    │  │  Service    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS + WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    INTERVIEWER EXPERIENCE                    │
│  ┌───────────────────────────────────────────────────────┐  │
│  │        React Web App (Browser-based, No Install)      │  │
│  │  • Real-time Video       • Security Event Dashboard   │  │
│  │  • Session Management    • AI Detection Results       │  │
│  │  • Gaze Heatmaps         • Comprehensive Reports      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
Interview Question Asked
         │
         ├─► AI Detection Service
         │   ├─► Generate AI answers (GPT-4, Claude, Gemini, Llama)
         │   ├─► Compute embeddings (pgvector)
         │   └─► Cache in Redis
         │
Interviewee Responds
         │
         ├─► Speech-to-Text (Whisper)
         ├─► Response Timing Analysis
         ├─► AI Similarity Scoring (XGBoost ensemble)
         │   ├─► Semantic similarity (cosine)
         │   ├─► N-gram overlap (Jaccard)
         │   ├─► Perplexity scoring (GPT-2)
         │   └─► Stylometric analysis
         │
Continuous Monitoring
         │
         ├─► Eye Tracking (30 FPS)
         │   ├─► MediaPipe FaceMesh (468 landmarks)
         │   ├─► Gaze vector computation
         │   ├─► Off-screen detection
         │   └─► Pattern recognition (reading, drift)
         │
         ├─► Security Telemetry
         │   ├─► Process enumeration
         │   ├─► Window focus tracking
         │   ├─► Screen recording detection
         │   ├─► VM detection
         │   └─► Clipboard monitoring
         │
         └─► Store in TimescaleDB (30-day retention)
                     │
                     ▼
         Generate Risk Score & Report
```

---

## Technology Stack

### Frontend

#### Interviewer Web Application (✅ Implemented)
- **Framework:** React 19.2.0 with TypeScript 5.9.3
- **State Management:** Zustand 5.x
- **UI Library:** Tailwind CSS 4.x + shadcn/ui components
- **Video:** mediasoup-client 3.x (WebRTC)
- **Real-time:** socket.io-client 4.x
- **Build Tool:** Vite 6.x
- **Data Fetching:** TanStack Query (React Query) 5.x
- **Forms:** React Hook Form + Zod validation
- **Routing:** React Router 7.x
- **Testing:** Vitest + React Testing Library, Playwright (E2E)

#### Interviewee Chromium Browser (⏳ Specified, pending implementation)
- **Base:** Chromium 142.0.7444.175 (stable as of 2025-11-17)
- **Build System:** GN + Ninja
- **Languages:** C++ (browser core), JavaScript/TypeScript (UI)
- **Key Modifications:**
  - `chrome/browser/ui/browser.cc` - Tab/window blocking
  - `content/browser/renderer_host/render_widget_host_impl.cc` - Input filtering
  - `chrome/browser/ui/exclusive_access/fullscreen_controller.cc` - Fullscreen lock
  - `chrome/browser/blocked_security/` - NEW: Security monitoring module
  - `chrome/browser/blocked_video/` - NEW: Video capture service
  - `chrome/browser/blocked_telemetry/` - NEW: System telemetry
  - `chrome/browser/blocked_ipc/` - NEW: Backend connector (WebSocket + Protobuf)
  - `content/renderer/blocked_eye_tracking/` - NEW: Eye tracking in renderer
- **Status:** Complete architecture specifications in `docs/agents16-18-chromium-architecture.json`

### Backend (✅ All Services Implemented)

#### API Gateway (✅ Implemented)
- **Framework:** Fastify 5.x (Node.js 24.11.0 LTS)
- **Authentication:** JWT (RS256) with refresh token rotation
- **Rate Limiting:** Redis-backed token bucket (100 req/min)
- **API Versioning:** `/api/v1/`
- **Documentation:** OpenAPI/Swagger

#### Video Processing Service (✅ Implemented)
- **Language:** Python 3.14.0
- **Framework:** FastAPI 0.121.3 with WebSocket support
- **Streaming:** mediasoup 3.19.11 (WebRTC SFU)
- **Recording:** FFmpeg 7.x with hardware acceleration (NVENC, QuickSync)
- **Storage:** S3-compatible (AWS S3, MinIO, Cloudflare R2)

#### AI Detection Service (✅ Implemented)
- **Language:** Python 3.14.0
- **Framework:** FastAPI 0.121.3 + Celery (async tasks)
- **ML Framework:** PyTorch 2.5.x
- **LLM Providers:**
  - OpenAI (GPT-4 Turbo)
  - Anthropic (Claude 3.5 Sonnet 20241022)
  - Google (Gemini 1.5 Pro)
- **Detection:** XGBoost 2.x ensemble classifier
- **Embeddings:** sentence-transformers 3.x (384-dim vectors)

#### Eye Tracking Service (✅ Implemented)
- **Language:** Python 3.14.0
- **ML Models:**
  - MediaPipe 0.10.x FaceMesh (468-point facial landmarks)
  - Custom CNN gaze estimator (ResNet-18 based)
- **Processing:** Kalman filtering, LSTM autoencoder for anomaly detection
- **Performance:** 30 FPS real-time processing (<50ms latency)

#### Response Timing Service (✅ Implemented)
- **Language:** Python 3.14.0
- **Speech Recognition:** OpenAI Whisper (API + self-hosted)
- **Metrics:** Response latency, speech rate (WPM), pause frequency, filler words
- **Anomaly Detection:** 6 algorithms for unnatural speech patterns

#### Authentication Service (✅ Implemented)
- **Language:** Node.js 24.11.0 LTS with TypeScript 5.9.3
- **Features:** JWT, MFA (TOTP), OAuth 2.0 (Google, Microsoft)
- **Password Hashing:** bcrypt (12 rounds)
- **Token Lifetime:** 1h access, 7d refresh

#### Session Management Service (✅ Implemented)
- **Language:** Node.js 24.11.0 LTS with TypeScript 5.9.3
- **Features:** Complete session lifecycle, risk scoring, PDF reports
- **State Machine:** Strict transition enforcement

#### WebSocket Service (✅ Implemented)
- **Language:** Node.js 24.11.0 LTS with TypeScript 5.9.3
- **Framework:** Socket.io 4.x with Redis adapter
- **Capacity:** 500+ concurrent connections
- **Events:** 15+ real-time event types

### Databases & Storage (✅ All Implemented)

#### PostgreSQL 18.1 (✅ Implemented)
- **Purpose:** Primary relational data (users, sessions, organizations)
- **ORM:** Prisma 6.x (Node.js) and SQLAlchemy 2.x (Python)
- **Extensions:** pgvector 0.7.x (embeddings), uuid-ossp, pg_stat_statements
- **Schema:** 11 tables, 31 indexes, 2 TimescaleDB hypertables
- **Migrations:** Alembic 1.x
- **Connection Pooling:** PgBouncer
- **Replication:** 1 primary + 2 read replicas

#### TimescaleDB 2.x (✅ Implemented)
- **Purpose:** Time-series data (gaze events, telemetry, security events)
- **Retention:** 30 days default (configurable up to 12 months)
- **Compression:** Enabled after 7 days (50-70% reduction)
- **Hypertables:** `gaze_events`, `browser_telemetry`

#### Redis 8.4 Cluster (✅ Implemented)
- **Purpose:** Sessions, rate limiting, AI answer caching, real-time data
- **Configuration:** 6 nodes (3 primaries + 3 replicas)
- **Memory:** 64 GB total
- **Persistence:** AOF with fsync every second
- **Clients:** TypeScript and Python cache managers

#### S3-Compatible Object Storage (✅ Configured)
- **Providers:** AWS S3, MinIO, Cloudflare R2
- **Purpose:** Video recordings, processed media, ML models, logs
- **Encryption:** AES-256 server-side
- **Lifecycle:** Delete after 90 days, archive to Glacier after 30 days

#### Message Queue: RabbitMQ 4.x (✅ Implemented)
- **Purpose:** Asynchronous job processing, event streaming
- **Configuration:** 3-node cluster with HA
- **Topology:** 5 exchanges, 20 queues with DLX
- **Workers:** Celery (Python) for task execution
- **Publishers:** TypeScript/Node.js client

### Infrastructure (✅ All Configured)

#### Containerization (✅ Implemented)
- **Docker:** 27.x with containerd runtime
- **Base Images:** node:24-alpine, python:3.14-slim, FFmpeg + CUDA, PyTorch + CUDA
- **Dockerfiles:** 8 multi-stage builds implemented
- **Registry:** AWS ECR, Google Artifact Registry, or Harbor (self-hosted)

#### Orchestration - Kubernetes 1.31 (✅ Implemented)
- **Distributions:** AWS EKS, Google GKE, Azure AKS, or self-managed
- **Manifests:** 15 YAML files for all services
- **Helm Charts:** Complete charts for dev/staging/production
- **Node Pools:**
  - System: t3.medium (2-3 nodes)
  - Applications: c6i.2xlarge (3-10 nodes, HPA)
  - Video Processing: c6i.4xlarge with GPU
  - ML Inference: GPU nodes (A100, A10G)
- **Autoscaling:** HPA (CPU >70%, Memory >80%), VPA, Cluster Autoscaler, KEDA

#### CI/CD (⏳ Specified, pending implementation)
- **Platform:** GitHub Actions
- **Pipeline Stages:** Complete specifications in `docs/agents19-20-testing-cicd.json`
  1. Lint & format (ESLint, Prettier, Black)
  2. Unit tests (Vitest, pytest) - **80% coverage minimum**
  3. Docker build with layer caching
  4. Security scanning (Trivy, Snyk, SonarQube, CodeQL)
  5. Push to container registry
  6. Deploy to staging
  7. Integration tests (Playwright, Newman, k6)
  8. Deploy to production (blue-green deployment)

#### Monitoring & Observability (⏳ Specified, pending implementation)
- **Metrics:** Prometheus + Grafana dashboards (configured)
- **Logging:** ELK Stack (Elasticsearch, Logstash, Kibana) or Loki
- **Tracing:** Jaeger or Zipkin with OpenTelemetry SDKs
- **Error Tracking:** Sentry (real-time alerts, source maps)
- **Uptime:** UptimeRobot, Pingdom, or StatusCake
- **Complete specs in:** `docs/agents19-20-testing-cicd.json`

---

## Development Workflow

### Git Workflow

#### Branch Strategy
- **Main branch:** `main` (protected, requires PR review)
- **Feature branches:** `feature/<description>`
- **Bug fixes:** `bugfix/<issue-description>`
- **Chromium updates:** `chromium-update/<version>`
- **AI assistant branches:** `claude/<session-id>` (auto-generated)

#### Commit Conventions
Follow **Conventional Commits** specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, tooling
- `security`: Security-related changes

**Examples:**
```
feat(browser): add process detection for screen recorders

Implements native process enumeration for Windows, macOS, and Linux
to detect OBS, Camtasia, QuickTime Screen Recording, and other
screen capture applications.

Closes #42
```

```
fix(ai-detection): correct perplexity scoring for short answers

Short answers (<20 words) were incorrectly flagged as high-risk
due to naturally lower perplexity scores. Added normalization
based on answer length.

Fixes #89
```

### Development Environment Setup

#### Prerequisites
- **Node.js:** 20 LTS
- **Python:** 3.11+
- **Docker:** 24+
- **Kubernetes:** kubectl + minikube/kind for local dev
- **Git:** 2.40+
- **For Chromium development:**
  - 100+ GB free disk space
  - 16-32 GB RAM
  - 8+ CPU cores
  - depot_tools installed

#### Initial Setup

```bash
# Clone repository
git clone https://github.com/WillieTheWhale/Blockd.git
cd Blockd

# Install dependencies (when implemented)
cd frontend/interviewer-app
npm install

cd ../../backend/api-gateway
npm install

cd ../ai-detection
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Setup local Kubernetes cluster
minikube start --cpus=4 --memory=8192

# Setup databases
kubectl apply -f k8s/local-dev/postgres.yaml
kubectl apply -f k8s/local-dev/redis.yaml

# Run database migrations
cd database
alembic upgrade head
```

### Testing Strategy

#### Unit Tests
- **Coverage Target:** 80% minimum
- **Frontend:** Jest + React Testing Library
- **Backend (Node.js):** Jest + Supertest
- **Backend (Python):** pytest + pytest-asyncio
- **Chromium C++:** gtest + gmock

```bash
# Run all tests
npm test                    # Frontend
pytest tests/               # Python services
ninja -C out/Default unit_tests  # Chromium
```

#### Integration Tests
- **Tool:** Playwright for E2E web testing
- **Scope:** Full user workflows (create session, join interview, end session)
- **API:** Postman collections + Newman

```bash
# Run integration tests
npm run test:e2e
newman run tests/api/postman-collection.json
```

#### Performance Tests
- **Load Testing:** k6 or Apache JBench
- **Targets:**
  - API Gateway: 1000 req/sec sustained
  - Video Streaming: 100 concurrent streams
  - WebSocket: 500 concurrent connections

---

## Key Conventions for AI Assistants

### 🤖 Guidelines for AI Code Generation

#### 1. **ALWAYS Read Before Modifying**
Never propose changes to code you haven't read. Always:
```
1. Read existing file(s)
2. Understand current implementation
3. Propose minimal, focused changes
4. Verify changes don't break existing functionality
```

#### 2. **Avoid Over-Engineering**
- Only make changes that are directly requested or clearly necessary
- Don't add features, refactoring, or "improvements" beyond the ask
- Don't add docstrings, comments, or type annotations to unchanged code
- Three similar lines of code is better than a premature abstraction

#### 3. **Security First**
Always validate code for OWASP Top 10 vulnerabilities:
- ✅ Input validation (XSS, SQL injection)
- ✅ Authentication & authorization checks
- ✅ Secure session management
- ✅ Proper error handling (don't leak sensitive info)
- ✅ HTTPS/TLS for all external communication
- ✅ Rate limiting on all public endpoints
- ✅ CORS configuration
- ✅ Dependency vulnerability scanning

#### 4. **Type Safety**
- TypeScript: Use strict mode, avoid `any`, prefer interfaces over types
- Python: Use type hints for all function signatures
- C++: Use smart pointers (std::unique_ptr, std::shared_ptr), avoid raw pointers

#### 5. **Error Handling**
- Always handle errors explicitly
- Log errors with sufficient context (use structured logging)
- Return meaningful error messages to users (but don't leak internals)
- Use try-catch blocks appropriately

**Example (TypeScript):**
```typescript
async function analyzeAnswer(answerId: string): Promise<AnalysisResult> {
  try {
    const answer = await db.answer.findUnique({ where: { id: answerId } });
    if (!answer) {
      throw new NotFoundError(`Answer ${answerId} not found`);
    }

    const result = await aiDetectionService.analyze(answer.content);
    return result;
  } catch (error) {
    logger.error('Answer analysis failed', {
      answerId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}
```

#### 6. **Database Operations**
- Always use parameterized queries (ORM or prepared statements)
- Never construct SQL strings with user input
- Use transactions for multi-step operations
- Add proper indexes for query optimization
- Follow migration naming: `YYYYMMDD_HHMM_description.sql`

#### 7. **API Design**
- RESTful conventions: GET (read), POST (create), PUT (update), PATCH (partial update), DELETE (remove)
- Use proper HTTP status codes:
  - 200 OK, 201 Created, 204 No Content
  - 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict
  - 500 Internal Server Error, 503 Service Unavailable
- Version APIs: `/api/v1/`, `/api/v2/`
- Use pagination for list endpoints: `?page=1&limit=20`
- Include HATEOAS links when appropriate

#### 8. **Chromium Browser Development**

**CRITICAL:** When working on Chromium code:

- Study existing Chromium patterns before implementing
- Follow Chromium C++ style guide (Google C++ Style)
- Use Mojo for IPC between processes
- Never block the browser main thread
- Use PostTask() for async operations
- Respect process architecture (Browser vs. Renderer vs. GPU)

**File Naming:**
- Headers: `blocked_feature_name.h`
- Implementation: `blocked_feature_name.cc`
- Tests: `blocked_feature_name_unittest.cc`

**Example Structure:**
```cpp
// chrome/browser/blocked_security/blocked_security_service.h
#ifndef CHROME_BROWSER_BLOCKED_SECURITY_BLOCKED_SECURITY_SERVICE_H_
#define CHROME_BROWSER_BLOCKED_SECURITY_BLOCKED_SECURITY_SERVICE_H_

#include "base/memory/weak_ptr.h"
#include "components/keyed_service/core/keyed_service.h"

class BlockedSecurityService : public KeyedService {
 public:
  explicit BlockedSecurityService();
  ~BlockedSecurityService() override;

  void StartMonitoring();
  void StopMonitoring();

 private:
  void OnProcessEnumerated(const std::vector<ProcessInfo>& processes);

  base::WeakPtrFactory<BlockedSecurityService> weak_factory_{this};
};

#endif  // CHROME_BROWSER_BLOCKED_SECURITY_BLOCKED_SECURITY_SERVICE_H_
```

#### 9. **AI/ML Model Integration**

When adding or modifying AI detection logic:

- Always cache expensive operations (embeddings, LLM responses)
- Use Redis for caching with appropriate TTL
- Implement graceful degradation if AI service is unavailable
- Add confidence thresholds (don't rely on binary yes/no)
- Log all AI decisions for audit trail
- Use pgvector for persistent vector storage

**Confidence Thresholds:**
- High risk: ≥0.85 (likely AI-generated)
- Medium risk: 0.70-0.84 (investigate further)
- Low risk: 0.50-0.69 (probably human)
- Minimal risk: <0.50 (human)

#### 10. **Real-Time Communication**

- Use WebSocket for bidirectional real-time data
- Implement heartbeat/ping-pong for connection health
- Handle reconnection with exponential backoff
- Buffer messages during disconnection
- Use Protocol Buffers for efficient binary serialization

---

## Critical Implementation Guidelines

### 🔒 Security & Privacy

#### Data Handling
- **PII Protection:** Encrypt at rest (AES-256) and in transit (TLS 1.3)
- **Video Retention:** Delete after 90 days (configurable by organization)
- **GDPR Compliance:** Implement data export and deletion workflows
- **Audit Logging:** Log all authentication events, session starts/ends, security events

#### Authentication & Authorization
- Use JWT with RS256 (never HS256 in production)
- Implement refresh token rotation
- Enforce strong password policy (min 12 chars, complexity requirements)
- Support MFA (TOTP with backup codes)
- Implement role-based access control (RBAC):
  - `admin`: Full system access
  - `interviewer`: Create sessions, view reports
  - `interviewee`: Join assigned sessions only
  - `viewer`: Read-only access to reports

#### Rate Limiting
- **Public endpoints:** 100 requests/min per IP
- **Authenticated endpoints:** 500 requests/min per user
- **WebSocket:** 1000 messages/min per connection
- Use Redis-backed token bucket algorithm

### 📊 Performance Optimization

#### Caching Strategy
1. **AI Answer Cache (Redis):**
   - Key: `ai_answer:question_hash:model_name`
   - TTL: 24 hours
   - Store: Generated answer text + embeddings

2. **Session Data (Redis):**
   - Key: `session:{session_id}`
   - TTL: Session duration + 1 hour
   - Store: Metadata, participants, status

3. **User Sessions (Redis):**
   - Key: `user_session:{token_hash}`
   - TTL: 1 hour (access token lifetime)

#### Database Optimization
- Add indexes on frequently queried fields:
  ```sql
  CREATE INDEX idx_sessions_org_status ON interview_sessions(organization_id, status);
  CREATE INDEX idx_security_events_session_time ON security_events(session_id, timestamp DESC);
  CREATE INDEX idx_gaze_events_session_time ON gaze_events(session_id, timestamp DESC);
  ```
- Use connection pooling (PgBouncer with 100 max connections)
- Enable query logging for slow queries (>500ms)

#### Video Processing
- Use hardware acceleration when available (NVENC, QuickSync, VideoToolbox)
- Implement adaptive bitrate streaming (240p, 360p, 480p, 720p)
- Compress recorded videos with H.264/H.265
- Use CDN for video delivery (CloudFront, Cloudflare)

### 🧪 Testing Requirements

#### Pre-commit Checks
```bash
# Run automatically via Git hook
npm run lint          # ESLint + Prettier
npm run type-check    # TypeScript compiler
npm test -- --coverage  # Jest with coverage
```

#### Code Coverage Targets
- **Overall:** 80% minimum
- **Critical paths:** 95% (authentication, payment, security monitoring)
- **Utilities:** 90%
- **UI components:** 70%

#### Test Pyramid
```
        ╱╲         5%  - E2E Tests (Playwright)
       ╱  ╲
      ╱    ╲       15% - Integration Tests
     ╱──────╲
    ╱        ╲     80% - Unit Tests (Jest, pytest, gtest)
   ╱──────────╲
```

---

## Database Schema Reference

### Core Tables

#### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),  -- bcrypt, null for OAuth users
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL,     -- admin, interviewer, interviewee, viewer
  organization_id UUID REFERENCES organizations(id),
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(32),      -- Base32-encoded TOTP secret
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### interview_sessions
```sql
CREATE TABLE interview_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  interviewer_id UUID REFERENCES users(id),
  interviewee_id UUID REFERENCES users(id),
  status session_status NOT NULL,  -- scheduled, active, ended, cancelled
  scheduled_start TIMESTAMP,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  session_token VARCHAR(255) UNIQUE,  -- For interviewee browser auth
  video_recording_url TEXT,
  risk_score DECIMAL(3,2),     -- 0.00 to 1.00 (computed at end)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### security_events
```sql
CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES interview_sessions(id),
  event_type security_event_type NOT NULL,
  severity event_severity NOT NULL,  -- low, medium, high, critical
  description TEXT,
  metadata JSONB,               -- Additional context (process name, window title, etc.)
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_security_events_session_time
ON security_events(session_id, timestamp DESC);
```

#### gaze_events (TimescaleDB Hypertable)
```sql
CREATE TABLE gaze_events (
  session_id UUID NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  gaze_x FLOAT,                -- Normalized 0-1 (left to right)
  gaze_y FLOAT,                -- Normalized 0-1 (top to bottom)
  is_off_screen BOOLEAN,
  off_screen_direction VARCHAR(20),  -- left, right, up, down
  confidence FLOAT             -- 0-1 (eye tracking model confidence)
);

-- Convert to hypertable (TimescaleDB)
SELECT create_hypertable('gaze_events', 'timestamp');

-- Retention policy (delete after 30 days)
SELECT add_retention_policy('gaze_events', INTERVAL '30 days');

-- Compression policy (compress after 7 days)
SELECT add_compression_policy('gaze_events', INTERVAL '7 days');
```

#### ai_answer_cache
```sql
CREATE TABLE ai_answer_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_hash VARCHAR(64) NOT NULL,  -- SHA-256 of normalized question
  model_name VARCHAR(50) NOT NULL,     -- gpt-4, claude-3.5-sonnet, gemini-1.5-pro
  answer_text TEXT NOT NULL,
  embedding vector(384),               -- pgvector for semantic search
  perplexity_score FLOAT,
  generated_at TIMESTAMP DEFAULT NOW(),
  access_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP,
  UNIQUE(question_hash, model_name)
);

-- pgvector index for similarity search
CREATE INDEX idx_ai_answer_embedding ON ai_answer_cache
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

---

## API Endpoint Reference

### Authentication

#### POST /api/v1/auth/register
```json
Request:
{
  "email": "interviewer@company.com",
  "password": "SecurePass123!",
  "full_name": "Jane Doe",
  "role": "interviewer",
  "organization_id": "uuid"
}

Response: 201 Created
{
  "user_id": "uuid",
  "email": "interviewer@company.com",
  "access_token": "eyJhbGc...",
  "refresh_token": "refresh_token_here",
  "expires_in": 3600
}
```

#### POST /api/v1/auth/login
```json
Request:
{
  "email": "interviewer@company.com",
  "password": "SecurePass123!",
  "mfa_code": "123456"  // Optional, required if MFA enabled
}

Response: 200 OK
{
  "user_id": "uuid",
  "access_token": "eyJhbGc...",
  "refresh_token": "refresh_token_here",
  "expires_in": 3600
}
```

### Session Management

#### POST /api/v1/sessions
```json
Request:
{
  "interviewee_id": "uuid",
  "scheduled_start": "2025-11-25T10:00:00Z",
  "questions": [
    {
      "question_text": "Explain the difference between TCP and UDP",
      "expected_duration_seconds": 180,
      "difficulty": "medium"
    }
  ]
}

Response: 201 Created
{
  "session_id": "uuid",
  "session_token": "token_for_interviewee",
  "status": "scheduled",
  "join_url": "https://blocked.com/join/token"
}
```

#### POST /api/v1/sessions/:session_id/start
```json
Request: (empty body)

Response: 200 OK
{
  "session_id": "uuid",
  "status": "active",
  "started_at": "2025-11-25T10:00:15Z",
  "websocket_url": "wss://api.blocked.com/api/v1/sessions/uuid/stream"
}
```

### Browser Client Endpoints

#### POST /api/v1/browser/security/event
```json
Request:
{
  "session_token": "token",
  "event_type": "suspicious_process_detected",
  "severity": "high",
  "description": "Detected OBS Studio running",
  "metadata": {
    "process_name": "obs64.exe",
    "process_id": 12345,
    "window_title": "OBS 30.0.0"
  }
}

Response: 204 No Content
```

#### POST /api/v1/browser/telemetry/batch
```json
Request:
{
  "session_token": "token",
  "telemetry_data": [
    {
      "timestamp": "2025-11-25T10:05:00Z",
      "cpu_percent": 45.2,
      "memory_mb": 2048,
      "active_processes": 87,
      "window_focused": true
    },
    // ... more telemetry points
  ]
}

Response: 204 No Content
```

### AI Analysis

#### POST /api/v1/analysis/answer
```json
Request:
{
  "session_id": "uuid",
  "question_id": "uuid",
  "answer_text": "TCP is connection-oriented and ensures reliable delivery...",
  "response_time_ms": 12500,
  "audio_url": "s3://bucket/session/question_audio.wav"  // Optional
}

Response: 200 OK
{
  "analysis_id": "uuid",
  "risk_score": 0.72,
  "risk_level": "medium",
  "similarity_scores": {
    "gpt-4": 0.78,
    "claude-3.5-sonnet": 0.71,
    "gemini-1.5-pro": 0.69
  },
  "perplexity_score": 145.2,
  "response_timing": {
    "latency_ms": 1200,
    "speech_rate_wpm": 145,
    "pause_count": 3,
    "filler_word_ratio": 0.02
  },
  "flags": [
    "high_similarity_gpt4",
    "fast_response_complex_question"
  ]
}
```

---

## Deployment Guide

### Local Development

```bash
# Start local Kubernetes cluster
minikube start --cpus=4 --memory=8192 --disk-size=50g

# Deploy databases
kubectl apply -f k8s/local-dev/postgres.yaml
kubectl apply -f k8s/local-dev/redis.yaml
kubectl apply -f k8s/local-dev/rabbitmq.yaml

# Port forward for local access
kubectl port-forward svc/postgres 5432:5432
kubectl port-forward svc/redis 6379:6379

# Run migrations
cd database
alembic upgrade head

# Start services locally
cd backend/api-gateway
npm run dev

cd ../video-service
python -m uvicorn main:app --reload

cd ../../frontend/interviewer-app
npm run dev
```

### Staging Deployment

```bash
# Build and push Docker images
docker build -t blocked/api-gateway:staging -f backend/api-gateway/Dockerfile .
docker push blocked/api-gateway:staging

# Deploy to Kubernetes staging namespace
kubectl apply -f k8s/staging/ -n staging

# Verify deployment
kubectl get pods -n staging
kubectl logs -f deployment/api-gateway -n staging
```

### Production Deployment

**Prerequisites:**
- Kubernetes cluster (EKS/GKE/AKS) provisioned
- Helm 3+ installed
- Production secrets configured in Kubernetes Secrets
- TLS certificates issued (Let's Encrypt via cert-manager)

```bash
# Install cert-manager (for automatic TLS)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Install Prometheus + Grafana (monitoring)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace

# Deploy Blocked platform
helm install blocked ./k8s/helm/blocked \
  --namespace production \
  --create-namespace \
  --values k8s/helm/blocked/values-production.yaml

# Verify deployment
kubectl get pods -n production
kubectl get ingress -n production

# Check monitoring
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
# Open http://localhost:3000 (admin/prom-operator)
```

---

## Troubleshooting Guide

### Common Issues

#### 1. Chromium Build Fails
**Symptom:** `ninja: build stopped: subcommand failed.`

**Solutions:**
- Ensure you have 16+ GB RAM and 100+ GB disk space
- Run `gclient sync` to update dependencies
- Check for compiler errors in Chromium source
- Verify GN args: `gn args out/Default --list`

#### 2. Video Streaming Latency
**Symptom:** Video feed has >2 second delay

**Solutions:**
- Check mediasoup configuration (use `planB` SDP format)
- Verify network bandwidth (need 2-5 Mbps per stream)
- Enable hardware encoding in FFmpeg (NVENC, QuickSync)
- Reduce video resolution/framerate

#### 3. AI Detection False Positives
**Symptom:** Human answers flagged as AI-generated

**Solutions:**
- Adjust similarity thresholds (increase from 0.85 to 0.90)
- Check if question is too simple (generic answers look like AI)
- Review perplexity scoring calibration
- Consider answer length normalization

#### 4. Database Connection Pool Exhausted
**Symptom:** `Error: Connection pool exhausted`

**Solutions:**
- Increase PgBouncer max connections (default 100)
- Check for connection leaks (unclosed database clients)
- Implement connection pooling in application code
- Add database replicas for read queries

#### 5. Redis Out of Memory
**Symptom:** `OOM command not allowed when used memory > 'maxmemory'`

**Solutions:**
- Increase Redis memory allocation (32-64 GB)
- Review TTL settings (reduce cache duration)
- Enable eviction policy: `maxmemory-policy allkeys-lru`
- Add more Redis replicas

---

## Performance Benchmarks

### Target Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Response Time (p95) | <200ms | Prometheus + Grafana |
| WebSocket Message Latency | <50ms | Custom instrumentation |
| Video Stream Latency | <1s | WebRTC stats |
| AI Detection Time | <5s | FastAPI middleware |
| Eye Tracking FPS | 30 FPS | Renderer process metrics |
| Database Query Time (p95) | <100ms | pg_stat_statements |
| Page Load Time (p75) | <2s | Lighthouse CI |

### Load Testing

Use k6 for load testing:

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Ramp up to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],  // 95% of requests must complete below 200ms
  },
};

export default function () {
  let response = http.get('https://api.blocked.com/api/v1/sessions');
  check(response, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

Run: `k6 run load-test.js`

---

## Security Considerations

### Threat Model

#### Threats We Mitigate
1. **Interviewee Using AI Assistance (ChatGPT, Claude, etc.)**
   - Detection: Multi-LLM similarity analysis with XGBoost ensemble
   - Mitigation: Real-time alerts to interviewer

2. **Interviewee Looking at Second Monitor/Phone**
   - Detection: Eye tracking with off-screen gaze detection
   - Mitigation: Flag suspicious gaze patterns (prolonged off-screen)

3. **Interviewee Using Virtual Machine to Bypass Security**
   - Detection: CPUID checks, registry analysis, SMBIOS inspection
   - Mitigation: Block session start if VM detected

4. **Interviewee Screen Recording Interview Questions**
   - Detection: Process enumeration for OBS, Camtasia, etc.
   - Mitigation: Force-close recording apps or terminate session

5. **Interviewee Switching Windows/Applications**
   - Detection: Window focus monitoring via OS APIs
   - Mitigation: Log all focus changes, alert interviewer

#### Threats We DON'T Mitigate
1. **Physical room observer (someone else in the room)**
   - Out of scope: Requires physical security measures
2. **Interviewee reading from printed notes off-camera**
   - Partial mitigation: Eye tracking may detect reading patterns
3. **Pre-memorized answers**
   - Out of scope: Cannot distinguish from legitimate knowledge

### Secure Coding Checklist

Before submitting code, verify:

- [ ] All user inputs are validated and sanitized
- [ ] SQL queries use parameterized statements (no string concatenation)
- [ ] Authentication tokens are stored securely (never in localStorage)
- [ ] Passwords are hashed with bcrypt (cost factor 12+)
- [ ] Sensitive data is encrypted at rest (AES-256)
- [ ] HTTPS/TLS 1.3 for all external communication
- [ ] CORS configured correctly (no `Access-Control-Allow-Origin: *` in production)
- [ ] Rate limiting applied to all public endpoints
- [ ] Secrets not committed to Git (use .env files in .gitignore)
- [ ] Dependencies scanned for vulnerabilities (npm audit, Snyk)
- [ ] Error messages don't leak sensitive information
- [ ] Logging doesn't include PII, passwords, or tokens
- [ ] JWT tokens have reasonable expiration (1h for access, 7d for refresh)
- [ ] MFA implemented for admin accounts

---

## Useful Resources

### Documentation
- **Chromium Development:** https://www.chromium.org/developers/
- **Chromium C++ Style Guide:** https://chromium.googlesource.com/chromium/src/+/main/styleguide/c++/c++.md
- **MediaPipe:** https://developers.google.com/mediapipe
- **WebRTC:** https://webrtc.org/getting-started/overview
- **PostgreSQL:** https://www.postgresql.org/docs/16/
- **TimescaleDB:** https://docs.timescale.com/
- **Redis:** https://redis.io/documentation
- **Kubernetes:** https://kubernetes.io/docs/home/
- **FastAPI:** https://fastapi.tiangolo.com/
- **React:** https://react.dev/

### Tools
- **Depot Tools (Chromium):** https://commondatastorage.googleapis.com/chrome-infra-docs/flat/depot_tools/docs/html/depot_tools_tutorial.html
- **pgvector:** https://github.com/pgvector/pgvector
- **Prometheus:** https://prometheus.io/docs/introduction/overview/
- **Grafana:** https://grafana.com/docs/
- **Sentry:** https://docs.sentry.io/

---

## Contact & Support

### Project Repository
- **GitHub:** https://github.com/WillieTheWhale/Blockd
- **Issues:** https://github.com/WillieTheWhale/Blockd/issues
- **Pull Requests:** https://github.com/WillieTheWhale/Blockd/pulls

### Development Team
When implementation begins, add team contact information here.

---

## Changelog

### 2025-11-24 - Major Implementation Progress (Version 2.0)
- **Phase 1 Complete:** Infrastructure & Database (Agents 1-4)
  - PostgreSQL 18.1 + TimescaleDB + pgvector schema
  - Redis 8.4 cluster implementation
  - RabbitMQ 4.x topology
  - Docker + Kubernetes infrastructure

- **Phase 2 Complete:** Core Backend Services (Agents 5-8)
  - Fastify API Gateway with 30+ endpoints
  - Authentication service (JWT, MFA, OAuth)
  - Session management service
  - WebSocket infrastructure (Socket.io)

- **Phase 3 Complete:** AI/ML Services (Agents 9-12)
  - Multi-LLM AI detection service
  - Eye tracking with MediaPipe
  - Response timing analysis
  - Video processing with mediasoup

- **Phase 4 Complete:** Frontend Application (Agents 13-15)
  - React 19.2.0 complete application
  - Authentication & session management UI
  - Real-time features (WebSocket + WebRTC)
  - Video player, security dashboard, gaze heatmap

- **Specifications Created:** Agents 16-20
  - Chromium browser architecture (Agents 16-18)
  - Testing & CI/CD specifications (Agents 19-20)

- **Documentation:** 16 comprehensive JSON specification files
- **Total Implementation:** 490+ files, 62,000+ lines of production code
- **Status Update:** 75% complete (15/20 agents)

### 2025-11-24 - Initial CLAUDE.md Creation (Version 1.0)
- Created comprehensive AI assistant guide
- Documented complete architecture and technology stack
- Added development workflow and conventions
- Included security guidelines and best practices
- Added API reference and database schema documentation

---

**Version:** 2.0.0
**Last Updated:** 2025-11-24
**Status:** 75% Complete - Production Backend & Frontend Implemented
**Remaining:** Chromium Browser Implementation + Testing/CI-CD (Agents 16-20)
