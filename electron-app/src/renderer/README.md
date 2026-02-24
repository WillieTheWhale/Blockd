# Blockd Renderer Process

This directory contains all renderer process code for the Blockd Electron app.

## Structure

```
renderer/
├── index.html              # Main HTML entry point
├── index.ts                # Renderer entry point - orchestrates all modules
├── blockd.d.ts             # TypeScript declarations for window.blockd API
│
├── eye-tracking/           # Eye tracking using MediaPipe FaceMesh
│   ├── eye-tracker.ts      # Main eye tracker controller
│   ├── face-detector.ts    # MediaPipe FaceMesh wrapper
│   ├── gaze-estimator.ts   # Gaze point estimation from landmarks
│   ├── kalman-filter.ts    # Smoothing filter for gaze data
│   ├── calibration.ts      # 9-point calibration system
│   └── index.ts            # Module exports
│
├── video/                  # Video capture modules
│   ├── webcam-capture.ts   # Webcam capture (640x480 @ 30fps)
│   ├── screen-capture.ts   # Screen capture (1920x1080 @ 5fps)
│   └── index.ts            # Module exports
│
├── meeting/                # Meeting platform detection
│   ├── meeting-detector.ts # URL-based meeting detection
│   └── index.ts            # Module exports
│
└── ui/                     # User interface
    ├── app.ts              # Main UI controller (vanilla TypeScript)
    ├── components/         # Future UI components
    └── index.ts            # Module exports
```

## Modules

### 1. Video Capture

#### Webcam Capture (`video/webcam-capture.ts`)
Captures webcam video stream for recording interviewee's face.

**Configuration:**
- Resolution: 640x480
- Frame rate: 30 fps
- Format: JPEG (quality: 0.8)
- Facing mode: User (front camera)

**Usage:**
```typescript
import { WebcamCapture } from './video';

const webcam = new WebcamCapture({
  width: 640,
  height: 480,
  frameRate: 30
});

await webcam.initialize();
await webcam.start();

// Frames are automatically sent to main process via IPC
```

**Features:**
- Automatic camera permission handling
- Frame capture using canvas API
- JPEG encoding with configurable quality
- Status callbacks for monitoring
- Automatic IPC communication with main process

#### Screen Capture (`video/screen-capture.ts`)
Captures screen content (meeting tab) for recording interviewer's screen share.

**Configuration:**
- Resolution: 1920x1080
- Frame rate: 5 fps (lower for bandwidth efficiency)
- Format: JPEG (quality: 0.7)

**Usage:**
```typescript
import { ScreenCapture } from './video';

const screen = new ScreenCapture({
  width: 1920,
  height: 1080,
  frameRate: 5
});

await screen.initialize();
await screen.start();
```

**Features:**
- Uses `getDisplayMedia` API
- Aspect ratio preservation
- Automatic stream ending detection
- Lower framerate for reduced bandwidth

### 2. Meeting Detection

#### Meeting Detector (`meeting/meeting-detector.ts`)
Detects meeting platform from URL and tracks meeting state.

**Supported Platforms:**
- Google Meet (`meet.google.com/*`)
- Zoom (`*.zoom.us/j/*`, `zoom.us/wc/join/*`)
- Microsoft Teams (`teams.microsoft.com/*`, `teams.live.com/*`)

**Usage:**
```typescript
import { MeetingDetector } from './meeting';

const detector = new MeetingDetector({
  checkIntervalMs: 1000,
  enableAutoDetection: true
});

detector.onMeetingDetected((meeting) => {
  console.log('Meeting detected:', meeting.platform);
});

detector.start();
```

**Features:**
- URL pattern matching
- Automatic URL monitoring
- Meeting ID extraction
- Platform-specific detection
- Automatic IPC notification to main process

### 3. User Interface

#### App UI (`ui/app.ts`)
Simple vanilla TypeScript UI showing session status and controls.

**Components:**
- Session status display
- Backend connection indicator
- Eye tracking status (with FPS and face detection)
- Webcam capture status
- Meeting detection indicator
- Security alerts list
- Calibration button

