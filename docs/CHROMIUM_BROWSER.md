# Blockd Browser: Chromium Build & Development Guide

## Overview

**Blockd Browser** is a custom Chromium fork (version 142.0.7444.175) built for secure interview proctoring. This is a **native Chromium modification**, not a browser extension. Security features, eye tracking, and anti-cheating capabilities are embedded at the browser process level.

### Key Characteristics
- **Base Version:** Chromium 142.0.7444.175 (stable branch)
- **Brand Name:** Blockd (not "Blocked" or "Chromium")
- **Type:** Native Chromium fork with embedded security modules
- **License:** BSD-style (inherits from Chromium) + proprietary Blockd modules
- **Platform Support:** Windows 10/11, macOS 12+, Linux (Ubuntu 20.04+)

---

## System Requirements

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 8 cores | 16+ cores |
| **RAM** | 16 GB | 32 GB |
| **Disk Space** | 100 GB free | 150 GB free |
| **Disk Type** | SATA (slow) | NVMe SSD |

### Disk Space Breakdown
- **Chromium source:** ~30 GB
- **Build outputs:** ~50 GB
- **Build cache & dependencies:** ~20 GB
- **Total:** 100+ GB

**Tip:** Use NVMe SSD for significantly faster builds (2-3x speedup vs HDD)

### Software Requirements

#### All Platforms
- **Python:** 3.11+ (verify with `python3 --version`)
- **Git:** 2.40+ (verify with `git --version`)
- **depot_tools:** Google's build toolchain (installed by setup script)

#### Windows
- **Visual Studio 2022** (Community/Professional/Enterprise)
  - Workload: "Desktop development with C++"
  - Include: Windows 10/11 SDK (10.0.22621.0 or later)
  - Include: ATL/MFC libraries
- **Windows 10 SDK:** Version 10.0.22621.0 or later

#### macOS
- **Xcode:** 14.0+ with Command Line Tools
- **macOS:** 12.0 (Monterey) or later
- **Minimum:** 40 GB free disk space

#### Linux (Ubuntu 20.04+ or equivalent)
- **Build tools:**
  ```bash
  sudo apt-get install -y \
    build-essential \
    libglib2.0-dev \
    libgtk-3-dev \
    libnss3-dev \
    libatk1.0-dev \
    libatk-bridge2.0-dev \
    libcups2-dev \
    libxcomposite-dev \
    libxdamage-dev \
    libxrandr-dev \
    libgbm-dev \
    libpango1.0-dev \
    libasound2-dev \
    libpulse-dev
  ```

---

## Directory Structure: blocked_backup/

The `blocked_backup/` directory contains all Blockd-specific modifications to Chromium. These files must be copied to the Chromium source during build setup.

```
blocked_backup/
├── chrome/
│   ├── app/
│   │   └── theme/
│   │       └── blocked/
│   │           ├── BRANDING                    # Product names (Blockd)
│   │           ├── product_logo_*.png         # Icons (16-1024px)
│   │           ├── blockd.ico                 # Windows icon
│   │           ├── BLOCKD_Primary_logo.png   # Source logo
│   │           └── linux/                     # Linux icons
│   │
│   ├── browser/
│   │   ├── blocked/                           # Core Blockd modules
│   │   │   ├── blocked_security/              # Process/VM/window monitoring
│   │   │   │   ├── blocked_security_service.h/cc
│   │   │   │   ├── blocked_security_observer.h/cc
│   │   │   │   └── platform/
│   │   │   │       ├── windows_security_monitor.cc
│   │   │   │       ├── macos_security_monitor.mm
│   │   │   │       └── linux_security_monitor.cc
│   │   │   │
│   │   │   ├── blocked_telemetry/            # CPU/memory/focus telemetry
│   │   │   │   ├── blocked_telemetry_service.h/cc
│   │   │   │   └── system_metrics_collector.h/cc
│   │   │   │
│   │   │   ├── blocked_video/                # Webcam capture
│   │   │   │   ├── blocked_video_capture_service.h/cc
│   │   │   │   └── video_stream_manager.h/cc
│   │   │   │
│   │   │   ├── blocked_ipc/                  # Backend communication
│   │   │   │   ├── blocked_backend_connector.h/cc
│   │   │   │   ├── websocket_client.h/cc
│   │   │   │   └── blocked_protocol.proto    # Protocol Buffer definitions
│   │   │   │
│   │   │   ├── blocked_meeting/              # Meeting detection
│   │   │   │   ├── meeting_platform_detector.h/cc
│   │   │   │   └── meeting_stream_controller.h/cc
│   │   │   │
│   │   │   └── public/mojom/                 # Mojo IPC interfaces
│   │   │       ├── eye_tracking.mojom
│   │   │       ├── video_capture.mojom
│   │   │       └── session.mojom
│   │   │
│   │   ├── ui/
│   │   │   └── blocked/
│   │   │       ├── blocked_browser_controller.h/cc
│   │   │       └── blocked_fullscreen_controller.h/cc
│   │   │
│   │   └── resources/
│   │       └── blocked/
│   │           └── blocked_api.js            # JavaScript API
│   │
│   └── app/
│       └── theme/
│           └── blocked/
│               └── BRANDING                  # Branding configuration
│
└── content/
    └── renderer/
        ├── blocked_eye_tracking/             # Eye tracking (renderer process)
        │   ├── eye_tracking_worker.h/cc
        │   ├── face_detector.h/cc
        │   ├── gaze_estimator.h/cc
        │   └── mediapipe_integration.h/cc
        │
        ├── blocked_ipc/                      # Renderer-side Mojo IPC
        │   ├── gaze_data_sender.h/cc
        │   └── renderer_host_connector.h/cc
        │
        └── blocked_video/                    # Renderer webcam access
            ├── camera_manager.h/cc
            └── video_capturer.h/cc
```

