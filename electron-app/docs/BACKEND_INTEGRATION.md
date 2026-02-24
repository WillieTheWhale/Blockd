# Backend Integration Guide

This guide demonstrates how to integrate all backend communication modules in the Blockd Electron app.

## Table of Contents

1. [Overview](#overview)
2. [Module Dependencies](#module-dependencies)
3. [Initialization](#initialization)
4. [Session Lifecycle](#session-lifecycle)
5. [Event Flow](#event-flow)
6. [Error Handling](#error-handling)
7. [Complete Example](#complete-example)

---

## Overview

The backend communication system consists of three main components:

```
┌─────────────────────────────────────────────────────────┐
│                    Main Process                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐     ┌──────────────────┐         │
│  │ SessionManager   │────▶│ BackendConnector │────┐    │
│  └──────────────────┘     └──────────────────┘    │    │
│           │                         │              │    │
│           │                         │              │    │
│           ▼                         ▼              │    │
│  ┌──────────────────┐     ┌──────────────────┐    │    │
│  │ SettingsStore    │     │ MessageQueue     │    │    │
│  └──────────────────┘     └──────────────────┘    │    │
│           │                         │              │    │
│           │                         │              │    │
│           ▼                         ▼              │    │
│  ┌─────────────────────────────────────────┐      │    │
│  │       TelemetryCollector                │      │    │
│  │       SecurityMonitor                   │      │    │
│  │       ProcessMonitor                    │      │    │
│  └─────────────────────────────────────────┘      │    │
│                                                    │    │
└────────────────────────────────────────────────────┼────┘
                                                     │
                                                    WSS
                                                     │
                                                     ▼
                                        ┌────────────────────┐
                                        │ Blockd Backend     │
                                        │ api.blockd.site    │
                                        └────────────────────┘
```

---

## Module Dependencies

### Installation

All required dependencies are already in `package.json`:

```json
{
  "dependencies": {
    "ws": "^8.16.0",
    "electron-store": "^8.1.0",
    "systeminformation": "^5.21.0",
    "uuid": "^9.0.0"
  }
}
```

Install with:

```bash
npm install
```

### Import Statements

```typescript
// Backend communication
import {
  BackendConnector,
  MessageQueue,
  createSecurityEvent,
  createGazeData,
  createTelemetryData,
} from './main/backend';

// Session management
import {
  SessionManager,
  getSessionManager,
  SettingsStore,
  getSettingsStore,
} from './main/session';

// Telemetry
import {
  TelemetryCollector,
  getTelemetryCollector,
} from './main/telemetry';

// Types
import {
  Session,
  SessionSettings,
  TelemetryData,
  SecurityEvent,
} from './shared/types';

// Constants
import {
  BACKEND_URL,
  TELEMETRY_INTERVAL_MS,
} from './shared/constants';
```

---

## Initialization

### Step 1: Create Core Instances

```typescript
import { app, BrowserWindow } from 'electron';
import { BackendConnector } from './main/backend';
import { getSessionManager } from './main/session';
import { getSettingsStore } from './main/session';
import { getTelemetryCollector } from './main/telemetry';
import { machineId } from 'node-machine-id';

// Initialize backend connector
const connector = new BackendConnector({
  url: process.env.NODE_ENV === 'development'
    ? 'ws://localhost:3003'
    : 'wss://api.blockd.site/ws',
});

// Initialize settings store with machine-specific encryption key
const encryptionKey = await machineId();
const settingsStore = getSettingsStore(encryptionKey);

// Initialize session manager
const sessionManager = getSessionManager(connector, settingsStore);

// Initialize telemetry collector
const telemetryCollector = getTelemetryCollector();
```

### Step 2: Setup Event Listeners

```typescript
// Backend connection events
connector.on('connected', () => {
  console.log('[Backend] Connected to server');
  // Update UI status indicator
  mainWindow?.webContents.send('backend:connected');
});

connector.on('disconnected', (reason) => {
  console.log('[Backend] Disconnected:', reason);
  mainWindow?.webContents.send('backend:disconnected', reason);
});

connector.on('reconnecting', (attempt, maxAttempts) => {
  console.log(`[Backend] Reconnecting (${attempt}/${maxAttempts})`);
  mainWindow?.webContents.send('backend:reconnecting', attempt, maxAttempts);
});

connector.on('error', (error) => {
  console.error('[Backend] Error:', error);
  mainWindow?.webContents.send('backend:error', error.message);
});

// Session events
sessionManager.on('session-started', (session) => {
  console.log('[Session] Started:', session.id);
  mainWindow?.webContents.send('session:started', session);

  // Start telemetry if enabled
  if (session.settings.enableTelemetry) {
    telemetryCollector.start(session.id, connector, mainWindow);
  }

  // Start security monitoring if enabled
  if (session.settings.enableSecurityMonitoring) {
    // Start security monitor
  }
});

sessionManager.on('session-ended', (sessionId, reason) => {
  console.log('[Session] Ended:', sessionId, reason);
  mainWindow?.webContents.send('session:ended', sessionId, reason);

  // Stop telemetry
  telemetryCollector.stop();

  // Return to login screen
  mainWindow?.loadURL('file://' + path.join(__dirname, 'login.html'));
});

sessionManager.on('session-error', (error) => {
  console.error('[Session] Error:', error);
  mainWindow?.webContents.send('session:error', error.message);
});

// Telemetry events
telemetryCollector.on('data-collected', (data) => {
  // Optionally send to renderer for display
  mainWindow?.webContents.send('telemetry:data', data);
});

telemetryCollector.on('error', (error) => {
  console.error('[Telemetry] Error:', error);
  // Don't stop on errors - just log
});
```

### Step 3: Connect to Backend

```typescript
app.whenReady().then(() => {
  // Create main window
  mainWindow = createWindow();

  // Connect to backend
  connector.connect();

  console.log('[App] Initialized and connected to backend');
});
```

---

## Session Lifecycle

### 1. User Enters Session Token

```typescript
// In renderer process
document.getElementById('start-session-btn').addEventListener('click', () => {
  const token = document.getElementById('session-token').value;
  window.electronAPI.startSession(token);
});

// In preload script
contextBridge.exposeInMainWorld('electronAPI', {
  startSession: (token: string) => ipcRenderer.invoke('session:start', token),
});

// In main process
ipcMain.handle('session:start', async (event, token: string) => {
  try {
    const session = await sessionManager.startSession(token);
    return { success: true, session };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
```

### 2. Backend Validates Token

The `sessionManager.startSession()` method:
1. Sends validation message to backend
2. Waits for response (10s timeout)
3. Receives session ID and settings
4. Creates session object
5. Stores in SettingsStore
6. Emits 'session-started' event

### 3. Start Monitoring

```typescript
sessionManager.on('session-started', (session) => {
  const { settings } = session;

  // Start telemetry
  if (settings.enableTelemetry) {
    telemetryCollector.start(session.id, connector, mainWindow);
  }

  // Start eye tracking
  if (settings.enableEyeTracking) {
    mainWindow?.webContents.send('eye-tracking:start', {
      sessionId: session.id,
      batchIntervalMs: 100,
    });
  }

  // Start video capture
  if (settings.enableVideoCapture) {
    mainWindow?.webContents.send('video-capture:start', {
      sessionId: session.id,
      width: 640,
      height: 480,
      frameRate: 30,
    });
  }

  // Start security monitoring
  if (settings.enableSecurityMonitoring) {
    securityMonitor.start(session.id, connector);
  }

  // Enter fullscreen/kiosk mode
  mainWindow?.setKiosk(true);
  mainWindow?.setFullScreen(true);
});
```

### 4. Send Data During Session

```typescript
// Gaze data from renderer
ipcMain.on('gaze:data', (event, batch: GazeDataBatch) => {
  const sessionId = sessionManager.getCurrentSessionId();
  if (sessionId) {
    const message = createGazeData(sessionId, batch);
    connector.send(message);
  }
});

// Security events
securityMonitor.on('security-event', (event: SecurityEvent) => {
  const sessionId = sessionManager.getCurrentSessionId();
  if (sessionId) {
    const message = createSecurityEvent(sessionId, event);
    connector.send(message);
  }
});
```

### 5. End Session

```typescript
// User clicks end session
ipcMain.handle('session:end', (event, reason?: string) => {
  sessionManager.endSession(reason || 'User ended session');
  return { success: true };
});

// Force end on app close
app.on('before-quit', (event) => {
  if (sessionManager.isSessionActive()) {
    event.preventDefault();

    // End session gracefully
    sessionManager.endSession('Application closing');

    // Wait for session end message to be sent
    setTimeout(() => {
      app.quit();
    }, 1000);
  }
});
```

---

## Event Flow

### Session Start Flow

```
┌───────────┐         ┌────────────────┐         ┌──────────┐
│  Renderer │         │  Main Process  │         │  Backend │
└─────┬─────┘         └───────┬────────┘         └────┬─────┘
      │                       │                       │
      │ IPC: session:start    │                       │
      │──────────────────────▶│                       │
      │                       │                       │
      │                       │ WS: session_validate  │
      │                       │──────────────────────▶│
      │                       │                       │
      │                       │ WS: validate_response │
      │                       │◀──────────────────────│
      │                       │                       │
      │                       │ WS: session_start     │
      │                       │──────────────────────▶│
      │                       │                       │
      │ IPC: session:started  │                       │
      │◀──────────────────────│                       │
      │                       │                       │
      │ Start eye tracking    │                       │
      │ Start video capture   │                       │
      │ Enter fullscreen      │                       │
```

### Data Collection Flow

```
┌─────────────┐       ┌────────────────┐       ┌──────────┐
│  Collector  │       │   Connector    │       │  Backend │
└──────┬──────┘       └────────┬───────┘       └────┬─────┘
       │                       │                     │
       │ 30s interval timer    │                     │
       │──────────────────────▶│                     │
       │                       │                     │
       │ Collect CPU           │                     │
       │ Collect Memory        │                     │
       │ Collect Processes     │                     │
       │                       │                     │
       │ Create message        │                     │
       │──────────────────────▶│                     │
       │                       │                     │
       │                       │ WS: telemetry_data  │
       │                       │────────────────────▶│
       │                       │                     │
```

### Reconnection Flow

```
┌───────────┐         ┌────────────────┐
│ Connector │         │  Backend       │
└─────┬─────┘         └────────┬───────┘
      │                        │
      │ WS: Connection lost    │
      │◀───────────────────────│
      │                        │
      │ Status: reconnecting   │
      │ Queue messages         │
      │                        │
      │ Wait 1s (backoff)      │
      │                        │
      │ WS: Reconnect attempt  │
      │───────────────────────▶│
      │                        │
      │ WS: Connected          │
      │◀───────────────────────│
      │                        │
      │ Status: connected      │
      │ Flush queue            │
      │───────────────────────▶│
```

---

## Error Handling

### Network Errors

```typescript
connector.on('error', (error) => {
  console.error('[Backend] Connection error:', error);

  // Show notification to user
  showNotification('Connection Error', 'Unable to connect to server');

  // Log to file for debugging
  logToFile('errors.log', {
    timestamp: Date.now(),
    type: 'backend-error',
    message: error.message,
    stack: error.stack,
  });

  // Don't end session - connector will auto-reconnect
  // Messages are queued until reconnected
});
```

### Session Errors

```typescript
sessionManager.on('session-error', (error) => {
  console.error('[Session] Error:', error);

  if (error.message.includes('timeout')) {
    // Validation timeout
    showError('Session validation timed out. Please check your connection.');
  } else if (error.message.includes('Invalid')) {
    // Invalid token
    showError('Invalid session token. Please check with your interviewer.');
  } else {
    // Other errors
    showError(`Session error: ${error.message}`);
  }

  // Return to login screen
  returnToLogin();
});
```

### Collection Errors

```typescript
telemetryCollector.on('error', (error) => {
  console.error('[Telemetry] Collection error:', error);

  // Log but don't stop collection
  // Next interval will try again
  logToFile('telemetry-errors.log', {
    timestamp: Date.now(),
    error: error.message,
  });

  // If too many consecutive errors, disable that metric
  consecutiveErrors++;
  if (consecutiveErrors > 5) {
    telemetryCollector.updateConfig({
      collectNetwork: false, // Disable problematic metric
    });
  }
});
```

---

## Complete Example

Here's a complete `src/main/index.ts` example:

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { machineId } from 'node-machine-id';

// Backend modules
import { BackendConnector } from './backend/backend-connector';
import { createSecurityEvent, createGazeData } from './backend/protocol';

// Session modules
import { getSessionManager } from './session/session-manager';
import { getSettingsStore } from './session/settings-store';

// Telemetry
import { getTelemetryCollector } from './telemetry/telemetry-collector';

// Types
import { GazeDataBatch, SecurityEvent } from '../shared/types';
import { BACKEND_URL } from '../shared/constants';

// ============================================================================
// Global State
// ============================================================================

let mainWindow: BrowserWindow | null = null;
let connector: BackendConnector;
let sessionManager: ReturnType<typeof getSessionManager>;
let settingsStore: ReturnType<typeof getSettingsStore>;
let telemetryCollector: ReturnType<typeof getTelemetryCollector>;

// ============================================================================
// Initialization
// ============================================================================

async function initialize() {
  // Get machine-specific encryption key
  const encryptionKey = await machineId();

  // Initialize modules
  connector = new BackendConnector({
    url: process.env.NODE_ENV === 'development'
      ? 'ws://localhost:3003'
      : BACKEND_URL,
  });

  settingsStore = getSettingsStore(encryptionKey);
  sessionManager = getSessionManager(connector, settingsStore);
  telemetryCollector = getTelemetryCollector();

  // Setup event listeners
  setupConnectorEvents();
  setupSessionEvents();
  setupTelemetryEvents();
}

// ============================================================================
// Event Handlers
// ============================================================================

function setupConnectorEvents() {
  connector.on('connected', () => {
    console.log('[Backend] Connected');
    mainWindow?.webContents.send('backend:connected');
  });

  connector.on('disconnected', (reason) => {
    console.log('[Backend] Disconnected:', reason);
    mainWindow?.webContents.send('backend:disconnected', reason);
  });

  connector.on('reconnecting', (attempt, maxAttempts) => {
    console.log(`[Backend] Reconnecting (${attempt}/${maxAttempts})`);
    mainWindow?.webContents.send('backend:reconnecting', attempt, maxAttempts);
  });

  connector.on('error', (error) => {
    console.error('[Backend] Error:', error);
    mainWindow?.webContents.send('backend:error', error.message);
  });
}

function setupSessionEvents() {
  sessionManager.on('session-started', (session) => {
    console.log('[Session] Started:', session.id);
    mainWindow?.webContents.send('session:started', session);

    // Start monitoring based on settings
    if (session.settings.enableTelemetry) {
      telemetryCollector.start(session.id, connector, mainWindow!);
    }

    if (session.settings.enableEyeTracking) {
      mainWindow?.webContents.send('eye-tracking:start', {
        sessionId: session.id,
      });
    }

    // Enter kiosk mode
    mainWindow?.setKiosk(true);
    mainWindow?.setFullScreen(true);
  });

  sessionManager.on('session-ended', (sessionId, reason) => {
    console.log('[Session] Ended:', sessionId, reason);
    mainWindow?.webContents.send('session:ended', sessionId, reason);

    // Stop all monitoring
    telemetryCollector.stop();

    // Exit kiosk mode
    mainWindow?.setKiosk(false);
    mainWindow?.setFullScreen(false);

    // Return to login
    mainWindow?.loadURL('file://' + path.join(__dirname, '../renderer/login.html'));
  });

  sessionManager.on('session-error', (error) => {
    console.error('[Session] Error:', error);
    mainWindow?.webContents.send('session:error', error.message);
  });
}

function setupTelemetryEvents() {
  telemetryCollector.on('data-collected', (data) => {
    // Send to renderer for display
    mainWindow?.webContents.send('telemetry:data', data);
  });

  telemetryCollector.on('error', (error) => {
    console.error('[Telemetry] Error:', error);
  });
}

// ============================================================================
// IPC Handlers
// ============================================================================

function setupIpcHandlers() {
  // Session management
  ipcMain.handle('session:start', async (event, token: string) => {
    try {
      const session = await sessionManager.startSession(token);
      return { success: true, session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle('session:end', (event, reason?: string) => {
    sessionManager.endSession(reason || 'User ended session');
    return { success: true };
  });

  // Gaze data from renderer
  ipcMain.on('gaze:data', (event, batch: GazeDataBatch) => {
    const sessionId = sessionManager.getCurrentSessionId();
    if (sessionId) {
      const message = createGazeData(sessionId, batch);
      connector.send(message);
    }
  });

  // Security events
  ipcMain.on('security:event', (event, securityEvent: SecurityEvent) => {
    const sessionId = sessionManager.getCurrentSessionId();
    if (sessionId) {
      const message = createSecurityEvent(sessionId, securityEvent);
      connector.send(message);
    }
  });
}

// ============================================================================
// Window Management
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/preload.js'),
    },
  });

  mainWindow.loadURL('file://' + path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  await initialize();
  setupIpcHandlers();
  createWindow();

  // Connect to backend
  connector.connect();

  console.log('[App] Ready');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', (event) => {
  if (sessionManager.isSessionActive()) {
    event.preventDefault();

    // End session gracefully
    sessionManager.endSession('Application closing');

    // Wait for message to be sent
    setTimeout(() => {
      connector.disconnect('Application closing');
      app.quit();
    }, 1000);
  }
});

// ============================================================================
// Cleanup
// ============================================================================

process.on('exit', () => {
  connector.destroy();
  telemetryCollector.destroy();
});
```

---

## Next Steps

1. **Install dependencies**: `npm install`
2. **Build the app**: `npm run build`
3. **Start development**: `npm run dev`
4. **Test backend connection**: Check console for connection logs
5. **Test session flow**: Enter a session token and verify validation
6. **Monitor telemetry**: Check backend receives telemetry data

For more details, see individual module READMEs:
- [Backend Modules](../src/main/backend/README.md)
- [Session Modules](../src/main/session/README.md)
- [Telemetry Module](../src/main/telemetry/README.md)
