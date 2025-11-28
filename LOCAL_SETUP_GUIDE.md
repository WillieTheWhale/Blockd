# Blockd Local Development Setup Guide

This guide will help you set up the Blockd platform for local development and testing on your machine.

## Prerequisites

Before starting, ensure you have the following installed:

### Required Software
- **Git** (2.40+): For cloning the repository
- **Docker Desktop** (24+): For running all services in containers
  - Download: https://www.docker.com/products/docker-desktop/
  - Ensure Docker Desktop is running before proceeding
- **Node.js** (20 LTS): For running Node.js services locally (optional if using Docker)
  - Download: https://nodejs.org/
- **Python** (3.11+): For running Python services locally (optional if using Docker)
  - Download: https://www.python.org/downloads/

### System Requirements
- **Disk Space**: 20+ GB free (for Docker images, volumes, and code)
- **RAM**: 8+ GB (16 GB recommended for running all services)
- **CPU**: 4+ cores

---

## Part 1: Clone the Repository

### Step 1: Open Terminal
Open your terminal application (Terminal on macOS/Linux, PowerShell or Command Prompt on Windows).

### Step 2: Navigate to Your Desired Directory
```bash
# Navigate to where you want to clone the repository
cd /Users/williamkeffer/NerdsInc/Blockd

# Create the directory if it doesn't exist
mkdir -p /Users/williamkeffer/NerdsInc/Blockd
cd /Users/williamkeffer/NerdsInc/Blockd
```

### Step 3: Clone the Repository
```bash
# Clone the repository
git clone http://127.0.0.1:58442/git/WillieTheWhale/Blockd.git Blockd_Code

# Navigate into the cloned repository
cd Blockd_Code

# Checkout the correct branch
git checkout claude/claude-md-mici38tq4ao8cwez-01LPuX7h3mR4QaD11q7i4EGs
```

**Note**: If the clone URL doesn't work (127.0.0.1 is localhost), use the GitHub URL instead:
```bash
git clone https://github.com/WillieTheWhale/Blockd.git Blockd_Code
```

### Step 4: Verify the Clone
```bash
# List the contents to verify the clone was successful
ls -la

# You should see directories like:
# backend/, frontend/, database/, infrastructure/, k8s/, tests/, docs/
```

---

## Part 2: Environment Setup

### Step 5: Create Environment Variables File

The docker-compose.yml uses environment variables. You'll need to set up API keys for AI services.

**Option A: Quick Start (Development Only)**

For testing without AI features, the docker-compose.yml has default values that will work.

**Option B: Full Setup (With AI Features)**

Create a `.env` file in the root directory:

```bash
# Create .env file
cat > .env << 'EOF'
# OpenAI API Key (for AI Detection and Response Timing services)
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic API Key (for AI Detection service - Claude)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# AWS S3 Configuration (optional - for video storage)
S3_BUCKET=blockd-videos-dev
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
EOF
```

**To get API keys**:
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/settings/keys
- AWS (optional): https://console.aws.amazon.com/iam/

---

## Part 3: Running Blockd with Docker (Recommended)

This is the easiest way to run all services together.

### Step 6: Verify Docker is Running

```bash
# Check Docker is running
docker --version
docker compose version

# Start Docker Desktop if it's not running
```

### Step 7: Build and Start All Services

```bash
# From the root of the Blockd_Code directory
# This will build all Docker images and start all services
docker compose up --build

# Or to run in the background (detached mode):
docker compose up --build -d
```

**This command will**:
1. Build Docker images for all 8 services
2. Start PostgreSQL database
3. Start Redis cache
4. Start RabbitMQ message queue
5. Start all backend microservices (API Gateway, Auth, Session, AI Detection, Eye Tracking, Response Timing, Video)
6. Start the frontend React app
7. Initialize the database with schema and seed data

**Expected output**: You'll see logs from all services. Wait for messages like:
- `postgres ready for connections`
- `redis ready to accept connections`
- `api-gateway server listening on 0.0.0.0:3000`
- `frontend server started on port 80`

**First-time build**: The initial build may take 10-20 minutes depending on your internet speed and machine.

### Step 8: Verify All Services Are Running

Open a new terminal window and run:

```bash
# Check running containers
docker compose ps

# You should see all services in "Up" state:
# - blockd-postgres
# - blockd-redis
# - blockd-rabbitmq
# - blockd-api-gateway
# - blockd-auth-service
# - blockd-session-service
# - blockd-ai-detection
# - blockd-eye-tracking
# - blockd-response-timing
# - blockd-video-service
# - blockd-frontend
```

### Step 9: Check Service Health