---

## Build Process: Step-by-Step

### Step 1: Prerequisites & Environment Setup

Ensure all system requirements are met before proceeding.

```bash
# Verify Python version
python3 --version          # Must be 3.11+

# Verify Git
git --version              # Must be 2.40+

# Windows only: Set environment variable for local Visual Studio
# Add to your shell profile or system variables:
export DEPOT_TOOLS_WIN_TOOLCHAIN=0
```

### Step 2: Clone Repository & Navigate

```bash
# Clone if not already cloned
git clone https://github.com/WillieTheWhale/Blockd.git
cd Blockd/chromium
```

### Step 3: Run Setup Script

```bash
# Execute setup script (one-time only)
./setup.sh
```

**What this does:**
- Downloads and installs depot_tools
- Fetches Chromium source (~30 GB)
- Installs build dependencies
- Creates `.gclient` configuration
- Syncs Chromium dependencies

**Time:** 1-3 hours depending on internet speed and system performance

**Output:** Chromium source in `src/` directory

### Step 4: Integrate Blockd Modifications (CRITICAL)

```bash
# Copy all Blockd modules from backup to Chromium source
cp -r blocked_backup/chrome/browser/blocked src/chrome/browser/
cp -r blocked_backup/chrome/browser/ui/blocked src/chrome/browser/ui/
cp -r blocked_backup/chrome/browser/resources/blocked src/chrome/browser/resources/
cp -r blocked_backup/chrome/app/theme/blocked src/chrome/app/theme/
cp -r blocked_backup/content/renderer/blocked_* src/content/renderer/
```

**Verify all files were copied:**

```bash
# These directories MUST exist before building:
ls src/chrome/browser/blocked/blocked_security/
ls src/chrome/browser/blocked/blocked_ipc/
ls src/chrome/browser/blocked/blocked_video/
ls src/chrome/browser/blocked/blocked_telemetry/
ls src/chrome/browser/blocked/blocked_meeting/
ls src/chrome/browser/blocked/public/mojom/
ls src/chrome/browser/ui/blocked/
ls src/content/renderer/blocked_eye_tracking/
```

If any directory is missing, the build will fail with "file not found" errors.

### Step 5: Configure Build (args.gn)

```bash
cd src
gn gen out/Blockd
```

**Edit `src/out/Blockd/args.gn`** with required settings:

```gn
# Core Build Configuration
is_component_build = false          # Monolithic build (more efficient)
is_official_build = false           # Use Blockd optimization
is_debug = false                    # Release mode (no debug symbols)
symbol_level = 1                    # Minimal symbols for size
chrome_pgo_phase = 0                # No profile-guided optimization

# Branding (CRITICAL - must not be Chrome branding)
is_chrome_branded = false

# Media & Codecs (required for video capture)
proprietary_codecs = true           # H.264 support
ffmpeg_branding = "Chrome"          # Full codec suite
enable_widevine = false             # No DRM

# Optional Features
enable_nacl = false                 # Disable NaCl (rarely used)
enable_pdf = true                   # PDF viewer
enable_print_preview = true         # Print dialog
enable_extensions = true            # Extension support (can be disabled for security)

# Build Optimization
use_goma = false                    # No distributed builds (not available locally)

# BLOCKD FEATURE FLAGS (CRITICAL - Must all be true)
blocked_enable_security_monitoring = true
blocked_enable_eye_tracking = true
blocked_enable_telemetry = true
blocked_enable_meeting_detection = true

# Backend Configuration (must match your deployment)
blocked_backend_url = "wss://api.blockd.site/ws"
```

**Platform-Specific Customizations:**

For **Windows**:
```gn
target_os = "win"
target_cpu = "x64"
```

For **macOS**:
```gn
target_os = "mac"
target_cpu = "x64"          # or "arm64" for Apple Silicon
```

For **Linux**:
```gn
target_os = "linux"
target_cpu = "x64"
```

### Step 6: Build the Browser

```bash
# Standard build (uses all available cores)
autoninja -C out/Blockd chrome

# For systems with <32GB RAM (use -j6 to limit parallelism)
autoninja -C out/Blockd chrome -j6

# For systems with >32GB RAM (optimize build time)
autoninja -C out/Blockd chrome -j24
```

**Build Times:**
| Config | First Build | Incremental |
|--------|-------------|-------------|
| 8 cores, 16GB RAM | 6-8 hours | 30-60 min |
| 16 cores, 32GB RAM | 2-4 hours | 10-20 min |
| 8 cores, with SSD | 4-6 hours | 20-40 min |

**Monitor Progress:**
- Build log: `out/Blockd/build.log`
- Estimated time remaining is displayed in console

### Step 7: Verify Build Success

