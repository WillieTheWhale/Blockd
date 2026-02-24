# Blockd Electron App - Design Document

## Overview

The Blockd Electron App is an alternative to the custom Chromium browser for interviewees. It provides interview integrity monitoring through security features, eye tracking, and video capture.

## Important Limitations

Electron has fundamental limitations compared to a native Chromium fork:

| Feature | Chromium Fork | Electron | Mitigation |
|---------|---------------|----------|------------|
| OS-level shortcuts (Alt+Tab) | Can block | Cannot block | Server-side detection via focus monitoring |
| Screen capture prevention | Native | Partial (setContentProtection) | Detect recording software |
| VM detection | Deep | Bypassable | Best-effort detection + server-side verification |
| Process termination | Can terminate | Can only detect | Report suspicious processes to backend |
| Kiosk escape prevention | Native | macOS dock issue | Warn user, log escape attempts |

**Design Philosophy**: Since client-side lockdown cannot be perfect, we emphasize **detection over prevention**. All suspicious activities are reported to the backend for human review.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ELECTRON APP                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      MAIN PROCESS (Node.js)                      │    │
│  │                                                                   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │    │
│  │  │   Security   │  │   Window     │  │   Backend    │           │    │
│  │  │   Monitor    │  │   Manager    │  │   Connector  │           │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │    │
│  │                                                                   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │    │
│  │  │   Process    │  │   Telemetry  │  │   Session    │           │    │
│  │  │   Monitor    │  │   Collector  │  │   Manager    │           │    │
│  └──└──────────────┘──└──────────────┘──└──────────────┘───────────┘    │
│           │                   │                   │                      │
│           │            IPC Bridge (contextBridge)                        │
│           │                   │                   │                      │
│  ┌────────▼───────────────────▼───────────────────▼────────────────┐    │
│  │                   RENDERER PROCESS (Sandboxed)                   │    │
│  │                                                                   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │    │
│  │  │  Eye Tracker │  │   Video      │  │   Meeting    │           │    │
│  │  │  (MediaPipe) │  │   Capture    │  │   Detector   │           │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │    │
│  │                                                                   │    │
│  │  ┌────────────────────────────────────────────────────┐         │    │
│  │  │                    WebView / BrowserView            │         │    │
│  │  │              (Meeting Platform Content)             │         │    │
│  └──└────────────────────────────────────────────────────┘─────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                   WSS
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Blockd Backend    │
                         │   api.blockd.site   │
                         └─────────────────────┘
```

---

## Directory Structure

```
electron-app/
├── package.json
├── electron-builder.json
├── tsconfig.json
├── DESIGN.md
│
├── src/
│   ├── main/                      # Main process
│   │   ├── index.ts               # Entry point
│   │   ├── window-manager.ts      # BrowserWindow management
│   │   ├── security/
│   │   │   ├── security-monitor.ts    # Orchestrates all security checks
│   │   │   ├── process-monitor.ts     # Detects suspicious processes
│   │   │   ├── vm-detector.ts         # VM/virtualization detection
│   │   │   ├── screen-recorder-detector.ts
│   │   │   ├── focus-monitor.ts       # Window focus tracking
│   │   │   └── clipboard-monitor.ts
│   │   ├── backend/
│   │   │   ├── backend-connector.ts   # WebSocket connection
│   │   │   ├── protocol.ts            # Message types
│   │   │   └── message-queue.ts       # Offline message queueing
│   │   ├── session/
│   │   │   ├── session-manager.ts     # Session lifecycle
│   │   │   └── settings-store.ts      # Encrypted settings storage
│   │   └── telemetry/
│   │       └── telemetry-collector.ts # System metrics
│   │
│   ├── preload/                   # Preload scripts
│   │   └── preload.ts             # contextBridge API exposure
│   │
│   ├── renderer/                  # Renderer process
│   │   ├── index.html
│   │   ├── index.ts
│   │   ├── eye-tracking/
│   │   │   ├── eye-tracker.ts
│   │   │   ├── face-detector.ts       # MediaPipe wrapper
│   │   │   ├── gaze-estimator.ts
│   │   │   ├── kalman-filter.ts
│   │   │   └── calibration.ts
│   │   ├── video/
│   │   │   ├── webcam-capture.ts
│   │   │   └── screen-capture.ts
│   │   ├── meeting/
│   │   │   └── meeting-detector.ts
│   │   └── ui/
│   │       ├── app.tsx
│   │       ├── components/
│   │       └── styles/
│   │
│   └── shared/                    # Shared types
│       ├── types.ts
│       ├── constants.ts
│       └── ipc-channels.ts
│
├── assets/
│   ├── icons/
│   │   ├── icon.ico
│   │   ├── icon.icns
│   │   └── icon.png
│   └── mediapipe/                 # MediaPipe WASM files
│
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

