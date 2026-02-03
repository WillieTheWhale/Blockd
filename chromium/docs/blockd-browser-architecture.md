# Blockd Browser Architecture

> **Version:** 1.0
> **Based on:** Chromium 142.0.7444.175

This document describes the architecture of the Blockd Interview Browser, a custom Chromium fork designed for secure technical interviews.

## Overview

Blockd Browser is an enterprise interview security platform that combines:
- Custom Chromium browser with native security monitoring
- AI-powered answer detection using multi-LLM analysis
- Eye tracking and gaze analysis for attention monitoring
- Real-time video streaming and session management

---

## Process Architecture

### Multi-Process Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      BROWSER PROCESS                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Security       │  │   Telemetry     │  │   Backend       │  │
│  │  Service        │  │   Service       │  │   Connector     │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │            │
│           └────────────────────┼────────────────────┘            │
│                                │                                 │
│                          Mojo IPC                                │
│                                │                                 │
└────────────────────────────────┼─────────────────────────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ RENDERER PROC   │  │ RENDERER PROC   │  │  GPU PROCESS    │
│                 │  │                 │  │                 │
│ ┌─────────────┐ │  │ ┌─────────────┐ │  │ Video encoding  │
│ │ Eye Tracker │ │  │ │ Video       │ │  │ Hardware accel  │
│ │ Face Detect │ │  │ │ Capturer    │ │  │                 │
│ │ Gaze Estim. │ │  │ │             │ │  │                 │
│ └─────────────┘ │  │ └─────────────┘ │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Module Breakdown

### Browser Process Services

#### BlockedSecurityService

**Location:** `chrome/browser/blocked/blocked_security/`

**Responsibilities:**
- Process enumeration and monitoring
- Screen recording detection (OBS, Camtasia, ScreenFlow)
- Virtual machine detection (VMware, VirtualBox, Hyper-V)
- Window focus tracking
- Clipboard operation monitoring

**Interface:**
```cpp
class BlockedSecurityService : public KeyedService {
 public:
  // Monitoring control
  void StartMonitoring();
  void StopMonitoring();

  // Risk assessment
  float GetCurrentRiskLevel();  // 0.0 - 1.0

  // Event subscription
  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);
};
```

**Security Events:**
| Event Type | Description | Risk Level |
|------------|-------------|------------|
| `SUSPICIOUS_PROCESS` | Forbidden process detected | High |
| `SCREEN_RECORDING` | Screen recording software active | Critical |
| `VM_DETECTED` | Virtual machine environment | High |
| `WINDOW_FOCUS_LOST` | Browser lost focus | Medium |
| `CLIPBOARD_ACTIVITY` | Suspicious clipboard access | Low-Medium |
| `MULTIPLE_DISPLAYS` | Additional monitors detected | Medium |

---

#### BlockedTelemetryService

**Location:** `chrome/browser/blocked/blocked_telemetry/`

**Responsibilities:**
- CPU usage monitoring
- Memory usage tracking
- Active process counting
- Window focus state reporting

**Data Collection Interval:** 1 second

**Telemetry Payload:**
```protobuf
message TelemetryData {
  float cpu_usage_percent = 1;
  int64 memory_usage_mb = 2;
  int32 process_count = 3;
  bool window_focused = 4;
  int64 timestamp = 5;
}
```

---

#### BlockedBackendConnector

**Location:** `chrome/browser/blocked/blocked_ipc/`

**Responsibilities:**
- WebSocket connection management
- Message serialization (Protocol Buffers)
- Reconnection logic with exponential backoff
- Heartbeat management
- Message queuing (max 100 messages)

**Connection States:**
```
DISCONNECTED → CONNECTING → CONNECTED → DISCONNECTING → DISCONNECTED
                    │                         │
                    └─────── ERROR ───────────┘
```

**Reconnection Strategy:**
- Initial delay: 1 second
- Max delay: 30 seconds
- Backoff multiplier: 2x
- Max attempts: 5 (then notify user)

---

#### BlockedVideoCaptureService

**Location:** `chrome/browser/blocked/blocked_video/`