```bash
# Check if executable exists
ls -lh out/Blockd/chrome         # Should be ~150 MB (release) or ~2 GB (debug)

# Verify Blockd symbols are present
# Windows:
dumpbin /EXPORTS out/Blockd/chrome.dll | findstr -i "blocked"

# Linux/macOS:
nm out/Blockd/chrome | grep -i "blocked" | head -20

# Expected symbols:
# BlockedSecurityService
# BlockedTelemetryService
# BlockedBackendConnector
# BlockedVideoCaptureService
# MeetingPlatformDetector
# EyeTracker
```

### Step 8: Test the Build

```bash
# Run the browser
./out/Blockd/chrome

# Verify Blockd branding (should see "Blockd" in window title, not "Chromium")

# Run unit tests
./out/Blockd/blocked_unittests

# Run integration tests
./out/Blockd/blocked_integration_tests
```

---

## Blockd Feature Flags (args.gn)

All Blockd features are controlled by feature flags in `args.gn`. These MUST be set to `true` for a functional build.

### Security Monitoring Flag
```gn
blocked_enable_security_monitoring = true
```
**Enables:** Process detection, VM detection, window focus monitoring, clipboard tracking

### Eye Tracking Flag
```gn
blocked_enable_eye_tracking = true
```
**Enables:** MediaPipe face detection, gaze estimation, gaze data transmission

### Telemetry Flag
```gn
blocked_enable_telemetry = true
```
**Enables:** CPU usage, memory usage, focus state tracking

### Meeting Detection Flag
```gn
blocked_enable_meeting_detection = true
```
**Enables:** Google Meet, Zoom, Microsoft Teams detection and streaming

### Backend Configuration
```gn
blocked_backend_url = "wss://api.blockd.site/ws"
```
**Purpose:** WebSocket URL for backend communication. Must match your deployment.

---

## Module Descriptions

### blocked_security/ - Security Monitoring

**Purpose:** Detect cheating attempts by monitoring system state

**Components:**

| Component | Purpose |
|-----------|---------|
| `blocked_security_service.h/cc` | Main service managing all security checks |
| `blocked_security_observer.h/cc` | Observer for security events |
| `windows_security_monitor.cc` | Windows-specific monitoring (Win32 API) |
| `macos_security_monitor.mm` | macOS-specific monitoring (Cocoa framework) |
| `linux_security_monitor.cc` | Linux-specific monitoring (proc filesystem) |

**Detections:**

1. **Suspicious Processes**
   - Screen recording software (OBS, Camtasia, Bandicam)
   - Chat applications (ChatGPT, Claude)
   - Virtual desktop tools (TeamViewer)
   - Keyboard logging software

2. **Virtual Machine Detection**
   - Detects hypervisor (CPUID instruction)
   - Registry key analysis (Windows)
   - SMBIOS manufacturer strings
   - Timing attacks

3. **Window Focus Monitoring**
   - Detects when browser loses focus
   - Tracks foreground application changes
   - Reports focus violations to backend

4. **Screen Recording Detection**
   - Windows: DwmGetWindowAttribute with DWMWA_CLOAKED
   - macOS: CGWindowListCopyWindowInfo analysis
   - Linux: Process-based detection

5. **Clipboard Monitoring**
   - Logs clipboard copy/paste events
   - Detects suspicious clipboard activity

**Event Reporting:**
- Frequency: Every 5 seconds (process check), real-time (focus changes)
- Format: Protocol Buffer messages to backend via WebSocket
- Severity: Critical/High/Medium/Low (mapped to event type)

### blocked_telemetry/ - System Metrics

**Purpose:** Collect system performance and user focus data

**Components:**

| Component | Purpose |
|-----------|---------|
| `blocked_telemetry_service.h/cc` | Main telemetry service |
| `system_metrics_collector.h/cc` | CPU, memory, disk usage collection |

**Metrics Collected:**
- **CPU Usage:** Percentage utilization
- **Memory Usage:** RAM utilization in MB
- **Disk Usage:** Free space on drives
- **Focus State:** Whether browser is active/focused
- **Network Usage:** Upload/download bandwidth
- **Battery Level:** Device battery percentage

**Transmission:**
- Interval: Every 30 seconds
- Protocol: WebSocket to backend
- Format: Protobuf messages

### blocked_video/ - Webcam Capture

**Purpose:** Capture webcam video for identity verification and proctoring

**Components:**

| Component | Purpose |
|-----------|---------|
| `blocked_video_capture_service.h/cc` | Manages video capture lifecycle |
| `video_stream_manager.h/cc` | Handles video encoding and transmission |

**Features:**
- Automatic webcam access (bypasses permission dialogs during sessions)
- H.264 video encoding
- Configurable frame rate (30 FPS default)
- Real-time streaming to backend

**Transmission:**
- Protocol: WebSocket binary frames or WebRTC data channel
- Encoding: H.264 (efficient for network transmission)
- Resolution: 640x480 (configurable)
- Bitrate: Adaptive (50-2000 kbps)

### blocked_ipc/ - Backend Communication

**Purpose:** Establish and maintain WebSocket connection to Blockd backend

**Components:**

| Component | Purpose |
|-----------|---------|
| `blocked_backend_connector.h/cc` | Main WebSocket connection manager |
| `websocket_client.h/cc` | WebSocket protocol implementation |
| `blocked_protocol.proto` | Protocol Buffer message definitions |

**Features:**
- Secure WebSocket (WSS) connection
- Automatic reconnection on failure
- Protocol Buffer serialization
- Message queueing during disconnections

**Message Types:**