---

## Module Specifications

### 1. Main Process Modules

#### 1.1 Security Monitor (`security-monitor.ts`)

```typescript
interface SecurityMonitor {
  start(): void;
  stop(): void;
  onSecurityEvent(callback: (event: SecurityEvent) => void): void;
}

interface SecurityEvent {
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  description: string;
  metadata: Record<string, unknown>;
}

enum SecurityEventType {
  SUSPICIOUS_PROCESS = 'suspicious_process',
  SCREEN_RECORDING_DETECTED = 'screen_recording_detected',
  VM_DETECTED = 'vm_detected',
  WINDOW_FOCUS_LOST = 'window_focus_lost',
  CLIPBOARD_ACTIVITY = 'clipboard_activity',
  MULTIPLE_MONITORS = 'multiple_monitors',
  FULLSCREEN_EXIT_ATTEMPT = 'fullscreen_exit_attempt'
}
```

#### 1.2 Process Monitor (`process-monitor.ts`)

Uses `systeminformation` package to detect suspicious processes.

```typescript
const suspiciousProcessPatterns = [
  // Screen Recording
  /obs/i, /obs64/i, /camtasia/i, /bandicam/i, /screenflow/i,
  /fraps/i, /action!/i, /xsplit/i, /streamlabs/i,
  // Remote Access
  /teamviewer/i, /anydesk/i, /rustdesk/i, /vnc/i,
  // VM Tools
  /vmtoolsd/i, /vboxservice/i, /vboxtray/i,
  // Chat/AI
  /chatgpt/i, /copilot/i
];
```

#### 1.3 VM Detector (`vm-detector.ts`)

Multi-method VM detection:
- CPUID hypervisor bit (via native module)
- MAC address prefixes (VMware, VirtualBox, Hyper-V)
- BIOS/SMBIOS strings
- Hardware model strings
- Registry keys (Windows)
- DMI data (Linux)

#### 1.4 Backend Connector (`backend-connector.ts`)

WebSocket connection to backend with:
- Automatic reconnection (exponential backoff)
- Message queueing when offline
- Heartbeat (30-second interval)
- Protocol Buffer serialization (using `protobufjs`)

#### 1.5 Window Manager (`window-manager.ts`)

```typescript
interface WindowManagerConfig {
  kiosk: boolean;
  fullscreen: boolean;
  alwaysOnTop: boolean;
  frame: boolean;
  devTools: boolean;
}

// Key features:
// - Enter/exit fullscreen
// - Block exit attempts during session
// - Prevent DevTools
// - Block new windows
// - Navigation whitelist
```

### 2. Renderer Process Modules

#### 2.1 Eye Tracker (`eye-tracker.ts`)

MediaPipe FaceMesh integration:
- 30 FPS face landmark detection
- Gaze vector estimation from iris position
- Kalman filter smoothing
- Off-screen detection
- 9-point calibration

#### 2.2 Video Capture (`webcam-capture.ts`)

```typescript
interface VideoCaptureConfig {
  width: number;    // 640
  height: number;   // 480
  frameRate: number; // 30
  facingMode: 'user';
}

// Captures webcam stream using getUserMedia
// Sends frames to main process for backend transmission
```

#### 2.3 Meeting Detector (`meeting-detector.ts`)

URL pattern matching for:
- Google Meet: `meet.google.com/*`
- Zoom: `*.zoom.us/*`, `zoom.us/*`
- Microsoft Teams: `teams.microsoft.com/*`, `teams.live.com/*`

---

## IPC Channels

```typescript
// Main -> Renderer
const MainToRenderer = {
  SESSION_STARTED: 'session:started',
  SESSION_ENDED: 'session:ended',
  SECURITY_ALERT: 'security:alert',
  BACKEND_CONNECTED: 'backend:connected',
  BACKEND_DISCONNECTED: 'backend:disconnected',
};

// Renderer -> Main
const RendererToMain = {
  START_SESSION: 'session:start',
  END_SESSION: 'session:end',
  GAZE_DATA: 'gaze:data',
  VIDEO_FRAME: 'video:frame',
  CALIBRATION_COMPLETE: 'calibration:complete',
  MEETING_DETECTED: 'meeting:detected',
  MEETING_ENDED: 'meeting:ended',
};
```

---

## Security Configuration

### BrowserWindow Settings

```typescript
const secureWindowConfig: BrowserWindowConstructorOptions = {
  width: 1280,
  height: 720,
  fullscreen: true,
  kiosk: true,
  frame: false,
  autoHideMenuBar: true,
  alwaysOnTop: true,
  closable: false,      // During session
  minimizable: false,   // During session
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    devTools: false,
    preload: path.join(__dirname, 'preload.js'),
  },
};
```