**Responsibilities:**
- Video capture state management
- Coordinate with renderer process video capturer
- Forward frames to backend connector

**Capture States:**
```
IDLE → INITIALIZING → CAPTURING → STOPPED
            │               │
            └─── ERROR ─────┘
```

---

#### MeetingPlatformDetector

**Location:** `chrome/browser/blocked/blocked_meeting/`

**Responsibilities:**
- URL pattern matching for meeting platforms
- Navigation interception
- Stream initiation control

**Supported Platforms:**
| Platform | URL Patterns |
|----------|--------------|
| Google Meet | `meet.google.com/*` |
| Zoom | `*.zoom.us/*`, `zoom.us/*` |
| Microsoft Teams | `teams.microsoft.com/*`, `teams.live.com/*` |

**Detection Events:**
```cpp
enum class MeetingEvent {
  MEETING_PAGE_ENTERED,
  MEETING_STARTED,
  MEETING_PAUSED,
  MEETING_ENDED,
  MEETING_PAGE_LEFT
};
```

---

#### MeetingFullscreenController

**Location:** `chrome/browser/blocked/blocked_meeting/`

**Responsibilities:**
- Auto-enter fullscreen when meeting detected
- Lock fullscreen during active calls
- Block ESC key and exit attempts
- Auto-unlock when meeting ends

**Fullscreen States:**
| State | Fullscreen | Locked | Trigger |
|-------|------------|--------|---------|
| No meeting | No | No | Default |
| Meeting detected | Yes | No | URL match |
| In call | Yes | Yes | Call started |
| Call ended | Yes | No | Call ended |
| Meeting left | No | No | Tab closed/navigated |

---

#### MediaStreamCapture

**Location:** `chrome/browser/blocked/blocked_video/`

**Responsibilities:**
- Capture interviewee webcam for security monitoring
- Capture meeting tab video for Mode Collapse analysis
- Capture meeting tab audio for question extraction

**Stream Types:**
| Type | Source | Purpose |
|------|--------|---------|
| `kIntervieweeCamera` | Webcam | Security analysis |
| `kInterviewerScreen` | Tab capture | Mode Collapse |
| `kInterviewerAudio` | Tab audio | Question extraction |

**Configuration:**
```cpp
struct MediaCaptureConfig {
  bool capture_video = true;
  int video_width = 640;
  int video_height = 480;
  int video_fps = 15;
  bool capture_tab_video = true;
  bool capture_tab_audio = true;
};
```

---

#### MeetingStreamController

**Location:** `chrome/browser/blocked/blocked_meeting/`

**Responsibilities:**
- Coordinate MediaStreamCapture with meeting detection
- Forward captured frames/audio to backend
- Manage streaming state

**Observer Interface:**
```cpp
class MediaStreamCaptureObserver {
  virtual void OnFrameCaptured(const CapturedFrame& frame) = 0;
  virtual void OnAudioCaptured(const CapturedAudio& audio) = 0;
  virtual void OnCaptureStarted(StreamType type) = 0;
  virtual void OnCaptureStopped(StreamType type, const std::string& reason) = 0;
};
```

---

### Renderer Process Modules

#### EyeTracker

**Location:** `content/renderer/blocked_eye_tracking/`

**Components:**
- `FaceDetector` - MediaPipe FaceMesh (468 landmarks)
- `GazeEstimator` - Gaze vector computation
- `CalibrationOverlay` - 9-point calibration UI
- `EyeTrackingWorker` - Background processing thread

**Processing Pipeline:**
```
Webcam Frame → Face Detection → Landmark Extraction
                                        │
                                        ▼
                              Gaze Estimation
                                        │
                                        ▼
                              Calibration Transform
                                        │
                                        ▼
                              Screen Coordinates
                                        │
                                        ▼
                              Batch to Browser Process
```

**Gaze Data Structure:**
```cpp
struct GazeData {
  float x;              // 0.0 - 1.0 (normalized screen X)
  float y;              // 0.0 - 1.0 (normalized screen Y)
  float confidence;     // 0.0 - 1.0 (detection quality)
  bool is_off_screen;   // True if looking away
  std::string off_screen_direction;  // "left", "right", "up", "down"
  base::TimeTicks timestamp;
};
```

