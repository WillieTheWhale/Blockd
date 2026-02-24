# Session Management Modules

This directory contains session lifecycle management and secure settings storage.

## Modules

### 1. SessionManager (`session-manager.ts`)

Manages session lifecycle with backend validation and state tracking.

**Features:**
- Session token validation with backend
- Session start/end lifecycle
- Session state tracking
- Settings management
- EventEmitter interface
- Automatic cleanup on app close

**Usage:**

```typescript
import { SessionManager, getSessionManager } from './session/session-manager';
import { BackendConnector } from './backend/backend-connector';
import { SettingsStore } from './session/settings-store';

// Create dependencies
const connector = new BackendConnector();
const settingsStore = new SettingsStore();

// Create session manager (or use singleton)
const sessionManager = getSessionManager(connector, settingsStore);

// Listen for events
sessionManager.on('session-started', (session) => {
  console.log('Session started:', session.id);
  console.log('Settings:', session.settings);
});

sessionManager.on('session-ended', (sessionId, reason) => {
  console.log('Session ended:', sessionId, reason);
});

sessionManager.on('session-error', (error) => {
  console.error('Session error:', error);
});

sessionManager.on('session-status-changed', (status) => {
  console.log('Status:', status);
});

// Start session
try {
  const session = await sessionManager.startSession('session-token-123');
  console.log('Active session:', session);
} catch (error) {
  console.error('Failed to start session:', error);
}

// Check session state
if (sessionManager.isSessionActive()) {
  const sessionId = sessionManager.getCurrentSessionId();
  const settings = sessionManager.getSessionSettings();
  const duration = sessionManager.getSessionDuration();

  console.log('Current session:', { sessionId, settings, duration });
}

// End session
sessionManager.endSession('User logged out');

// Force end (emergency)
sessionManager.forceEndSession('Application crash');

// Cleanup
sessionManager.destroy();
```

**Events:**
- `session-status-changed`: Session status changed (idle, validating, active, ending, ended, error)
- `session-started`: Session successfully started
- `session-ended`: Session ended
- `session-validated`: Session token validated
- `session-error`: Error occurred

**Methods:**
- `validateSession(token)`: Validate session token with backend (returns Promise)
- `startSession(token)`: Start new session (returns Promise)
- `endSession(reason?)`: End current session
- `forceEndSession(reason)`: Force end session without waiting
- `getCurrentSession()`: Get current session object
- `getCurrentSessionId()`: Get current session ID
- `getSessionStatus()`: Get current session status
- `isSessionActive()`: Check if session is active
- `getSessionSettings()`: Get session settings
- `getSessionDuration()`: Get session duration in ms
- `getSessionInfo()`: Get complete session info
- `destroy()`: Clean up resources

**Session Object:**

```typescript
interface Session {
  id: string;                  // Backend-assigned session ID
  token: string;               // Session token
  status: SessionStatus;       // Current status
  startedAt?: number;          // Start timestamp
  endedAt?: number;            // End timestamp
  settings: SessionSettings;   // Session configuration
}

interface SessionSettings {
  enableEyeTracking: boolean;
  enableVideoCapture: boolean;
  enableTelemetry: boolean;
  enableSecurityMonitoring: boolean;
  monitoringIntervalMs: number;
  allowedOrigins: string[];
}
```

---

### 2. SettingsStore (`settings-store.ts`)

Secure encrypted settings storage using electron-store.

**Features:**
- Encrypted storage with electron-store
- Session settings persistence
- User preferences storage
- Automatic cleanup on session end
- Import/export functionality

**Usage:**

```typescript
import { SettingsStore, getSettingsStore } from './session/settings-store';

// Create store (or use singleton)
const settingsStore = getSettingsStore('encryption-key-123');

// Session settings
settingsStore.setSessionSettings({
  enableEyeTracking: true,
  enableVideoCapture: true,
  enableTelemetry: true,
  enableSecurityMonitoring: true,
  monitoringIntervalMs: 5000,
  allowedOrigins: ['https://meet.google.com'],
});

const settings = settingsStore.getSessionSettings();

// Session token/ID
settingsStore.setSessionToken('token-123');
settingsStore.setSessionId('session-456');

const token = settingsStore.getSessionToken();
const sessionId = settingsStore.getSessionId();

// User preferences
settingsStore.setTheme('dark');
settingsStore.setNotifications(true);
settingsStore.setLanguage('en');

const theme = settingsStore.getTheme();
const prefs = settingsStore.getUserPreferences();

// Batch update preferences
settingsStore.setUserPreferences({
  theme: 'light',
  notifications: false,
  language: 'es',
});

// Last session info
settingsStore.setLastSession('session-123', 'User logout');
const lastSession = settingsStore.getLastSession();

// Clear session data (but keep preferences)
settingsStore.clearSessionData();

// Clear everything
settingsStore.clearAll();

// Reset to defaults
settingsStore.reset();

// Export/import (for backup)
const backup = settingsStore.export();
settingsStore.import(backup);

// Get metadata
console.log('Store path:', settingsStore.getStorePath());
console.log('Store size:', settingsStore.size());
console.log('Is empty:', settingsStore.isEmpty());
```

