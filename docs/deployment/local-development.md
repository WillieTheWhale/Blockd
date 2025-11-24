# Local Development Setup

Guide for setting up Blockd platform for local development.

## Prerequisites

- Docker Desktop (with Kubernetes enabled)
- Node.js 24.x
- Python 3.14
- PostgreSQL 17
- Redis 7
- RabbitMQ 3.13

## Quick Start with Docker Compose

```bash
# Clone repository
git clone https://github.com/blockd/blockd.git
cd blockd

# Start all services
docker-compose up -d

# Wait for services to be ready
docker-compose ps

# Run database migrations
cd database
npm install
npx prisma migrate dev

# Access services
# Frontend: http://localhost:3000
# API Gateway: http://localhost:8000
# RabbitMQ Console: http://localhost:15672 (guest/guest)
```

## Manual Setup

### 1. Database Setup

```bash
# Start PostgreSQL
docker run -d \
  --name blockd-postgres \
  -e POSTGRES_USER=blockd_user \
  -e POSTGRES_PASSWORD=dev_password \
  -e POSTGRES_DB=blockd_dev \
  -p 5432:5432 \
  postgres:17-alpine

# Run migrations
cd database
npm install
DATABASE_URL="postgresql://blockd_user:dev_password@localhost:5432/blockd_dev" \
  npx prisma migrate dev
```

### 2. Redis Setup

```bash
docker run -d \
  --name blockd-redis \
  -p 6379:6379 \
  redis:7-alpine
```

### 3. RabbitMQ Setup

```bash
docker run -d \
  --name blockd-rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3.13-management-alpine
```

### 4. Backend Services

```bash
# API Gateway
cd backend/api-gateway
npm install
npm run dev

# Auth Service
cd backend/auth-service
npm install
npm run dev

# Session Service
cd backend/session-service
npm install
npm run dev

# AI Detection (Python)
cd backend/ai-detection
pip install -r requirements.txt
uvicorn main:app --reload --port 5000

# Eye Tracking
cd backend/eye-tracking
pip install -r requirements.txt
uvicorn main:app --reload --port 5001

# Response Timing
cd backend/response-timing
pip install -r requirements.txt
uvicorn main:app --reload --port 5002

# Video Service
cd backend/video-service
npm install
npm run dev

# WebSocket Service
cd backend/websocket-service
npm install
npm run dev
```

### 5. Frontend

```bash
cd frontend/interviewer-app
npm install
npm start
```

## Environment Variables

Create `.env.local` files in each service:

### API Gateway `.env.local`
```
NODE_ENV=development
PORT=3000
AUTH_SERVICE_URL=http://localhost:3001
SESSION_SERVICE_URL=http://localhost:3002
AI_DETECTION_URL=http://localhost:5000
EYE_TRACKING_URL=http://localhost:5001
RESPONSE_TIMING_URL=http://localhost:5002
VIDEO_SERVICE_URL=http://localhost:3003
WEBSOCKET_SERVICE_URL=http://localhost:3004
```

### Auth Service `.env.local`
```
DATABASE_URL=postgresql://blockd_user:dev_password@localhost:5432/blockd_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=local_development_jwt_secret_change_in_production
```

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run E2E tests
cd tests/e2e
npm install
npx playwright install
npx playwright test
```

## Debugging

### VS Code Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug API Gateway",
      "program": "${workspaceFolder}/backend/api-gateway/src/index.ts",
      "preLaunchTask": "tsc: build - backend/api-gateway/tsconfig.json",
      "outFiles": ["${workspaceFolder}/backend/api-gateway/dist/**/*.js"]
    }
  ]
}
```

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port
lsof -ti:3000 | xargs kill -9
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check connection
psql postgresql://blockd_user:dev_password@localhost:5432/blockd_dev
```

### Redis Connection Issues
```bash
# Test Redis connection
redis-cli ping
```
