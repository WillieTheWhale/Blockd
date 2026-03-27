# Blockd WebSocket Protocol Documentation

**Version**: 1.0.0
**Service**: Blockd WebSocket Service
**Technology**: Socket.io 4.x
**Last Updated**: 2025-11-24

## Table of Contents

1. [Overview](#overview)
2. [Connection URL](#connection-url)
3. [Authentication](#authentication)
4. [Connection Lifecycle](#connection-lifecycle)
5. [Client-to-Server Events](#client-to-server-events)
6. [Server-to-Client Events](#server-to-client-events)
7. [Session Room Management](#session-room-management)
8. [Gaze Data Streaming](#gaze-data-streaming)
9. [Security Event Reporting](#security-event-reporting)
10. [Chat Messaging](#chat-messaging)
11. [Heartbeat/Ping-Pong Mechanism](#heartbeatping-pong-mechanism)
12. [Error Handling](#error-handling)
13. [Reconnection Strategy](#reconnection-strategy)
14. [Code Examples](#code-examples)
15. [Performance Characteristics](#performance-characteristics)
16. [Rate Limiting](#rate-limiting)

---

## Overview

The Blockd WebSocket Service provides production-grade real-time bidirectional communication between interviewers, interviewees, and the Blockd interview platform. Built on Socket.io with Redis adapter for horizontal scaling, the service enables:

- Real-time event-based communication
- Secure JWT token authentication
- Interview session management
- Gaze tracking data streaming
- Security event broadcasting
- Chat messaging
- Connection health monitoring
- Automatic message buffering and delivery on reconnection
- Rate limiting and abuse protection

**Key Statistics**:
- Supports 500+ concurrent WebSocket connections
- Message latency: < 50ms (p95)
- Connection timeout: 45 seconds
- Ping interval: 25 seconds
- Gaze streaming rate: 10 Hz (server-side throttled from 30 Hz client)

---

## Connection URL

```
Production: wss://api.blockd.site/socket.io
Development: ws://localhost:3003/socket.io
```

Socket.io connection parameters:
- **Protocol**: WebSocket with fallback to polling
- **Port**: 3003 (default)
- **CORS**: Enabled (origins configured via `ALLOWED_ORIGINS` environment variable)
- **Max HTTP Buffer Size**: 1MB (1,000,000 bytes)

---

## Authentication

All WebSocket connections require JWT (JSON Web Token) authentication. The server verifies tokens using RS256 algorithm with a public key.

### Authentication Flow

#### Step 1: Client Connection with JWT Token

Pass the JWT token during Socket.io connection initialization using one of these methods:

**Method 1: Auth object (recommended)**
```javascript
const socket = io('wss://api.blockd.site', {
  auth: {
    token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

**Method 2: Authorization header**
```javascript
const socket = io('wss://api.blockd.site', {
  extraHeaders: {
    'Authorization': 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

**Method 3: Query parameter (fallback)**
```javascript
const socket = io('wss://api.blockd.site?token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...');
```

#### Step 2: Server Token Extraction and Verification

The server extracts the JWT token and performs the following verifications:

1. **JWT Signature**: Verified using RS256 algorithm with public key
2. **Token Expiry**: Ensures `exp` claim is valid (not expired)
3. **Issuer**: Validates `iss` claim matches `blockd-auth`
4. **Audience**: Validates `aud` claim matches `blockd-api`
5. **Payload Structure**: Validates required claims are present

#### Step 3: Token Payload Decoding

The server extracts the following claims from the JWT payload:

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string (UUID) | User ID |
| `email` | string | User email address |
| `role` | string | User role: `interviewer`, `interviewee`, or `admin` |
| `organization_id` | string (optional) | Organization identifier |
| `iat` | number | Issued at timestamp (Unix time) |
| `exp` | number | Expiration timestamp (Unix time) |

#### Step 4: Socket User Data Attachment

Upon successful authentication, the server attaches the following data to the socket:

```javascript
socket.data = {
  user_id: "550e8400-e29b-41d4-a716-446655440000",    // From 'sub' claim
  email: "user@example.com",                            // From 'email' claim
  role: "interviewer",                                  // From 'role' claim
  organization_id: "org-123456",                        // From 'organization_id' claim
  connected_at: 1732435200000,                          // Connection timestamp (ms)
  last_activity: 1732435200000                          // Last activity timestamp (ms)
}
```

#### Step 5: Connection Acceptance or Rejection

**Accepted**: Valid token → `connected` event emitted to client

**Rejected**: Invalid token with one of these reasons:
- No token provided
- Invalid token signature
- Token expired
- Invalid issuer or audience claim
- Malformed token payload

Error response (if rejected):
```json
{
  "message": "Authentication token required",
  "code": "AUTHENTICATION_ERROR"
}
```

---

## Connection Lifecycle

### On Connection

When a client successfully authenticates and connects:

1. Log connection with user details
2. Auto-join personal user room: `user:{user_id}`
3. Auto-join organization room: `org:{org_id}` (if applicable)
4. Auto-join admin room: `admin:all` (if user role is admin)
5. Flush any buffered messages from offline period
6. Emit `connected` event to client
7. Start heartbeat/ping interval (25 seconds)

### During Connection

While connected, the socket:

1. Processes incoming Socket.io events
2. Enforces rate limiting (1000 events/minute per socket)
3. Updates `last_activity` timestamp on each event
4. Receives periodic `ping` events (every 25 seconds)
5. Responds with `pong` events containing the timestamp
6. Broadcasts events to subscribed rooms
7. Receives `error` events when applicable

### On Disconnection

When a client disconnects:

1. Log disconnection with reason
2. Remove socket from all rooms (user, session, organization, admin)
3. Clear rate limiting state for socket
4. Stop heartbeat interval
5. Notify room participants of departure via `participant:left` event
6. Clean up socket resources
7. Begin message buffering for future reconnection (5 minute buffer)

---

## Client-to-Server Events

Events sent by the client to the server. All events may include an optional callback function for acknowledgements.

### session:join

**Description**: Join an interview session room

**Payload**:
```typescript
{
  session_id: string  // UUID of the interview session
}
```

**Acknowledgement Response**:
```typescript
{
  success: boolean,
  message?: string,              // Error message if success is false
  sessionState?: {
    session_id: string,
    status: string,              // "scheduled" | "in_progress" | "completed" | "cancelled"
    participants: Array<{
      user_id: string,
      email: string,
      role: string,               // "interviewer" | "interviewee"
      joined_at: string           // ISO 8601 timestamp
    }>,
    current_question?: {
      question_id: string,
      question_text: string,
      difficulty?: string,
      category?: string
    },
    started_at?: string,          // ISO 8601
    ends_at?: string              // ISO 8601
  }
}
```

**Authorization**: User must have access to the session (verified with session service)

**Side Effects**:
- Socket joins `session:{session_id}` room
- Other participants in room receive `participant:joined` event
- User receives current session state as `sessionState` in acknowledgement

**Example**:
```javascript
socket.emit('session:join',
  { session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv' },
  (response) => {
    if (response.success) {
      console.log('Joined session');
      console.log('Participants:', response.sessionState.participants);
    } else {
      console.error('Failed to join:', response.message);
    }
  }
);
```

---

### session:leave

**Description**: Leave an interview session room

**Payload**:
```typescript
{
  session_id: string  // UUID of the interview session
}
```

**Acknowledgement Response**:
```typescript
{
  success: boolean,
  message?: string
}
```

**Side Effects**:
- Socket leaves `session:{session_id}` room
- Other participants in room receive `participant:left` event with user_id and timestamp

**Example**:
```javascript
socket.emit('session:leave',
  { session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv' },
  (response) => {
    console.log('Left session:', response.success);
  }
);
```

---

### pong

**Description**: Heartbeat response to server ping (acknowledgement of connection health)

**Payload**:
```typescript
{
  timestamp: number  // Milliseconds from the original ping event
}
```

**Side Effects**:
- Update latency measurement (current time - timestamp)
- Reset missed pongs counter to 0
- Update connection quality metrics
- Update `last_activity` timestamp

**Example**:
```javascript
socket.on('ping', (data) => {
  socket.emit('pong', { timestamp: data.timestamp });
});
```

---

### gaze:stream

**Description**: Stream real-time gaze tracking data from the interviewee

**Payload**:
```typescript
{
  session_id: string,             // UUID of the interview session
  gaze_x: number,                 // 0-1, normalized horizontal position
  gaze_y: number,                 // 0-1, normalized vertical position
  is_off_screen: boolean,         // Whether gaze is outside visible area
  off_screen_direction?: string,  // Required if is_off_screen=true
                                  // "top" | "bottom" | "left" | "right" |
                                  // "top-left" | "top-right" |
                                  // "bottom-left" | "bottom-right"
  confidence: number,             // 0-1, confidence level of gaze tracking
  timestamp: string               // ISO 8601 timestamp of the gaze sample
}
```

**Client Behavior**:
- Clients capture gaze at 30 Hz from tracking device
- Clients emit at 30 Hz rate
- Server throttles to 10 Hz using `GazeThrottler`

**Validation Rules**:
- `gaze_x` and `gaze_y` must be between 0 and 1 (inclusive)
- `confidence` must be between 0 and 1 (inclusive)
- `off_screen_direction` is required if `is_off_screen` is true
- `session_id` must be a valid UUID
- Timestamp must be valid ISO 8601 format

**Authorization**: Only users with role `interviewee` can stream gaze data

**Rate Limiting**: Exempt from standard rate limiting (gaze events are high-frequency by design)

**Side Effects**:
- Server broadcasts to session participants as `gaze:update` event
- Server publishes to message queue (RabbitMQ) for storage in TimescaleDB
- Used for live monitoring by interviewer

**Example**:
```javascript
// Emit gaze data at 30 Hz
setInterval(() => {
  socket.emit('gaze:stream', {
    session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
    gaze_x: 0.5,                    // Center of screen
    gaze_y: 0.3,
    is_off_screen: false,
    confidence: 0.95,
    timestamp: new Date().toISOString()
  });
}, 1000 / 30);  // 30 Hz
```

---

### security:event

**Description**: Report a security event detected by the browser client (e.g., tab switch, copy-paste detected)

**Payload**:
```typescript
{
  session_id: string,      // UUID of the interview session
  event_type: string,      // See security event types below
  severity: string,        // "low" | "medium" | "high" | "critical"
  description: string,     // Human-readable description of the event
  metadata?: object,       // Optional additional context data
  timestamp: string        // ISO 8601 timestamp of event detection
}
```

**Supported Event Types**:
| Type | Description | Typical Severity |
|------|-------------|------------------|
| `tab_switch` | User switched to different browser tab | medium |
| `window_blur` | Browser window lost focus | low |
| `copy_paste` | Copy or paste operation detected | critical |
| `devtools_open` | Developer tools opened | high |
| `fullscreen_exit` | Exited fullscreen mode | medium |
| `multiple_monitors` | Multiple display detected | critical |
| `suspicious_activity` | Generic suspicious behavior | high |

**Side Effects by Severity**:
- **Low**: Log event, broadcast `security:alert` to session participants
- **Medium**: Log event, broadcast `security:alert`, track violation
- **High**: Log event, broadcast `security:alert`, notify admin room, send email alert
- **Critical**: All high actions + evaluate auto-termination rules

**Example**:
```javascript
socket.emit('security:event', {
  session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
  event_type: 'tab_switch',
  severity: 'medium',
  description: 'User switched to another browser tab',
  metadata: {
    tab_title: 'Google Search'
  },
  timestamp: new Date().toISOString()
});
```

---

### answer:submit

**Description**: Submit an answer to an interview question

**Payload**:
```typescript
{
  session_id: string,        // UUID of the interview session
  question_id: string,       // UUID of the question
  answer_text: string,       // The answer provided (1-2000 characters)
  time_taken_seconds: number // Seconds spent on this question
}
```

**Acknowledgement Response**:
```typescript
{
  success: boolean,
  answer_id?: string,        // UUID of stored answer (if successful)
  message?: string           // Error message if success is false
}
```

**Validation**:
- Answer text must be 1-2000 characters
- User must be in the session
- Session must be in "in_progress" status

**Side Effects**:
- Store answer in database
- Broadcast `answer:received` event to session participants
- Update session state with latest answer

**Example**:
```javascript
socket.emit('answer:submit',
  {
    session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
    question_id: 'q-999-888-777',
    answer_text: 'Here is my solution...',
    time_taken_seconds: 180
  },
  (response) => {
    if (response.success) {
      console.log('Answer submitted:', response.answer_id);
    } else {
      console.error('Failed to submit:', response.message);
    }
  }
);
```

---

### chat:message

**Description**: Send a chat message within an interview session

**Payload**:
```typescript
{
  session_id: string,  // UUID of the interview session
  message: string      // Chat message (1-2000 characters)
}
```

**Validation**:
- Message must be 1-2000 characters
- User must be in the session
- Message is sanitized (null bytes removed, whitespace normalized)

**Side Effects**:
- Store message in database
- Broadcast `chat:message` event to all session participants (including sender)
- Message receives unique `message_id` and timestamp

**Example**:
```javascript
socket.emit('chat:message', {
  session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
  message: 'I have a question about this topic.'
});
```

---

## Server-to-Client Events

Events sent by the server to the client.

### connected

**Description**: Connection successful acknowledgement

**Payload**: None (simple notification)

**When**: Immediately after authentication success

**Example**:
```javascript
socket.on('connected', () => {
  console.log('Successfully connected to Blockd');
});
```

---

### ping

**Description**: Heartbeat request from server to measure connection latency

**Payload**:
```typescript
{
  timestamp: number  // Milliseconds since Unix epoch
}
```

**Frequency**: Every 25 seconds (configurable via `PING_INTERVAL`)

**Expected Client Response**: Client should respond with `pong` event containing the same timestamp within 20 seconds

**Example**:
```javascript
socket.on('ping', (data) => {
  // Respond immediately with the timestamp
  socket.emit('pong', { timestamp: data.timestamp });
});
```

**Note**: Socket.io may handle ping/pong automatically depending on client library configuration. For explicit handling, listen for these events.

---

### session:state

**Description**: Current state of the interview session

**Payload**:
```typescript
{
  session_id: string,
  status: string,         // "scheduled" | "in_progress" | "completed" | "cancelled"
  participants: Array<{
    user_id: string,
    email: string,
    role: string,         // "interviewer" | "interviewee"
    joined_at: string,    // ISO 8601
    last_activity: string // ISO 8601
  }>,
  current_question?: {
    question_id: string,
    question_text: string,
    difficulty?: string,
    category?: string
  },
  started_at?: string,    // ISO 8601
  ends_at?: string        // ISO 8601
}
```

**When**: Sent when user successfully joins a session

**Example**:
```javascript
socket.on('session:state', (data) => {
  console.log('Session Status:', data.status);
  console.log('Participants:', data.participants);
});
```

---

### session:started

**Description**: Interview session has started

**Payload**:
```typescript
{
  session_id: string,
  started_at: string,     // ISO 8601 timestamp
  interviewer: {
    user_id: string,
    email: string,
    name?: string
  },
  interviewee: {
    user_id: string,
    email: string,
    name?: string
  }
}
```

**When**: Emitted to all session participants when the interviewer starts the session

**Example**:
```javascript
socket.on('session:started', (data) => {
  console.log('Session started at:', data.started_at);
  console.log('Interviewer:', data.interviewer.email);
});
```

---

### session:ended

**Description**: Interview session has ended

**Payload**:
```typescript
{
  session_id: string,
  ended_at: string,       // ISO 8601 timestamp
  reason?: string         // "completed" | "cancelled" | "timeout" | etc.
}
```

**When**: Emitted to all session participants when the session ends

**Example**:
```javascript
socket.on('session:ended', (data) => {
  console.log('Session ended:', data.reason);
  alert('The interview session has ended.');
});
```

---

### participant:joined

**Description**: Another participant has joined the session

**Payload**:
```typescript
{
  user_id: string,        // UUID of joining participant
  role: string,           // "interviewer" | "interviewee" | "admin"
  timestamp: string       // ISO 8601 timestamp of join
}
```

**When**: Broadcast to all session participants when someone joins

**Example**:
```javascript
socket.on('participant:joined', (data) => {
  console.log(`${data.role} joined at ${data.timestamp}`);
});
```

---

### participant:left

**Description**: A participant has left the session

**Payload**:
```typescript
{
  user_id: string,        // UUID of departing participant
  timestamp: string       // ISO 8601 timestamp of departure
}
```

**When**: Broadcast to remaining session participants when someone leaves

**Example**:
```javascript
socket.on('participant:left', (data) => {
  console.log(`Participant ${data.user_id} left`);
});
```

---

### security:alert

**Description**: Security event alert detected by the system

**Payload**:
```typescript
{
  event_id: string,       // UUID of the security event
  session_id: string,     // UUID of the session
  event_type: string,     // Type of security event (see security:event)
  severity: string,       // "low" | "medium" | "high" | "critical"
  description: string,    // Human-readable description
  timestamp: string       // ISO 8601 timestamp of event
}
```

**When**: Broadcast to session participants when security event is reported

**Typically Shown To**:
- All session participants receive all alerts
- Admin room receives high and critical severity alerts

**Example**:
```javascript
socket.on('security:alert', (data) => {
  if (data.severity === 'critical') {
    alert(`Critical security event: ${data.description}`);
  }
});
```

---

### gaze:update

**Description**: Real-time gaze tracking data update from interviewee

**Payload**:
```typescript
{
  session_id: string,             // UUID of the session
  gaze_x: number,                 // 0-1, normalized horizontal position
  gaze_y: number,                 // 0-1, normalized vertical position
  is_off_screen: boolean,
  off_screen_direction?: string,  // "top" | "bottom" | "left" | "right" | etc.
  confidence: number,             // 0-1, tracking confidence
  timestamp: string,              // ISO 8601
  user_id: string                 // UUID of interviewee
}
```

**Frequency**: 10 Hz (throttled by server from client's 30 Hz)

**When**: Broadcast to session participants (typically interviewer) when interviewee streams gaze data

**Example**:
```javascript
socket.on('gaze:update', (data) => {
  // Update UI with current gaze position
  updateGazeIndicator(data.gaze_x, data.gaze_y, data.confidence);
});
```

---

### question:asked

**Description**: New question asked in the session by interviewer

**Payload**:
```typescript
{
  session_id: string,
  question: {
    question_id: string,
    question_text: string,
    difficulty?: string,    // "easy" | "medium" | "hard"
    category?: string
  },
  asked_at: string         // ISO 8601 timestamp
}
```

**When**: Broadcast to session participants when interviewer asks a new question

**Example**:
```javascript
socket.on('question:asked', (data) => {
  console.log('New question:', data.question.question_text);
  displayQuestion(data.question);
});
```

---

### answer:received

**Description**: Answer received from interviewee

**Payload**:
```typescript
{
  session_id: string,
  answer_id: string,       // UUID of the stored answer
  question_id: string,
  interviewee_id: string,  // UUID of the interviewee
  timestamp: string        // ISO 8601
}
```

**When**: Broadcast to session participants when answer is submitted

**Example**:
```javascript
socket.on('answer:received', (data) => {
  console.log('Answer submitted for question:', data.question_id);
});
```

---

### chat:message

**Description**: Chat message received

**Payload**:
```typescript
{
  session_id: string,
  message: string,         // The chat message text
  sender_id: string,       // UUID of sender or "system"
  sender_role: string,     // "interviewer" | "interviewee" | "system"
  timestamp: string,       // ISO 8601
  message_id?: string      // UUID of the message
}
```

**When**: Broadcast to session participants when message is sent

**Example**:
```javascript
socket.on('chat:message', (data) => {
  addChatMessage({
    text: data.message,
    sender: data.sender_role,
    time: new Date(data.timestamp)
  });
});
```

---

### error

**Description**: Error occurred on the server

**Payload**:
```typescript
{
  message: string,        // Human-readable error description
  code: string,           // Machine-readable error code
  details?: object        // Optional additional context
}
```

**When**: Emitted when an error occurs during event processing

**Common Error Codes**:
- `AUTHENTICATION_ERROR`: JWT authentication failed
- `AUTHORIZATION_ERROR`: Insufficient permissions
- `SESSION_NOT_FOUND`: Session does not exist
- `SESSION_ACCESS_DENIED`: No access to session
- `RATE_LIMIT_EXCEEDED`: Too many events
- `INVALID_TOKEN`: Token signature or format invalid
- `VALIDATION_ERROR`: Invalid event payload
- `CONNECTION_ERROR`: Server-side connection issue

**Example**:
```javascript
socket.on('error', (data) => {
  console.error(`[${data.code}] ${data.message}`, data.details);
});
```

---

## Session Room Management

Socket.io uses rooms to manage message broadcasting. Blockd implements multiple room types:

### Room Types

#### User Room (`user:{user_id}`)

- **Format**: `user:550e8400-e29b-41d4-a716-446655440000`
- **Purpose**: Personal room for direct messaging to specific user
- **Auto-Join**: Yes (every socket joins on connection)
- **Use Case**: Direct notifications, administrative messages

#### Session Room (`session:{session_id}`)

- **Format**: `session:abc12345-def6-7890-ghij-klmnopqrstuv`
- **Purpose**: Interview session room for all participants
- **Auto-Join**: No (requires `session:join` event)
- **Join Event**: `session:join`
- **Leave Event**: `session:leave`
- **Use Case**: Session-specific events (participant notifications, gaze updates, messages)

#### Organization Room (`org:{organization_id}`)

- **Format**: `org:org-123456`
- **Purpose**: Organization-wide broadcasts
- **Auto-Join**: Yes (if user belongs to organization)
- **Use Case**: Organization announcements, member notifications

#### Admin Room (`admin:all`)

- **Format**: `admin:all`
- **Purpose**: Admin broadcasts and alerts
- **Auto-Join**: Yes (if user role is `admin`)
- **Use Case**: High/critical security alerts, system announcements

### Room Operations

#### Join Room

```typescript
// Client-side
socket.emit('session:join', { session_id: 'session-id' });

// Server-side (internal)
socket.join(`session:${sessionId}`);
// RoomManager tracks participant
// Notify existing participants with participant:joined
```

#### Leave Room

```typescript
// Client-side
socket.emit('session:leave', { session_id: 'session-id' });

// Server-side (internal)
socket.leave(`session:${sessionId}`);
// RoomManager removes participant
// Notify remaining participants with participant:left
// Auto-cleanup removes empty rooms
```

#### Broadcast to Room

```typescript
// Broadcast to all in room (including sender)
io.to(`session:${sessionId}`).emit('event', data);

// Broadcast to room excluding sender
socket.to(`session:${sessionId}`).emit('event', data);

// Broadcast excluding specific user
io.to(`session:${sessionId}`)
  .except(userSocket)
  .emit('event', data);
```

---

## Gaze Data Streaming

The gaze streaming protocol enables real-time eye-tracking monitoring during interviews.

### Data Flow

```
1. Interviewee's browser captures gaze at 30 Hz
   ↓
2. Client emits 'gaze:stream' events
   ↓
3. Server receives events in WebSocket handler
   ↓
4. GazeThrottler reduces to 10 Hz
   ↓
5. Server broadcasts 'gaze:update' to session room
   ↓
6. Server publishes to RabbitMQ message queue
   ↓
7. TimescaleDB stores for historical analysis
```

### Client Emission (30 Hz)

```javascript
// Emit gaze data 30 times per second
const gazeInterval = setInterval(() => {
  const gazeData = tracker.getGazePosition();  // From eye-tracking device

  socket.emit('gaze:stream', {
    session_id: sessionId,
    gaze_x: gazeData.x / screenWidth,      // Normalize to 0-1
    gaze_y: gazeData.y / screenHeight,
    is_off_screen: gazeData.x < 0 || gazeData.x > screenWidth ||
                   gazeData.y < 0 || gazeData.y > screenHeight,
    off_screen_direction: calculateDirection(gazeData),
    confidence: gazeData.confidence,
    timestamp: new Date().toISOString()
  });
}, 1000 / 30);  // 33.33ms interval
```

### Server Reception and Throttling (10 Hz)

The server uses `GazeThrottler` to reduce the update frequency:
- Client sends 30 events/second
- Server broadcasts only 10 events/second to other participants
- This prevents overwhelming network bandwidth and UI rendering

### Validation

The server validates gaze data:
- `gaze_x` and `gaze_y` must be 0-1 (normalized)
- `confidence` must be 0-1
- `off_screen_direction` required if `is_off_screen` is true
- Invalid data is rejected with `VALIDATION_ERROR`

### Authorization

Only users with role `interviewee` can stream gaze data. Interviewers receive gaze updates in real-time.

### Storage

The server publishes validated gaze data to RabbitMQ for:
- Historical storage in TimescaleDB
- Analysis and reporting
- Candidate behavior metrics

---

## Security Event Reporting

The security event system detects and reports potential cheating or policy violations during interviews.

### Event Types

| Type | Detection | Severity | Action |
|------|-----------|----------|--------|
| `tab_switch` | User switched to different tab | medium | Track and notify |
| `window_blur` | Browser lost focus | low | Log only |
| `copy_paste` | Copy/paste attempted | critical | Alert and evaluate termination |
| `devtools_open` | Developer tools opened | high | Alert admin |
| `fullscreen_exit` | Exited fullscreen | medium | Track |
| `multiple_monitors` | Multiple displays detected | critical | Alert and evaluate termination |
| `suspicious_activity` | Generic suspicious behavior | high | Alert |

### Severity Levels and Actions

**Low Severity**
- Log event to database
- Broadcast `security:alert` to session participants
- Example: Brief window blur

**Medium Severity**
- Log event to database
- Broadcast `security:alert` to session participants
- Track violation count
- Example: Tab switch

**High Severity**
- Log event to database
- Broadcast `security:alert` to session participants
- Broadcast to admin room
- Send email alert to interviewer
- Example: DevTools opened

**Critical Severity**
- Perform all high severity actions
- Broadcast to admin room
- Evaluate auto-termination rules
- Example: Copy/paste detected, multiple monitors detected

### Client Detection (Example Implementation)

```javascript
// Detect tab switch
window.addEventListener('blur', () => {
  socket.emit('security:event', {
    session_id: sessionId,
    event_type: 'window_blur',
    severity: 'low',
    description: 'Browser window lost focus',
    timestamp: new Date().toISOString()
  });
});

// Detect copy-paste
document.addEventListener('copy', (e) => {
  socket.emit('security:event', {
    session_id: sessionId,
    event_type: 'copy_paste',
    severity: 'critical',
    description: 'Copy operation detected',
    metadata: { operation: 'copy' },
    timestamp: new Date().toISOString()
  });
});

// Detect DevTools
setInterval(() => {
  const start = performance.now();
  debugger;
  const end = performance.now();

  if (end - start > 100) {  // Debugger paused execution
    socket.emit('security:event', {
      session_id: sessionId,
      event_type: 'devtools_open',
      severity: 'high',
      description: 'Developer tools detected',
      timestamp: new Date().toISOString()
    });
  }
}, 1000);
```

### Workflow

1. Client detects security event (tab switch, copy-paste, etc.)
2. Client emits `security:event` to server
3. Server validates and stores in database
4. Server broadcasts `security:alert` to session participants
5. For high/critical: broadcast to admin room
6. For critical: evaluate auto-termination policies

---

## Chat Messaging

The chat system enables real-time communication between interview participants.

### Message Constraints

- **Length**: 1-2000 characters
- **Sanitization**: Null bytes removed, whitespace normalized
- **Storage**: Persisted in database for session history

### Message Payload

Client emission:
```typescript
{
  session_id: string,
  message: string
}
```

Server broadcast:
```typescript
{
  session_id: string,
  message: string,
  sender_id: string,              // UUID or "system"
  sender_role: string,            // "interviewer" | "interviewee" | "system"
  timestamp: string,              // ISO 8601
  message_id: string              // UUID, assigned by server
}
```

### Example Flow

```javascript
// Client sends message
socket.emit('chat:message', {
  session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
  message: 'Can you clarify the requirements?'
});

// All participants receive
socket.on('chat:message', (data) => {
  chatUI.addMessage({
    from: data.sender_role === 'interviewer' ? 'Interviewer' : 'You',
    text: data.message,
    time: new Date(data.timestamp)
  });
});
```

### Validation

Server validates:
- Message is between 1 and 2000 characters
- User is in the session
- Session is active
- Message format is valid

---

## Heartbeat/Ping-Pong Mechanism

The heartbeat mechanism monitors connection health and latency.

### Configuration

- **Ping Interval**: 25 seconds (every 25000ms)
- **Ping Timeout**: 20 seconds (20000ms wait for pong response)
- **Missed Pongs Threshold**: 3 consecutive missed pongs triggers disconnect

### Ping-Pong Flow

```
Server                      Client
  |                           |
  |--- ping (timestamp) ----->|
  |                           |
  |                      (record timestamp)
  |                           |
  |<---- pong (timestamp) ----|
  |                           |
  (calculate latency)
  (update connection quality)
  |
  (wait 25 seconds)
  |
  |--- ping (timestamp) ----->|
  ...
```

### Latency Calculation

```javascript
clientLatency = currentTime - pongTimestamp;
// Example: 45ms latency
```

### Connection Quality Assessment

| Latency Range | Quality | Status |
|---------------|---------|--------|
| < 50ms | Excellent | Optimal |
| 50-150ms | Good | Normal |
| 150-300ms | Fair | Acceptable |
| > 300ms | Poor | Warning |
| No pong (3x) | Disconnected | Auto-disconnect |

### Example Handling

```javascript
// Automatic (Socket.io handles this):
socket.on('ping', (data) => {
  socket.emit('pong', { timestamp: data.timestamp });
});

// Manual implementation if needed:
let missedPongs = 0;
let latencySum = 0;
let latencyCount = 0;

socket.on('ping', (data) => {
  socket.emit('pong', { timestamp: data.timestamp });
  missedPongs = 0;  // Reset counter
});

socket.on('pong', (data) => {
  const latency = Date.now() - data.timestamp;
  latencySum += latency;
  latencyCount++;

  console.log(`Latency: ${latency}ms`);
  console.log(`Average: ${Math.round(latencySum / latencyCount)}ms`);
});

// Server-side timeout detection
socket.on('pong_timeout', () => {
  missedPongs++;
  if (missedPongs >= 3) {
    console.log('Connection lost, reconnecting...');
  }
});
```

---

## Error Handling

### Error Response Format

All errors follow this format:

```typescript
{
  message: string,        // Human-readable error description
  code: string,           // Machine-readable error code
  details?: object        // Optional additional context
}
```

### Error Codes and Handling

#### AUTHENTICATION_ERROR (HTTP 401)

**Cause**: Missing or invalid JWT token

**Handling**:
```javascript
socket.on('error', (error) => {
  if (error.code === 'AUTHENTICATION_ERROR') {
    // Redirect to login
    window.location.href = '/login';
  }
});
```

**Recovery**: User must obtain new valid JWT token and reconnect

#### AUTHORIZATION_ERROR (HTTP 403)

**Cause**: User lacks permissions for the action

**Handling**:
```javascript
socket.on('error', (error) => {
  if (error.code === 'AUTHORIZATION_ERROR') {
    console.error('Permission denied:', error.message);
    // Show error to user, don't retry
  }
});
```

**Recovery**: None (user doesn't have permission)

#### SESSION_NOT_FOUND (HTTP 404)

**Cause**: Session ID doesn't exist or was deleted

**Handling**:
```javascript
socket.emit('session:join', { session_id }, (response) => {
  if (!response.success) {
    if (response.code === 'SESSION_NOT_FOUND') {
      alert('Session not found');
    }
  }
});
```

**Recovery**: Verify session ID and retry

#### SESSION_ACCESS_DENIED (HTTP 403)

**Cause**: User is not a participant in the session

**Handling**: Same as AUTHORIZATION_ERROR - user cannot join

#### RATE_LIMIT_EXCEEDED (HTTP 429)

**Cause**: Too many events sent in time window (> 1000 events/minute)

**Handling**:
```javascript
socket.on('error', (error) => {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    console.warn('Too many events, backing off');
    // Slow down event emission
    pauseEventEmission(5000);  // 5 second pause
  }
});
```

**Recovery**:
- Reduce event emission rate
- Track violation count
- Auto-disconnect after 5 violations

#### INVALID_TOKEN (HTTP 401)

**Cause**: JWT signature invalid, expired, or malformed

**Handling**: Same as AUTHENTICATION_ERROR

**Recovery**: Refresh token and reconnect

#### VALIDATION_ERROR (HTTP 400)

**Cause**: Event payload doesn't match schema

**Handling**:
```javascript
socket.emit('chat:message', { session_id, message }, (response) => {
  if (response.code === 'VALIDATION_ERROR') {
    console.error('Invalid message:', response.details);
  }
});
```

**Recovery**: Fix payload and retry with correct format

#### CONNECTION_ERROR (HTTP 500)

**Cause**: Server-side connection or database issue

**Handling**:
```javascript
socket.on('error', (error) => {
  if (error.code === 'CONNECTION_ERROR') {
    console.error('Server error, retrying...');
    // Will trigger automatic reconnection
  }
});
```

**Recovery**: Automatic reconnection with exponential backoff

#### REDIS_CONNECTION_ERROR (HTTP 500)

**Cause**: Redis adapter connection failed

**Handling**: Same as CONNECTION_ERROR

**Recovery**: Automatic reconnection, degraded mode operation possible

### Error Prevention Best Practices

```javascript
// 1. Always validate before sending
if (message.length < 1 || message.length > 2000) {
  console.error('Message length invalid');
  return;
}

// 2. Handle acknowledgement responses
socket.emit('session:join', { session_id }, (response) => {
  if (!response.success) {
    console.error('Join failed:', response.message);
  }
});

// 3. Listen for error events
socket.on('error', (error) => {
  console.error(`[${error.code}] ${error.message}`);
});

// 4. Monitor connection state
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

// 5. Implement retry logic
let retryCount = 0;
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server disconnected intentionally, don't retry
    console.log('Server disconnected');
  } else {
    // Network issue, will auto-retry
    console.log('Will reconnect...');
  }
});
```

---

## Reconnection Strategy

Socket.io provides built-in reconnection with exponential backoff. The Blockd service integrates message buffering for offline periods.

### Reconnection Configuration

- **Max Attempts**: 10
- **Initial Delay**: 1000ms (1 second)
- **Max Delay**: 30000ms (30 seconds)
- **Backoff Multiplier**: 2
- **Jitter**: ±20% random variation on each delay

### Reconnection Attempt Schedule

| Attempt | Delay | Cumulative Time |
|---------|-------|-----------------|
| 1 | 0ms (immediate) | 0s |
| 2 | ~1000ms ±200ms | ~1s |
| 3 | ~2000ms ±400ms | ~3s |
| 4 | ~4000ms ±800ms | ~7s |
| 5 | ~8000ms ±1600ms | ~15s |
| 6 | ~16000ms ±3200ms | ~31s |
| 7-10 | ~30000ms ±6000ms (capped) | ~31s each |

**Total maximum reconnection time**: ~151 seconds (2.5 minutes)

### Delay Calculation with Jitter

```javascript
// Exponential backoff with jitter
function calculateDelay(attempt) {
  const baseDelay = Math.min(
    initialDelay * Math.pow(backoffMultiplier, attempt - 1),
    maxDelay
  );

  // Add ±20% jitter
  const jitterAmount = baseDelay * 0.2;
  const randomJitter = (Math.random() - 0.5) * 2 * jitterAmount;

  return baseDelay + randomJitter;
}

// Example: attempt 5
// baseDelay = 1000 * 2^4 = 16000ms
// jitter = ±3200ms
// actual delay = 16000 ± 3200ms range
```

### Message Buffering on Reconnection

The server maintains a message buffer for each user:

- **Buffer Capacity**: 100 messages per user
- **Buffer TTL**: 5 minutes (300,000ms)
- **Priority Levels**: critical (3), high (2), normal (1), low (0)

### Reconnection Flow

```
1. Network disconnection detected
   ↓
2. Client starts reconnection attempts with exponential backoff
   ↓
3. After ~1-2 seconds: Try to reconnect (attempt 1)
   ↓
4. Success? Yes → Socket connects, re-authenticates
   ↓
5. Server verifies JWT token
   ↓
6. Server retrieves buffered messages for user
   ↓
7. Server flushes buffer to reconnected socket
   ↓
8. Client receives buffered events
   ↓
9. Normal operation resumes
```

### Buffer Flushing Strategy

When a user reconnects:

1. **Trigger**: Socket reconnects and authenticates
2. **Order**: Messages delivered by priority (high first), then chronological
3. **Delivery**: Each message emitted as separate event to socket
4. **Cleanup**: Buffer cleared after successful delivery

### Example Implementation

```javascript
const socket = io('wss://api.blockd.site', {
  auth: { token: jwtToken },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  reconnectionAttempts: 10
});

socket.on('connect', () => {
  console.log('Connected');
  reconnectAttempt = 0;
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);

  if (reason === 'io server disconnect') {
    // Server explicitly disconnected
    console.log('Server disconnected');
  } else {
    // Network issue or client closed
    console.log('Will automatically reconnect...');
  }
});

socket.on('reconnect_attempt', () => {
  console.log('Reconnection attempt...');
});

socket.on('reconnect', () => {
  console.log('Successfully reconnected');
});

socket.on('reconnect_failed', () => {
  console.log('Reconnection failed after all attempts');
  // Prompt user to manually reconnect
});
```

---

## Code Examples

### Basic Connection

```javascript
import { io } from 'socket.io-client';

// Connect with JWT token
const socket = io('wss://api.blockd.site', {
  auth: {
    token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
  },
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10
});

socket.on('connected', () => {
  console.log('Successfully authenticated and connected');
});

socket.on('error', (error) => {
  console.error('Connection error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

### Join Interview Session

```javascript
socket.emit('session:join',
  { session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv' },
  (response) => {
    if (response.success) {
      console.log('Joined session');
      console.log('Status:', response.sessionState.status);
      console.log('Participants:', response.sessionState.participants);
    } else {
      console.error('Failed to join:', response.message);
    }
  }
);
```

### Listen for Session Events

```javascript
socket.on('participant:joined', (data) => {
  console.log(`${data.role} joined at ${data.timestamp}`);
});

socket.on('participant:left', (data) => {
  console.log(`Participant ${data.user_id} left`);
});

socket.on('session:started', (data) => {
  console.log('Session started by:', data.interviewer.email);
});

socket.on('session:ended', (data) => {
  console.log('Session ended:', data.reason);
});
```

### Send and Receive Chat Messages

```javascript
// Send message
socket.emit('chat:message', {
  session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
  message: 'Can you explain this concept?'
});

// Receive messages
socket.on('chat:message', (data) => {
  console.log(`${data.sender_role}: ${data.message}`);
  console.log(`Sent at: ${data.timestamp}`);
});
```

### Stream Gaze Data (Interviewee)

```javascript
// Assuming access to eye-tracking data
const gazeDataStream = getGazeTracker();

const gazeInterval = setInterval(() => {
  const gaze = gazeDataStream.getPosition();

  socket.emit('gaze:stream', {
    session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
    gaze_x: gaze.x / window.innerWidth,     // Normalize 0-1
    gaze_y: gaze.y / window.innerHeight,
    is_off_screen: gaze.x < 0 || gaze.x > window.innerWidth ||
                   gaze.y < 0 || gaze.y > window.innerHeight,
    off_screen_direction: gaze.offScreenDirection,
    confidence: gaze.confidence,
    timestamp: new Date().toISOString()
  });
}, 1000 / 30);  // 30 Hz

// Stop when session ends
socket.on('session:ended', () => {
  clearInterval(gazeInterval);
});
```

### Monitor Gaze Data (Interviewer)

```javascript
let gazeHistory = [];

socket.on('gaze:update', (data) => {
  gazeHistory.push({
    x: data.gaze_x,
    y: data.gaze_y,
    confidence: data.confidence,
    timestamp: new Date(data.timestamp)
  });

  // Keep only last 5 seconds of data
  const fiveSecondsAgo = Date.now() - 5000;
  gazeHistory = gazeHistory.filter(g => g.timestamp > fiveSecondsAgo);

  // Update visualization
  updateGazeVisualization(gazeHistory);

  // Alert if low confidence
  if (data.confidence < 0.5) {
    console.warn('Low gaze tracking confidence');
  }
});
```

### Report Security Event

```javascript
// Detect and report tab switch
window.addEventListener('blur', () => {
  socket.emit('security:event', {
    session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
    event_type: 'tab_switch',
    severity: 'medium',
    description: 'User switched to another browser tab',
    timestamp: new Date().toISOString()
  });
});

// Listen for security alerts
socket.on('security:alert', (data) => {
  console.warn(`Security Alert [${data.severity}]: ${data.description}`);

  if (data.severity === 'critical') {
    // Show prominent alert
    alert('Critical security violation detected');
  }
});
```

### Submit Answer

```javascript
socket.emit('answer:submit',
  {
    session_id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
    question_id: 'q-999-888-777',
    answer_text: 'Here is my detailed solution to the problem...',
    time_taken_seconds: 300  // 5 minutes
  },
  (response) => {
    if (response.success) {
      console.log('Answer submitted:', response.answer_id);
      showNotification('Answer submitted successfully');
    } else {
      console.error('Failed to submit:', response.message);
      showError('Could not submit answer');
    }
  }
);

// Listen for confirmation
socket.on('answer:received', (data) => {
  console.log('Your answer was received');
});
```

### Heartbeat Monitoring

```javascript
let latencyHistory = [];

socket.on('ping', (data) => {
  // Respond immediately
  socket.emit('pong', { timestamp: data.timestamp });
});

// Track latency from pong responses
socket.on('pong', (data) => {
  const latency = Date.now() - data.timestamp;
  latencyHistory.push(latency);

  // Keep only last 100 pongs
  if (latencyHistory.length > 100) {
    latencyHistory.shift();
  }

  // Calculate average
  const avgLatency = latencyHistory.reduce((a, b) => a + b) / latencyHistory.length;

  console.log(`Latency: ${latency}ms, Average: ${Math.round(avgLatency)}ms`);

  // Alert if degraded
  if (avgLatency > 300) {
    console.warn('Connection quality degraded');
  }
});
```

### Error Handling Best Practices

```javascript
socket.on('error', (error) => {
  switch (error.code) {
    case 'AUTHENTICATION_ERROR':
      console.error('Auth failed, redirecting to login');
      window.location.href = '/login';
      break;

    case 'AUTHORIZATION_ERROR':
      console.error('Insufficient permissions');
      showError('You do not have permission for this action');
      break;

    case 'SESSION_NOT_FOUND':
      console.error('Session does not exist');
      showError('Interview session not found');
      break;

    case 'RATE_LIMIT_EXCEEDED':
      console.warn('Too many events, backing off');
      pauseEventEmission(5000);
      break;

    case 'CONNECTION_ERROR':
    case 'REDIS_CONNECTION_ERROR':
      console.error('Server error, will retry');
      // Automatic reconnection will be attempted
      break;

    default:
      console.error('Unknown error:', error.message);
  }
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

socket.on('reconnect_failed', () => {
  console.error('Failed to reconnect after all attempts');
  showError('Failed to reconnect. Please refresh the page.');
});
```

### Python Example (socket.io-client)

```python
import socketio
import time

sio = socketio.Client()

@sio.event
def connect():
    print('Connected to Blockd')

@sio.event
def connected():
    print('Successfully authenticated')

@sio.event
def disconnect():
    print('Disconnected')

@sio.on('participant:joined')
def on_participant_joined(data):
    print(f"Participant {data['user_id']} joined")

@sio.on('gaze:update')
def on_gaze_update(data):
    print(f"Gaze: {data['gaze_x']}, {data['gaze_y']}")

@sio.on('chat:message')
def on_chat_message(data):
    print(f"{data['sender_role']}: {data['message']}")

@sio.on('error')
def on_error(data):
    print(f"Error [{data['code']}]: {data['message']}")

# Connect with JWT token
token = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
sio.connect('wss://api.blockd.site',
            auth={'token': token},
            transports=['websocket'])

# Join session
sio.emit('session:join', {'session_id': 'session-id'})

# Send chat message
sio.emit('chat:message', {
    'session_id': 'session-id',
    'message': 'Hello from Python!'
})

sio.wait()
```

---

## Performance Characteristics

### Performance Requirements

| Metric | Target |
|--------|--------|
| Concurrent Connections | 500+ simultaneous |
| Message Latency (p95) | < 50ms |
| Message Latency (p99) | < 100ms |
| Heartbeat Interval | 25 seconds |
| Gaze Streaming Rate | 10 Hz (server-side throttled) |
| Rate Limit | 1000 events/minute per socket |

### Resource Usage Benchmarks

#### 100 Concurrent Connections
- Memory Usage: ~50MB
- CPU Usage: ~5%
- Average Latency: ~15ms

#### 500 Concurrent Connections
- Memory Usage: ~200MB
- CPU Usage: ~20%
- Average Latency: ~30ms

### Scaling

The service supports horizontal scaling:

- **Multiple Instances**: Deploy multiple WebSocket server instances
- **Redis Adapter**: Socket.io Redis adapter handles cross-instance communication
- **Load Balancing**: Sticky sessions recommended but not required
- **Session Affinity**: Redis ensures message delivery across instances

### Network Optimization

- **Max HTTP Buffer Size**: 1MB (1,000,000 bytes) per message
- **Gaze Throttling**: Server-side 10 Hz limit prevents bandwidth saturation
- **Message Batching**: Multiple events can be sent in single frame
- **Connection Pooling**: Redis connection pool for efficiency

---

## Rate Limiting

The WebSocket service enforces per-socket rate limiting to prevent abuse and resource exhaustion.

### Configuration

- **Max Events**: 1000 events per minute
- **Check Interval**: 1000ms (1 second)
- **Violation Threshold**: 5 consecutive violations trigger disconnect

### Sliding Window Algorithm

```
Window: 60 seconds (1 minute)
Count events within window
If count > 1000: Rate limited
Events move out of window as time passes
```

### Enforcement

- **Per Socket**: Each connection has independent rate limit
- **On Exceed**: Emit `RATE_LIMIT_EXCEEDED` error, block event processing
- **On Violations**: Track consecutive violations
- **Auto-Disconnect**: Disconnect after 5 consecutive violations within 60 seconds

### Exemptions

The following events are exempt from rate limiting:

- `ping` / `pong` (heartbeat)
- `connect` / `disconnect` (lifecycle)
- Authentication handshakes

### Recovery

Good behavior reduces violation counter:

- **Condition**: Event rate drops below 50% of limit (< 500/min)
- **Action**: Decrement violation counter by 1
- **Recovery Time**: ~10 seconds of good behavior (5 decrements needed)

### Example Handling

```javascript
let rateLimitErrors = 0;

socket.on('error', (error) => {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    rateLimitErrors++;
    console.warn('Rate limited, reducing event rate');

    // Exponential backoff on rate limited events
    const backoffMs = Math.pow(2, rateLimitErrors) * 1000;

    // Stop emitting events temporarily
    pauseEventEmission(backoffMs);

    // Will reset if we hear from the server
  }
});

socket.on('chat:message', (data) => {
  // Receiving messages means rate limiting has lifted
  rateLimitErrors = 0;
});
```

---

## Appendix: Environment Variables

The WebSocket service is configured via environment variables:

```
# Server
NODE_ENV=production                    # development | production
PORT=3003
HOST=0.0.0.0

# CORS
ALLOWED_ORIGINS=https://blockd.site   # Comma-separated list
CORS_CREDENTIALS=true

# Socket.io
TRANSPORTS=websocket,polling
PING_INTERVAL=25000                    # milliseconds
PING_TIMEOUT=20000                     # milliseconds
MAX_HTTP_BUFFER_SIZE=1000000           # bytes
CONNECT_TIMEOUT=45000                  # milliseconds

# Redis
REDIS_HOST=redis-cluster
REDIS_PORT=6379
REDIS_PASSWORD=                        # Leave empty if no auth
REDIS_DB=0
REDIS_KEY_PREFIX=blockd:ws
REDIS_RETRY_STRATEGY=exponential       # Exponential backoff

# JWT
JWT_PUBLIC_KEY_PATH=/keys/public.pem
JWT_ALGORITHM=RS256
JWT_ISSUER=blockd-auth
JWT_AUDIENCE=blockd-api

# Rate Limiting
RATE_LIMIT_MAX_EVENTS=1000             # events per minute
RATE_LIMIT_CHECK_INTERVAL=1000         # milliseconds
RATE_LIMIT_VIOLATIONS_THRESHOLD=5

# Message Buffering
MESSAGE_BUFFER_MAX_SIZE=100            # messages per user
MESSAGE_BUFFER_MAX_AGE_MS=300000       # 5 minutes

# Reconnection
RECONNECT_MAX_ATTEMPTS=10
RECONNECT_INITIAL_DELAY=1000           # milliseconds
RECONNECT_MAX_DELAY=30000              # milliseconds

# Gaze
GAZE_THROTTLE_HZ=10                    # Server-side throttle rate

# Logging
LOG_LEVEL=info                         # debug | info | warn | error
LOG_FORMAT=json                        # json | pretty
```

---

## Support and Resources

For detailed implementation examples and source code, refer to:
- `/backend/websocket-service/README.md`

For issues or questions regarding the WebSocket protocol, contact the Blockd development team.

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-24
**Service Version**: 1.0.0
**Technology**: Socket.io 4.x, Node.js 24.11.0 LTS, TypeScript 5.9.3