| Message | Direction | Fields |
|---------|-----------|--------|
| `SessionValidate` | Browser → Backend | session_token, browser_version, platform |
| `SessionStart` | Backend → Browser | session_id, settings |
| `SecurityEvent` | Browser → Backend | event_type, severity, timestamp, metadata |
| `GazeData` | Browser → Backend | session_id, gaze_x, gaze_y, timestamp |
| `VideoFrame` | Browser → Backend | session_id, frame_data, timestamp |
| `TelemetryData` | Browser → Backend | cpu_usage, memory_usage, focus_state |

### blocked_meeting/ - Meeting Platform Detection

**Purpose:** Detect when user is on interview platform and capture video

**Detection Rules:**

| Platform | URL Pattern |
|----------|------------|
| Google Meet | `meet.google.com/*` |
| Zoom | `*.zoom.us/*`, `zoom.us/*` |
| Microsoft Teams | `teams.microsoft.com/*`, `teams.live.com/*` |

**Components:**

| Component | Purpose |
|-----------|---------|
| `meeting_platform_detector.h/cc` | URL-based platform detection |
| `meeting_stream_controller.h/cc` | Streaming management |

**Behavior:**
1. Monitor current URL
2. If meeting platform detected, start video capture
3. Stream video to backend for recording
4. Continue streaming until session ends or user navigates away

### blocked_eye_tracking/ - Eye Tracking (Renderer Process)

**Purpose:** Track user gaze position for attention monitoring

**Location:** `content/renderer/blocked_eye_tracking/`

**Components:**

| Component | Purpose |
|-----------|---------|
| `eye_tracking_worker.h/cc` | Main eye tracking worker thread |
| `face_detector.h/cc` | MediaPipe FaceMesh integration |
| `gaze_estimator.h/cc` | Gaze vector calculation |
| `mediapipe_integration.h/cc` | WASM MediaPipe loading |

**Algorithm:**

1. **Face Detection:** MediaPipe FaceMesh detects 468 facial landmarks
2. **Iris Location:** Extract iris center from landmarks 473-478
3. **Gaze Vector:** Calculate 3D gaze vector from iris position
4. **Screen Projection:** Project 3D gaze to 2D screen coordinates
5. **Filtering:** Kalman filter for smoothing
6. **Transmission:** Send gaze data every frame via Mojo IPC

**Performance:**
- Processing: 30 FPS
- Latency: <50ms per frame
- Accuracy: ±2-3 degrees

**Data Sent to Backend:**
- Gaze X/Y coordinates
- Confidence score (0.0-1.0)
- Timestamp (milliseconds)
- Off-screen detection

### JavaScript API: window.BlockedAPI

The `window.BlockedAPI` object provides JavaScript access to Blockd features from interview pages.

**Available Methods:**

```javascript
// Eye Tracking
BlockedAPI.startEyeTracking()          // Start 30 FPS gaze tracking
BlockedAPI.stopEyeTracking()           // Stop eye tracking
BlockedAPI.calibrate()                 // Run 9-point calibration
BlockedAPI.getGazeData()               // Get current gaze (X, Y, confidence)

// Video Capture
BlockedAPI.startVideoCapture()         // Start webcam stream
BlockedAPI.stopVideoCapture()          // Stop webcam stream
BlockedAPI.getVideoStream()            // Get MediaStream object

// Session Management
BlockedAPI.getSessionId()              // Get current session ID
BlockedAPI.isSessionActive()           // Check if session is active
BlockedAPI.startSession(sessionId)     // Start new session
BlockedAPI.endSession()                // End current session

// Event Listeners
BlockedAPI.addEventListener(event, callback)  // Listen to events
BlockedAPI.removeEventListener(event, callback)

// Events:
// - 'gaze-data'        : { x, y, confidence, timestamp }
// - 'focus-changed'    : { focused: boolean }
// - 'session-started'  : { sessionId, settings }
// - 'session-ended'    : { sessionId, duration }
// - 'security-event'   : { type, severity, metadata }
```

**Example Usage:**

```javascript
// Start eye tracking with event listener
BlockedAPI.startEyeTracking();
BlockedAPI.addEventListener('gaze-data', (event) => {
  console.log(`Gaze: ${event.x}, ${event.y} (confidence: ${event.confidence})`);
});

// Start video capture
BlockedAPI.startVideoCapture();
const stream = BlockedAPI.getVideoStream();
const video = document.querySelector('video');
video.srcObject = stream;

// Check session status
if (BlockedAPI.isSessionActive()) {
  const sessionId = BlockedAPI.getSessionId();
  console.log(`Session active: ${sessionId}`);
}
```

---

## Meeting Platform Detection

Blockd automatically detects when the user enters a meeting platform and begins monitoring/recording.

### Supported Platforms

1. **Google Meet**
   - URL: `https://meet.google.com/[meeting-code]`
   - Detection: URL pattern matching
   - Action: Start video capture and stream to backend

2. **Zoom**
   - URL: `https://zoom.us` or `https://*.zoom.us`
   - Detection: URL pattern matching
   - Action: Start video capture and stream to backend

3. **Microsoft Teams**
   - URL: `https://teams.microsoft.com` or `https://teams.live.com`
   - Detection: URL pattern matching
   - Action: Start video capture and stream to backend

### Detection Flow

