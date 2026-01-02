# Blockd WebSocket Service

Production-grade WebSocket infrastructure for real-time communication in the Blockd interview platform.

## Overview

The WebSocket service provides real-time bidirectional communication between interviewers, interviewees, and the Blockd platform using Socket.io with Redis adapter for horizontal scaling.

## Features

- **Real-time Communication**: Bidirectional event-based communication
- **Horizontal Scaling**: Redis adapter for multi-instance deployment
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Per-socket event rate limiting
- **Message Buffering**: Offline message buffering and delivery
- **Reconnection Support**: Exponential backoff reconnection strategy
- **Gaze Streaming**: Real-time eye-tracking data streaming with throttling
- **Security Events**: Real-time security event broadcasting
- **Chat System**: Interview session chat functionality
- **Heartbeat Monitoring**: Ping/pong connection health monitoring

## Technology Stack

- **Node.js**: 24.11.0 LTS
- **TypeScript**: 5.9.3
- **Socket.io**: 4.x
- **Redis Adapter**: @socket.io/redis-adapter 8.x
- **Redis**: 8.4
- **JWT**: jsonwebtoken 9.x

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client 1  │────▶│  WS Server  │────▶│   Redis     │
└─────────────┘     │  Instance 1 │     │   Cluster   │
                    └─────────────┘     └─────────────┘
                           │                    │
┌─────────────┐            │                    │
│   Client 2  │────▶┌─────────────┐            │
└─────────────┘     │  WS Server  │────────────┘
                    │  Instance 2 │
                    └─────────────┘
```

## Directory Structure

```
websocket-service/
├── src/
│   ├── server.ts          # Main server entry point
│   ├── socket.ts          # Socket.io configuration
│   └── config.ts          # Configuration management
├── handlers/
│   ├── connection.handler.ts   # Connection/disconnection
│   ├── session.handler.ts      # Session room management
│   ├── security.handler.ts     # Security events
│   ├── gaze.handler.ts         # Gaze streaming
│   ├── chat.handler.ts         # Chat messages
│   └── heartbeat.handler.ts    # Ping/pong heartbeat
├── middleware/
│   ├── auth.middleware.ts      # JWT authentication
│   ├── rate-limit.middleware.ts # Rate limiting
│   └── logging.middleware.ts   # Event logging
├── lib/
│   ├── redis-adapter.ts   # Redis adapter setup
│   ├── room-manager.ts    # Room management
│   ├── message-buffer.ts  # Message buffering
│   ├── reconnect.ts       # Reconnection logic
│   ├── errors.ts          # Custom errors
│   └── logger.ts          # Logging utility
├── types/
│   ├── socket.types.ts    # Socket event types
│   ├── room.types.ts      # Room types
│   └── message.types.ts   # Message types
└── test/
    ├── connection.test.ts # Connection tests
    ├── room.test.ts       # Room tests
    ├── events.test.ts     # Event tests
    ├── heartbeat.test.ts  # Heartbeat tests
    ├── rate-limit.test.ts # Rate limit tests
    ├── reconnect.test.ts  # Reconnect tests
    └── load.test.ts       # Load tests
```

## Getting Started

### Prerequisites

- Node.js 24.11.0 or higher
- Redis 8.4 or higher
- JWT public key from auth-service

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Update .env with your configuration
```

### Configuration

Edit `.env` file:

```env
# Server
NODE_ENV=development
PORT=3003
HOST=0.0.0.0

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_PUBLIC_KEY_PATH=../auth-service/keys/public.pem
```

### Development

```bash
# Start development server with hot reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type check
npm run type-check

# Lint
npm run lint

# Format
npm run format
```

### Production

```bash
# Build TypeScript
npm run build

# Start production server
npm start
```

### Docker

```bash
# Build image
docker build -t blockd-websocket-service .

# Run container
docker run -p 3003:3003 \
  -e REDIS_HOST=redis \
  -e JWT_PUBLIC_KEY_PATH=/keys/public.pem \
  blockd-websocket-service
```

## Client Integration

### JavaScript/TypeScript

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3003', {
  auth: {
    token: 'your-jwt-token',
  },
  transports: ['websocket', 'polling'],
});

// Connection events
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

// Join session
socket.emit('session:join', { session_id: 'session-123' }, (response) => {
  console.log('Joined session:', response);
});

// Listen for gaze updates
socket.on('gaze:update', (data) => {
  console.log('Gaze data:', data);
});

// Send chat message
socket.emit('chat:message', {
  session_id: 'session-123',
  message: 'Hello!',
});

// Handle errors
socket.on('error', (error) => {
  console.error('Error:', error);
});
```

### Python

```python
import socketio

sio = socketio.Client()

@sio.event
def connect():
    print('Connected')

