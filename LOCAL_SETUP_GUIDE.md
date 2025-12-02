# Blockd Local Development Setup Guide

Complete step-by-step guide to run the Blockd platform locally, including backend services, the interviewer web app, and the Electron interviewee desktop app.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Clone the Repository](#part-1-clone-the-repository)
3. [Quick Start with Docker](#part-2-quick-start-with-docker-recommended)
4. [Running the Interviewer Frontend](#part-3-running-the-interviewer-frontend)
5. [Running the Electron Interviewee App](#part-4-running-the-electron-interviewee-app)
6. [Running Backend Services Locally](#part-5-running-backend-services-locally-without-docker)
7. [Testing](#part-6-testing)
8. [Troubleshooting](#part-7-troubleshooting)
9. [Service Reference](#service-reference)

---

## Prerequisites

### Required Software

| Software | Version | Download |
|----------|---------|----------|
| Git | 2.40+ | https://git-scm.com/downloads |
| Docker Desktop | 24+ | https://www.docker.com/products/docker-desktop/ |
| Node.js | 20 LTS | https://nodejs.org/ |
| Python | 3.11+ | https://www.python.org/downloads/ |

### System Requirements

- **Disk Space**: 20+ GB free
- **RAM**: 8+ GB (16 GB recommended)
- **CPU**: 4+ cores

### Verify Installation

```bash
# Verify all tools are installed
git --version        # Should show 2.40+
docker --version     # Should show 24+
docker compose version
node --version       # Should show v20+
npm --version        # Should show 10+
python3 --version    # Should show 3.11+
```

---

## Part 1: Clone the Repository

### Step 1: Clone from GitHub

```bash
# Navigate to your projects directory
cd ~/projects  # or your preferred location

# Clone the repository
git clone https://github.com/WillieTheWhale/Blockd.git

# Navigate into the project
cd Blockd
```

### Step 2: Verify the Clone

```bash
# List contents - you should see these directories:
ls -la

# Expected output:
# backend/          - 8 microservices
# frontend/         - interviewer-app & interviewee-app
# database/         - PostgreSQL schema and migrations
# infrastructure/   - Docker configs
# k8s/              - Kubernetes manifests
# tests/            - E2E, API, and load tests
# docker-compose.yml
# CLAUDE.md
```

---

## Part 2: Quick Start with Docker (Recommended)

This is the fastest way to get everything running.

### Step 3: Start Docker Desktop

Make sure Docker Desktop is running on your machine.

### Step 4: Start All Services

```bash
# From the Blockd root directory
docker compose up --build
```

**First-time build takes 10-20 minutes.** Wait until you see:

```
blockd-api-gateway    | Server listening on 0.0.0.0:3000
blockd-frontend       | Server started on port 80
```

### Step 5: Verify Services Are Running

Open a new terminal:

```bash
# Check all containers are running
docker compose ps

# You should see all 11 services with status "Up":
# blockd-postgres, blockd-redis, blockd-rabbitmq
# blockd-api-gateway, blockd-auth-service, blockd-session-service
# blockd-ai-detection, blockd-eye-tracking, blockd-response-timing
# blockd-video-service, blockd-frontend
```

### Step 6: Access the Application

Open your browser:

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend (Interviewer)** | http://localhost:5173 | Main web application |
| **API Gateway** | http://localhost:3000 | REST API |
| **API Documentation** | http://localhost:3000/documentation | Swagger UI |
| **RabbitMQ Admin** | http://localhost:15672 | Message queue UI (blockd_mq/blockd_mq_dev) |

### Step 7: Create a Test User

```bash
# Register a new interviewer user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@blockd.com",
    "password": "TestPassword123!",
    "full_name": "Test User",
    "role": "interviewer"
  }'
```

Now login at http://localhost:5173 with these credentials.

---

## Part 3: Running the Interviewer Frontend

The interviewer frontend is a React web application for managing interviews and viewing analytics.

### Option A: Run via Docker (Already done in Part 2)

If you ran `docker compose up`, the frontend is already running at http://localhost:5173.

### Option B: Run Locally (for development)

If you want hot-reload and faster development:

#### Step 1: Start Backend Services via Docker

```bash
# Start only the infrastructure and backend (not frontend)
docker compose up postgres redis rabbitmq api-gateway auth-service session-service -d
```

#### Step 2: Configure Environment

```bash
cd frontend/interviewer-app

# Copy environment template
cp .env.example .env
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_APP_NAME=Blockd
VITE_APP_ENV=development
VITE_ENABLE_DEBUG=true
```

#### Step 3: Install Dependencies and Run

```bash
npm install
npm run dev
```

The app will be available at http://localhost:5173 with hot-reload enabled.

---

## Part 4: Running the Electron Interviewee App

The interviewee app is an Electron desktop application that candidates use to join interviews.

### Step 1: Ensure Backend is Running

The backend services must be running first:

```bash
# From Blockd root directory
docker compose up -d
```

### Step 2: Navigate to Interviewee App

```bash
cd frontend/interviewee-app
```

### Step 3: Install Dependencies

```bash
npm install
```

### Step 4: Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
BLOCKD_API_URL=http://localhost:3000
BLOCKD_WS_URL=http://localhost:3003
BLOCKD_VIDEO_URL=http://localhost:8003
NODE_ENV=development
```

### Step 5: Run the Electron App

```bash
npm start
```

This will:
- Build the TypeScript code
- Launch the Electron app in development mode
- Open DevTools automatically for debugging

### Step 6: Using the Interviewee App

1. **Login/Register**: Create an account or sign in
2. **Select Meeting Platform**: Choose Google Meet, Zoom, or Microsoft Teams
3. **Enter Meeting URL**: Paste your meeting link
4. **Grant Permissions**: Allow camera, microphone, and screen access
5. **Join Interview**: The meeting loads in an embedded browser

### Building the Electron App for Distribution

```bash
# Build for your current platform (Windows, macOS, or Linux)
npm run make

# The packaged app will be in the 'out' directory
ls out/make/
```

---

## Part 5: Running Backend Services Locally (Without Docker)

For development with full debugging capabilities, you can run services directly.

### Step 1: Start Infrastructure Only

```bash
# Start databases and message queue
docker compose up postgres redis rabbitmq -d

# Wait for them to be healthy
docker compose ps
```

### Step 2: Initialize Database

```bash
cd database
chmod +x init.sh
./init.sh
```

### Step 3: Run Node.js Backend Services

Open separate terminal windows for each service:

**Terminal 1 - API Gateway (Port 3000)**:
```bash
cd backend/api-gateway
cp .env.example .env
npm install
npm run dev
```

**Terminal 2 - Auth Service (Port 3001)**:
```bash
cd backend/auth-service
cp .env.example .env
npm install
npm run keys:generate  # Generate JWT keys
npm run dev
```

**Terminal 3 - Session Service (Port 3002)**:
```bash
cd backend/session-service
cp .env.example .env
npm install
npm run dev
```

**Terminal 4 - WebSocket Service (Port 3003)**:
```bash
cd backend/websocket-service
cp .env.example .env
npm install
npm run dev
```

### Step 4: Run Python Backend Services (Optional)

These are needed for AI features:

**Terminal 5 - AI Detection (Port 8000)**:
```bash
cd backend/ai-detection
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

**Terminal 6 - Eye Tracking (Port 8001)**:
```bash
cd backend/eye-tracking
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8001
```

**Terminal 7 - Response Timing (Port 8002)**:
```bash
cd backend/response-timing
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8002
```

**Terminal 8 - Video Service (Port 8003)**:
```bash
cd backend/video-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8003
```

---

## Part 6: Testing

### Run API Tests

```bash
cd tests
npm install
npm run test:api
```

### Run E2E Tests

```bash
# Ensure all services are running first
npm run test:e2e
```

### Run Load Tests

```bash
npm run test:load
```

---

## Part 7: Troubleshooting

### Docker Issues

#### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change the port in docker-compose.yml
```

#### Out of Disk Space

```bash
# Clean up Docker resources
docker system prune -a

# Remove Blockd-specific volumes (WARNING: deletes data)
docker compose down -v
```

#### Services Won't Start

```bash
# View logs for a specific service
docker compose logs -f api-gateway

# Restart a specific service
docker compose restart api-gateway

# Rebuild a specific service
docker compose up --build api-gateway
```

### Database Issues

#### Connection Refused

```bash
# Check if PostgreSQL is running
docker compose ps postgres

# Check PostgreSQL logs
docker compose logs postgres

# Restart PostgreSQL
docker compose restart postgres
```

#### Reset Database

```bash
# Stop all services
docker compose down

# Remove database volume
docker volume rm blockd-postgres-data

# Start fresh
docker compose up --build
```

### Electron App Issues

#### App Won't Start

```bash
# Clear node_modules and reinstall
cd frontend/interviewee-app
rm -rf node_modules
npm install
npm start
```

#### Can't Connect to Backend

1. Verify backend is running: `docker compose ps`
2. Check `.env` file URLs are correct
3. Ensure firewall isn't blocking localhost

### Frontend Issues

#### Blank Page

1. Open browser DevTools (F12)
2. Check Console for errors
3. Verify `VITE_API_URL` in `.env` is correct

---

## Service Reference

### Service URLs

| Service | Port | URL | Technology |
|---------|------|-----|------------|
| Frontend (Interviewer) | 5173 | http://localhost:5173 | React + Vite |
| API Gateway | 3000 | http://localhost:3000 | Fastify (Node.js) |
| Auth Service | 3001 | http://localhost:3001 | Node.js |
| Session Service | 3002 | http://localhost:3002 | Node.js |
| WebSocket Service | 3003 | http://localhost:3003 | Socket.io |
| AI Detection | 8000 | http://localhost:8000 | FastAPI (Python) |
| Eye Tracking | 8001 | http://localhost:8001 | FastAPI (Python) |
| Response Timing | 8002 | http://localhost:8002 | FastAPI (Python) |
| Video Service | 8003 | http://localhost:8003 | FastAPI (Python) |
| PostgreSQL | 5432 | localhost:5432 | PostgreSQL 16 |
| Redis | 6379 | localhost:6379 | Redis 7 |
| RabbitMQ | 5672 | localhost:5672 | RabbitMQ 3 |
| RabbitMQ Admin | 15672 | http://localhost:15672 | Web UI |

### Default Credentials

| Service | Username | Password |
|---------|----------|----------|
| PostgreSQL | blockd_user | blockd_password_dev |
| Redis | (default) | blockd_redis_dev |
| RabbitMQ | blockd_mq | blockd_mq_dev |

### Quick Commands

```bash
# Start everything
docker compose up --build

# Start in background
docker compose up -d

# Stop everything
docker compose down

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f api-gateway

# Restart a service
docker compose restart api-gateway

# Clean up everything
docker compose down -v
docker system prune -a
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│              Electron App (Interviewee)                     │
│                 npm start                                   │
│               localhost (desktop)                           │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket + HTTP
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              React App (Interviewer)                        │
│                 npm run dev                                 │
│               localhost:5173                                │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  API Gateway                                │
│               localhost:3000                                │
└─┬─────────────────┬─────────────────┬───────────────────────┘
  │                 │                 │
  ▼                 ▼                 ▼
┌──────────┐  ┌──────────┐  ┌──────────────────────┐
│   Auth   │  │ Session  │  │   Python Services    │
│  :3001   │  │  :3002   │  │  AI:8000 Eye:8001    │
│          │  │          │  │  Timing:8002 Vid:8003│
└──────────┘  └──────────┘  └──────────────────────┘
       │             │                  │
       └─────────────┴──────────────────┘
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│PostgreSQL│  │  Redis   │  │ RabbitMQ │
│  :5432   │  │  :6379   │  │  :5672   │
└──────────┘  └──────────┘  └──────────┘
```

---

## Next Steps

1. **Read the full documentation**: See `CLAUDE.md` in the root directory
2. **Explore the API**: Visit http://localhost:3000/documentation
3. **Run tests**: Execute `npm run test:e2e` in the tests directory
4. **Review component docs**: Check the `docs/` folder for detailed specs

---

**You're now ready to develop and test Blockd locally!**