```
User navigates to meeting URL
  ↓
MeetingPlatformDetector.OnURLChanged()
  ↓
Pattern matches meeting platform?
  ↓ YES
MeetingStreamController.StartStreaming()
  ↓
BlockedVideoCaptureService starts capturing
  ↓
Frames sent to BlockedBackendConnector
  ↓
WebSocket transmission to backend
  ↓
User navigates away or session ends
  ↓
MeetingStreamController.StopStreaming()
```

### Configuration

Meeting detection URLs can be customized in `args.gn`:

```gn
blocked_meeting_platforms = [
  "meet.google.com/*",
  "*.zoom.us/*",
  "teams.microsoft.com/*",
]
```

---

## Verification Steps After Build

After the build completes, verify that all Blockd features are properly integrated.

### 1. Check Executable Size

```bash
# Windows
dir out\Blockd\chrome.exe

# macOS/Linux
ls -lh out/Blockd/chrome
```

**Expected Size:**
- Release build: 150-200 MB
- Debug build: 2-3 GB

Significantly smaller (30-50 MB) indicates incomplete build.

### 2. Verify Blockd Symbols

```bash
# Windows - Check for Blockd symbols in DLL
dumpbin /EXPORTS out/Blockd/chrome.dll | findstr "blocked"

# Expected output should include:
# BlockedSecurityService::DoesExist
# BlockedTelemetryService::Create
# BlockedBackendConnector::Connect
# EyeTracker::StartTracking

# Linux/macOS - Check symbol table
nm out/Blockd/chrome | grep -i "blocked" | wc -l

# Should output 50+ symbols
```

### 3. Check Branding

```bash
# Run the browser
./out/Blockd/chrome

# Verify in window title and about dialog:
# - Window title should show "Blockd"
# - About dialog should show "Blockd Interview Browser"
# - App icon should be the Blockd "B" logo

# To check about dialog programmatically:
strings out/Blockd/chrome | grep -i "blockd"
```

### 4. Verify Feature Flags

```bash
# Check if feature flags are compiled in
strings out/Blockd/chrome | grep "blocked_enable"

# Should show:
# blocked_enable_security_monitoring
# blocked_enable_eye_tracking
# blocked_enable_telemetry
# blocked_enable_meeting_detection
```

### 5. Run Unit Tests

```bash
# Build test targets
autoninja -C out/Blockd blocked_unittests blocked_integration_tests

# Run unit tests
./out/Blockd/blocked_unittests

# Expected output:
# [==========] Running 50+ tests from X test suites
# [  PASSED  ] BlockedSecurityServiceTest.DetectsOBSProcess
# ... more tests ...
# [==========] X tests from X test suites ran. All tests passed!
```

### 6. Test Eye Tracking

```bash
# Start browser with eye tracking enabled
./out/Blockd/chrome --enable-eye-tracking --vmodule=eye_tracker*=1

# Navigate to interview page
# Verify in DevTools console:
console.log(window.BlockedAPI);  // Should show API object
BlockedAPI.startEyeTracking();
// Should start face detection and log "Eye tracking started"
```

### 7. Test Backend Connection

```bash
# Start browser with verbose logging
./out/Blockd/chrome --enable-logging --v=1 --vmodule=blocked_backend*=2

# Monitor console output for:
# "BlockedBackendConnector: Connecting to wss://..."
# "BlockedBackendConnector: Connected successfully"
# "Sending SecurityEvent to backend"
```

### 8. Verify No Vanilla Chromium Features

```bash
# Ensure build is not vanilla Chromium
strings out/Blockd/chrome | grep -i "google chrome"

# Should return nothing (no vanilla Chrome branding)
strings out/Blockd/chrome | grep -i "blockd"

# Should return many results (Blockd branding)
```

---

## Installer Generation

After a successful build, you can create platform-specific installers.

### Build All Installers

```bash
# Generate installers for all platforms (uses existing build)
./build_installers.sh --skip-build

# Or build with specific version
./build_installers.sh --skip-build --version 1.0.0

# Full build including Chromium compilation
./build_installers.sh --release
```

### Platform-Specific Installers

#### Windows NSIS Installer

```bash
# Generate Windows installer
./build_installers.sh --skip-build --platform windows

# Output: dist/BlockedBrowser_Setup_v1.0.0.exe

# Install options:
# - GUI installation: Double-click BlockedBrowser_Setup_v1.0.0.exe
# - Silent install: BlockedBrowser_Setup_v1.0.0.exe /S
# - Custom install dir: BlockedBrowser_Setup_v1.0.0.exe /D=C:\Program Files\Blockd

# Uninstall: Control Panel → Programs → Blockd Browser
```

**Prerequisites:**
- NSIS: `choco install nsis` (Windows) or `brew install nsis` (macOS)

#### macOS DMG Installer

```bash
# Generate macOS installer
./build_installers.sh --skip-build --platform macos

# Output: dist/BlockedBrowser-v1.0.0-macOS.dmg

# Installation:
# 1. Double-click the DMG file
# 2. Drag "Blockd Browser" to Applications
# 3. Run from Applications folder
```

**For signed and notarized builds:**
```bash
./installer/mac/sign_and_notarize.sh
```

**Requirements:**
- Apple Developer ID certificate
- macOS notarization credentials

#### Linux Packages

```bash
# Generate all Linux packages
./build_installers.sh --skip-build --platform linux

# Outputs:
# - dist/BlockedBrowser-v1.0.0.AppImage (universal)
# - dist/blockd-browser_1.0.0_amd64.deb (Debian/Ubuntu)
# - dist/blockd-browser-1.0.0-1.x86_64.rpm (Fedora/RHEL)
```

