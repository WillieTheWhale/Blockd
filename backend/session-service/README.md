# Blockd Session Service

Production-grade session management service for the Blockd interview integrity platform. Handles interview session lifecycle, participant management, real-time communication via WebSocket, and comprehensive reporting.

## Features

- **Session Lifecycle Management**: Create, start, end, and cancel interview sessions with state machine validation
- **Real-time WebSocket Communication**: Live participant tracking, security alerts, and status updates
- **Security Event Logging**: Track and analyze security events during sessions
- **Question & Answer Management**: Handle interview questions and capture responses
- **Risk Scoring**: Calculate comprehensive risk scores based on AI detection, security events, gaze tracking, and timing analysis
- **Report Generation**: Generate detailed session reports in JSON and PDF formats
- **Participant Tracking**: Monitor connected participants in real-time
- **Message Queue Integration**: Async communication with video, AI detection, and gaze analysis services

## Technology Stack

- **Node.js**: 24.11.0 LTS
- **TypeScript**: 5.9.3
- **Fastify**: 5.x (HTTP framework)
- **Socket.io**: 4.x (WebSocket)
- **Prisma**: 6.x (PostgreSQL ORM)
- **Redis**: Session state caching
- **RabbitMQ**: Message queue for async tasks

## Architecture

```
session-service/
├── src/
│   ├── server.ts           # Main entry point
│   ├── app.ts             # Fastify application
│   ├── config.ts          # Configuration
│   ├── database.ts        # Prisma client
│   ├── redis.ts           # Redis client
│   └── messageQueue.ts    # RabbitMQ client
├── controllers/           # HTTP request handlers
├── services/             # Business logic
├── websocket/            # WebSocket handlers
├── lib/                  # Utilities
├── types/                # TypeScript types
├── prisma/              # Database schema
└── test/                # Test suite
```

## Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
# Server
NODE_ENV=development
PORT=3002
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/blockd

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://user:password@localhost:5672

# JWT
JWT_SECRET=your-secret-key

# WebSocket
WEBSOCKET_PORT=3003
WEBSOCKET_CORS_ORIGIN=http://localhost:3000
```

## Running the Service

```bash
# Development mode (with auto-reload)
npm run dev

# Build TypeScript
npm run build

# Production mode
npm start

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage
```

## API Endpoints

### Session Management

#### Create Session
```http
POST /sessions
Content-Type: application/json
Authorization: Bearer <token>

{
  "interviewee_email": "candidate@example.com",
  "scheduled_start": "2025-11-25T10:00:00Z",
  "duration_minutes": 60,
  "questions": [
    {
      "question_text": "Describe your experience with TypeScript",
      "expected_duration_seconds": 300,
      "difficulty": "medium"
    }
  ]
}

Response: 201 Created
{
  "session_id": "uuid",
  "session_token": "secure-token",
  "status": "scheduled",
  "join_url": "http://localhost:3000/session/join/token",
  "websocket_url": "ws://localhost:3003",
  "interviewer": {...},
  "scheduled_start": "2025-11-25T10:00:00Z",
  "created_at": "2025-11-24T12:00:00Z"
}
```

#### Get Session
```http
GET /sessions/:id
Authorization: Bearer <token>

Response: 200 OK
{
  "session_id": "uuid",
  "status": "active",
  "interviewer": {...},
  "interviewee": {...},
  "questions": [...],
  "security_events": [...],
  "risk_score": 0.35
}
```

#### List Sessions
```http
GET /sessions?page=1&limit=20&status=active
Authorization: Bearer <token>

Response: 200 OK
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

### Session Lifecycle

#### Start Session
```http
POST /sessions/:id/start
Authorization: Bearer <token>

{
  "started_by": "user-id"
}

Response: 200 OK
{
  "session_id": "uuid",
  "status": "active",
  "started_at": "2025-11-24T12:00:00Z",
  "websocket_url": "ws://localhost:3003",
  "participants": []
}
```

#### End Session
```http
POST /sessions/:id/end
Authorization: Bearer <token>

{
  "ended_by": "user-id",
  "reason": "Interview completed"
}

Response: 200 OK
{
  "session_id": "uuid",
  "status": "ended",
  "ended_at": "2025-11-24T13:00:00Z",
  "duration_seconds": 3600,
  "report_id": "uuid"
}
```

#### Cancel Session
```http
POST /sessions/:id/cancel
Authorization: Bearer <token>

{
  "cancelled_by": "user-id",
  "reason": "Candidate no-show"
}

Response: 204 No Content
```

### Security Events

