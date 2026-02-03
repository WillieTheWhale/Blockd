# Blockd Browser System Design Document

> **Version:** 2.0
> **Last Updated:** January 2026
> **Chromium Base:** 142.0.7444.175

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Architecture](#architecture)
4. [Module Reference](#module-reference)
5. [Data Flow](#data-flow)
6. [Security Model](#security-model)
7. [Meeting Platform Integration](#meeting-platform-integration)
8. [Branding System](#branding-system)
9. [Build System](#build-system)
10. [Deployment](#deployment)
11. [API Reference](#api-reference)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)

---

## Executive Summary

Blockd Browser is a custom Chromium fork designed for secure technical interviews. It provides:

- **Native security monitoring** embedded at the browser process level
- **Meeting platform detection** with automatic fullscreen locking
- **Audio/video streaming** to backend for AI analysis
- **Eye tracking integration** for attention monitoring
- **Anti-tampering measures** including DevTools blocking and clipboard monitoring

Unlike browser extensions, Blockd's security features cannot be bypassed by users as they're compiled into the browser itself.

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BLOCKD BROWSER                                    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        BROWSER PROCESS                                │   │
│  │                                                                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  Security   │  │  Telemetry  │  │   Meeting   │  │   Backend   │  │   │
│  │  │  Service    │  │   Service   │  │  Detector   │  │  Connector  │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │   │
│  │         │                │                │                │         │   │
│  │         └────────────────┴────────────────┴────────────────┘         │   │
│  │                                    │                                  │   │
│  │                              Mojo IPC                                 │   │
│  │                                    │                                  │   │
│  └────────────────────────────────────┼──────────────────────────────────┘   │
│                                       │                                      │
│  ┌────────────────────────────────────┼──────────────────────────────────┐   │
│  │                        RENDERER PROCESS                               │   │
│  │                                    │                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │   │
│  │  │ Eye Tracker │  │   Video     │  │   IPC       │                   │   │
│  │  │ + FaceMesh  │  │  Capturer   │  │  Connector  │                   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                   │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ WebSocket (TLS)
                                       │ Protocol Buffers
                                       ▼
                        ┌──────────────────────────────┐
                        │      BLOCKD BACKEND          │
                        │                              │
                        │  ┌────────┐  ┌────────────┐  │
                        │  │  API   │  │ AI Analysis│  │
                        │  │Gateway │  │  Service   │  │
                        │  └────────┘  └────────────┘  │
                        │                              │
                        │  ┌────────┐  ┌────────────┐  │
                        │  │ Video  │  │  Session   │  │
                        │  │Service │  │  Service   │  │
                        │  └────────┘  └────────────┘  │
                        └──────────────────────────────┘
```

### Component Summary

| Component | Process | Purpose |
|-----------|---------|---------|
| BlockedSecurityService | Browser | Process/VM/screen recording detection |
| BlockedTelemetryService | Browser | CPU/memory/focus monitoring |
| MeetingPlatformDetector | Browser | Detect Meet/Zoom/Teams URLs |
| MeetingFullscreenController | Browser | Auto fullscreen lock/unlock |
| MeetingStreamController | Browser | Coordinate media streaming |
| MediaStreamCapture | Browser | Camera + tab capture |
| BlockedBackendConnector | Browser | WebSocket communication |
| EyeTracker | Renderer | MediaPipe gaze detection |
| VideoCapturer | Renderer | Webcam frame capture |
| GazeDataSender | Renderer | Batch gaze data to browser |

---

## Architecture

### Process Model

Blockd inherits Chromium's multi-process architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                     BROWSER PROCESS (Privileged)                │
│                                                                 │
│  • UI thread (main)           • Security monitoring             │
│  • IO thread                  • Backend communication           │
│  • File thread                • Session management              │
│  • Service workers            • Meeting detection               │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │     Mojo IPC          │
                    └───────────┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│   RENDERER    │       │   RENDERER    │       │     GPU       │
│   PROCESS     │       │   PROCESS     │       │   PROCESS     │
│   (Sandboxed) │       │   (Sandboxed) │       │   (Sandboxed) │
│               │       │               │       │               │
│ • Page render │       │ • Eye tracking│       │ • Compositing │
│ • JavaScript  │       │ • Video proc. │       │ • Encoding    │
│ • DOM         │       │ • WebGL       │       │ • Decoding    │
└───────────────┘       └───────────────┘       └───────────────┘
```

### IPC Communication

All inter-process communication uses **Mojo**, Chromium's IPC system:

```
Browser Process                         Renderer Process
      │                                       │
      │         ┌─────────────────┐           │
      │         │ eye_tracking    │           │
      │◄────────│    .mojom       │──────────►│
      │         └─────────────────┘           │
      │                                       │
      │         ┌─────────────────┐           │
      │         │ video_capture   │           │
      │◄────────│    .mojom       │──────────►│
      │         └─────────────────┘           │
      │                                       │
      │         ┌─────────────────┐           │
      │         │ session         │           │
      │◄────────│    .mojom       │──────────►│
      │         └─────────────────┘           │
```

---

## Module Reference

### Browser Process Modules

#### 1. BlockedSecurityService

**Location:** `chrome/browser/blocked/blocked_security/`

**Purpose:** Detect and report security threats during interview sessions.

**Capabilities:**
- Process enumeration and monitoring
- Screen recording software detection (OBS, Camtasia, ScreenFlow, etc.)
- Virtual machine detection (VMware, VirtualBox, Hyper-V, QEMU)
- Window focus tracking
- Clipboard operation monitoring
- Multi-display detection

**Security Events:**

| Event | Risk Level | Description |
|-------|------------|-------------|
| `SUSPICIOUS_PROCESS` | High | Forbidden process detected |
| `SCREEN_RECORDING` | Critical | Screen recording active |
| `VM_DETECTED` | High | Virtual machine environment |
| `WINDOW_FOCUS_LOST` | Medium | Browser lost focus |
| `CLIPBOARD_ACTIVITY` | Medium | Suspicious clipboard access |
| `MULTIPLE_DISPLAYS` | Medium | Additional monitors detected |

**Platform Implementations:**
- `platform/windows/windows_security_monitor.cc`
- `platform/macos/macos_security_monitor.mm`
- `platform/linux/linux_security_monitor.cc`

---

#### 2. MeetingPlatformDetector

**Location:** `chrome/browser/blocked/blocked_meeting/`

**Purpose:** Detect when user navigates to supported meeting platforms.

**Supported Platforms:**

| Platform | URL Patterns | Detection Method |
|----------|--------------|------------------|
| Google Meet | `meet.google.com/*` | URL match |
| Zoom | `*.zoom.us/*`, `zoom.us/*` | URL match |
| Microsoft Teams | `teams.microsoft.com/*`, `teams.live.com/*` | URL match |

**Observer Interface:**
```cpp
class MeetingPlatformObserver {
 public:
  virtual void OnMeetingDetected(const MeetingInfo& info) = 0;
  virtual void OnMeetingEnded(const MeetingInfo& info) = 0;
  virtual void OnMeetingStateChanged(const MeetingInfo& info, bool in_call) = 0;
};
```

---

#### 3. MeetingFullscreenController

**Location:** `chrome/browser/blocked/blocked_meeting/`

**Purpose:** Automatically manage fullscreen mode during meetings.

**Behavior:**
1. **Meeting detected** → Enter fullscreen automatically
2. **Call started** → Lock fullscreen (prevent exit)
3. **Call ended** → Unlock fullscreen
4. **Meeting page left** → Exit fullscreen

**Blocked Actions During Locked State:**
- ESC key to exit fullscreen
- F11 toggle
- Browser fullscreen menu
- Window resize/minimize

---

#### 4. MediaStreamCapture

**Location:** `chrome/browser/blocked/blocked_video/`

**Purpose:** Capture camera video and meeting tab audio/video for backend analysis.

**Stream Types:**

| Stream | Source | Purpose |
|--------|--------|---------|
| `kIntervieweeCamera` | Webcam | Security monitoring |
| `kInterviewerScreen` | Tab capture | Mode Collapse analysis |
| `kInterviewerAudio` | Tab audio | Question extraction |

**Configuration:**
```cpp
struct MediaCaptureConfig {
  // Video settings
  bool capture_video = true;
  int video_width = 640;
  int video_height = 480;
  int video_fps = 15;
  std::string video_format = "jpeg";

  // Audio settings
  bool capture_audio = true;
  int audio_sample_rate = 16000;
  int audio_channels = 1;
  int audio_chunk_ms = 1000;
  std::string audio_format = "opus";

  // Tab capture (interviewer screen/audio)
  bool capture_tab_video = true;
  bool capture_tab_audio = true;
  int tab_video_fps = 5;
};
```

---

#### 5. MeetingStreamController

**Location:** `chrome/browser/blocked/blocked_meeting/`

**Purpose:** Coordinate media streaming when meetings are detected.

**Flow:**
```
Meeting Detected
       │
       ▼
┌──────────────────┐
│ Initialize       │
│ MediaStreamCapture│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ Start Camera     │────►│ OnFrameCaptured  │──► Backend
│ Capture          │     │ (security)       │
└──────────────────┘     └──────────────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ Start Tab        │────►│ OnFrameCaptured  │──► Mode Collapse
│ Capture          │     │ (screen)         │
└──────────────────┘     └──────────────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ Start Audio      │────►│ OnAudioCaptured  │──► Question
│ Capture          │     │ (interviewer)    │    Extraction
└──────────────────┘     └──────────────────┘
```

---

#### 6. BlockedBackendConnector

**Location:** `chrome/browser/blocked/blocked_ipc/`

**Purpose:** Manage WebSocket connection to Blockd backend.

**Features:**
- Automatic reconnection with exponential backoff
- Message queuing (max 100 messages)
- Heartbeat management
- Protocol Buffer serialization

**Connection States:**
```
DISCONNECTED → CONNECTING → CONNECTED → DISCONNECTING
      ▲              │            │              │
      └──────────────┴────────────┴──────────────┘
                     (on error)
```

**Reconnection Strategy:**
- Initial delay: 1 second
- Max delay: 30 seconds
- Backoff multiplier: 2x
- Max attempts: 5 before user notification

---

### Renderer Process Modules

#### 7. EyeTracker

**Location:** `content/renderer/blocked_eye_tracking/`

**Components:**
- `FaceDetector` - MediaPipe FaceMesh (468 landmarks)
- `GazeEstimator` - Gaze vector computation
- `CalibrationOverlay` - 9-point calibration UI
- `EyeTrackingWorker` - Background processing thread

**Processing Pipeline:**
```
Webcam Frame (30 FPS)
        │
        ▼
┌─────────────────┐
│ Face Detection  │ MediaPipe FaceMesh
│ (468 landmarks) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Gaze Estimation │ Eye landmark → gaze vector
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Calibration     │ Raw → screen coordinates
│ Transform       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Batch & Send    │ Every 100ms to browser process
└─────────────────┘
```

**Performance Targets:**
| Metric | Target |
|--------|--------|
| Processing rate | 30 FPS |
| Latency | < 50ms |
| Confidence threshold | 0.7 |
| Batch interval | 100ms |

---

## Data Flow

### Interview Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. USER OPENS BLOCKD BROWSER                                                │
│    └─► Load default page: https://blockd.site/session                       │
│    └─► Show login (if first run)                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. USER AUTHENTICATES                                                       │
│    └─► JWT token issued                                                     │
│    └─► Backend connection established                                       │
│    └─► Session initialized                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. USER NAVIGATES TO MEETING (meet.google.com, zoom.us, teams.microsoft.com)│
│    └─► MeetingPlatformDetector triggers OnMeetingDetected                   │
│    └─► MeetingFullscreenController enters fullscreen                        │
│    └─► MeetingStreamController starts media capture                         │
│    └─► BlockedSecurityService begins monitoring                             │
│    └─► EyeTracker starts calibration                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. INTERVIEW IN PROGRESS                                                    │
│    ├─► Gaze data batched every 100ms → Backend                              │
│    ├─► Camera frames streamed → Backend (security analysis)                 │
│    ├─► Tab video/audio streamed → Backend (Mode Collapse)                   │
│    ├─► Security events sent immediately → Backend                           │
│    ├─► Telemetry sent every 1s → Backend                                    │
│    └─► Fullscreen locked (cannot exit)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. MEETING ENDS (user leaves meeting or closes tab)                         │
│    └─► MeetingPlatformDetector triggers OnMeetingEnded                      │
│    └─► MeetingFullscreenController unlocks and exits fullscreen             │
│    └─► MeetingStreamController stops media capture                          │
│    └─► Session summary displayed                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Backend Communication Protocol

```
Browser                                          Backend
   │                                                │
   │────────── SESSION_VALIDATE ───────────────────►│
   │◄───────── SESSION_VALIDATED ──────────────────│
   │                                                │
   │────────── SESSION_START ──────────────────────►│
   │◄───────── SESSION_CONFIG ─────────────────────│
   │                                                │
   │────────── GAZE_BATCH ─────────────────────────►│ (every 100ms)
   │────────── VIDEO_FRAME ────────────────────────►│ (camera)
   │────────── SCREEN_FRAME ───────────────────────►│ (tab capture)
   │────────── AUDIO_CHUNK ────────────────────────►│ (tab audio)
   │────────── TELEMETRY ──────────────────────────►│ (every 1s)
   │────────── SECURITY_EVENT ─────────────────────►│ (on detection)
   │◄───────── ANALYSIS_RESULT ────────────────────│ (async)
   │                                                │
   │────────── HEARTBEAT ──────────────────────────►│ (every 30s)
   │◄───────── HEARTBEAT_ACK ──────────────────────│
   │                                                │
   │────────── SESSION_END ────────────────────────►│
   │◄───────── SESSION_SUMMARY ────────────────────│
   │                                                │
```

---

## Security Model

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Screen recording | Detect recording software, alert proctor |
| Virtual machine | Detect VM environment, flag session |
| Copy/paste from external sources | Monitor clipboard, detect patterns |
| Window switching | Track focus, log all switches |
| Remote desktop | Detect RDP/VNC processes |
| Browser DevTools | Completely disabled in session |
| Extension tampering | No extension support in session mode |
| Network manipulation | TLS pinning, certificate validation |

### Sandboxing

```
┌─────────────────────────────────────────────────────────────────┐
│                    BROWSER PROCESS (Privileged)                 │
│                                                                 │
│  ✓ Network access        ✓ File system access                   │
│  ✓ Process enumeration   ✓ System APIs                          │
│  ✓ Backend communication ✓ Security monitoring                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                          Mojo IPC only
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   RENDERER PROCESS (Sandboxed)                  │
│                                                                 │
│  ✗ No direct network      ✗ No file system                      │
│  ✗ No process access      ✗ No system APIs                      │
│  ✓ DOM manipulation       ✓ JavaScript execution                │
│  ✓ WebGL/Canvas           ✓ MediaPipe (WASM)                    │
└─────────────────────────────────────────────────────────────────┘
```

### Anti-Tampering Measures

| Feature | Implementation |
|---------|----------------|
| DevTools disabled | `--disable-dev-tools` flag enforced |
| Context menu blocked | Right-click handler removed |
| View source blocked | Ctrl+U disabled |
| Keyboard shortcuts blocked | Ctrl+T, Ctrl+N, Ctrl+W, Alt+Tab intercepted |
| Extension isolation | Extensions disabled in session mode |
| Navigation restriction | Whitelist-only URL navigation |

---

## Meeting Platform Integration

### Detection Logic

```cpp
MeetingPlatform DetectPlatform(const GURL& url) {
  if (url.host() == "meet.google.com")
    return MeetingPlatform::kGoogleMeet;

  if (url.host().ends_with(".zoom.us") || url.host() == "zoom.us")
    return MeetingPlatform::kZoom;

  if (url.host() == "teams.microsoft.com" ||
      url.host() == "teams.live.com")
    return MeetingPlatform::kMicrosoftTeams;

  return MeetingPlatform::kNone;
}
```

### Fullscreen Lock Behavior

| Event | Action |
|-------|--------|
| Meeting page loaded | Enter fullscreen |
| User joins call | Lock fullscreen |
| User attempts ESC | Block, show notification |
| User leaves call | Unlock fullscreen |
| User closes meeting tab | Exit fullscreen |

### Media Capture Strategy

**Camera (Interviewee):**
- Captures user's webcam
- 640x480 @ 15 FPS
- JPEG encoding for bandwidth
- Sent to backend for security analysis

**Tab Video (Interviewer Screen):**
- Captures meeting tab content
- 1280x720 @ 5 FPS
- Shows what interviewer is presenting
- Used for Mode Collapse question extraction

**Tab Audio (Interviewer Voice):**
- Captures meeting tab audio
- 16kHz mono
- Opus encoding
- Transcribed for question detection

---

## Branding System

### Directory Structure

```
chrome/app/theme/blocked/
├── BRANDING                    # Product name definitions
├── product_logo_16.png         # 16x16 icon
├── product_logo_24.png         # 24x24 icon
├── product_logo_32.png         # 32x32 icon
├── product_logo_48.png         # 48x48 icon
├── product_logo_64.png         # 64x64 icon
├── product_logo_128.png        # 128x128 icon
├── product_logo_256.png        # 256x256 icon
├── product_logo_512.png        # 512x512 icon
├── product_logo_1024.png       # 1024x1024 icon
├── product_logo_22_mono.png    # macOS menu bar
├── blockd.ico                  # Windows multi-res icon
├── installer_logo.bmp          # Windows installer
├── fix_logos.py                # Icon generation script
├── logo_preview.html           # Visual preview page
├── linux/                      # Linux-specific icons
├── mac/                        # macOS assets
│   ├── app.icns
│   └── Assets.xcassets/
└── win/                        # Windows assets
    ├── blockd.ico
    └── app_list.ico
```

### Icon Specifications

| Property | Value |
|----------|-------|
| Shape | Rounded rectangle |
| Corner radius | 22% of icon size |
| Background | White (inside rounded area) |
| Transparency | Outside rounded corners |
| Logo | Black "B" with keyhole |
| Centering | Horizontal and vertical |
| Fill | 96% of canvas width |

### Generating Icons

```bash
cd chromium/src/chrome/app/theme/blocked
python fix_logos.py
```

The script:
1. Loads source from `Blockd_Landing/New_Logos_Colors/BLOCKD_Primary_logo.png`
2. Crops to B icon only (removes "BLOCKD" wordmark)
3. Centers in square canvas
4. Applies 22% rounded corners
5. Generates all sizes (16-1024px)
6. Creates Windows ICO
7. Syncs to linux/, default_100_percent/, default_200_percent/

---

## Build System

### Prerequisites

| Platform | Requirements |
|----------|--------------|
| Windows | Visual Studio 2022, Windows SDK 10.0.22621 |
| macOS | Xcode 14+, macOS 12+ |
| Linux | GCC 11+, build-essential, GTK3-dev |
| All | Python 3.11+, 100+ GB disk, 16+ GB RAM |

### Build Commands

```bash
# Setup (first time only)
cd chromium
./setup.sh

# Copy Blockd modules to src
cp -r blocked_backup/chrome/browser/blocked src/chrome/browser/
cp -r blocked_backup/chrome/browser/ui/blocked src/chrome/browser/ui/
cp -r blocked_backup/chrome/app/theme/blocked src/chrome/app/theme/
cp -r blocked_backup/content/renderer/blocked_* src/content/renderer/

# Generate build files
cd src
gn gen out/Blockd

# Build
autoninja -C out/Blockd chrome
```

### args.gn Configuration

```gn
# Build settings
is_debug = false
is_official_build = true
is_component_build = false
symbol_level = 1

# Branding
is_chrome_branded = false
branding_path_component = "blocked"

# Codecs
proprietary_codecs = true
ffmpeg_branding = "Chrome"

# Blockd features
blocked_enable_security_monitoring = true
blocked_enable_eye_tracking = true
blocked_enable_telemetry = true
blocked_enable_meeting_detection = true
blocked_backend_url = "wss://api.blockd.site"

# Disable unused features
enable_nacl = false
enable_vr = false
```

### Build Verification

After building, verify Blockd symbols:

```bash
# Windows
dumpbin /EXPORTS out/Blockd/chrome.dll | findstr -i "blocked"

# Linux/macOS
nm out/Blockd/chrome | grep -i "blocked"
```

Expected symbols:
- `BlockedSecurityService`
- `BlockedTelemetryService`
- `BlockedBackendConnector`
- `MeetingPlatformDetector`
- `MeetingFullscreenController`
- `MediaStreamCapture`

---

## Deployment

### Installer Creation

```bash
./build_installers.sh --skip-build --version 1.0.0
```

**Output:**
| Platform | File | Size |
|----------|------|------|
| Windows | `BlockedBrowser_Setup_v1.0.0.exe` | ~80 MB |
| macOS | `BlockedBrowser-v1.0.0-macOS.dmg` | ~150 MB |
| Linux DEB | `blockd-browser_1.0.0_amd64.deb` | ~120 MB |
| Linux RPM | `blockd-browser-1.0.0.x86_64.rpm` | ~120 MB |
| AppImage | `BlockedBrowser-v1.0.0.AppImage` | ~150 MB |

### Code Signing

**Windows:**
```powershell
signtool sign /f cert.pfx /p password /t http://timestamp.digicert.com out/Blockd/chrome.exe
```

**macOS:**
```bash
codesign --deep --force --sign "Developer ID Application: Blockd Inc." Blockd.app
xcrun notarytool submit Blockd.dmg --apple-id dev@blockd.com --team-id XXXXX --wait
```

---

## API Reference

### JavaScript API (window.BlockedAPI)

```javascript
// Session control
BlockedAPI.getSessionId()       // Returns session UUID
BlockedAPI.isSessionActive()    // Returns boolean
BlockedAPI.getSessionState()    // Returns state string

// Eye tracking
BlockedAPI.startEyeTracking()   // Start eye tracking
BlockedAPI.stopEyeTracking()    // Stop eye tracking
BlockedAPI.calibrate()          // Run 9-point calibration

// Video capture
BlockedAPI.startVideoCapture()  // Start webcam capture
BlockedAPI.stopVideoCapture()   // Stop webcam capture

// Events
BlockedAPI.addEventListener('sessionStateChanged', (state) => {})
BlockedAPI.addEventListener('calibrationComplete', (points) => {})
BlockedAPI.addEventListener('securityEvent', (event) => {})
BlockedAPI.addEventListener('error', (error) => {})
```

### Mojo Interfaces

**eye_tracking.mojom:**
```mojom
interface EyeTrackingHost {
  OnGazeUpdate(GazeData data);
  OnGazeBatch(array<GazeData> batch);
  OnCalibrationComplete(array<CalibrationPoint> points);
  OnEyeTrackingError(string error);
};
```

**session.mojom:**
```mojom
interface BlockedSessionHost {
  OnRendererReady();
  OnSessionEvent(string event_type, string data);
  GetSessionState() => (SessionState state);
};
```

---

## Configuration

### Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `blocked_enable_security_monitoring` | `true` | Enable process/VM detection |
| `blocked_enable_eye_tracking` | `true` | Enable gaze tracking |
| `blocked_enable_telemetry` | `true` | Enable system telemetry |
| `blocked_enable_meeting_detection` | `true` | Enable Meet/Zoom/Teams detection |
| `blocked_backend_url` | `""` | WebSocket backend URL |
| `blocked_default_homepage` | `"https://blockd.site/session"` | Default homepage |

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

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Chromium" shown instead of "Blockd" | Branding not applied | Run `fix_logos.py`, verify BRANDING file |
| Blue Chromium logo | Wrong icon files | Regenerate icons with `fix_logos.py` |
| Build fails with OOM | Too many parallel jobs | Use `autoninja -j6` |
| Meeting not detected | URL mismatch | Check MeetingPlatformDetector patterns |
| Fullscreen won't lock | Controller not initialized | Check MeetingFullscreenController logs |
| Backend connection fails | Invalid URL or network | Check `blocked_backend_url` setting |

### Debug Logging

```bash
# Enable verbose logging
./out/Blockd/chrome --enable-logging --v=1 --vmodule=blocked*=2,meeting*=2

# Log file locations
# Windows: %LOCALAPPDATA%\Blockd\User Data\chrome_debug.log
# macOS: ~/Library/Application Support/Blockd/chrome_debug.log
# Linux: ~/.config/blockd/chrome_debug.log
```

### Verifying Installation

1. **Window title:** Should show "Blockd" not "Chromium"
2. **About page:** Should show "Blockd Interview Browser"
3. **Taskbar icon:** Should show B with keyhole (rounded corners)
4. **Meeting detection:** Navigate to meet.google.com, should auto-fullscreen

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Jan 2026 | Added meeting integration, rounded corners, media capture |
| 1.0 | Nov 2025 | Initial architecture documentation |

---

*Document maintained by Blockd Engineering Team*