**DEB Installation (Ubuntu/Debian):**
```bash
sudo dpkg -i blockd-browser_1.0.0_amd64.deb
blockd-browser  # Run from terminal

# Uninstall:
sudo dpkg -r blockd-browser
```

**RPM Installation (Fedora/RHEL):**
```bash
sudo rpm -i blockd-browser-1.0.0-1.x86_64.rpm
blockd-browser  # Run from terminal

# Uninstall:
sudo rpm -e blockd-browser
```

**AppImage Installation (Universal):**
```bash
chmod +x BlockedBrowser-v1.0.0.AppImage
./BlockedBrowser-v1.0.0.AppImage

# Or integrate into system:
sudo mv BlockedBrowser-v1.0.0.AppImage /opt/blockd-browser
/opt/blockd-browser
```

**Requirements:**
- dpkg-deb (Debian tools)
- rpmbuild (RPM tools)
- appimagetool (AppImage generation)

### Installer Output

All installers are placed in the `dist/` directory:

| Platform | Filename | Size | Type |
|----------|----------|------|------|
| Windows | BlockedBrowser_Setup_v1.0.0.exe | 80-100 MB | NSIS installer |
| macOS | BlockedBrowser-v1.0.0-macOS.dmg | 120-150 MB | DMG bundle |
| Linux DEB | blockd-browser_1.0.0_amd64.deb | 120 MB | Debian package |
| Linux RPM | blockd-browser-1.0.0-1.x86_64.rpm | 120 MB | RPM package |
| Linux | BlockedBrowser-v1.0.0.AppImage | 150 MB | Portable app |

---

## Common Build Errors and Fixes

### Error: "Python not found" or "Python 3.11+ required"

**Cause:** Python is not in system PATH

**Fix:**
```bash
# Verify Python is installed and accessible
python3 --version

# If not found, add Python to PATH
# Windows: Add C:\Python311\ to system PATH
# macOS: brew install python@3.11
# Linux: sudo apt-get install python3.11
```

### Error: "Out of memory" (LLVM ERROR)

**Cause:** Too many parallel build jobs for available RAM

**Fix:**
```bash
# Reduce parallelism
autoninja -C out/Blockd chrome -j4

# Or set environment variable
export NINJA_STATUS="[%s/%t] %e sec"
autoninja -C out/Blockd chrome -j2
```

**Prevention:**
- Use `-j6` on machines with <32GB RAM
- Use `-j24` on machines with 64GB+ RAM
- Close other applications during build

### Error: "components_blocked_strings.grd missing"

**Cause:** Blockd branding files not copied from blocked_backup/

**Fix:**
```bash
# Verify blocked_backup/ exists
ls blocked_backup/chrome/app/theme/blocked/

# Copy branding files
cp -r blocked_backup/chrome/app/theme/blocked src/chrome/app/theme/

# Regenerate build files
cd src
gn gen out/Blockd
```

### Error: "blocked_security_service.h: No such file or directory"

**Cause:** Blockd modules not copied from blocked_backup/

**Fix:**
```bash
# Verify blocked_backup/ contents
ls blocked_backup/chrome/browser/blocked/

# Copy all modules
cp -r blocked_backup/chrome/browser/blocked src/chrome/browser/

# Verify files exist
ls src/chrome/browser/blocked/blocked_security/blocked_security_service.h

# Regenerate and rebuild
cd src && gn gen out/Blockd && autoninja -C out/Blockd chrome
```

### Error: "undefined reference to blocked::" symbols

**Cause:** Blockd modules not linked in BUILD.gn

**Fix:**
```bash
# Edit src/chrome/browser/BUILD.gn
# Add to deps section:
deps += [
  "//chrome/browser/blocked:blocked_browser_modules",
]

# Regenerate build
cd src && gn gen out/Blockd
```

### Error: "Linker errors" or "link.exe failed with exit code"

**Cause:** System running out of memory during linking

**Fix:**
```bash
# Increase available memory
# Option 1: Reduce parallelism
ninja -C out/Blockd chrome -j2

# Option 2: Use component build (faster linking)
# Edit args.gn: is_component_build = true
gn args out/Blockd
autoninja -C out/Blockd chrome

# Option 3: Clean and rebuild
rm -rf out/Blockd
gn gen out/Blockd
autoninja -C out/Blockd chrome
```

### Error: "depot_tools not found" or "gclient command not found"

**Cause:** depot_tools not in system PATH

**Fix:**
```bash
# Re-run setup script
./setup.sh

# Manually add to PATH
export PATH="$PATH:$PWD/depot_tools"

# Verify
which gclient
```

### Error: Patch apply fails with ".rej files"

**Cause:** Patches conflict with Chromium source

**Fix:**
```bash
# Manually apply patches
cd src
git apply --reject ../patches/0001-*.patch

# Resolve .rej files manually
# Open *.rej files and merge conflicting sections

# After fixing all conflicts
git add .
git commit -m "Apply blocked patches"

# Or clean and try again
git clean -fd
git checkout .
cd ..
./patches/apply-patches.sh
```

### Error: "No space left on device"

**Cause:** Insufficient disk space (need 100+ GB)