**Performance Targets:**
- Processing rate: 30 FPS
- Latency: < 50ms
- Confidence threshold: 0.7

---

#### VideoCapturer

**Location:** `content/renderer/blocked_video/`

**Responsibilities:**
- Webcam stream acquisition
- Constraint handling (resolution, FPS)
- Frame encoding
- IPC to browser process

**Supported Formats:**
| Format | Description |
|--------|-------------|
| I420 | YUV 4:2:0 planar |
| NV12 | YUV 4:2:0 semi-planar |
| RGB24 | RGB 8-8-8 |
| H264 | Hardware encoded |

**Frame Metadata:**
```cpp
struct VideoFrameMetadata {
  VideoFormat format;
  int32_t width;
  int32_t height;
  base::TimeTicks capture_time;
  int64_t frame_id;
};
```

---

### UI Modifications

#### BlockedBrowserController

**Location:** `chrome/browser/ui/blocked/`

**Responsibilities:**
- Session lockdown enforcement
- Fullscreen management
- Navigation restrictions
- Keyboard shortcut filtering

**Blocked Keyboard Shortcuts:**
- `Ctrl+T` - New tab
- `Ctrl+N` - New window
- `Ctrl+Shift+N` - Incognito window
- `Alt+Tab` - Task switching (OS level)
- `Ctrl+W` - Close tab
- `F12` - DevTools

**Session States:**
```cpp
enum class SessionState {
  INACTIVE,       // No session, normal browser
  INITIALIZING,   // Session starting, connecting
  CALIBRATING,    // Eye tracking calibration
  ACTIVE,         // Interview in progress, locked down
  PAUSED,         // Temporarily paused
  ENDED           // Session complete, unlock pending
};
```

---

## Mojo IPC Interfaces

### eye_tracking.mojom

```mojom
module blocked.mojom;

struct GazeData {
  float x;
  float y;
  float confidence;
  bool is_off_screen;
  string off_screen_direction;
  mojo_base.mojom.TimeTicks timestamp;
};

struct CalibrationPoint {
  float screen_x;
  float screen_y;
  array<GazeData> samples;
};

interface EyeTrackingHost {
  OnGazeUpdate(GazeData data);
  OnGazeBatch(array<GazeData> batch);
  OnCalibrationComplete(array<CalibrationPoint> points);
  OnEyeTrackingError(string error);
};

interface EyeTrackingClient {
  StartEyeTracking(string session_id);
  StopEyeTracking();
  StartCalibration();
};
```

### session.mojom

```mojom
module blocked.mojom;

enum SessionState {
  IDLE,
  INITIALIZING,
  CALIBRATING,
  ACTIVE,
  PAUSED,
  ENDED,
  ERROR
};

struct SessionConfig {
  string session_id;
  string backend_url;
  bool eye_tracking_enabled;
  bool video_capture_enabled;
  bool security_monitoring_enabled;
};

interface BlockedSessionHost {
  OnRendererReady();
  OnSessionEvent(string event_type, string data);
  GetSessionState() => (SessionState state);
  BindEyeTracking();
  BindVideoCapture();
};

interface BlockedSessionClient {
  OnSessionStateChanged(SessionState state);
  OnSessionConfig(SessionConfig config);
  EndSession();
};
```

### video_capture.mojom

```mojom
module blocked.mojom;

enum VideoFormat {
  I420,
  NV12,
  RGB24,
  H264
};

struct VideoFrameMetadata {
  VideoFormat format;
  int32 width;
  int32 height;
  mojo_base.mojom.TimeTicks capture_time;
  int64 frame_id;
};

interface VideoCaptureHost {
  OnVideoFrame(mojo_base.mojom.BigBuffer frame_data, VideoFrameMetadata metadata);
  OnEncodedFrame(mojo_base.mojom.BigBuffer data, mojo_base.mojom.TimeTicks timestamp);
  OnCaptureStarted();
  OnCaptureStopped();
};

interface VideoCaptureClient {
  StartCapture(int32 width, int32 height, int32 fps);
  StopCapture();
};
```