```bash
# Check database is ready
docker exec blockd-postgres pg_isready -U blockd_user -d blockd

# Check Redis
docker exec blockd-redis redis-cli ping

# Check RabbitMQ management UI
open http://localhost:15672
# Login: blockd_mq / blockd_mq_dev

# Check API Gateway health
curl http://localhost:3000/health
```

---

## Part 4: Access the Application

### Step 10: Access Frontend Application

Open your browser and navigate to:

```
http://localhost:5173
```

You should see the Blockd Interviewer Application login page.

### Step 11: Access Service Endpoints

The following services are now running:

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:5173 | React interviewer app |
| API Gateway | http://localhost:3000 | Main API entry point |
| API Docs | http://localhost:3000/documentation | Swagger API documentation |
| Auth Service | http://localhost:3001 | Authentication |
| Session Service | http://localhost:3002 | Session management |
| AI Detection | http://localhost:8000 | AI answer detection |
| Eye Tracking | http://localhost:8001 | Eye tracking analysis |
| Response Timing | http://localhost:8002 | Response timing analysis |
| Video Service | http://localhost:8003 | Video processing |
| RabbitMQ Admin | http://localhost:15672 | Message queue management |

### Step 12: Create Test User

You can create a test user via the API:

```bash
# Register a new user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@blockd.com",
    "password": "TestPassword123!",
    "full_name": "Test User",
    "role": "interviewer"
  }'
```

**Expected response**: You'll receive an access token and user ID.

### Step 13: Login to Frontend

Use the credentials you just created:
- Email: `test@blockd.com`
- Password: `TestPassword123!`

---

## Part 5: Viewing Logs and Debugging

### Step 14: View Service Logs

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f api-gateway
docker compose logs -f frontend
docker compose logs -f ai-detection

# View last 100 lines
docker compose logs --tail=100 api-gateway
```

### Step 15: Common Issues and Solutions

#### Issue: Port Already in Use
```
Error: bind: address already in use
```

**Solution**: Another service is using the port. Either:
1. Stop the conflicting service
2. Or modify the port in `docker-compose.yml`

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

#### Issue: Database Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**: Wait for PostgreSQL to be ready
```bash
# Check PostgreSQL logs
docker compose logs postgres

# Restart the services
docker compose restart api-gateway auth-service session-service
```

#### Issue: Out of Disk Space
```
Error: no space left on device
```

**Solution**: Clean up Docker resources
```bash
# Remove unused Docker images and volumes
docker system prune -a

# Remove specific volumes (WARNING: deletes data)
docker volume rm blockd-postgres-data blockd-redis-data
```

---

## Part 6: Running Services Locally (Without Docker)

If you prefer to run services directly on your machine:

### Step 16: Install Dependencies

#### Backend Services (Node.js)
```bash
# API Gateway
cd backend/api-gateway
npm install

# Auth Service
cd ../auth-service
npm install

# Session Service
cd ../session-service
npm install

# Repeat for other Node.js services
```

#### Backend Services (Python)
```bash
# AI Detection
cd backend/ai-detection
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Repeat for eye-tracking, response-timing, video-service
```

#### Frontend
```bash
cd frontend/interviewer-app
npm install
```

### Step 17: Start Infrastructure Services with Docker

```bash
# Start only database, cache, and message queue
docker compose up postgres redis rabbitmq -d
```

### Step 18: Run Database Migrations

```bash
cd database
chmod +x init.sh
./init.sh
```

### Step 19: Start Services Manually

Open multiple terminal windows:

**Terminal 1 - API Gateway**:
```bash
cd backend/api-gateway
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

**Terminal 2 - Auth Service**:
```bash
cd backend/auth-service
cp .env.example .env
npm run dev
```

**Terminal 3 - Frontend**:
```bash
cd frontend/interviewer-app
npm run dev
```

**Terminal 4 - AI Detection** (optional):
```bash
cd backend/ai-detection
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

---

## Part 7: Testing the Platform

### Step 20: Run Automated Tests

```bash
# Install test dependencies
cd tests
npm install

# Run API tests
npm run test:api

# Run E2E tests (requires services running)
npm run test:e2e

# Run load tests
npm run test:load
```

### Step 21: Manual Testing Workflow

1. **Create an interviewer account** (via frontend or API)
2. **Create an interviewee account**
3. **Create a session** as interviewer
4. **Join session** as interviewee (would require Chromium browser in production)
5. **Monitor real-time events** in interviewer dashboard
6. **End session** and view report

---

## Part 8: Stopping and Cleaning Up

### Step 22: Stop All Services

```bash
# Stop all services (preserves data)
docker compose stop

# Stop and remove containers (preserves data in volumes)
docker compose down