#### Log Security Event
```http
POST /sessions/:id/security-events
Authorization: Bearer <token>

{
  "event_type": "suspicious_process_detected",
  "severity": "high",
  "description": "Detected unauthorized screen recording software",
  "metadata": {
    "process_name": "obs-studio.exe"
  }
}

Response: 201 Created
{
  "event_id": "uuid",
  "acknowledged": true,
  "timestamp": "2025-11-24T12:30:00Z"
}
```

#### Get Security Events
```http
GET /sessions/:id/security-events
Authorization: Bearer <token>

Response: 200 OK
[
  {
    "event_id": "uuid",
    "event_type": "suspicious_process_detected",
    "severity": "high",
    "description": "...",
    "timestamp": "2025-11-24T12:30:00Z"
  }
]
```

### Questions & Answers

#### Get Session Questions
```http
GET /sessions/:sessionId/questions
Authorization: Bearer <token>

Response: 200 OK
[
  {
    "question_id": "uuid",
    "question_text": "...",
    "difficulty": "medium",
    "asked_at": "2025-11-24T12:05:00Z",
    "answer": {...}
  }
]
```

#### Submit Answer
```http
POST /answers
Authorization: Bearer <token>

{
  "question_id": "uuid",
  "answer_text": "Candidate's answer...",
  "submitted_by": "user-id"
}

Response: 201 Created
{
  "answer_id": "uuid"
}
```

### Reports

#### Generate Report
```http
POST /sessions/:id/report
Authorization: Bearer <token>

Response: 200 OK
{
  "report_id": "uuid",
  "session_id": "uuid",
  "risk_analysis": {...},
  "security_summary": {...},
  "recommendations": [...]
}
```

#### Export Report
```http
GET /sessions/:id/report/export?format=pdf
Authorization: Bearer <token>

Response: 200 OK (PDF download)
Content-Type: application/pdf
Content-Disposition: attachment; filename="session-report-uuid.pdf"
```

## WebSocket Events

### Client to Server

- `join` - Join session room
- `leave` - Leave session room
- `ping` - Heartbeat
- `answer.submit` - Submit answer to question

### Server to Client

- `session.created` - New session created
- `session.started` - Session started
- `session.ended` - Session ended
- `session.cancelled` - Session cancelled
- `participant.joined` - Participant joined
- `participant.left` - Participant left
- `security.alert` - Security event occurred
- `question.asked` - New question asked
- `answer.submitted` - Answer submitted
- `gaze.update` - Real-time gaze data

## Session State Machine

```
scheduled → active → ended
    ↓          ↓
cancelled  cancelled
```

### State Transitions

- `schedule()`: Create new session → `scheduled`
- `start()`: `scheduled` → `active`
- `end()`: `active` → `ended`
- `cancel()`: `scheduled | active` → `cancelled`

## Risk Scoring

Risk score (0-1) calculated from:

- **AI Detection** (40% weight): Similarity to AI-generated answers
- **Security Events** (30% weight): Count and severity of security violations
- **Gaze Anomalies** (20% weight): Off-screen time and patterns
- **Timing Anomalies** (10% weight): Response timing irregularities

### Risk Levels

- **Low** (< 0.50): No significant concerns
- **Medium** (0.50 - 0.74): Review recommended
- **High** (0.75 - 0.89): Manual review required
- **Critical** (≥ 0.90): Severe violations detected

## Message Queue Topics

### Published Events

- `video_processing.start` - Start recording
- `video_processing.stop` - Stop recording
- `ai_detection.detect` - Trigger AI analysis
- `security_events.{severity}` - Security alerts
- `gaze_analysis.analyze` - Process gaze data

## Redis Cache Keys

```
session:{session_id}              → Session state
token:{token}                     → Session ID lookup
participants:{session_id}         → Connected participants
active_sessions:{interviewer_id}  → Active session IDs
```

## Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- state-machine.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Format code
npm run format

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

## Docker

```bash
# Build image
docker build -t blockd/session-service .

# Run container
docker run -p 3002:3002 -p 3003:3003 blockd/session-service
```

## Environment Variables

See `.env.example` for all configuration options.

## Integration Points

- **Database**: PostgreSQL (from Agent 1)
- **Cache**: Redis (from Agent 2)
- **Auth**: JWT validation (from Agent 6)
- **Message Queue**: RabbitMQ (from Agent 3)
- **Video Service**: Recording start/stop
- **AI Detection Service**: Answer analysis
- **Gaze Tracking Service**: Eye tracking data

## License

MIT

## Author

Blockd Team - Agent 7: Session Management Developer