**Storage Location:**

The settings are stored in an encrypted file at:
- Windows: `%APPDATA%/blockd-settings/config.json`
- macOS: `~/Library/Application Support/blockd-settings/config.json`
- Linux: `~/.config/blockd-settings/config.json`

**Security:**

- All data is encrypted using AES-256-CBC
- Encryption key should be derived from machine-specific identifier
- Session data is automatically cleared on app start
- Sensitive data (tokens) should be cleared after use

---

## Integration Example

```typescript
import { BackendConnector } from './backend/backend-connector';
import { SessionManager, getSessionManager } from './session/session-manager';
import { SettingsStore, getSettingsStore } from './session/settings-store';

// Initialize components
const connector = new BackendConnector();
const settingsStore = getSettingsStore();
const sessionManager = getSessionManager(connector, settingsStore);

// Connect to backend
connector.connect();

// Start session when backend connected
connector.on('connected', async () => {
  try {
    // Get token from URL parameters or stored
    const token = getSessionTokenFromURL();

    // Start session
    const session = await sessionManager.startSession(token);

    console.log('Session active:', {
      id: session.id,
      settings: session.settings,
    });

    // Use session settings
    if (session.settings.enableEyeTracking) {
      // Start eye tracking
    }

    if (session.settings.enableTelemetry) {
      // Start telemetry collection
    }
  } catch (error) {
    console.error('Failed to start session:', error);
    // Show error UI
  }
});

// Handle session end
sessionManager.on('session-ended', (sessionId, reason) => {
  console.log('Session ended:', reason);

  // Stop all monitoring
  // Close window
  // Return to login screen
});

// Handle app close
app.on('before-quit', () => {
  if (sessionManager.isSessionActive()) {
    sessionManager.endSession('Application closing');
  }
});
```

---

## Session Flow

1. **User enters session token** (from interviewer)
2. **Validate with backend** (`sessionManager.validateSession()`)
3. **Backend returns validation response** with session ID and settings
4. **Start session** (`sessionManager.startSession()`)
5. **Store session data** (SettingsStore)
6. **Configure monitoring** based on session settings
7. **User completes interview**
8. **End session** (`sessionManager.endSession()`)
9. **Clear session data** (SettingsStore)

---

## Error Handling

Always handle session errors:

```typescript
sessionManager.on('session-error', (error) => {
  console.error('Session error:', error);

  // Show error notification
  showErrorNotification(error.message);

  // Return to login screen
  returnToLogin();
});

// Catch promise rejections
try {
  await sessionManager.startSession(token);
} catch (error) {
  if (error.message.includes('timeout')) {
    // Handle timeout
  } else if (error.message.includes('Invalid')) {
    // Handle invalid token
  } else {
    // Handle other errors
  }
}
```

---

## Testing

To test session modules:

```bash
npm run test:unit -- session
```

Mock backend responses:

```typescript
import { SessionManager } from './session/session-manager';

const mockConnector = {
  send: jest.fn(),
  on: jest.fn(),
  // ...
};

const sessionManager = new SessionManager(
  mockConnector as any,
  settingsStore
);
```

---

## Security Best Practices

1. **Encryption Key**: Use machine-specific identifier to derive encryption key
2. **Token Storage**: Clear session tokens after session ends
3. **Auto-cleanup**: Clear session data on app start
4. **Validation**: Always validate session token before starting
5. **Timeout**: Implement session timeout for inactive sessions
6. **Logging**: Don't log sensitive data (tokens, session IDs)

```typescript
// Generate encryption key from machine ID
import { machineId } from 'node-machine-id';

const encryptionKey = await machineId();
const settingsStore = getSettingsStore(encryptionKey);
```