# Stop and remove everything including volumes (WARNING: deletes all data)
docker compose down -v
```

### Step 23: Restart Services

```bash
# Start previously built services
docker compose up

# Or rebuild if you made code changes
docker compose up --build
```

---

## Part 9: Development Workflow

### Step 24: Making Code Changes

**For Dockerized Development**:
The docker-compose.yml is configured with volume mounts, so code changes are reflected immediately:

```yaml
volumes:
  - ./backend/api-gateway:/app
```

**Hot Reload**: Most services have hot-reload enabled:
- Node.js services use `tsx watch`
- Python services use `uvicorn --reload`
- Frontend uses Vite HMR

**To apply changes**:
1. Edit code in your IDE
2. Save the file
3. Service automatically restarts
4. Refresh browser (for frontend)

### Step 25: Viewing Database Data

**Option A: Prisma Studio** (for services using Prisma):
```bash
cd backend/api-gateway
npx prisma studio
# Opens at http://localhost:5555
```

**Option B: PostgreSQL CLI**:
```bash
docker exec -it blockd-postgres psql -U blockd_user -d blockd

# Example queries
\dt                          # List all tables
SELECT * FROM users;         # View users
SELECT * FROM interview_sessions;  # View sessions
\q                           # Quit
```

**Option C: Database GUI Tool**:
- Download TablePlus, DBeaver, or pgAdmin
- Connect to: `localhost:5432`
- Database: `blockd`
- User: `blockd_user`
- Password: `blockd_password_dev`

### Step 26: Monitoring Services

**RabbitMQ Management UI**:
```
http://localhost:15672
Login: blockd_mq / blockd_mq_dev
```

**View Queues and Messages**:
- Navigate to "Queues" tab
- See message rates, consumers
- Manually publish/consume messages for testing

---

## Troubleshooting Reference

### Quick Diagnostics

```bash
# Check Docker is running
docker ps

# Check disk space
docker system df

# Check service logs
docker compose logs --tail=50 <service-name>

# Restart a specific service
docker compose restart <service-name>

# Rebuild a specific service
docker compose up --build <service-name>

# Check container resource usage
docker stats
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | Service not ready | Wait 30s, check service logs |
| `Port already in use` | Port conflict | Change port or kill process |
| `No space left` | Disk full | `docker system prune -a` |
| `Cannot connect to Docker daemon` | Docker not running | Start Docker Desktop |
| `Build failed` | Missing dependency | Check Dockerfile, rebuild |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│            Frontend (React + Vite)              │
│              http://localhost:5173              │
└────────────────────┬────────────────────────────┘
                     │ HTTP/WebSocket
                     ▼
┌─────────────────────────────────────────────────┐
│         API Gateway (Fastify)                   │
│          http://localhost:3000                  │
└─┬─────────────────┬─────────────────┬───────────┘
  │                 │                 │
  ▼                 ▼                 ▼
┌──────────┐  ┌──────────┐  ┌──────────────────┐
│   Auth   │  │ Session  │  │  AI Detection    │
│  :3001   │  │  :3002   │  │     :8000        │
└──────────┘  └──────────┘  └──────────────────┘
       │             │              │
       └─────────────┴──────────────┘
                     │
       ┌─────────────┴─────────────┐
       ▼             ▼              ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│PostgreSQL│  │  Redis   │  │ RabbitMQ │
│  :5432   │  │  :6379   │  │  :5672   │
└──────────┘  └──────────┘  └──────────┘
```

---

## Next Steps

1. **Review Documentation**: Check `/docs` folder for detailed component docs
2. **Explore API**: Visit http://localhost:3000/documentation for Swagger UI
3. **Run Tests**: Execute test suites to verify everything works
4. **Read Code**: Start with `backend/api-gateway/src/server.ts`
5. **Check CLAUDE.md**: Full project documentation in root directory

---

## Getting Help

If you encounter issues:

1. **Check logs**: `docker compose logs -f`
2. **Review this guide**: Ensure you followed all steps
3. **Check Docker resources**: Ensure enough RAM/disk space
4. **Restart services**: `docker compose restart`
5. **Clean rebuild**: `docker compose down && docker compose up --build`

---

## Summary of Commands

```bash
# 1. Clone repository
git clone <URL> Blockd_Code
cd Blockd_Code

# 2. Start all services
docker compose up --build -d

# 3. Check status
docker compose ps

# 4. View logs
docker compose logs -f

# 5. Access application
open http://localhost:5173

# 6. Stop services
docker compose down

# 7. Clean up everything
docker compose down -v
docker system prune -a
```

---

**You're now ready to develop and test Blockd locally!** 🚀
