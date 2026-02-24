# Backend Communication Modules

This directory contains the backend communication infrastructure for the Blockd Electron app.

## Modules

### 1. BackendConnector (`backend-connector.ts`)

WebSocket connection manager with automatic reconnection and message queueing.

**Features:**
- WebSocket connection to `wss://api.blockd.site/ws`
- Automatic reconnection with exponential backoff (1s → 2s → 4s → 8s → 16s → 30s max)
- Message queueing when disconnected (max 100 messages)
- Heartbeat every 30 seconds
- Connection status events
- EventEmitter interface

**Usage:**

```typescript
import { BackendConnector } from './backend/backend-connector';

// Create connector
const connector = new BackendConnector({
  url: 'wss://api.blockd.site/ws',
  heartbeatIntervalMs: 30000,
  reconnectDelayMs: 1000,
  maxReconnectAttempts: 5,
  maxQueuedMessages: 100,
});

// Listen for events
connector.on('connected', () => {
  console.log('Connected to backend');
});

connector.on('disconnected', (reason) => {
  console.log('Disconnected:', reason);
});

connector.on('message', (message) => {
  console.log('Received:', message);
});

connector.on('status-change', (status) => {
  console.log('Status:', status);
});

// Connect
connector.connect('session-id-123');

// Send message
connector.send({
  type: 'security_event',
  sessionId: 'session-id-123',
  timestamp: Date.now(),
  payload: { /* ... */ },
});

// Disconnect
connector.disconnect('User logout');

// Cleanup
connector.destroy();
```

**Events:**
- `status-change`: Connection status changed (disconnected, connecting, connected, reconnecting, error)
- `message`: Message received from backend
- `error`: Error occurred
- `connected`: Successfully connected
- `disconnected`: Connection closed
- `reconnecting`: Attempting reconnection

**Methods:**
- `connect(sessionId?)`: Connect to backend
- `disconnect(reason?)`: Disconnect from backend
- `send(message)`: Send message (queues if disconnected)
- `isConnected()`: Check connection status
- `getStatus()`: Get current connection status
- `getQueueStats()`: Get message queue statistics
- `getConnectionStats()`: Get connection statistics
- `destroy()`: Clean up all resources

---

### 2. MessageQueue (`message-queue.ts`)

FIFO queue for offline message storage with automatic overflow handling.

**Features:**
- FIFO (First In, First Out) queue
- Max size limit (default 100)
- Automatic overflow handling (drops oldest)
- Batch operations (flush)
- Queue statistics

**Usage:**

```typescript
import { MessageQueue } from './backend/message-queue';

const queue = new MessageQueue(100); // Max 100 messages

// Enqueue message
queue.enqueue(message);

// Dequeue message
const msg = queue.dequeue();

// Peek at first message
const first = queue.peek();

// Flush all messages
const all = queue.flush();

// Clear queue
queue.clear();

// Check status
console.log('Size:', queue.size());
console.log('Empty:', queue.isEmpty());
console.log('Full:', queue.isFull());

// Get statistics
const stats = queue.getStats();
console.log('Utilization:', stats.utilization);
```

---

### 3. Protocol (`protocol.ts`)

Message serialization/deserialization and helper functions.

**Features:**
- JSON serialization/deserialization
- Message validation
- Factory functions for all message types
- Message size estimation
- Message prioritization
- Message batching

**Usage:**

```typescript
import {
  createSecurityEvent,
  createGazeData,
  createTelemetryData,
  createHeartbeat,
  serializeMessage,
  deserializeMessage,
  validateMessage,
} from './backend/protocol';

// Create messages
const securityMsg = createSecurityEvent('session-123', {
  type: 'suspicious_process',
  severity: 'high',
  timestamp: Date.now(),
  description: 'OBS detected',
  metadata: { processName: 'obs64.exe' },
});

const gazeMsg = createGazeData('session-123', {
  sessionId: 'session-123',
  points: [
    { x: 0.5, y: 0.5, confidence: 0.9, timestamp: Date.now(), isOffScreen: false },
  ],
});

const telemetryMsg = createTelemetryData('session-123', {
  sessionId: 'session-123',
  timestamp: Date.now(),
  cpuPercent: 45.2,
  memoryMb: 2048,
  activeProcesses: 120,
  windowFocused: true,
});

const heartbeatMsg = createHeartbeat('session-123');

// Serialize/deserialize
const json = serializeMessage(securityMsg);
const parsed = deserializeMessage(json);

// Validate
if (validateMessage(parsed)) {
  console.log('Valid message');
}

// Get priority
const priority = getMessagePriority(securityMsg); // 'high', 'medium', or 'low'
```

**Factory Functions:**
- `createSessionValidateMessage(request)`: Create session validation message
- `createSessionStartMessage(sessionId)`: Create session start message
- `createSessionEndMessage(sessionId, reason?)`: Create session end message
- `createSecurityEvent(sessionId, event)`: Create security event message
- `createGazeData(sessionId, batch)`: Create gaze data message
- `createTelemetryData(sessionId, data)`: Create telemetry message
- `createVideoFrame(sessionId, frame)`: Create video frame message
- `createHeartbeat(sessionId?)`: Create heartbeat message
- `createErrorMessage(error, sessionId?)`: Create error message

---

## Integration Example

```typescript
import { BackendConnector } from './backend/backend-connector';
import { createSecurityEvent } from './backend/protocol';

// Initialize
const connector = new BackendConnector();

connector.on('connected', () => {
  console.log('Backend connected');
});

connector.on('message', (message) => {
  if (message.type === 'session_validate_response') {
    const response = message.payload as SessionValidateResponse;
    if (response.valid) {
      console.log('Session valid:', response.sessionId);
    }
  }
});

// Connect
connector.connect();

// Send security event
const event = createSecurityEvent('session-123', {
  type: 'vm_detected',
  severity: 'critical',
  timestamp: Date.now(),
  description: 'VMware detected',
  metadata: { vmType: 'vmware', confidence: 0.95 },
});

connector.send(event);
```

---

## Error Handling

All modules handle errors gracefully:

1. **BackendConnector**: Emits 'error' events and attempts reconnection
2. **MessageQueue**: Logs warnings when queue is full
3. **Protocol**: Throws errors on serialization/validation failures

Always listen for error events:

```typescript
connector.on('error', (error) => {
  console.error('Connector error:', error);
  // Handle error (show notification, log to file, etc.)
});
```

---

## Testing

To test the backend modules:

```bash
npm run test:unit -- backend
```

Mock the WebSocket connection:

```typescript
import { BackendConnector } from './backend/backend-connector';

// Use dev URL for testing
const connector = new BackendConnector({
  url: 'ws://localhost:3003',
});
```

---

## Configuration

Configuration is centralized in `src/shared/constants.ts`:

```typescript
export const BACKEND_URL = 'wss://api.blockd.site/ws';
export const BACKEND_URL_DEV = 'ws://localhost:3003';
export const HEARTBEAT_INTERVAL_MS = 30000;
export const RECONNECT_DELAY_MS = 1000;
export const MAX_RECONNECT_ATTEMPTS = 5;
export const MAX_QUEUED_MESSAGES = 100;
```

Override in development:

```typescript
const connector = new BackendConnector({
  url: process.env.NODE_ENV === 'development'
    ? BACKEND_URL_DEV
    : BACKEND_URL,
});
```