@sio.event
def disconnect():
    print('Disconnected')

@sio.on('gaze:update')
def on_gaze_update(data):
    print('Gaze data:', data)

sio.connect('http://localhost:3003', auth={'token': 'your-jwt-token'})
sio.emit('session:join', {'session_id': 'session-123'})
sio.wait()
```

## Events

### Client → Server

| Event | Description | Payload |
|-------|-------------|---------|
| `session:join` | Join session room | `{ session_id: string }` |
| `session:leave` | Leave session room | `{ session_id: string }` |
| `pong` | Heartbeat response | `{ timestamp: number }` |
| `gaze:stream` | Stream gaze data | `{ session_id, gaze_x, gaze_y, ... }` |
| `security:event` | Report security event | `{ session_id, event_type, severity, ... }` |
| `chat:message` | Send chat message | `{ session_id, message }` |

### Server → Client

| Event | Description | Payload |
|-------|-------------|---------|
| `ping` | Heartbeat request | `{ timestamp: number }` |
| `session:state` | Session state update | `{ session_id, status, participants, ... }` |
| `participant:joined` | Participant joined | `{ user_id, role, timestamp }` |
| `participant:left` | Participant left | `{ user_id, timestamp }` |
| `security:alert` | Security event alert | `{ event_id, event_type, severity, ... }` |
| `gaze:update` | Gaze data update | `{ gaze_x, gaze_y, is_off_screen, ... }` |
| `chat:message` | Chat message received | `{ message, sender_id, timestamp }` |
| `error` | Error occurred | `{ message, code, details }` |

## Performance

### Requirements

- Support 500+ concurrent WebSocket connections
- Message latency < 50ms (p95)
- Heartbeat interval: 25s
- Gaze streaming: 10 Hz (throttled)
- Rate limit: 1000 events/minute per socket

### Benchmarks

Run load tests:

```bash
npm test -- load.test.ts
```

Expected results:
- 500 concurrent connections: ✓
- Average latency: < 50ms
- Memory usage: < 200MB per 100 connections

## Monitoring

### Health Check

```bash
curl http://localhost:3003/health
```

### Metrics

The service exposes the following metrics:

- Total connections
- Connections by role
- Room statistics
- Message buffer statistics
- Rate limit violations
- Heartbeat latency

Access metrics programmatically through handler functions.

## Security

### Authentication

All connections require valid JWT token:

```typescript
socket.io('http://localhost:3003', {
  auth: {
    token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
});
```

### Rate Limiting

- Default: 1000 events/minute per socket
- Configurable via `RATE_LIMIT_MAX_EVENTS`
- Auto-disconnect after 5 violations

### Security Events

High severity events trigger alerts:
- `critical`: Auto-termination consideration
- `high`: Email notification to interviewer
- `medium/low`: Logged and broadcasted

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED
```

**Solution**: Check server is running and port is correct.

### Authentication Failed

```
Error: Authentication token required
```

**Solution**: Ensure JWT token is passed in `auth` object or `Authorization` header.

### Redis Connection Error

```
Error: Redis connection failed
```

**Solution**: Verify Redis is running and configuration is correct.

### High Latency

**Symptoms**: Slow message delivery, delayed events

**Solutions**:
- Check network connectivity
- Verify Redis cluster health
- Monitor server resources
- Check client-side throttling

## Development

### Adding New Events

1. Define types in `types/socket.types.ts`
2. Create handler in `handlers/`
3. Register handler in `src/server.ts`
4. Add tests in `test/`

Example:

```typescript
// types/socket.types.ts
export interface MyEventData {
  session_id: string;
  data: string;
}

// handlers/my.handler.ts
export function setupMyHandler(io: Server): void {
  io.on('connection', (socket) => {
    socket.on('my:event', (data: MyEventData) => {
      // Handle event
    });
  });
}

// src/server.ts
import { setupMyHandler } from '../handlers/my.handler';
// ...
setupMyHandler(this.io);
```

### Testing

```bash
# Run all tests
npm test

# Run specific test file
npm test -- connection.test.ts

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Deployment

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: websocket-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: websocket-service
  template:
    metadata:
      labels:
        app: websocket-service
    spec:
      containers:
      - name: websocket-service
        image: blockd-websocket-service:latest
        ports:
        - containerPort: 3003
        env:
        - name: REDIS_HOST
          value: redis-cluster
        - name: NODE_ENV
          value: production
```

### Docker Compose

```yaml
version: '3.8'
services:
  websocket:
    build: .
    ports:
      - "3003:3003"
    environment:
      - REDIS_HOST=redis
      - NODE_ENV=production
    depends_on:
      - redis
```

## License

UNLICENSED - Proprietary

## Support

For issues and questions, contact the Blockd development team.
