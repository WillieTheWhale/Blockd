# Core Main Process Implementation

This document describes the core main process files that have been implemented for the Blockd Electron app.

## Files Created

### 1. `src/main/index.ts` (Main Entry Point)

**Purpose**: Main process entry point that orchestrates the entire application.

**Key Features**:
- **Single Instance Lock**: Prevents multiple instances of the app from running
- **App Lifecycle Management**: Handles `ready`, `window-all-closed`, `activate`, `before-quit` events
- **Window Creation**: Creates and manages the main BrowserWindow via WindowManager
- **IPC Handler Registration**: Registers all IPC channels for renderer communication
- **Service Initialization**: Placeholder for initializing background services (SecurityMonitor, BackendConnector, SessionManager, etc.)
- **Error Handling**: Global error handlers for uncaught exceptions and promise rejections

**IPC Handlers Implemented**:
- Session management (start, end, get status)
- Eye tracking data (gaze batches, calibration)
- Video frames
- Meeting detection (detected, ended)
- Window control (fullscreen requests)
- System info and app version

**Next Steps**:
- Implement service initialization when services are created
- Connect IPC handlers to actual backend communication
- Add proper session validation logic

---

### 2. `src/main/window-manager.ts` (Window Management)

**Purpose**: Manages the BrowserWindow with security features and kiosk mode enforcement.

**Security Features Implemented**:

#### 2.1 Secure BrowserWindow Configuration
```typescript
webPreferences: {
  contextIsolation: true,     // Isolate renderer context
  nodeIntegration: false,     // No Node.js in renderer
  sandbox: true,              // Sandbox renderer process
  webSecurity: true,          // Enable web security
  allowRunningInsecureContent: false,
  devTools: false (production), // Prevent DevTools
  preload: path to preload.js
}
```

#### 2.2 Keyboard Shortcut Blocking
- Intercepts keyboard input via `before-input-event`
- Blocks shortcuts defined in `BLOCKED_SHORTCUTS` constant:
  - F12, Ctrl+Shift+I (DevTools)
  - Escape, F11 (Fullscreen exit)
  - Ctrl+T, Ctrl+N (New tab/window)
  - Ctrl+W, Alt+F4 (Close window)
  - F5, Ctrl+R (Refresh)
  - And many more...
- Reports blocked shortcuts as security events

#### 2.3 Navigation Control
- `will-navigate` and `will-redirect` event handlers
- Whitelist-based URL validation against `ALLOWED_ORIGINS`
- Wildcard support for patterns like `*.zoom.us`
- Blocks navigation to disallowed URLs
- Reports blocked navigation as security events

#### 2.4 New Window Prevention
- `setWindowOpenHandler` blocks all `window.open()` attempts
- Reports as security events

#### 2.5 DevTools Prevention
- Disabled in webPreferences (production)
- `devtools-opened` handler closes DevTools immediately
- Reports DevTools opening as high-severity security event

#### 2.6 Content Protection
- `setContentProtection(true)` on macOS and Windows
- Helps prevent screen recording on supported platforms

#### 2.7 Context Menu Blocking
- Prevents right-click context menu in production

#### 2.8 Focus Monitoring
- Tracks window focus/blur events
- Reports focus loss during active session as security event
- Sends focus state to renderer via IPC

#### 2.9 Fullscreen Enforcement
- Monitors fullscreen state changes
- Forces back to fullscreen if user exits during session
- Reports exit attempts as high-severity security events

**Public API**:
- `createWindow()`: Create and configure the main window
- `getWindow()`: Get window instance
- `enterFullscreen()`: Enter fullscreen mode
- `exitFullscreen()`: Exit fullscreen (only when not in session)
- `enableLockdown()`: Enable kiosk mode for session
- `disableLockdown()`: Disable kiosk mode after session
- `isFullscreen()`: Check fullscreen state
- `isKiosk()`: Check kiosk mode state
- `isLocked()`: Check lockdown state
- `destroy()`: Destroy window

**Lockdown Mode Features**:
- Kiosk mode enabled
- Always on top
- Prevents closing and minimizing
- Forces fullscreen
- Enhanced keyboard blocking

---

### 3. `src/preload/preload.ts` (Preload Script)