**Fix:**
```bash
# Check available space
df -h

# Free up space
# Option 1: Move to larger disk
# Option 2: Clean build cache
rm -rf out/Blockd/*
rm -rf .ninja_deps .ninja_log

# Option 3: Delete old builds
ls -lh out/
rm -rf out/Debug out/Release  # if multiple builds exist
```

### Error: Windows SDK not found

**Cause:** Visual Studio 2022 C++ workload not installed

**Fix:**
```bash
# Run Visual Studio Installer
"C:\Program Files (x86)\Microsoft Visual Studio\Installer\vs_installer.exe"

# Select "Modify" for Visual Studio 2022
# Check: Desktop development with C++
# Check: Windows 10/11 SDK (10.0.22621.0)
# Click "Modify"
```

### Error: Chromium source fetch timeout

**Cause:** Network issues during initial setup

**Fix:**
```bash
# Re-run setup with retry
./setup.sh

# Or manually sync
cd src
gclient sync --with_branch_heads --with_tags --retry=3
```

---

## Performance Optimization Tips

### Build Performance

#### 1. Use SSD
- NVMe SSD: 3x faster than HDD
- Measure: Time full build with `-j8`
- Typical times: SSD 2-3 hours, HDD 6-8 hours

#### 2. Reduce Parallelism (if OOM errors occur)
```bash
autoninja -C out/Blockd chrome -j4  # Instead of -j8 or -j24
```

#### 3. Use Build Cache (sccache)
```bash
# Install sccache
brew install sccache  # macOS
# or download from https://github.com/mozilla/sccache/releases

# Enable in environment
export CC="sccache cc"
export CXX="sccache c++"

# Rebuild
autoninja -C out/Blockd chrome
```

#### 4. Use RAM Disk (Linux/macOS)
```bash
# Create 50GB RAM disk
# macOS:
diskutil secureErase freespace 0 -secureCommands 0 $(hdiutil attach -nomount ram://104857600)

# Move build directory to RAM disk
mv out/Blockd /Volumes/RAMDisk/
ln -s /Volumes/RAMDisk/Blockd out/Blockd
```

#### 5. Component Build (Development Only)
```gn
# Edit args.gn for faster incremental builds
is_component_build = true  # Faster linking, larger binary
```

### Runtime Performance

#### 1. Profile-Guided Optimization (PGO)
```bash
# Build instrumented version
gn args out/BlockdPGO
# Set: pgo_data_generation = true

ninja -C out/BlockdPGO chrome

# Run browser with typical workload to gather profile data
./out/BlockdPGO/chrome --no-startup-window

# Build optimized version using profile
gn args out/Blockd
# Set: pgo_data_file = "/path/to/profile.txt"

ninja -C out/Blockd chrome
```

#### 2. Link-Time Optimization (LTO)
```gn
# Enable in args.gn (already enabled in release builds)
use_lto = true
```

---

## Directory Structure Reference

### Full File Tree

```
C:\Users\Willi\NerdsInc\Blockd\chromium\
├── README.md                          # Quick start guide
├── setup.sh                           # Initial setup script
├── build.sh                           # Build script
├── build_blockd.py                    # Python build automation
├── build_installers.sh                # Installer generation
│
├── blocked_backup/                    # SOURCE: Blockd modifications
│   └── chrome/browser/blocked/        # All modules copied to src/
│       ├── blocked_security/
│       ├── blocked_telemetry/
│       ├── blocked_video/
│       ├── blocked_ipc/
│       ├── blocked_meeting/
│       └── public/mojom/
│
├── src/                               # Chromium source (downloaded)
│   ├── chrome/
│   │   ├── app/theme/blocked/         # Branding + icons
│   │   ├── browser/
│   │   │   ├── blocked/               # Blockd modules (copied here)
│   │   │   ├── ui/blocked/
│   │   │   └── resources/blocked/
│   │   └── BUILD.gn
│   ├── content/renderer/              # Eye tracking, video capture
│   ├── build/
│   └── tools/
│
├── patches/                           # Chromium patch files
│   ├── 0001-add-blocked-security.patch
│   ├── 0002-modify-browser-ui.patch
│   └── apply-patches.sh
│
├── installer/                         # Installer templates
│   ├── windows/
│   │   ├── blocked_installer.nsi      # NSIS installer script
│   │   └── resources/
│   ├── mac/
│   │   ├── create_dmg.sh
│   │   └── sign_and_notarize.sh
│   └── linux/
│       ├── blockd-browser.desktop
│       └── control
│
├── out/                               # Build outputs
│   └── Blockd/
│       ├── chrome                     # Main executable
│       ├── chrome.dll                 # (Windows)
│       ├── blocked_unittests
│       ├── build.ninja
│       ├── args.gn
│       └── ... (build artifacts)
│
└── dist/                              # Final installers
    ├── BlockedBrowser_Setup_v1.0.0.exe
    ├── BlockedBrowser-v1.0.0-macOS.dmg
    └── blockd-browser_1.0.0_amd64.deb
```

---

## Branding Guide

### Important: Always Use "Blockd" (Not "Blocked")

**Correct:** Blockd Browser, Blockd Interview Browser
**Incorrect:** Blocked Browser, BlockedBrowser, Chromium

### Branding Files

Located in `src/chrome/app/theme/blocked/`:

| File | Purpose |
|------|---------|
| `BRANDING` | Product names (Blockd) |
| `product_logo_*.png` | Icons for all sizes (16-1024px) |
| `blockd.ico` | Windows multi-icon file |
| `BLOCKD_Primary_logo.png` | Source logo |