---

## Data Flow

### Interview Session Flow

```
1. User opens Blockd Browser
   └─→ Show login page (blockd.site/login)

2. User authenticates
   └─→ Redirect to session page
   └─→ Initialize services

3. User enters meeting URL (Meet/Zoom/Teams)
   └─→ MeetingPlatformDetector triggers
   └─→ Enable fullscreen lock
   └─→ Start security monitoring
   └─→ Start eye tracking
   └─→ Start video capture

4. Interview in progress
   └─→ Continuous monitoring
   └─→ Gaze data batched and sent (every 100ms)
   └─→ Security events sent immediately
   └─→ Telemetry sent (every 1s)

5. Meeting ends
   └─→ MeetingPlatformDetector detects
   └─→ Stop capture
   └─→ Disable fullscreen lock
   └─→ Show session summary
```

### Backend Communication Flow

```
Browser Process                    Backend Server
      │                                  │
      │──── SESSION_VALIDATE ───────────>│
      │<─── SESSION_VALIDATED ───────────│
      │                                  │
      │──── SESSION_START ──────────────>│
      │<─── SESSION_CONFIG ──────────────│
      │                                  │
      │──── GAZE_DATA (batch) ──────────>│
      │──── TELEMETRY_DATA ─────────────>│
      │──── SECURITY_EVENT ─────────────>│
      │<─── ANALYSIS_RESULT ─────────────│
      │                                  │
      │──── HEARTBEAT ──────────────────>│
      │<─── HEARTBEAT_ACK ───────────────│
      │                                  │
      │──── SESSION_END ────────────────>│
      │<─── SESSION_SUMMARY ─────────────│
```

---

## JavaScript API

### window.BlockedAPI

Exposed to interview pages for controlled interaction:

```javascript
// Eye tracking control
BlockedAPI.startEyeTracking();
BlockedAPI.stopEyeTracking();
BlockedAPI.calibrate();

// Video capture control
BlockedAPI.startVideoCapture();
BlockedAPI.stopVideoCapture();

// Session information
BlockedAPI.getSessionId();       // Returns session UUID
BlockedAPI.isSessionActive();    // Returns boolean
BlockedAPI.getSessionState();    // Returns state string

// Event listeners
BlockedAPI.addEventListener('sessionStateChanged', (state) => {
  console.log('Session state:', state);
});

BlockedAPI.addEventListener('calibrationComplete', (points) => {
  console.log('Calibration complete');
});

BlockedAPI.addEventListener('error', (error) => {
  console.error('Blocked error:', error);
});
```

---

## Security Considerations

### Sandboxing

- Renderer processes are heavily sandboxed
- Sensitive operations only in browser process
- No direct network access from renderer

### Data Protection

- All backend communication over TLS
- No local storage of sensitive data
- Session tokens expire after use

### Anti-Tampering

- DevTools disabled in session
- Context menu disabled
- Keyboard shortcuts blocked
- Source view disabled

---

## Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Eye tracking latency | < 50ms | Time from capture to backend |
| Video frame rate | 30 FPS | Consistent during session |
| Memory usage | < 500 MB | Browser process |
| CPU usage | < 30% | Idle (no meeting) |
| CPU usage | < 50% | Active (meeting + tracking) |
| Reconnection time | < 5s | On network disruption |

---

## Configuration

### Feature Flags (args.gn)

```gn
# Enable/disable features
blockd_enable_security_monitoring = true
blockd_enable_eye_tracking = true
blockd_enable_telemetry = true
blockd_enable_video_capture = true
blockd_enable_meeting_detection = true

# Backend configuration
blockd_backend_url = "wss://api.blockd.site"
blockd_default_homepage = "https://blockd.site/session"
```

### Runtime Configuration

Backend sends configuration on session start:

```json
{
  "session_id": "uuid",
  "features": {
    "eye_tracking": true,
    "video_capture": true,
    "security_monitoring": true
  },
  "thresholds": {
    "gaze_off_screen_warning": 3,
    "risk_level_alert": 0.7
  }
}
```

---

*Document maintained by Blockd Engineering Team*