**Purpose**: Safely exposes IPC APIs to the renderer process using `contextBridge`.

**Security Approach**:
- Uses `contextBridge.exposeInMainWorld()` to create safe API
- NO direct Node.js API exposure
- NO access to `ipcRenderer` from renderer
- All data serialized through bridge (no functions, no prototypes)
- Type-safe API with TypeScript

**API Structure** (`window.blockd`):

```typescript
window.blockd = {
  // Session management
  session: {
    start(request): Promise<SessionValidateResponse>
    end(): Promise<{success: boolean}>
    getStatus(): Promise<{status, sessionId}>
  },

  // Eye tracking
  eyeTracking: {
    sendGazeBatch(batch): Promise<{success: boolean}>
    sendCalibration(result): Promise<{success: boolean}>
  },

  // Video capture
  video: {
    sendFrame(frame): Promise<{success: boolean}>
  },

  // Meeting detection
  meeting: {
    detected(info): Promise<{success: boolean}>
    ended(info): Promise<{success: boolean}>
  },

  // Window control
  window: {
    requestFullscreen(): Promise<{success, error?}>
    requestExitFullscreen(): Promise<{success, error?}>
  },

  // System info
  system: {
    getInfo(): Promise<{platform, arch, versions...}>
    getAppVersion(): Promise<{version, name}>
  },

  // Event listeners (Main -> Renderer)
  on: {
    sessionStarted(callback)
    sessionEnded(callback)
    sessionError(callback)
    backendConnected(callback)
    backendDisconnected(callback)
    backendError(callback)
    securityAlert(callback)
    fullscreenChanged(callback)
    focusChanged(callback)
    meetingLockdownActivated(callback)
    meetingLockdownDeactivated(callback)
  },

  // Remove listeners
  off: {
    // Same as on, but removes listeners
  }
}
```

**Type Definitions**:
- Exports `BlockdAPI` interface
- Can be imported in renderer for type safety

---

### 4. `src/renderer/blockd.d.ts` (Type Declarations)

**Purpose**: TypeScript declaration file for renderer process to use `window.blockd` API.

**Features**:
- Provides full type definitions for `window.blockd`
- Augments global `Window` interface
- Import shared types from `src/shared/types.ts`
- Enables IntelliSense and type checking in renderer code

---

## Security Best Practices Implemented

### 1. Context Isolation
- `contextIsolation: true` ensures renderer cannot access main process objects
- Preload script uses `contextBridge` to expose limited, safe API

### 2. No Node Integration
- `nodeIntegration: false` prevents renderer from using Node.js APIs
- All Node.js functionality must go through IPC

### 3. Sandboxing
- `sandbox: true` runs renderer in OS-level sandbox
- Limits attack surface if renderer is compromised

### 4. Web Security
- `webSecurity: true` enforces same-origin policy
- `allowRunningInsecureContent: false` blocks mixed content

### 5. Input Validation
- All IPC messages are type-checked
- URL navigation validated against whitelist
- Keyboard shortcuts validated before blocking

### 6. Defense in Depth
- Multiple layers of security (OS, Electron, application)
- Detection AND prevention approach
- Security events reported for monitoring

---

## Integration with Existing Code

The implementation integrates with existing shared types and constants:

**From `src/shared/types.ts`**:
- `SecurityEvent`, `SecurityEventType`, `Severity`
- `Session`, `SessionStatus`, `SessionSettings`
- `SessionValidateRequest`, `SessionValidateResponse`
- `GazePoint`, `GazeDataBatch`, `CalibrationResult`
- `MeetingInfo`, `MeetingPlatform`
- `VideoFrame`, `VideoCaptureConfig`
- `WindowConfig`, `BlockedKeyboardShortcut`
- All backend message types

**From `src/shared/constants.ts`**:
- `BLOCKED_SHORTCUTS`: Keyboard shortcuts to block
- `ALLOWED_ORIGINS`: Whitelisted navigation URLs
- `MEETING_PATTERNS`: Meeting platform URL patterns
- Configuration constants (intervals, sizes, etc.)

**From `src/shared/ipc-channels.ts`**:
- `MainToRenderer`: Channels for main -> renderer communication
- `RendererToMain`: Channels for renderer -> main communication
- Type-safe channel definitions