### Keyboard Shortcut Blocking

```typescript
const blockedShortcuts = [
  { key: 'F12' },                           // DevTools
  { key: 'I', modifiers: ['ctrl', 'shift'] }, // DevTools
  { key: 'Escape' },                         // Exit fullscreen
  { key: 'F11' },                            // Toggle fullscreen
  { key: 'T', modifiers: ['ctrl'] },         // New tab
  { key: 'N', modifiers: ['ctrl'] },         // New window
  { key: 'W', modifiers: ['ctrl'] },         // Close tab
  { key: 'F4', modifiers: ['alt'] },         // Close window
  { key: 'F5' },                             // Refresh
  { key: 'R', modifiers: ['ctrl'] },         // Refresh
];
```

### Navigation Whitelist

```typescript
const allowedOrigins = [
  'https://blockd.site',
  'https://api.blockd.site',
  'https://meet.google.com',
  'https://zoom.us',
  'https://*.zoom.us',
  'https://teams.microsoft.com',
  'https://teams.live.com',
];
```

---

## Backend Communication Protocol

### WebSocket Messages

```typescript
// Message envelope
interface BlockedMessage {
  type: MessageType;
  sessionId: string;
  timestamp: number;
  payload: unknown;
}

enum MessageType {
  SESSION_VALIDATE = 'session_validate',
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  SECURITY_EVENT = 'security_event',
  GAZE_DATA = 'gaze_data',
  TELEMETRY_DATA = 'telemetry_data',
  HEARTBEAT = 'heartbeat',
  VIDEO_FRAME = 'video_frame',
}

// Gaze data batch (sent every ~100ms, 3 points)
interface GazeDataBatch {
  points: GazePoint[];
}

interface GazePoint {
  x: number;          // 0-1 normalized
  y: number;          // 0-1 normalized
  confidence: number; // 0-1
  timestamp: number;
  isOffScreen: boolean;
  offScreenDirection?: 'left' | 'right' | 'up' | 'down';
}
```

---

## Build & Distribution

### Electron Builder Config

```json
{
  "appId": "site.blockd.interviewee",
  "productName": "Blockd",
  "directories": {
    "output": "dist"
  },
  "files": [
    "build/**/*",
    "assets/**/*"
  ],
  "win": {
    "target": "nsis",
    "icon": "assets/icons/icon.ico"
  },
  "mac": {
    "target": "dmg",
    "icon": "assets/icons/icon.icns",
    "hardenedRuntime": true,
    "entitlements": "build/entitlements.mac.plist"
  },
  "linux": {
    "target": ["AppImage", "deb"],
    "icon": "assets/icons"
  }
}
```

### macOS Entitlements

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.device.camera</key>
  <true/>
  <key>com.apple.security.device.microphone</key>
  <true/>
</dict>
</plist>
```

---

## Dependencies

### Production
- `electron` - Framework
- `systeminformation` - Process/system monitoring
- `ws` - WebSocket client
- `electron-store` - Encrypted local storage
- `@electron/fuses` - Build-time security

### Renderer (Eye Tracking)
- `@mediapipe/face_mesh` - Face landmark detection
- `@mediapipe/camera_utils` - Camera helper

### Development
- `typescript`
- `electron-builder`
- `vite` - Bundler for renderer
- `vitest` - Testing

---

## Testing Strategy

### Unit Tests
- Security detection logic
- Gaze estimation algorithms
- Message serialization

### Integration Tests
- IPC communication
- Backend connection
- MediaPipe integration

### E2E Tests
- Full session flow
- Meeting detection
- Security event reporting

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Project setup with TypeScript
- [ ] Main process entry point
- [ ] Window manager with kiosk mode
- [ ] Preload script with IPC bridge

### Phase 2: Security Features
- [ ] Process monitor
- [ ] VM detector
- [ ] Focus monitor
- [ ] Screen recorder detector
- [ ] Keyboard shortcut blocking

### Phase 3: Backend Communication
- [ ] WebSocket connector
- [ ] Message queue
- [ ] Heartbeat system
- [ ] Session management

### Phase 4: Eye Tracking
- [ ] MediaPipe integration
- [ ] Gaze estimation
- [ ] Kalman filter
- [ ] Calibration UI

### Phase 5: Video Capture
- [ ] Webcam capture
- [ ] Frame encoding
- [ ] Stream to backend

### Phase 6: Meeting Integration
- [ ] Platform detection
- [ ] BrowserView for meetings
- [ ] Auto-lockdown on meeting

### Phase 7: Testing & Polish
- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Build & packaging
