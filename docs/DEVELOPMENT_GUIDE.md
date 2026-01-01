# Blockd Development Guide

A comprehensive guide for developing, testing, and deploying the Blockd interview security platform. This document is written for developers of all experience levels.

---

## Table of Contents

1. [Understanding the System Architecture](#1-understanding-the-system-architecture)
2. [Prerequisites and Setup](#2-prerequisites-and-setup)
3. [Running the Development Environment](#3-running-the-development-environment)
4. [Developing the Interviewer Frontend](#4-developing-the-interviewer-frontend)
5. [Developing the Interviewee Experience](#5-developing-the-interviewee-experience)
6. [Testing Backend Services](#6-testing-backend-services)
7. [API Endpoints Reference](#7-api-endpoints-reference)
8. [Building the Chromium Browser](#8-building-the-chromium-browser)
9. [Connecting Everything Together](#9-connecting-everything-together)
10. [Troubleshooting Common Issues](#10-troubleshooting-common-issues)
11. [Glossary of Terms](#11-glossary-of-terms)

---

## 1. Understanding the System Architecture

### What is Blockd?

Blockd is an interview security platform that helps companies detect if job candidates are cheating during remote interviews. It works by:

1. **Monitoring the candidate** through a custom web browser (Chromium-based)
2. **Analyzing their answers** using AI to detect if they're using ChatGPT or similar tools
3. **Tracking their eye movements** to see if they're looking at other screens or notes
4. **Recording the session** for later review

### The Two User Types

#### Interviewer (Company/Recruiter)
- Uses a **web browser** (Chrome, Firefox, Safari, etc.)
- Accesses the **Interviewer Dashboard** to:
  - Create interview sessions
  - Watch candidates in real-time
  - View AI detection results
  - Generate reports

#### Interviewee (Job Candidate)
- Uses the **custom Blockd Browser** (a modified Chromium)
- This browser:
  - Locks to fullscreen mode
  - Monitors for screen recording software
  - Tracks eye movements via webcam
  - Sends telemetry data to the backend

### System Components Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     INTERVIEWER SIDE                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │   Regular Web Browser (Chrome, Firefox, etc.)            │    │
│  │   └── React Frontend (http://localhost:5173)             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS / WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND SERVERS                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ API Gateway  │  │ Auth Service │  │   Session    │          │
│  │  (Port 3000) │  │ (Port 3001)  │  │   Service    │          │
│  │              │  │              │  │ (Port 3002)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │     AI       │  │     Eye      │  │   Response   │          │
│  │  Detection   │  │   Tracking   │  │    Timing    │          │
│  │ (Port 8000)  │  │ (Port 8001)  │  │ (Port 8002)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐                                               │
│  │    Video     │                                               │
│  │   Service    │                                               │
│  │ (Port 8003)  │                                               │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket / HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INTERVIEWEE SIDE                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │   Custom Blockd Browser (Modified Chromium)              │    │
│  │   • Security monitoring built into the browser           │    │
│  │   • Eye tracking via webcam                              │    │
│  │   • Cannot be bypassed like browser extensions           │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### What are "Microservices"?

Instead of one big application, Blockd is split into smaller, specialized services:

| Service | Language | What It Does |
|---------|----------|--------------|
| **API Gateway** | Node.js | Front door - routes requests to other services |
| **Auth Service** | Node.js | Handles login, registration, passwords |
| **Session Service** | Node.js | Manages interview sessions (start, end, status) |
| **AI Detection** | Python | Compares answers to AI-generated responses |
| **Eye Tracking** | Python | Analyzes webcam data for gaze direction |
| **Response Timing** | Python | Measures how long candidates take to answer |
| **Video Service** | Python | Records and streams video |

### What is Docker?

Docker is a tool that packages software into "containers" - isolated environments that include everything needed to run the software. Think of it like shipping containers for code.

**Why we use Docker:**
- Everyone gets the same environment (no "works on my machine" problems)
- Easy to start all services with one command
- Easy to reset if something breaks

---

## 2. Prerequisites and Setup

### Required Software

Before you begin, install the following on your computer:

#### 1. Docker Desktop
Downloads: https://www.docker.com/products/docker-desktop/

Docker runs all our backend services. After installing:
- Open Docker Desktop
- Make sure it shows "Docker Desktop is running"
- Allocate at least 8GB RAM in Docker Settings > Resources

#### 2. Node.js (v20 or later)
Download: https://nodejs.org/

Node.js runs JavaScript outside the browser. We use it for the frontend and some backend services.

To verify installation, open Terminal and run:
```bash
node --version
# Should show v20.x.x or higher
```

#### 3. Git
Download: https://git-scm.com/downloads

Git tracks code changes and lets you collaborate with others.

To verify:
```bash
git --version
# Should show git version 2.x.x
```

#### 4. A Code Editor
Recommended: **Visual Studio Code** (https://code.visualstudio.com/)

Free, works on Mac/Windows/Linux, has great extensions for our tech stack.

Helpful VS Code extensions:
- ESLint (JavaScript linting)
- Prettier (code formatting)
- Python (if editing Python files)
- Docker (container management)

### Clone the Repository

Open Terminal and run:

```bash
# Navigate to where you want the project
cd ~/Projects  # or wherever you prefer

# Clone the repository
git clone https://github.com/WillieTheWhale/Blockd.git

# Enter the project directory
cd Blockd
```

### Understanding the Project Structure

```
Blockd/
├── backend/                    # All backend microservices
│   ├── api-gateway/           # Main API entry point (Node.js)
│   ├── auth-service/          # Authentication (Node.js)
│   ├── session-service/       # Session management (Node.js)
│   ├── ai-detection/          # AI answer detection (Python)
│   ├── eye-tracking/          # Gaze analysis (Python)
│   ├── response-timing/       # Speech timing analysis (Python)
│   └── video-service/         # Video streaming (Python)
│
├── frontend/
│   └── interviewer-app/       # React web app for interviewers
│
├── chromium/                   # Custom browser source code
│   └── src/                   # C++ modifications to Chromium
│
├── database/                   # Database schema and migrations
├── docs/                       # Documentation (you're reading this!)
├── docker-compose.yml         # Defines how to run all services
└── CLAUDE.md                  # AI assistant instructions
```

---

## 3. Running the Development Environment

### Starting Everything with Docker Compose

Docker Compose reads the `docker-compose.yml` file and starts all services together.

```bash
# Make sure you're in the project root
cd /path/to/Blockd

# Start all services
docker compose up -d

# The -d flag runs in "detached" mode (background)
```

**What happens:**
1. Docker downloads base images (first time only, ~5-10 min)
2. Builds custom images for each service
3. Starts containers for:
   - PostgreSQL (database)
   - Redis (caching)
   - RabbitMQ (message queue)
   - MinIO (file storage)
   - All 7 backend services
   - Frontend web app

### Checking Service Status

```bash
# See all running containers
docker compose ps

# Expected output:
# NAME                  STATUS
# blockd-postgres       running (healthy)
# blockd-redis          running (healthy)
# blockd-rabbitmq       running (healthy)
# blockd-minio          running (healthy)
# blockd-api-gateway    running
# blockd-auth-service   running
# blockd-ai-detection   running
# ... etc
```

### Viewing Logs

Logs show what each service is doing (helpful for debugging):

```bash
# All services (can be overwhelming)
docker compose logs -f

# Specific service
docker compose logs -f api-gateway
docker compose logs -f ai-detection

# Last 100 lines only
docker compose logs --tail=100 api-gateway
```

Press `Ctrl+C` to stop viewing logs.

### Stopping Services

```bash
# Stop all services (keeps data)
docker compose stop

# Stop and remove containers (keeps data in volumes)
docker compose down

# Stop and remove EVERYTHING including data (fresh start)
docker compose down --volumes --remove-orphans
```

### Service URLs Reference

Once running, access services at:

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | Interviewer web app |
| API Gateway | http://localhost:3000 | Main API |
| Auth Service | http://localhost:3001 | Authentication API |
| Session Service | http://localhost:3002 | Session API |
| AI Detection | http://localhost:8000 | AI detection API |
| Eye Tracking | http://localhost:8001 | Eye tracking API |
| Response Timing | http://localhost:8002 | Response timing API |
| Video Service | http://localhost:8003 | Video streaming API |
| RabbitMQ UI | http://localhost:15672 | Message queue dashboard |
| MinIO Console | http://localhost:9001 | File storage dashboard |

---

## 4. Developing the Interviewer Frontend

The interviewer frontend is a React web application located in `frontend/interviewer-app/`.

### What is React?

React is a JavaScript library for building user interfaces. It breaks the UI into reusable "components" (like building blocks).

### Running the Frontend Separately (for Development)

While Docker runs the frontend, for active development you'll want to run it locally for faster updates:

```bash
# Navigate to frontend directory
cd frontend/interviewer-app

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
```

This starts a development server at http://localhost:5173 with "hot reload" - changes appear instantly without refreshing.

### Frontend Project Structure

```
frontend/interviewer-app/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── ui/           # Basic elements (buttons, inputs, cards)
│   │   ├── layout/       # Page layouts (header, sidebar)
│   │   └── features/     # Feature-specific components
│   │
│   ├── pages/            # Full page components
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── SessionPage.tsx
│   │   └── ...
│   │
│   ├── hooks/            # Custom React hooks
│   │   ├── useAuth.ts    # Authentication logic
│   │   ├── useSession.ts # Session management
│   │   └── useWebSocket.ts # Real-time updates
│   │
│   ├── stores/           # State management (Zustand)
│   │   ├── authStore.ts  # User authentication state
│   │   └── sessionStore.ts # Active session state
│   │
│   ├── lib/              # Utilities and API client
│   │   ├── api.ts        # Backend API calls
│   │   └── utils.ts      # Helper functions
│   │
│   ├── App.tsx           # Main application component
│   └── main.tsx          # Entry point
│
├── package.json          # Dependencies and scripts
├── vite.config.ts        # Build configuration
└── tailwind.config.js    # CSS styling configuration
```

### Making Your First Change

Let's make a simple change to understand the workflow:

1. **Open the project in VS Code:**
   ```bash
   code frontend/interviewer-app
   ```

2. **Start the dev server:**
   ```bash
   npm run dev
   ```

3. **Edit a component:**
   Open `src/pages/LoginPage.tsx` and find the login heading. Change the text:
   ```tsx
   // Before
   <h1>Welcome to Blockd</h1>

   // After
   <h1>Welcome to Blockd Platform</h1>
   ```

4. **Save the file** - the browser automatically updates!

### Key Technologies in the Frontend

| Technology | Purpose | Learn More |
|------------|---------|------------|
| **React** | UI components | https://react.dev |
| **TypeScript** | Type-safe JavaScript | https://typescriptlang.org |
| **Tailwind CSS** | Utility-first styling | https://tailwindcss.com |
| **Zustand** | State management | https://zustand-demo.pmnd.rs |
| **React Router** | Page navigation | https://reactrouter.com |
| **TanStack Query** | API data fetching | https://tanstack.com/query |

### Connecting Frontend to Backend

The frontend communicates with backend via HTTP API calls. The API client is in `src/lib/api.ts`:

```typescript
// Example: Fetching sessions
const response = await api.get('/sessions');
const sessions = response.data;

// Example: Creating a session
const newSession = await api.post('/sessions', {
  candidateEmail: 'candidate@example.com',
  scheduledTime: '2024-01-15T10:00:00Z'
});
```

The base URL is configured in environment variables:
```
VITE_API_URL=http://localhost:3000/api/v1
```

---

## 5. Developing the Interviewee Experience

The interviewee experience has two parts:
1. **Web interface** (what they see in the browser)
2. **Custom Chromium browser** (the container with security features)

### For Initial Development: Use a Regular Browser

During development, you can test the interviewee experience in a regular browser. You won't have security monitoring, but you can develop the UI and API interactions.

The interviewee joins via a special URL like:
```
http://localhost:5173/join/SESSION_TOKEN_HERE
```

### What the Interviewee Sees

1. **Join Screen** - Enter session code or click join link
2. **Permissions Request** - Allow camera/microphone
3. **Waiting Room** - Wait for interviewer to start
4. **Interview Screen** - Questions, video feed, answer input
5. **Completion Screen** - Session ended

### Creating a Test Session

1. Open the Interviewer Dashboard: http://localhost:5173
2. Log in (or create an account)
3. Click "Create New Session"
4. Copy the "Interviewee Join Link"
5. Open that link in a new browser window (or incognito)

### Adding Interviewee-Specific Pages

Interviewee pages are in the same React app but with different routes:

```
/join/:token     - Join session with token
/interview/:id   - Active interview screen
/complete        - Post-interview screen
```

### Simulating Security Events

For testing, you can simulate security events via the API:

```bash
# Simulate a "suspicious process detected" event
curl -X POST http://localhost:3000/api/v1/browser/security/event \
  -H "Content-Type: application/json" \
  -d '{
    "session_token": "YOUR_SESSION_TOKEN",
    "event_type": "suspicious_process_detected",
    "severity": "high",
    "description": "Detected OBS Studio running",
    "metadata": {
      "process_name": "obs64.exe"
    }
  }'
```

---

## 6. Testing Backend Services

### Health Checks

Every service has a `/health` endpoint. Use these to verify services are working:

```bash
# Check all services
curl http://localhost:3000/health  # API Gateway
curl http://localhost:3001/health  # Auth Service
curl http://localhost:3002/health  # Session Service
curl http://localhost:8000/health  # AI Detection
curl http://localhost:8001/health  # Eye Tracking
curl http://localhost:8002/health  # Response Timing
curl http://localhost:8003/health  # Video Service
```

A healthy response looks like:
```json
{
  "status": "healthy",
  "service": "api-gateway",
  "version": "1.0.0"
}
```

### Testing with cURL

cURL is a command-line tool for making HTTP requests. Here are common patterns:

```bash
# GET request (fetch data)
curl http://localhost:3000/api/v1/sessions

# POST request (create data)
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "full_name": "Test User"
  }'

# With authentication token
curl http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

### Testing with Postman (Graphical Tool)

Postman is easier for testing APIs if you prefer a visual interface:

1. Download Postman: https://www.postman.com/downloads/
2. Create a new request
3. Enter the URL: `http://localhost:3000/api/v1/sessions`
4. Click "Send"

### Testing AI Detection

The AI detection service compares human answers to AI-generated responses:

```bash
# Step 1: Submit a question for AI to answer
curl -X POST http://localhost:8000/api/v1/question \
  -H "Content-Type: application/json" \
  -d '{
    "question_text": "Explain the difference between TCP and UDP"
  }'

# Response includes a question_hash you'll need for step 2

# Step 2: Submit a human answer for analysis
curl -X POST http://localhost:8000/api/v1/answer \
  -H "Content-Type: application/json" \
  -d '{
    "question_hash": "HASH_FROM_STEP_1",
    "answer_text": "TCP is connection-oriented and guarantees delivery..."
  }'

# Response includes risk_score, similarity to AI answers, etc.
```

### Testing Eye Tracking

The eye tracking service analyzes gaze data:

```bash
# Submit gaze data for analysis
curl -X POST http://localhost:8001/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-session-123",
    "gaze_data": [
      {"timestamp": 1000, "x": 0.5, "y": 0.5, "confidence": 0.95},
      {"timestamp": 1033, "x": 0.52, "y": 0.48, "confidence": 0.93},
      {"timestamp": 1066, "x": 0.1, "y": 0.1, "confidence": 0.90}
    ]
  }'
```

### Viewing Database Contents

PostgreSQL stores all persistent data. To explore it:

```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U blockd_user -d blockd

# Once connected, try these SQL commands:
\dt                          # List all tables
SELECT * FROM users;         # View users
SELECT * FROM interview_sessions;  # View sessions
\q                           # Quit
```

### Viewing Message Queue

RabbitMQ handles async tasks. Access the management UI:

1. Open http://localhost:15672
2. Login: `blockd_mq` / `blockd_mq_dev`
3. Explore queues, exchanges, and messages

### Viewing Object Storage (MinIO)

MinIO stores video files. Access the console:

1. Open http://localhost:9001
2. Login: `blockd_minio` / `blockd_minio_dev`
3. Browse buckets and files

---

## 7. API Endpoints Reference

### Authentication Endpoints

```
POST /api/v1/auth/register     - Create new account
POST /api/v1/auth/login        - Login and get JWT token
POST /api/v1/auth/refresh      - Refresh access token
POST /api/v1/auth/logout       - Invalidate tokens
POST /api/v1/auth/forgot-password - Request password reset
POST /api/v1/auth/reset-password  - Complete password reset
```

### Session Endpoints

```
GET    /api/v1/sessions              - List all sessions
POST   /api/v1/sessions              - Create new session
GET    /api/v1/sessions/:id          - Get session details
PUT    /api/v1/sessions/:id          - Update session
DELETE /api/v1/sessions/:id          - Delete session
POST   /api/v1/sessions/:id/start    - Start interview
POST   /api/v1/sessions/:id/end      - End interview
GET    /api/v1/sessions/:id/report   - Get session report
```

### Browser/Interviewee Endpoints

```
POST /api/v1/browser/join            - Join session with token
POST /api/v1/browser/security/event  - Report security event
POST /api/v1/browser/telemetry/batch - Submit telemetry data
POST /api/v1/browser/gaze/batch      - Submit gaze data
```

### Analysis Endpoints

```
POST /api/v1/analysis/question  - Submit question for AI answers
POST /api/v1/analysis/answer    - Analyze human answer
GET  /api/v1/analysis/:id       - Get analysis results
```

### WebSocket Endpoints

```
ws://localhost:3000/ws/session/:id  - Real-time session updates
ws://localhost:8003/ws/video/:id    - Video streaming
```

---

## 8. Building the Chromium Browser

The custom Chromium browser is what makes Blockd's security features possible. Building it is complex and time-consuming.

### Why Custom Chromium?

Browser extensions can be disabled by users. By building security features into the browser itself, we ensure they cannot be bypassed:

- **Process monitoring** - Detect screen recorders, virtual machines
- **Focus tracking** - Know when browser loses focus
- **Fullscreen enforcement** - Prevent exiting fullscreen
- **Eye tracking integration** - MediaPipe runs in the renderer process
- **Telemetry collection** - System information, network status

### Build Requirements

Building Chromium requires significant resources:

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Disk Space | 100 GB | 200+ GB |
| RAM | 16 GB | 32 GB |
| CPU Cores | 8 | 16+ |
| Build Time | 4-8 hours | 1-2 hours |
| OS | Windows/macOS/Linux | Any |

### High-Level Build Steps

1. **Install depot_tools** (Chromium's build toolchain)
2. **Fetch Chromium source** (~30 GB download)
3. **Apply Blockd modifications** (our custom code)
4. **Configure the build** (GN build system)
5. **Compile** (Ninja build system)
6. **Package installer** (NSIS/PKG/DEB)

### Detailed Build Instructions

See the dedicated build guide at: `chromium/docs/BUILD.md`

For quick reference:

```bash
# 1. Install depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:/path/to/depot_tools"

# 2. Create build directory
mkdir chromium-build && cd chromium-build

# 3. Fetch Chromium (takes a while)
fetch --nohooks chromium
cd src
gclient sync

# 4. Apply Blockd patches
cp -r /path/to/Blockd/chromium/src/* ./

# 5. Configure build
gn gen out/Default --args='is_debug=false is_component_build=false'

# 6. Build (this takes hours)
autoninja -C out/Default chrome

# 7. The browser executable is at:
# Windows: out/Default/chrome.exe
# macOS: out/Default/Chromium.app
# Linux: out/Default/chrome
```

### Development Without Building Chromium

For most frontend/backend development, you don't need the custom browser. Use these alternatives:

1. **Regular Chrome** - Test basic functionality
2. **Mock security events** - Use API to simulate browser events
3. **Browser DevTools** - Override webcam with test video

To simulate the browser connecting:
```bash
# Simulate browser connecting to session
curl -X POST http://localhost:3000/api/v1/browser/join \
  -H "Content-Type: application/json" \
  -d '{"session_token": "YOUR_TOKEN"}'
```

---

## 9. Connecting Everything Together

### Full Integration Test Workflow

Here's how to test the complete system end-to-end:

#### Step 1: Start All Services
```bash
cd /path/to/Blockd
docker compose up -d
```

#### Step 2: Create an Interviewer Account
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "interviewer@company.com",
    "password": "SecurePass123!",
    "full_name": "Test Interviewer",
    "role": "interviewer"
  }'
```

#### Step 3: Login as Interviewer
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "interviewer@company.com",
    "password": "SecurePass123!"
  }'
# Save the access_token from response
```

#### Step 4: Create Interview Session
```bash
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "interviewee_email": "candidate@example.com",
    "scheduled_start": "2024-01-15T10:00:00Z",
    "questions": [
      {
        "question_text": "Explain the difference between TCP and UDP",
        "expected_duration_seconds": 180
      }
    ]
  }'
# Note the session_id and session_token
```

#### Step 5: Open Interviewer Dashboard
1. Open http://localhost:5173
2. Login with interviewer credentials
3. You should see the created session

#### Step 6: Simulate Interviewee Joining
```bash
# Join the session
curl -X POST http://localhost:3000/api/v1/browser/join \
  -H "Content-Type: application/json" \
  -d '{"session_token": "TOKEN_FROM_STEP_4"}'
```

#### Step 7: Start the Interview
```bash
curl -X POST http://localhost:3000/api/v1/sessions/SESSION_ID/start \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### Step 8: Submit Test Answer
```bash
# First, analyze the question
curl -X POST http://localhost:8000/api/v1/question \
  -H "Content-Type: application/json" \
  -d '{"question_text": "Explain the difference between TCP and UDP"}'

# Then submit an answer for analysis
curl -X POST http://localhost:8000/api/v1/answer \
  -H "Content-Type: application/json" \
  -d '{
    "question_hash": "HASH_FROM_ABOVE",
    "answer_text": "TCP provides reliable, ordered delivery with error checking. UDP is faster but does not guarantee delivery."
  }'
```

#### Step 9: End Session and View Report
```bash
curl -X POST http://localhost:3000/api/v1/sessions/SESSION_ID/end \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

curl http://localhost:3000/api/v1/sessions/SESSION_ID/report \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### WebSocket Real-Time Updates

For real-time features, connect via WebSocket:

```javascript
// In browser console or Node.js
const socket = new WebSocket('ws://localhost:3000/ws/session/SESSION_ID');

socket.onopen = () => {
  console.log('Connected to session');
  socket.send(JSON.stringify({
    type: 'join',
    token: 'YOUR_ACCESS_TOKEN'
  }));
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
  // Handle events like:
  // - interviewee_joined
  // - security_event
  // - gaze_update
  // - answer_submitted
};
```

---

## 10. Troubleshooting Common Issues

### Docker Services Won't Start

**Symptom:** `docker compose up` fails or services keep restarting

**Solutions:**
```bash
# 1. Check Docker is running
docker info

# 2. View specific service logs
docker compose logs api-gateway

# 3. Restart fresh
docker compose down --volumes --remove-orphans
docker compose up -d

# 4. Rebuild images
docker compose build --no-cache
docker compose up -d
```

### Port Already in Use

**Symptom:** `Error: listen EADDRINUSE: address already in use`

**Solutions:**
```bash
# Find what's using the port
lsof -i :3000

# Kill the process
kill -9 PID_NUMBER

# Or change the port in docker-compose.yml
```

### Frontend Can't Connect to Backend

**Symptom:** Network errors, CORS errors in browser console

**Solutions:**
1. Ensure backend is running: `docker compose ps`
2. Check API Gateway health: `curl http://localhost:3000/health`
3. Check browser console for specific error
4. Ensure CORS is configured in backend

### Database Connection Errors

**Symptom:** `ECONNREFUSED` or `connection refused` to PostgreSQL

**Solutions:**
```bash
# Check PostgreSQL is running
docker compose ps postgres

# View PostgreSQL logs
docker compose logs postgres

# Connect manually to test
docker compose exec postgres psql -U blockd_user -d blockd
```

### npm install Fails

**Symptom:** Network errors or package resolution failures

**Solutions:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Try with different registry
npm install --registry https://registry.npmmirror.com
```

### AI Detection Returns Errors

**Symptom:** AI detection endpoints return 500 errors

**Solutions:**
1. Check AI Detection logs: `docker compose logs ai-detection`
2. Verify OpenAI/Anthropic API keys in docker-compose.yml
3. Ensure Redis is healthy: `curl http://localhost:6379` (should connect)

---

## 11. Glossary of Terms

| Term | Definition |
|------|------------|
| **API** | Application Programming Interface - how software components communicate |
| **Backend** | Server-side code that handles business logic and data |
| **Container** | Isolated environment running an application (via Docker) |
| **CORS** | Cross-Origin Resource Sharing - security feature for web requests |
| **Docker** | Tool for running applications in containers |
| **Docker Compose** | Tool for running multiple Docker containers together |
| **Endpoint** | A specific URL path that accepts requests (like `/api/v1/users`) |
| **Frontend** | Client-side code that runs in the browser (UI) |
| **Git** | Version control system for tracking code changes |
| **HTTP** | Protocol for web communication (GET, POST, etc.) |
| **JWT** | JSON Web Token - secure way to transmit user identity |
| **Microservice** | Small, independent service handling one responsibility |
| **npm** | Node Package Manager - installs JavaScript libraries |
| **PostgreSQL** | Relational database for storing structured data |
| **React** | JavaScript library for building user interfaces |
| **Redis** | In-memory database for caching and fast data access |
| **REST** | Representational State Transfer - API design pattern |
| **TypeScript** | JavaScript with type annotations for safer code |
| **WebSocket** | Protocol for real-time, bidirectional communication |

---

## Next Steps

1. **Start small** - Run Docker Compose and explore the frontend
2. **Make a change** - Edit a React component and see it update
3. **Test an API** - Use cURL or Postman to call endpoints
4. **Read the code** - Explore the service you're most interested in
5. **Ask questions** - Open an issue on GitHub if stuck

Happy developing!