---

## Next Steps

### Services to Implement

The main process is now ready for integration with these services:

1. **SecurityMonitor** (`src/main/security/security-monitor.ts`)
   - Orchestrate all security checks
   - Emit security events
   - Integrate with WindowManager

2. **BackendConnector** (`src/main/backend/backend-connector.ts`)
   - WebSocket connection to backend
   - Message queue for offline support
   - Heartbeat system

3. **SessionManager** (`src/main/session/session-manager.ts`)
   - Session validation and lifecycle
   - Token management
   - Settings storage

4. **ProcessMonitor** (`src/main/security/process-monitor.ts`)
   - Detect suspicious processes
   - Report to SecurityMonitor

5. **TelemetryCollector** (`src/main/telemetry/telemetry-collector.ts`)
   - Collect system metrics
   - Send to backend via BackendConnector

### Integration Points

In `src/main/index.ts`, the `initializeServices()` function is prepared for:

```typescript
async function initializeServices() {
  // Create instances
  const securityMonitor = new SecurityMonitor();
  const backendConnector = new BackendConnector(config);
  const sessionManager = new SessionManager(backendConnector);
  // ... etc

  // Start services
  await backendConnector.connect();
  securityMonitor.start();
  // ... etc

  // Wire up event handlers
  securityMonitor.onSecurityEvent((event) => {
    // Send to backend
    backendConnector.send(event);
    // Send to renderer
    windowManager?.getWindow()?.webContents.send(
      MainToRenderer.SECURITY_ALERT,
      event
    );
  });
}
```

---

## Testing

### Manual Testing Checklist

- [ ] App launches without errors
- [ ] Window opens in fullscreen
- [ ] Keyboard shortcuts are blocked (F12, Escape, etc.)
- [ ] Navigation is restricted to allowed origins
- [ ] New window attempts are blocked
- [ ] DevTools cannot be opened (production build)
- [ ] Focus loss is detected and reported
- [ ] Fullscreen exit attempts are prevented during session
- [ ] IPC communication works (test with simple renderer)
- [ ] Single instance lock works (try launching second instance)

### Unit Tests

Create tests for:
- `WindowManager.isNavigationAllowed(url)`
- `WindowManager.shouldBlockShortcut(input)`
- `WindowManager.formatShortcut(input)`
- IPC handler logic in `index.ts`

### Integration Tests

Test IPC flow:
- Renderer -> Preload -> Main process
- Main process -> Renderer via events
- Security event reporting

---

## Development vs Production

**Development Mode** (`NODE_ENV=development`):
- DevTools enabled
- Localhost URLs allowed
- Vite dev server URL loading
- More verbose logging

**Production Mode**:
- DevTools disabled
- Strict URL whitelist
- Load from built files
- Context menu disabled
- Maximum security enforcement

---

## Known Limitations

As documented in `DESIGN.md`:

1. **OS-level shortcuts (Alt+Tab)**: Cannot be blocked by Electron - mitigated by focus monitoring
2. **Screen capture prevention**: Partial support via `setContentProtection`
3. **VM detection**: Best-effort only - rely on server-side verification
4. **Process termination**: Can only detect, not prevent
5. **Kiosk escape on macOS**: Dock can appear - log escape attempts
6. **Frame visibility**: Cannot dynamically change after window creation

**Design Philosophy**: Emphasize **detection over prevention** - report all suspicious activities to backend for human review.

---

## File Sizes

- `src/main/index.ts`: ~8 KB (243 lines)
- `src/main/window-manager.ts`: ~15 KB (520 lines)
- `src/preload/preload.ts`: ~10 KB (280 lines)
- `src/renderer/blockd.d.ts`: ~3 KB (85 lines)

**Total**: ~36 KB of TypeScript code

---

## Summary

The core main process infrastructure is now complete and ready for integration with backend services. The implementation follows Electron security best practices with:

- Context isolation and sandboxing
- Comprehensive keyboard shortcut blocking
- Navigation whitelisting
- Kiosk mode enforcement
- Security event monitoring
- Type-safe IPC communication
- No Node.js exposure to renderer

All code is well-documented, type-safe, and follows the architecture outlined in `DESIGN.md`.
