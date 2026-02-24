# Blockd Electron App - Quick Start Guide

## Getting Started

### Prerequisites
- Node.js 18+ installed
- Windows, macOS, or Linux
- Webcam (for video capture testing)

---

## Installation

```bash
cd electron-app
npm install
```

---

## Building

### Build All
```bash
npm run build
```

This will:
1. Compile TypeScript for main process
2. Build renderer with Vite
3. Output to `build/` directory

### Build Individually
```bash
# Main process only
npm run build:main

# Renderer only
npm run build:renderer
```

---

## Running

### Development Mode
```bash
npm run dev
```

This will:
1. Build the project
2. Launch Electron app
3. Open DevTools (if configured)

### Production Mode
```bash
npm start
```

Runs the built application.

---

## Testing New Features

### 1. Test Webcam Capture

**When app starts:**
1. App will request webcam permission
2. Allow camera access
3. Check console for: "Webcam initialized successfully"
4. UI should show: "Webcam: Capturing (X frames)"

**Expected behavior:**
- Frame counter increases
- No errors in console
- Status shows green "Capturing"

---

### 2. Test Screen Capture

**Manual activation required** (not auto-started):

Open DevTools Console and run:
```javascript
// Access the app instance
const app = window.blockdApp;

// Initialize screen capture
await app.screenCapture.initialize();
await app.screenCapture.start();
```

**Expected behavior:**
- Browser shows screen/window picker
- Select a window/screen
- Frame capture begins at 5fps
- Console shows: "Screen capture started"

---

### 3. Test Meeting Detection

**Navigate to a meeting URL** in the app:

**Google Meet:**
```
https://meet.google.com/abc-defg-hij
```

**Zoom:**
```
https://zoom.us/j/1234567890
```

**Microsoft Teams:**
```
https://teams.microsoft.com/l/meetup-join/...
```

**Expected behavior:**
- Console logs: "Meeting detected: google_meet"
- UI shows: "Google Meet Meeting Active" (in green)
- Main process receives IPC notification
- Lockdown mode activates (if implemented)

**When you navigate away:**
- Console logs: "Meeting ended"
- UI shows: "No Meeting Detected"
- Main process receives end notification

---

### 4. Test Eye Tracking Integration

**Start a session:**

Open DevTools Console:
```javascript
const app = window.blockdApp;

// Create mock session
const sessionInfo = {
  sessionId: 'test-session-123',
  sessionToken: 'mock-token'
};

// Manually trigger session started
app.handleSessionStarted(sessionInfo);
```

**Expected behavior:**
- Eye tracker initializes
- Webcam starts automatically
- UI shows eye tracking status
- Gaze data batches sent to main process

---

### 5. Test Calibration

**Click the "Start Calibration" button in the UI**

**Expected behavior:**
1. Eye tracker initializes (if not already)
2. Calibration UI appears (from existing eye-tracking module)
3. Follow 9-point calibration process
4. On completion:
   - Console logs calibration result
   - Button text changes to "Recalibrate"
   - Main process receives calibration data

---

### 6. Test UI Status Updates

**The UI should update automatically when:**

1. **Backend connects:**
   - Status changes to "Connected" (green)

2. **Session starts:**
   - Session status shows session ID
   - Eye tracker status updates
   - Webcam status updates

3. **Security alert occurs:**
   - Alert appears in security section
   - Color-coded by severity

**To test manually via DevTools:**
```javascript
const app = window.blockdApp;

// Add a security alert
app.ui.addSecurityAlert({
  type: 'suspicious_process',
  severity: 'high',
  timestamp: Date.now(),
  description: 'OBS detected running',
  metadata: { process: 'obs64.exe' }
});
```

---

## Debugging

### Enable DevTools

Edit `src/main/window-manager.ts`:
```typescript
webPreferences: {
  devTools: true,  // Change to true
  // ...
}
```

### Check IPC Communication

**In renderer (DevTools Console):**
```javascript
// Check if API is available
console.log(window.blockd);

// Test IPC call
const info = await window.blockd.system.getInfo();
console.log('System Info:', info);

// Test video frame send
const mockFrame = {
  data: new Uint8Array([0, 1, 2]),
  width: 640,
  height: 480,
  timestamp: Date.now(),
  format: 'jpeg'
};
await window.blockd.video.sendFrame(mockFrame);
```

