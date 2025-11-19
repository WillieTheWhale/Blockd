# Blockd WebSocket Protocol Documentation

## Overview

The Blockd WebSocket protocol enables real-time bidirectional communication between the CEF browser client and the backend monitoring services. All messages are JSON-formatted and follow a consistent structure.

## Connection

### Endpoint

```
wss://api.blockd.io/ws
```

### Connection Parameters

The WebSocket connection requires a `session_id` query parameter:

```
wss://api.blockd.io/ws?session_id=<uuid>
```

The session ID is obtained from the authentication service (Agent 6) and corresponds to an active interview session in the database.

### SSL/TLS

All connections use WebSocket Secure (wss://) with TLS 1.2 or higher. Certificate validation is enforced.

## Message Format

### Client to Server Messages

All messages sent from the client to the server follow this structure:

```json
{
  "type": "MESSAGE_TYPE",
  "payload": {
    // Event-specific data
  },
  "timestamp": 1234567890123,
  "session_id": "uuid-here"
}
```

**Fields:**
- `type` (string, required): The message type identifier
- `payload` (object, required): Event-specific data
- `timestamp` (integer, required): Unix timestamp in milliseconds
- `session_id` (string, required): Session UUID

### Server to Client Messages

Messages from the server follow this structure:

```json
{
  "type": "MESSAGE_TYPE",
  "payload": {
    // Command-specific data
  }
}
```

**Fields:**
- `type` (string, required): The message type identifier
- `payload` (object, required): Command-specific data

## Client Message Types

### CLIENT_CONNECTED

Sent immediately after establishing the WebSocket connection.

```json
{
  "type": "CLIENT_CONNECTED",
  "payload": {
    "session_id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "timestamp": 1699564800000,
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### EYE_TRACKING_DATA

Eye tracking coordinates and confidence level.

```json
{
  "type": "EYE_TRACKING_DATA",
  "payload": {
    "x": 0.5,
    "y": 0.3,
    "confidence": 0.85
  },
  "timestamp": 1699564801000,
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Payload Fields:**
- `x` (float, 0-1): Normalized horizontal gaze position
- `y` (float, 0-1): Normalized vertical gaze position
- `confidence` (float, 0-1): Tracking confidence level

**Frequency:** Sent at 30 Hz (every 33ms) during active tracking

### KEYSTROKE_EVENT

Individual keystroke with timing information.

```json
{
  "type": "KEYSTROKE_EVENT",
  "payload": {
    "key": "a",
    "timestamp": 1699564802000,
    "duration": 150
  },
  "timestamp": 1699564802000,
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Payload Fields:**
- `key` (string): Key identifier (single character or special key name)
- `timestamp` (integer): Key press timestamp in milliseconds
- `duration` (integer): Key press duration in milliseconds

**Frequency:** Sent on each key press/release

### SCREEN_CHANGE

Display configuration changes or window focus changes.

```json
{
  "type": "SCREEN_CHANGE",
  "payload": {
    "monitor_count": 2,
    "active_window": "Google Meet - Interview Room"
  },
  "timestamp": 1699564803000,
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Payload Fields:**
- `monitor_count` (integer): Number of active monitors
- `active_window` (string): Title of the currently active window

**Frequency:** Sent on change detection (event-driven)

### HEARTBEAT

Keep-alive message to maintain connection.

```json
{
  "type": "HEARTBEAT",
  "payload": {},
  "timestamp": 1699564804000,
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Frequency:** Every 30 seconds

## Server Message Types

### ALERT

Notification about detected suspicious activity.

```json
{
  "type": "ALERT",
  "payload": {
    "severity": "high",
    "message": "Multiple monitors detected",
    "action": "warn"
  }
}
```

**Payload Fields:**
- `severity` (string): Alert severity level ("low", "medium", "high", "critical")
- `message` (string): Human-readable alert message
- `action` (string): Recommended action ("warn", "pause", "terminate")

### SESSION_END

Command to end the current session.

```json
{
  "type": "SESSION_END",
  "payload": {
    "reason": "Interview completed",
    "redirect_url": "https://app.blockd.io/interview/complete"
  }
}
```

**Payload Fields:**
- `reason` (string): Reason for session termination
- `redirect_url` (string, optional): URL to redirect the browser to

### CONFIG_UPDATE

Dynamic configuration update.

```json
{
  "type": "CONFIG_UPDATE",
  "payload": {
    "eye_tracking_frequency": 60,
    "enable_keystroke_monitoring": true
  }
}
```

**Payload Fields:**
- Dynamic fields based on configuration parameters

## Connection Lifecycle

### 1. Initial Connection

```
Client -> Server: WebSocket Handshake (wss://api.blockd.io/ws?session_id=xxx)
Server -> Client: WebSocket Handshake Response
Client -> Server: CLIENT_CONNECTED message
```

### 2. Active Session

```
Client -> Server: EYE_TRACKING_DATA (30 Hz)
Client -> Server: KEYSTROKE_EVENT (on key press)
Client -> Server: SCREEN_CHANGE (on change)
Client -> Server: HEARTBEAT (every 30s)

Server -> Client: ALERT (as needed)
Server -> Client: CONFIG_UPDATE (as needed)
```

### 3. Disconnection

**Normal:**
```
Server -> Client: SESSION_END
Client -> Server: WebSocket Close Frame
```

**Abnormal:**
```
Network interruption or error
Client: Automatic reconnection with exponential backoff
```

## Error Handling

### Connection Errors

If the initial connection fails, the client will retry with exponential backoff:

- Attempt 1: Immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 second delay
- Attempt 4: 4 second delay
- Attempt 5: 8 second delay
- Max attempts: 5

After 5 failed attempts, the client gives up and notifies the user.

### Message Queue

When disconnected, the client queues up to 1000 messages. Once reconnected, queued messages are sent in order.

### Heartbeat Timeout

If no message is received from the server for 90 seconds (3x heartbeat interval), the client considers the connection stale and attempts to reconnect.

## Security Considerations

### Authentication

- Session ID must be valid and correspond to an active session in the database
- Session IDs are single-use and expire after the interview
- Failed authentication results in immediate connection closure

### Data Privacy

- All communication is encrypted via TLS 1.2+
- No sensitive interview content is transmitted, only behavioral metadata
- Eye tracking coordinates are normalized (0-1 range) and don't reveal screen content

### Rate Limiting

- Eye tracking data: Maximum 60 Hz
- Other events: Maximum 1000 messages per minute per session
- Exceeding limits may result in temporary throttling or session termination

## Testing

### Mock Server

A Python mock server is provided for integration testing:

```bash
cd browser/tests
python mock_ws_server.py
```

This starts a WebSocket server on `ws://localhost:8765` that echoes messages and simulates server commands.

### Unit Tests

Run C++ unit tests:

```bash
cd browser/build
ctest -R websocket
```

### Integration Tests

1. Start mock server
2. Launch browser with test session ID
3. Inject test events from JavaScript console:

```javascript
blockdWS.sendEvent('EYE_TRACKING_DATA', { x: 0.5, y: 0.3, confidence: 0.85 });
```

4. Verify server receives correct JSON

## Performance Requirements

- **Connection time:** < 5 seconds on first attempt
- **Message latency:** < 100ms under normal conditions
- **Memory footprint:** < 10MB for WebSocket client
- **CPU usage:** < 1% during idle, < 5% during active streaming
- **Network bandwidth:** < 50 KB/s for typical session

## Versioning

Current protocol version: **1.0**

Protocol version negotiation may be added in future versions via a handshake parameter.

## Changelog

### Version 1.0 (2024-11-19)
- Initial protocol definition
- Client and server message types
- Connection lifecycle
- Error handling and reconnection logic