**Usage:**
```typescript
import { AppUI } from './ui';

const ui = new AppUI();
ui.initialize('app');

// Update status
ui.updateSessionStatus('active', sessionId);
ui.updateBackendStatus(true);
ui.updateEyeTrackerStatus(eyeTrackerStatus);
```

**Features:**
- Clean, dark-themed UI
- Real-time status updates
- Security alert display
- Calibration control
- No external UI framework dependencies (vanilla TypeScript)

### 4. Main Entry Point

#### Renderer Index (`index.ts`)
Orchestrates all renderer modules and handles IPC events.

**Responsibilities:**
1. Initialize all modules
2. Set up IPC event listeners
3. Coordinate module lifecycle
4. Handle session start/end
5. Display loading/error screens

**Lifecycle:**
1. App loads → Shows loading screen
2. Modules initialize
3. IPC listeners registered
4. System info loaded
5. Loading screen hidden, app shown

**Session Flow:**
1. Session started event → Initialize eye tracker, start webcam
2. Session active → All modules running
3. Session ended event → Stop all modules

## IPC Communication

All renderer modules communicate with the main process via `window.blockd` API exposed by the preload script.

### Available APIs

**Session Management:**
```typescript
window.blockd.session.start(request)
window.blockd.session.end()
window.blockd.session.getStatus()
```

**Eye Tracking:**
```typescript
window.blockd.eyeTracking.sendGazeBatch(batch)
window.blockd.eyeTracking.sendCalibration(result)
```

**Video Capture:**
```typescript
window.blockd.video.sendFrame(frame)
```

**Meeting Detection:**
```typescript
window.blockd.meeting.detected(info)
window.blockd.meeting.ended(info)
```

**Event Listeners:**
```typescript
window.blockd.on.sessionStarted(callback)
window.blockd.on.backendConnected(callback)
window.blockd.on.securityAlert(callback)
// ... and more
```

## Building

The renderer process is built using Vite:

```bash
# Build renderer
npm run build:renderer

# Or build everything
npm run build
```

Vite configuration is in `vite.config.ts`.

## Development Notes

### Eye Tracking Integration
The eye tracker module is already fully implemented in `eye-tracking/` directory. The main renderer entry point initializes it and coordinates with webcam capture.

### Video Frame Encoding
Both webcam and screen capture use canvas-based JPEG encoding. Frames are sent to the main process as `Uint8Array` for backend transmission.

### Meeting Detection
The meeting detector monitors URL changes every second. It uses regex patterns to identify meeting platforms and extract meeting IDs.

### UI Framework
The UI is intentionally kept simple using vanilla TypeScript/HTML/CSS. This avoids:
- Additional bundle size from React/Vue
- Build complexity
- Runtime overhead

If more complex UI is needed later, React/Vue can be added easily.

### Error Handling
All modules include error callbacks and logging. Errors are reported via:
1. Console logging
2. Callback functions
3. UI error display (for critical errors)

## Testing

Unit tests can be added in `tests/unit/renderer/`:

```typescript
import { describe, it, expect } from 'vitest';
import { MeetingDetector } from '@renderer/meeting';

describe('MeetingDetector', () => {
  it('should detect Google Meet URLs', () => {
    const detector = new MeetingDetector();
    const result = detector.checkUrl('https://meet.google.com/abc-defg-hij');
    expect(result?.platform).toBe('google_meet');
  });
});
```

## Security Considerations

1. **Sandbox:** Renderer runs in sandboxed mode with no direct Node.js access
2. **CSP:** Content Security Policy restricts external resources
3. **IPC:** All communication goes through type-safe IPC channels
4. **No eval():** No dynamic code execution
5. **Camera permissions:** Requested explicitly with user consent

## Future Enhancements

1. **React UI:** Migrate to React for more complex UI needs
2. **Screen Recording:** Full screen recording capability
3. **Audio Capture:** Microphone capture for interview recording
4. **Advanced Detection:** ML-based cheating detection in renderer
5. **Performance Monitoring:** Frame drop detection and reporting
