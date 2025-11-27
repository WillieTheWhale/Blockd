# Blockd Testing Infrastructure

Comprehensive testing suite for the Blockd AI-Powered Interview Platform.

## Table of Contents

- [Overview](#overview)
- [Test Types](#test-types)
- [Setup](#setup)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Coverage Requirements](#coverage-requirements)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Overview

This testing infrastructure provides complete coverage of the Blockd platform across multiple testing dimensions:

- **Unit Tests**: Component-level testing with Vitest
- **Integration Tests**: API testing with Newman/Postman
- **E2E Tests**: Full user journey testing with Playwright
- **Load Tests**: Performance testing with k6

### Test Statistics

- **Total Test Files**: 6 E2E + 4 API Collections + 3 Load Tests
- **E2E Test Scenarios**: 25+
- **API Test Cases**: 24+
- **Load Test Scenarios**: 3
- **Browser Coverage**: Chromium, Firefox, WebKit
- **Environment Coverage**: Local, Staging, Production

## Test Types

### 1. Playwright E2E Tests

End-to-end tests covering complete user workflows.

**Test Files:**
- `/home/user/Blockd/tests/e2e/interview-flow.spec.ts` - Complete interview lifecycle
- `/home/user/Blockd/tests/e2e/auth.spec.ts` - Authentication flows (9 scenarios)
- `/home/user/Blockd/tests/e2e/realtime.spec.ts` - WebSocket features (6 tests)
- `/home/user/Blockd/tests/e2e/security.spec.ts` - Security event detection (5 tests)
- `/home/user/Blockd/tests/e2e/ai-detection.spec.ts` - AI detection validation (5 tests)
- `/home/user/Blockd/tests/e2e/video.spec.ts` - Video streaming (5 tests)

**Run Commands:**
```bash
# Run all E2E tests
npm run test:e2e

# Run in headed mode (see browser)
npm run test:e2e:headed

# Debug mode
npm run test:e2e:debug

# Specific browser
npm run test:e2e:chromium
npm run test:e2e:firefox
npm run test:e2e:webkit

# Interactive UI mode
npm run test:e2e:ui
```

### 2. Newman/Postman API Tests

Integration tests for all API endpoints.

**Collections:**
- `/home/user/Blockd/tests/api/postman-collections/auth-api.postman_collection.json` - Auth API (6 tests)
- `/home/user/Blockd/tests/api/postman-collections/sessions-api.postman_collection.json` - Sessions API (6 tests)
- `/home/user/Blockd/tests/api/postman-collections/ai-detection.postman_collection.json` - AI Detection (4 tests)
- `/home/user/Blockd/tests/api/postman-collections/video-api.postman_collection.json` - Video API (6 tests)

**Environments:**
- `/home/user/Blockd/tests/api/environments/local.json`
- `/home/user/Blockd/tests/api/environments/staging.json`
- `/home/user/Blockd/tests/api/environments/production.json`

**Run Commands:**
```bash
# Run all API tests
npm run test:api

# Run specific collections
npm run test:api:auth
npm run test:api:sessions
npm run test:api:ai
npm run test:api:video
```

### 3. k6 Load Tests

Performance and load testing scenarios.

**Test Scripts:**
- `/home/user/Blockd/tests/load/normal-load.js` - 100 VUs, 10m, ~500 req/min
- `/home/user/Blockd/tests/load/peak-load.js` - 500 VUs, 5m, ~2000 req/min
- `/home/user/Blockd/tests/load/stress-test.js` - 0→1000 VUs over 10m

**Run Commands:**
```bash
# Normal load (baseline)
npm run test:load:normal

# Peak load
npm run test:load:peak

# Stress test (find breaking point)
npm run test:load:stress
```

**Thresholds:**
- Normal Load: p95 < 200ms, error rate < 1%
- Peak Load: p95 < 500ms, error rate < 5%
- Stress Test: p99 < 5000ms, error rate < 50%

## Setup

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL database (running)
- Redis (running)
- RabbitMQ (running - optional for full tests)

### Installation

```bash
cd /home/user/Blockd/tests

# Install dependencies
npm install

# Install Playwright browsers
npm run playwright:install

# Install k6 (if not already installed)
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Windows
choco install k6
```

### Environment Setup

1. Copy test environment file:
```bash
cp .env.test .env.test.local
```

2. Update variables in `.env.test.local` as needed for your environment.

3. Start required services:
```bash
# PostgreSQL
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16

# Redis
docker run -d -p 6379:6379 redis:7

# RabbitMQ (optional)
docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

### Database Setup

```bash
# Seed test data
npm run db:seed

# Clean test data
npm run db:cleanup

# Reset (clean + seed)
npm run db:reset
```

## Running Tests

### Quick Start

```bash
# Run all tests (except load tests)
npm test

# Run all tests including load tests
npm run test:all
```

### Individual Test Suites

```bash
# Unit tests
npm run test:unit

# Unit tests with coverage
npm run test:unit:coverage

# Integration tests (API)
npm run test:integration

# E2E tests
npm run test:e2e

# Load tests
npm run test:load
```

### Watch Mode & UI

```bash
# Unit tests in watch mode
npm run test:unit:watch

# Unit tests with UI
npm run test:unit:ui

# E2E tests with UI
npm run test:e2e:ui
```

## Test Structure

```
/home/user/Blockd/tests/
├── e2e/                          # Playwright E2E tests
│   ├── interview-flow.spec.ts
│   ├── auth.spec.ts
│   ├── realtime.spec.ts
│   ├── security.spec.ts
│   ├── ai-detection.spec.ts
│   └── video.spec.ts
├── api/                          # Newman/Postman API tests
│   ├── postman-collections/
│   │   ├── auth-api.postman_collection.json
│   │   ├── sessions-api.postman_collection.json
│   │   ├── ai-detection.postman_collection.json
│   │   └── video-api.postman_collection.json
│   └── environments/
│       ├── local.json
│       ├── staging.json
│       └── production.json
├── load/                         # k6 load tests
│   ├── normal-load.js
│   ├── peak-load.js
│   └── stress-test.js
├── fixtures/                     # Test data
│   ├── users.json
│   ├── sessions.json
│   ├── questions.json
│   └── factories.ts
├── mocks/                        # Mock servers
│   ├── mock-websocket.ts
│   ├── mock-webrtc.ts
│   └── mock-llm.ts
├── utils/                        # Test utilities
│   ├── seed.ts
│   ├── cleanup.ts
│   ├── db-utils.ts
│   ├── global-setup.ts
│   └── test-setup.ts
├── reports/                      # Generated test reports
│   ├── playwright-report/
│   ├── newman/
│   ├── coverage/
│   └── k6-report.html
├── .env.test                     # Test environment variables
├── playwright.config.ts          # Playwright configuration
├── vitest.config.ts              # Vitest configuration
├── package.json                  # Test dependencies
└── README.md                     # This file
```

## Coverage Requirements

### Critical Paths (95%+ coverage required)
- User authentication and authorization
- Session creation and lifecycle
- Real-time WebSocket communication
- Video streaming functionality
- AI detection analysis

### Important Paths (80%+ coverage required)
- Error handling and edge cases
- Rate limiting
- Security event logging
- Data validation

### Coverage Reports

```bash
# Generate coverage report
npm run test:unit:coverage

# Open coverage report
npm run reports:coverage
```

## CI/CD Integration

### GitHub Actions Integration

The tests are designed to run in CI/CD pipelines. See Agent 20's CI/CD configuration for details.

**Key Integration Points:**

1. **Test Workflow** (`.github/workflows/test.yml`):
   - Runs on every push and PR
   - Executes lint, unit, and integration tests
   - Uploads coverage to Codecov

2. **E2E Workflow** (`.github/workflows/e2e.yml`):
   - Runs E2E tests in parallel across browsers
   - Generates and uploads test reports

3. **Load Testing** (manual or scheduled):
   - Runs load tests against staging environment
   - Monitors performance metrics

### Running in CI

```bash
# Set CI environment variable
export CI=true

# Run tests
npm run test:all
```

## Test Data Management

### Fixtures

Static test data is stored in `/home/user/Blockd/tests/fixtures/`:
- `users.json` - Test user accounts
- `sessions.json` - Pre-configured sessions
- `questions.json` - Interview questions

### Factories

Dynamic test data generators in `/home/user/Blockd/tests/fixtures/factories.ts`:
- `UserFactory` - Create test users
- `SessionFactory` - Create test sessions
- `QuestionFactory` - Create test questions
- `AnswerFactory` - Create test answers
- `SecurityEventFactory` - Create security events

**Example Usage:**
```typescript
import { UserFactory, SessionFactory } from './fixtures/factories';

// Create a test user
const user = UserFactory.create({ role: 'interviewer' });

// Create batch of users
const users = UserFactory.createBatch(10);

// Create a scheduled session
const session = SessionFactory.createScheduled({
  interviewerId: user.id
});
```

### Database Seeding

```bash
# Seed database with fixtures
npm run db:seed

# Clean all test data
npm run db:cleanup

# Reset database
npm run db:reset
```

## Mock Servers

### WebSocket Mock

Mock WebSocket server for testing real-time features.

**Location:** `/home/user/Blockd/tests/mocks/mock-websocket.ts`

**Features:**
- Connection management
- Message broadcasting
- Event simulation
- Security event injection

### WebRTC Mock

Mock WebRTC signaling for video testing.

**Location:** `/home/user/Blockd/tests/mocks/mock-webrtc.ts`

**Features:**
- Transport creation
- Producer/consumer simulation
- Connection state simulation
- Stats generation

### LLM Mock

Mock LLM APIs (OpenAI, Anthropic, Google).

**Location:** `/home/user/Blockd/tests/mocks/mock-llm.ts`

**Features:**
- AI answer generation
- Embeddings generation
- Similarity calculation
- AI detection analysis

## Reports

### Viewing Reports

```bash
# Open Playwright report
npm run reports:e2e

# Open API test reports
npm run reports:api

# Open coverage report
npm run reports:coverage
```

### Report Locations

- Playwright: `/home/user/Blockd/tests/reports/playwright-report/`
- Newman: `/home/user/Blockd/tests/reports/newman/`
- Coverage: `/home/user/Blockd/tests/reports/coverage/`
- k6: `/home/user/Blockd/tests/reports/stress-test-summary.json`

## Troubleshooting

### Common Issues

**1. Database Connection Errors**
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Restart PostgreSQL
docker restart <postgres-container-id>

# Verify connection
psql -h localhost -U postgres -d blockd_test
```

**2. Playwright Browser Installation**
```bash
# Reinstall Playwright browsers
npx playwright install --with-deps
```

**3. Port Conflicts**
```bash
# Check what's running on ports
lsof -i :4000  # API Gateway
lsof -i :4001  # WebSocket
lsof -i :3000  # Frontend

# Kill processes if needed
kill -9 <PID>
```

**4. Test Timeouts**
```bash
# Increase timeout in .env.test
TEST_TIMEOUT=60000

# Or run with specific timeout
npm run test:e2e -- --timeout=60000
```

**5. Mock Server Issues**
```bash
# Disable mocks if causing issues
MOCK_EXTERNAL_SERVICES=false npm run test
```

### Debug Mode

**E2E Tests:**
```bash
# Debug with Playwright Inspector
npm run test:e2e:debug

# Run with traces
PWDEBUG=1 npm run test:e2e
```

**API Tests:**
```bash
# Verbose Newman output
newman run <collection> --verbose
```

**Load Tests:**
```bash
# k6 with detailed output
k6 run --vus 10 --duration 1m load/normal-load.js
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on others
2. **Cleanup**: Always clean up test data after tests
3. **Mocking**: Use mocks for external services to avoid dependencies
4. **Assertions**: Make assertions clear and specific
5. **Naming**: Use descriptive test names that explain what is being tested
6. **Performance**: Keep tests fast - optimize where possible
7. **Flakiness**: Avoid flaky tests - use proper waits and retries

## Contributing

When adding new tests:

1. Follow existing patterns and structure
2. Add tests to appropriate directory (e2e, api, load)
3. Update this README with new test information
4. Ensure tests pass locally before committing
5. Add appropriate assertions and error handling

## Support

For issues or questions about the testing infrastructure:
- Check this README
- Review existing tests for examples
- Check Agent 19 specification: `/home/user/Blockd/docs/agents19-20-testing-cicd.json`
- Contact the testing team

---

**Last Updated**: 2025-11-24
**Agent**: Agent 19 - Integration & E2E Testing Developer