**In main process (terminal):**
- Watch for: "Received gaze batch with X points"
- Watch for: "Meeting detected: ..."
- Watch for: "Calibration completed: SUCCESS"

### Check Module Status

**In renderer (DevTools Console):**
```javascript
const app = window.blockdApp;

// Check webcam status
console.log('Webcam:', app.webcamCapture.getStatus());

// Check eye tracker status
console.log('Eye Tracker:', app.eyeTracker.getStatus());

// Check meeting detector status
console.log('Meeting:', app.meetingDetector.getStatus());
```

---

## Common Issues

### Issue: "Webcam access denied"
**Solution:**
- Check system camera permissions
- Restart app and allow when prompted
- On macOS: System Preferences → Security & Privacy → Camera

### Issue: "window.blockd is undefined"
**Solution:**
- Preload script didn't load
- Check `webPreferences.preload` path in window-manager
- Check console for preload errors

### Issue: "Meeting not detected"
**Solution:**
- Check URL matches patterns in meeting-detector.ts
- Open DevTools and check console
- Ensure meeting detector is running: `app.meetingDetector.getStatus()`

### Issue: "UI not updating"
**Solution:**
- Check browser console for errors
- Verify module status callbacks are firing
- Check if UI initialized: `app.ui !== null`

### Issue: "TypeScript errors"
**Solution:**
```bash
# Type check all files
npm run typecheck

# If errors in new files, check triple-slash directives:
/// <reference path="../blockd.d.ts" />
```

---

## Monitoring Performance

### Frame Rates

**Webcam (should be ~30fps):**
```javascript
const status = app.webcamCapture.getStatus();
console.log('Frames sent:', status.framesSent);
console.log('Last frame:', new Date(status.lastFrameTimestamp));
```

**Eye Tracker (should be ~30fps):**
```javascript
const status = app.eyeTracker.getStatus();
console.log('FPS:', status.fps);
console.log('Face detected:', status.faceDetected);
```

### Memory Usage

Open Chrome DevTools → Performance Monitor:
- Watch for memory leaks
- Video capture should not accumulate
- Canvas should be reused, not recreated

---

## Next Steps

After verifying basic functionality:

1. **Test with real backend:**
   - Configure backend WebSocket URL
   - Start a real session
   - Verify data transmission

2. **Test lockdown features:**
   - Navigate to meeting URL
   - Verify fullscreen activation
   - Test keyboard shortcut blocking

3. **Test security monitoring:**
   - Run suspicious process (e.g., OBS)
   - Check security alerts appear
   - Verify alerts sent to backend

4. **Package the app:**
   ```bash
   npm run package:win   # Windows
   npm run package:mac   # macOS
   npm run package:linux # Linux
   ```

---

## Development Workflow

### Making Changes

1. **Edit renderer files** (src/renderer/*)
2. **Rebuild:**
   ```bash
   npm run build:renderer
   ```
3. **Restart app:**
   ```bash
   npm start
   ```

### Hot Reload (Future Enhancement)

Currently requires full rebuild. To add hot reload:
1. Set up Vite dev server
2. Point main process to `http://localhost:3000`
3. Enable Vite HMR

---

## File Locations

### Source Files
```
src/
├── renderer/
│   ├── index.html          # Entry HTML
│   ├── index.ts            # Entry TypeScript
│   ├── video/              # Video capture modules
│   ├── meeting/            # Meeting detection
│   └── ui/                 # UI components
```

### Built Files
```
build/
├── renderer/
│   ├── index.html
│   ├── assets/
│   │   ├── index-*.js      # Bundled JavaScript
│   │   └── index-*.css     # Bundled CSS (if any)
```

---

## Environment Variables

Currently none required. Future additions:

```bash
# .env file
BACKEND_URL=wss://api.blockd.site
LOG_LEVEL=debug
ENABLE_DEVTOOLS=true
```

---

## Support

For issues:
1. Check console for errors
2. Check this QUICKSTART guide
3. Check BUILD_SUMMARY.md for architecture
4. Check src/renderer/README.md for detailed docs

---

## Success Indicators

When everything works:

✅ App launches without errors
✅ Webcam permission granted
✅ UI shows "Webcam: Capturing"
✅ Frame counter increases
✅ Meeting URLs detected correctly
✅ Eye tracker shows FPS ~30
✅ Calibration completes successfully
✅ IPC communication works (check console)
✅ No memory leaks in long-running test

If all indicators pass, the renderer system is working correctly!
