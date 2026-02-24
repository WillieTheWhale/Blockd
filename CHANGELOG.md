# Changelog

All notable changes to the Blockd platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-02-05

### Overview

Comprehensive security audit and code quality review covering all 13 microservices. This release includes 376 fixes across security hardening, API connectivity, performance optimization, and code quality improvements.

### Security Enhancements

#### Authentication & Authorization
- **Auth Service**: Replaced `Math.random()` with `crypto.randomInt()` for secure password generation
- **Auth Service**: Implemented Fisher-Yates shuffle with cryptographically secure random for password character mixing
- **Auth Service**: Added `crypto.timingSafeEqual()` for OAuth state comparison to prevent timing attacks
- **Auth Service**: MFA verification now encoded in JWT claims instead of spoofable headers
- **Auth Service**: Server-side MFA secret storage in Redis with proper encryption
- **Session Service**: Removed mock ID fallbacks - now returns proper 401 Unauthorized

#### Input Validation & Sanitization
- **WebSocket Service**: Added XSS sanitization with comprehensive HTML entity encoding for chat messages
- **API Gateway**: Added metadata prototype pollution protection (`__proto__`, `constructor`, `prototype`)
- **API Gateway**: Added input length validation across all schemas (INPUT_LIMITS constants)
- **Video Service**: Path traversal prevention with UUID validation for session IDs

#### Connection Security
- **WebSocket Service**: Added connection rate limiting (10 per IP, 10,000 global maximum)
- **WebSocket Service**: Redis adapter TLS/SSL support for encrypted connections
- **API Gateway**: CSRF protection enforces origin verification in all environments
- **Frontend**: Token expiration checks with derived `isAuthenticated` state

#### Infrastructure Security
- **Docker Compose**: All ports bound to localhost (127.0.0.1) to prevent external exposure
- **Celery Workers**: Required credentials configuration, dead letter queue (DLQ) setup
- **Terraform**: KMS encryption enabled for state backend
- **Helm**: `secrets.create: false` to use external secrets management
- **RabbitMQ**: Removed plaintext password from topology configuration

### New API Endpoints

#### User Management
- `GET /api/v1/users/me` - Get current user profile
- `PUT /api/v1/users/me` - Update current user profile

#### Authentication Additions
- `GET /api/v1/auth/me` - Get authenticated user details
- `POST /api/v1/auth/change-password` - Change user password
- `POST /api/v1/auth/mfa/disable` - Disable MFA for account
- `POST /api/v1/auth/forgot-password` - Request password reset email
- `POST /api/v1/auth/reset-password` - Complete password reset
- `GET /api/v1/auth/oauth/state` - Generate OAuth state for CSRF protection

#### Session Management Additions
- `PUT /api/v1/sessions/:id` - Update session details
- `DELETE /api/v1/sessions/:id` - Delete/cancel session
- `GET /api/v1/sessions/:id/questions` - Get session questions
- `POST /api/v1/sessions/:id/answer` - Submit answer for session

#### Reports Additions
- `GET /api/v1/reports` - List all reports with pagination
- `DELETE /api/v1/reports/:id` - Delete a report
- `GET /api/v1/reports/:id/download` - Download report as PDF

### Performance Improvements

#### Database Optimization
- **Session Service**: Optimized N+1 queries with Prisma `select` for field selection
- **Session Service**: Parallel count and data queries using `Promise.all()`
- **Session Service**: Pagination caps (max 50 items per page)
- **AI Detection**: Atomic database operations with `ON CONFLICT DO UPDATE` upserts
- **Shared Cache**: Replaced Redis `KEYS` command with `SCAN` for O(1) operations

#### Memory Management
- **Session Service**: Redis-backed session storage with TTL (replaced in-memory)
- **WebSocket Service**: Map-based participant storage for O(1) lookup operations
- **WebSocket Service**: Message buffer cleanup with automatic expiration
- **Eye Tracking**: Thread-safe calibration storage with TTL cleanup
- **Video Service**: Proper cleanup task tracking to prevent memory leaks

#### Connection Pooling
- **Session Service**: Shared PrismaClient singleton pattern
- **Eye Tracking**: Gaze service connection pooling
- **AI Detection**: Async database operations with ThreadPoolExecutor