### Logo Specifications

- **Shape:** Stylized "B" with keyhole (security symbol)
- **Style:** Modern, rounded corners (22% radius)
- **Background:** Transparent (PNG format)
- **Colors:** Blockd brand colors (check design guide)

### Icon Generation

```bash
# Generate all required icon sizes
cd src/chrome/app/theme/blocked
python fix_logos.py

# Creates:
# - product_logo_16.png through product_logo_1024.png
# - blockd.ico (Windows)
# - linux/ directory (Linux icons)
```

### Branding Verification

Before release, verify:
- [ ] Window title shows "Blockd"
- [ ] About dialog: "Blockd Interview Browser"
- [ ] App icon shows Blockd logo
- [ ] Installer branded as "Blockd"
- [ ] All user-facing text says "Blockd"
- [ ] Icons have proper rounded corners

---

## Maintenance & Updates

### Chromium Version Updates

To update to a newer Chromium stable release:

```bash
cd src

# Fetch latest branches
git fetch origin

# Switch to target release (e.g., Chrome 145)
git checkout branch-heads/6433  # Replace with target branch

# Sync dependencies
gclient sync --with_branch_heads --with_tags

# Apply Blockd patches (may need adjustment)
cd ..
./patches/apply-patches.sh

# Rebuild
cd src
gn gen out/Blockd
autoninja -C out/Blockd chrome
```

**Note:** Major Chromium updates may require patch adjustments due to API changes. Test thoroughly.

### Security Patches

Monitor Chromium security advisories and apply patches within 48 hours:

```bash
# Check for updates
cd src && git log --oneline -20

# Apply specific security commit
git cherry-pick [commit-hash]

# Rebuild
gn gen out/Blockd
autoninja -C out/Blockd chrome
```

### Feature Updates

Add new security detections as cheating methods evolve:

1. Create new detection in `blocked_security/`
2. Add protocol message in `blocked_protocol.proto`
3. Update backend to handle new event type
4. Test with `blocked_unittests`
5. Deploy new browser version

---

## Resources & Documentation

### Official Documentation
- **Chromium Developers:** https://www.chromium.org/developers/
- **Build Instructions:** https://chromium.googlesource.com/chromium/src/+/main/docs/
- **C++ Style Guide:** https://chromium.googlesource.com/chromium/src/+/main/styleguide/c++/c++.md
- **Mojo IPC:** https://chromium.googlesource.com/chromium/src/+/main/mojo/README.md

### Blockd Documentation
- **System Architecture:** `docs/SYSTEM_DESIGN.md`
- **API Reference:** `docs/API_REFERENCE.md`
- **Chromium Browser Guide:** `docs/CHROMIUM_BROWSER.md`
- **Backend:** `backend/` directory
- **Frontend:** `frontend/interviewer-app/`

### Related Files
- **Build Scripts:** `chromium/build.sh`, `chromium/setup.sh`
- **Installer Scripts:** `chromium/build_installers.sh`
- **Patches:** `chromium/patches/`

---

## Quick Reference: Common Commands

### Build
```bash
cd chromium/src
gn gen out/Blockd                    # Generate build files
autoninja -C out/Blockd chrome       # Build (uses all cores)
autoninja -C out/Blockd chrome -j6   # Build (limit to 6 cores)
```

### Test
```bash
./out/Blockd/blocked_unittests       # Unit tests
./out/Blockd/blocked_integration_tests  # Integration tests
strings out/Blockd/chrome | grep blocked  # Verify symbols
```

### Run
```bash
./out/Blockd/chrome                           # Normal run
./out/Blockd/chrome --enable-logging --v=1   # Verbose logging
./out/Blockd/chrome --user-data-dir=/tmp/blockd-test  # Isolated profile
```

### Clean
```bash
rm -rf out/Blockd                    # Full clean
gn clean out/Blockd                  # GN clean only
ninja -C out/Blockd -t clean chrome  # Ninja clean
```

### Verify
```bash
dumpbin /EXPORTS out/Blockd/chrome.dll | findstr blocked  # Windows
nm out/Blockd/chrome | grep blocked                       # Linux/macOS
ls -lh out/Blockd/chrome                                 # Check size
```

---

## Support & Troubleshooting

### Getting Help
1. Check this document for common errors
2. Review build log: `out/Blockd/build.log`
3. Enable verbose logging: `--enable-logging --v=2`
4. Check GitHub issues: https://github.com/WillieTheWhale/Blockd/issues
5. Review architecture specification: `docs/CHROMIUM_BROWSER.md`

### Reporting Build Issues
Include:
- OS and version (Windows 11, macOS 13, Ubuntu 22.04)
- System specs (CPU cores, RAM, disk space available)
- Build command used
- Error message (full output)
- `gn args out/Blockd` output
- Build log: `cat out/Blockd/build.log | tail -100`

---

## License

**Blockd Browser** is based on Chromium and inherits its BSD-style open-source license. Custom Blockd modules are proprietary.

- **Chromium License:** BSD 3-Clause (https://chromium.googlesource.com/chromium/src/+/main/LICENSE)
- **Blockd Modules:** Proprietary (Willie The Whale)

---

**Last Updated:** February 2026
**Chromium Version:** 142.0.7444.175
**Status:** Production Ready
**Maintained by:** Blockd Engineering Team
