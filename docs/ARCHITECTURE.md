# Blockd Platform Architecture

> Comprehensive technical architecture documentation for the Blockd interview integrity platform.

**Last Updated:** February 2026

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Microservices](#microservices)
4. [Database Architecture](#database-architecture)
5. [Caching & Message Queues](#caching--message-queues)
6. [AI Detection System](#ai-detection-system)
7. [Eye Tracking System](#eye-tracking-system)
8. [Security Monitoring](#security-monitoring)
9. [Real-time Communication](#real-time-communication)
10. [Chromium Browser](#chromium-browser)
11. [Risk Scoring](#risk-scoring)

---

## System Overview

Blockd is an enterprise interview security platform that combines:

- **Custom Chromium Browser** - Native security monitoring embedded at the browser process level
- **AI-Powered Detection** - Multi-LLM analysis to detect AI-generated answers
- **Eye Tracking** - MediaPipe-based gaze analysis for attention monitoring
- **Real-time Video Streaming** - WebRTC-based session recording and monitoring
- **Security Telemetry** - Process detection, VM detection, and window focus tracking

### Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 19, TypeScript 5.7+, Vite 6, Tailwind CSS 4, shadcn/ui, Zustand | |
| API Gateway | Fastify 5, Node.js 20+ LTS, Prisma 6 | |
| Python Services | FastAPI 0.109+, Python 3.12+, PyTorch 2.1+, sentence-transformers | |
| Database | PostgreSQL 16+ with TimescaleDB + pgvector | pg16 in dev, pg18 in prod |
| Cache | Redis 7+ | redis:7-alpine in dev |
| Message Queue | RabbitMQ 3.x with Celery workers | |
| Video | mediasoup (WebRTC SFU), FFmpeg 7 | |
| Browser | Chromium 142 fork (C++) | |
| Infrastructure | AWS EKS, Terraform, Helm | |

> **Note:** Local development uses slightly older but compatible versions. See `docker-compose.yml` for development versions and `TECHNOLOGY_VERSIONS.json` for production targets.

---

## Architecture Diagram

```
                                    ┌─────────────────────────────────────────────┐
                                    │              BLOCKD PLATFORM                │
                                    └─────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────────────────────────┐
│  Interviewer App │     │  Blockd Browser  │     │         Backend Services             │
│  (React 19 SPA)  │     │  (Chromium Fork) │     │                                      │
└────────┬─────────┘     └────────┬─────────┘     │  ┌─────────────────────────────────┐ │
         │                        │               │  │        API Gateway (3000)        │ │
         │         REST/WS        │  Security     │  │   JWT Auth, Rate Limiting, CORS  │ │
         └────────────────────────┼───Telemetry───│  └───────────────┬─────────────────┘ │
                                  │               │                  │                   │
                                  │               │    ┌─────────────┼─────────────┐     │
                                  │               │    │             │             │     │
                                  │               │    ▼             ▼             ▼     │
                                  │               │  ┌─────┐     ┌─────┐     ┌─────┐    │
                                  │               │  │Auth │     │Sess │     │ WS  │    │
                                  │               │  │3001 │     │3002 │     │3003 │    │
                                  │               │  └─────┘     └─────┘     └─────┘    │
                                  │               │                                      │
                                  │               │    ┌─────────────────────────────┐   │
                                  │               │    │     Python ML Services      │   │
                                  │               │    │                             │   │
                                  └───────────────┼───▶│  AI Detection (8000)        │   │
                                   Eye Tracking   │    │  Eye Tracking (8001)        │   │
                                   Gaze Data      │    │  Response Timing (8002)     │   │
                                                  │    │  Video Service (8003)       │   │
                                                  │    └─────────────────────────────┘   │
                                                  └──────────────────────────────────────┘
                                                                    │
                                  ┌─────────────────────────────────┼─────────────────────┐
                                  │           Data Layer            │                     │
                                  │                                 ▼                     │
                                  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
                                  │  │ PostgreSQL   │  │    Redis     │  │  RabbitMQ   │ │
                                  │  │ + TimescaleDB│  │   Cluster    │  │   Cluster   │ │
                                  │  │ + pgvector   │  │              │  │             │ │
                                  │  └──────────────┘  └──────────────┘  └─────────────┘ │
                                  └───────────────────────────────────────────────────────┘
```

---

## Microservices

### Node.js Services (Fastify 5)

| Service | Port | Purpose |
|---------|------|---------|
| **API Gateway** | 3000 | Central entry point, JWT auth, rate limiting, request routing |
| **Auth Service** | 3001 | User registration, login, MFA (TOTP), OAuth 2.0 (Google, Microsoft) |
| **Session Service** | 3002 | Interview session lifecycle, questions, security events |
| **WebSocket Service** | 3003 | Real-time bidirectional communication via Socket.io |

### Python Services (FastAPI)

| Service | Port | Purpose |
|---------|------|---------|
| **AI Detection** | 8000 | Multi-LLM analysis, semantic similarity, XGBoost classification |
| **Eye Tracking** | 8001 | MediaPipe FaceMesh, gaze estimation, LSTM anomaly detection |
| **Response Timing** | 8002 | Whisper transcription, speech rate analysis, pause detection |
| **Video Service** | 8003 | WebRTC SFU (mediasoup), FFmpeg recording, S3 storage |

### Service Communication

- **Synchronous:** REST API calls between services via internal DNS
- **Asynchronous:** RabbitMQ message queues for background processing
- **Real-time:** Socket.io with Redis adapter for horizontal scaling

---

## Database Architecture

### PostgreSQL 18.1 with Extensions

| Extension | Purpose |
|-----------|---------|
| **TimescaleDB** | Time-series data for gaze events and browser telemetry |
| **pgvector** | Vector similarity search for AI answer embeddings (384 dimensions) |
| **uuid-ossp** | UUID generation for primary keys |
| **pgcrypto** | Secure token generation |

### Core Tables

| Table | Description |
|-------|-------------|
| `organizations` | Organization accounts with subscription tiers |
| `users` | User accounts with roles (admin, interviewer, interviewee) |
| `interview_sessions` | Session lifecycle with status, risk scores, video URLs |
| `questions` | Interview questions per session |
| `answer_analysis` | AI detection analysis results |
| `security_events` | Security monitoring events |
| `gaze_events` | TimescaleDB hypertable for eye tracking data (30-day retention) |
| `browser_telemetry` | TimescaleDB hypertable for browser metrics |
| `session_reports` | Final session analysis reports |
| `ai_answer_cache` | Cached AI answers with vector embeddings |

### Entity Relationships

```
organizations 1──────────* users
organizations 1──────────* interview_sessions
users 1──────────* interview_sessions (as interviewer)
users 1──────────* interview_sessions (as interviewee)
interview_sessions 1──────────* questions
interview_sessions 1──────────* security_events
interview_sessions 1──────────* gaze_events
questions 1──────────* answer_analysis
```

---

## Caching & Message Queues

### Redis 8.4 Cluster

**Architecture:** 3 primaries + 3 replicas with cluster mode enabled

| Cache Pattern | TTL | Purpose |
|---------------|-----|---------|
| `session:{id}` | Session duration | Active session state |
| `ai_detection:ai_answers:{hash}` | 24 hours | Cached AI-generated answers |
| `ai_detection:analysis:{id}` | 7 days | Analysis results |
| `rate_limit:{ip}` | 1 minute | Rate limiting tokens |
| `refresh_token:{token}` | 7 days | JWT refresh tokens |

### RabbitMQ 4.x Message Queues

| Exchange | Queues | Purpose |
|----------|--------|---------|
| `video_processing` | start, stop, transcode | Video encoding and storage |
| `ai_detection` | analyze_question, analyze_answer | AI analysis jobs |
| `security_events` | low, medium, high, critical | Security event routing by severity |
| `gaze_analysis` | batch, realtime | Eye tracking analysis |
| `dlx` (Dead Letter) | retry, failed | Failed message handling |

---

## AI Detection System

### Multi-Stage Detection Pipeline

```
Question → Generate AI Answers → Cache Embeddings → Compare Human Answer → Risk Score
            (GPT-4, Claude,       (pgvector +        (Similarity +
             Gemini)               Redis)             XGBoost)
```

### Detection Components

| Component | Description |
|-----------|-------------|
| **Multi-LLM Generation** | Parallel answer generation from GPT-4, Claude 3.5, Gemini 1.5 |
| **Semantic Similarity** | Cosine similarity using sentence-transformers (all-MiniLM-L6-v2) |
| **Perplexity Scoring** | GPT-2 based predictability measurement |
| **N-gram Overlap** | Trigram/4-gram Jaccard similarity for copy detection |
| **Stylometric Analysis** | Vocabulary richness, sentence length, punctuation density |
| **XGBoost Classifier** | 15-feature ensemble for final risk prediction |

### Similarity Thresholds

| Similarity Score | Interpretation |
|------------------|----------------|
| 0.0 - 0.3 | Very different content |
| 0.3 - 0.6 | Somewhat related |
| 0.6 - 0.8 | Similar content |
| 0.8 - 0.95 | Very similar (suspicious) |
| 0.95 - 1.0 | Nearly identical (highly suspicious) |

### Perplexity Interpretation

| Range | Interpretation |
|-------|----------------|
| < 30 | Highly predictable, likely AI-generated |
| 30-50 | Predictable, suspicious |
| 50-100 | Normal human variation |
| > 100 | Unpredictable, likely human |

---

## Eye Tracking System

### MediaPipe Integration

- **Face Detection:** 468-point facial landmark detection
- **Gaze Estimation:** 3D gaze vector calculation from eye landmarks
- **Processing Rate:** 30 FPS with Kalman filtering for smoothing
- **Anomaly Detection:** LSTM model for pattern recognition

### Gaze Patterns Detected

| Pattern | Description |
|---------|-------------|
| Reading | Normal focused attention on screen |
| Attention Drift | Gradual loss of focus |
| Shifty Eyes | Rapid, suspicious eye movements |
| Off-Screen | Looking away from the interview |
| Fixation | Prolonged staring at one location |

### Data Storage

- **Real-time:** 30 FPS streamed via WebSocket
- **Storage:** TimescaleDB hypertable with 1-day chunks
- **Retention:** 30 days with automatic compression after 7 days
- **Aggregation:** 1-minute continuous aggregates for summaries

---

## Security Monitoring

### Blockd Browser Security Features

| Feature | Detection Method |
|---------|------------------|
| **Process Detection** | System process enumeration for OBS, Camtasia, etc. |
| **Screen Recording** | API hooks for screen capture detection |
| **VM Detection** | Hardware fingerprinting, hypervisor detection |
| **Window Focus** | Browser focus events and active window monitoring |
| **Clipboard** | Clipboard API monitoring for copy/paste |
| **Multiple Displays** | Display enumeration and monitoring |

### Security Event Types

| Event | Severity | Description |
|-------|----------|-------------|
| `suspicious_process` | High | Forbidden process detected |
| `screen_recording_detected` | Critical | Screen recording software active |
| `vm_detected` | High | Virtual machine environment |
| `window_focus_changed` | Medium | Browser lost focus |
| `multi_monitor_detected` | Medium | Additional monitors detected |
| `copy_paste_detected` | Low | Clipboard activity |
| `keyboard_shortcut_blocked` | Low | Blocked hotkey attempt |

### Platform-Specific Implementations

- **Windows:** WMI queries, EnumProcesses API, DwmGetWindowAttribute
- **macOS:** NSWorkspace, CGWindowListCopyWindowInfo, IOKit
- **Linux:** /proc filesystem, X11/Wayland APIs, DBus

---

## Real-time Communication

### WebSocket Protocol (Socket.io)

**Client → Server Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `session:join` | `{sessionId}` | Join session room |
| `gaze:stream` | `{x, y, confidence}` | Stream gaze data |
| `security:event` | `{type, severity}` | Report security event |
| `chat:message` | `{content}` | Send chat message |

**Server → Client Events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `session:state` | `{status, risk}` | Session state update |
| `participant:joined` | `{userId}` | Participant joined |
| `security:alert` | `{event}` | Security event alert |
| `gaze:update` | `{data}` | Gaze data update |

### Horizontal Scaling

- Redis adapter for multi-instance Socket.io
- Sticky sessions via load balancer
- Heartbeat: 25-second interval with ping/pong
- Reconnection: Exponential backoff (1s-30s)

---

## Chromium Browser

### Blockd Browser Modules

| Module | Location | Purpose |
|--------|----------|---------|
| `blocked_security` | `chrome/browser/blocked/` | Security monitoring service |
| `blocked_telemetry` | `chrome/browser/blocked/` | System telemetry collection |
| `blocked_ipc` | `chrome/browser/blocked/` | WebSocket backend communication |
| `blocked_video` | `chrome/browser/blocked/` | Video capture service |
| `blocked_meeting` | `chrome/browser/blocked/` | Meeting platform detection |
| `blocked_eye_tracking` | `content/renderer/` | MediaPipe eye tracking |

### Meeting Platform Detection

| Platform | URL Patterns |
|----------|--------------|
| Google Meet | `meet.google.com/*` |
| Zoom | `*.zoom.us/*`, `zoom.us/*` |
| Microsoft Teams | `teams.microsoft.com/*`, `teams.live.com/*` |

### JavaScript API (window.BlockedAPI)

```javascript
BlockedAPI.startEyeTracking()     // Start eye tracking
BlockedAPI.stopEyeTracking()      // Stop eye tracking
BlockedAPI.calibrate()            // Run 9-point calibration
BlockedAPI.startVideoCapture()    // Start webcam capture
BlockedAPI.stopVideoCapture()     // Stop webcam capture
BlockedAPI.getSessionId()         // Get current session ID
BlockedAPI.isSessionActive()      // Check if session active
BlockedAPI.addEventListener()     // Listen for events
```

### Build Requirements

- **Disk:** 100+ GB (30 GB source, 50 GB build, 20 GB deps)
- **RAM:** 16 GB minimum, 32 GB recommended
- **Time:** 4-8 hours initial build, 20-40 min incremental

---

## Risk Scoring

### Multi-Factor Risk Calculation

```
Overall Risk Score = (AI Detection × 0.40) +
                     (Security Events × 0.30) +
                     (Gaze Anomalies × 0.20) +
                     (Timing Anomalies × 0.10)
```

### Risk Levels

| Level | Score Range | Action |
|-------|-------------|--------|
| **Minimal** | 0.00 - 0.29 | No action required |
| **Low** | 0.30 - 0.49 | Monitor |
| **Medium** | 0.50 - 0.74 | Review recommended |
| **High** | 0.75 - 0.89 | Manual review required |
| **Critical** | 0.90 - 1.00 | Investigation required |

### Detection Flags

| Flag | Condition | Severity |
|------|-----------|----------|
| `high_similarity_gpt4` | Similarity > 0.85 | High |
| `high_similarity_claude` | Similarity > 0.85 | High |
| `low_perplexity` | Perplexity < 50 | High |
| `high_ngram_overlap` | Overlap > 0.70 | High |
| `instant_response` | < 2s for hard question | Medium |
| `unnatural_vocabulary` | Richness < 0.3 or > 0.8 | Medium |
| `robotic_tone` | No fillers + high punctuation | Low |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| API response time (p95) | < 200ms |
| WebSocket latency (p95) | < 50ms |
| AI analysis (cached) | < 100ms |
| AI analysis (uncached) | < 5000ms |
| Gaze processing | < 50ms per frame |
| Concurrent WebSocket connections | 500+ |
| Concurrent HTTP connections | 1000+ |
| AI detection accuracy | > 90% |
| False positive rate | < 5% |

---

## Related Documentation

- [API Reference](./API_REFERENCE.md) - Complete REST API documentation
- [Database Schema](./DATABASE.md) - Detailed database documentation
- [Deployment Guide](./deployment/README.md) - Infrastructure setup
- [Chromium Browser](./CHROMIUM_BROWSER.md) - Browser build guide
- [WebSocket Protocol](./WEBSOCKET_PROTOCOL.md) - Real-time communication