### Code Quality Improvements

#### TypeScript Strict Mode
- **API Gateway**: Enabled full TypeScript strict mode
  - `strict: true`
  - `noImplicitAny: true`
  - `strictNullChecks: true`
  - `strictFunctionTypes: true`
  - `strictBindCallApply: true`
  - `strictPropertyInitialization: true`
  - `noImplicitReturns: true`
  - `noFallthroughCasesInSwitch: true`

#### Type Safety Fixes
- Fixed 50+ type errors across API Gateway codebase
- Added proper type annotations for WebSocket verifyClient
- Fixed CORS origin function signature for @fastify/cors v10
- Proper EventEmitter casting for Redis client event handlers
- Cookie options type casting for CSRF middleware

#### Python Improvements
- **AI Detection**: NaN/Inf validation in ML model predictions
- **AI Detection**: Proper async/await patterns for database operations
- **Eye Tracking**: HTTPException usage for proper error responses
- **Video Service**: JWT authentication middleware implementation
- Fixed bare `except:` clauses with proper `except Exception:` handling

### Infrastructure Improvements

#### Docker Health Checks
Added health checks for all application services in `docker-compose.yml`:

| Service | Health Check | Interval | Timeout |
|---------|--------------|----------|---------|
| api-gateway | HTTP /health | 30s | 10s |
| auth-service | HTTP /health | 30s | 10s |
| session-service | HTTP /health | 30s | 10s |
| ai-detection | curl /health | 30s | 10s |
| eye-tracking | curl /health | 30s | 10s |
| response-timing | curl /health | 30s | 10s |
| video-service | curl /health | 30s | 10s |
| celery-worker | celery inspect ping | 60s | 30s |
| frontend | HTTP / | 30s | 10s |

#### Database Indexes
- Added performance indexes for common query patterns
- Optimized TimescaleDB hypertable configurations

#### Kubernetes
- Added startup probes to all deployments
- NetworkPolicies for service isolation
- Proper resource limits and reservations

### Frontend Improvements

- **ProtectedRoute**: Token expiration check before route access
- **Auth Store**: Derived `isAuthenticated` computed from token validity
- **Constants**: Fixed API endpoint paths for consistency
- **XSS Protection**: Comprehensive sanitization utilities with tests

### Electron App Improvements

- Removed hardcoded encryption key (now uses environment variable)
- Token no longer logged in console
- URL validation for `shell.openExternal` calls
- Stored bound function references in focus monitor (memory leak fix)
- Development gate for `window.blockdApp` exposure

### Testing

- Created 510+ tests across all services
- Added XSS sanitization test suite for frontend
- Added security event validation tests
- Added API endpoint connectivity tests

### Documentation

- Created CHANGELOG.md (this file)
- Updated API_REFERENCE.md with new endpoints
- Updated SECURITY_REMEDIATION_PLAN.md with February 2026 fixes
- Updated DEVELOPMENT_GUIDE.md with TypeScript strict mode info

### Dependencies

- Added `@types/ws` to API Gateway for WebSocket type definitions

### Breaking Changes

None. All changes are backward compatible.

### Migration Guide

No migration required. Deploy new containers and the changes take effect automatically.

For TypeScript strict mode, if you have custom code extending the API Gateway:
1. Run `npx tsc --noEmit` to check for type errors
2. Fix any implicit `any` types
3. Handle potential `null`/`undefined` values

---

## [1.0.0] - 2026-01-24

### Initial Release

- Complete microservices architecture
- Authentication with JWT and MFA support
- Session management for interviews
- AI detection using multi-LLM analysis
- Eye tracking with MediaPipe integration
- WebSocket real-time communication
- Video recording and streaming
- Interviewer dashboard (React)
- Custom Chromium browser integration
- PostgreSQL with TimescaleDB and pgvector
- Redis caching and session storage
- RabbitMQ message queue with Celery workers
- Kubernetes deployment with Helm charts
- Comprehensive API documentation

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 1.1.0 | 2026-02-05 | Security audit, 376 fixes, TypeScript strict mode |
| 1.0.0 | 2026-01-24 | Initial release |
