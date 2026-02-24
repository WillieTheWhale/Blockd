# Security Monitoring Modules

This directory contains the security monitoring system for the Blockd Electron app.

## Modules

### 1. SecurityMonitor (security-monitor.ts)
Main orchestrator that coordinates all security checks.

**Usage:**
```typescript
import { SecurityMonitor } from './security';
import { BrowserWindow } from 'electron';

const securityMonitor = new SecurityMonitor({
  checkIntervalMs: 5000,
  enableProcessMonitoring: true,
  enableVMDetection: true,
  enableScreenRecorderDetection: true,
  enableFocusMonitoring: true,
  enableClipboardMonitoring: true,
});

// Listen for security events
securityMonitor.onSecurityEvent((event) => {
  console.log('Security event:', event);
  // Send to backend, log, etc.
});

// Start monitoring with a window
const mainWindow = new BrowserWindow({ ... });
await securityMonitor.start(mainWindow);

// Stop monitoring
securityMonitor.stop();
```

### 2. ProcessMonitor (process-monitor.ts)
Detects suspicious processes using systeminformation package.

**Usage:**
```typescript
import { ProcessMonitor } from './security';

const processMonitor = new ProcessMonitor();

// Scan for all suspicious processes
const suspiciousProcesses = await processMonitor.scanForSuspiciousProcesses();
console.log('Found suspicious processes:', suspiciousProcesses);

// Check if specific process is running
const isOBSRunning = await processMonitor.isProcessRunning([/obs/i]);
```

### 3. VMDetector (vm-detector.ts)
Detects if running in a virtual machine using multiple methods.

**Usage:**
```typescript
import { VMDetector } from './security';

const vmDetector = new VMDetector();

// Run VM detection
const result = await vmDetector.detect();
console.log('VM Detection:', result);
// {
//   isVM: true,
//   vmType: 'vmware',
//   confidence: 0.67,
//   detectionMethods: ['mac_address', 'bios_info']
// }

// Get detailed system info
const details = await vmDetector.getSystemDetails();
```

### 4. ScreenRecorderDetector (screen-recorder-detector.ts)
Detects screen recording software.

**Usage:**
```typescript
import { ScreenRecorderDetector } from './security';

const detector = new ScreenRecorderDetector();

// Detect any screen recorder
const result = await detector.detect();
console.log('Screen recording:', result);
// { isRecording: true, detectedRecorders: ['OBS Studio'] }

// Platform-specific detection
const platformResult = await detector.detectPlatformSpecific();

// Check specific recorder
const isOBSRunning = await detector.isRecorderRunning('obs');
```

### 5. FocusMonitor (focus-monitor.ts)
Tracks window focus changes using EventEmitter pattern.

**Usage:**
```typescript
import { FocusMonitor } from './security';
import { BrowserWindow } from 'electron';

const focusMonitor = new FocusMonitor();
const mainWindow = new BrowserWindow({ ... });

// Listen for focus events
focusMonitor.on('focus-lost', (event) => {
  console.log('Focus lost at:', event.timestamp);
  console.log('Was focused for:', event.duration, 'ms');
});

focusMonitor.on('focus-gained', (event) => {
  console.log('Focus gained at:', event.timestamp);
});

focusMonitor.on('window-minimized', (event) => {
  console.log('Window minimized');
});

// Start monitoring
focusMonitor.start(mainWindow);

// Check current state
const isFocused = focusMonitor.isFocused();
const duration = focusMonitor.getCurrentStateDuration();

// Stop monitoring
focusMonitor.stop();
```

### 6. ClipboardMonitor (clipboard-monitor.ts)
Monitors clipboard changes using polling.

**Usage:**
```typescript
import { ClipboardMonitor } from './security';

const clipboardMonitor = new ClipboardMonitor({
  pollIntervalMs: 500,
  enableTextTracking: true,
  enableImageTracking: true,
  logContent: false, // Don't log actual content for privacy
});

// Listen for clipboard changes
clipboardMonitor.on('clipboard-change', (event) => {
  console.log('Clipboard changed:', event);
  // {
  //   timestamp: 1234567890,
  //   hasText: true,
  //   hasImage: false,
  //   textLength: 42,
  //   changeType: 'text'
  // }
});

clipboardMonitor.on('clipboard-text-change', (event) => {
  console.log('Text copied/cut');
});

clipboardMonitor.on('clipboard-image-change', (event) => {
  console.log('Image copied');
});

// Start monitoring
clipboardMonitor.start();

// Get current clipboard state
const state = clipboardMonitor.getCurrentClipboard();

// Stop monitoring
clipboardMonitor.stop();
```

## Security Events

All security events follow this interface:

```typescript
interface SecurityEvent {
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  description: string;
  metadata: Record<string, unknown>;
}
```

### Event Types

- `suspicious_process` - Suspicious process detected
- `screen_recording_detected` - Screen recording software found
- `vm_detected` - Virtual machine detected
- `window_focus_lost` - Application lost focus
- `clipboard_activity` - Clipboard changed
- `multiple_monitors` - Multiple monitors detected
- `fullscreen_exit_attempt` - User tried to exit fullscreen
- `keyboard_shortcut_blocked` - Blocked shortcut was attempted
- `navigation_blocked` - Navigation to unauthorized site blocked

## Integration Example

```typescript
import { SecurityMonitor } from './security';
import { BrowserWindow } from 'electron';

// Create main window
const mainWindow = new BrowserWindow({
  width: 1280,
  height: 720,
  fullscreen: true,
  kiosk: true,
});

// Create and configure security monitor
const securityMonitor = new SecurityMonitor({
  checkIntervalMs: 5000,
  enableProcessMonitoring: true,
  enableVMDetection: true,
  enableScreenRecorderDetection: true,
  enableFocusMonitoring: true,
  enableClipboardMonitoring: true,
  clipboardPollIntervalMs: 500,
});

// Handle security events
securityMonitor.onSecurityEvent((event) => {
  console.log(`[${event.severity.toUpperCase()}] ${event.description}`);

  // Send to backend
  backendConnector.send({
    type: 'security_event',
    payload: event,
  });

  // Critical events - might want to end session
  if (event.severity === 'critical') {
    console.warn('CRITICAL SECURITY EVENT:', event);
    // Potentially end session or alert interviewer
  }
});

// Start monitoring
await securityMonitor.start(mainWindow);

// Later, stop monitoring
securityMonitor.stop();
```

## Dependencies

All modules require the following npm packages:
- `electron` - For window and clipboard APIs
- `systeminformation` - For process and system information

Install with:
```bash
npm install electron systeminformation
npm install --save-dev @types/node
```

## Notes

- **Performance**: VM detection is cached as it doesn't change during runtime
- **Privacy**: Clipboard monitor doesn't log actual content by default
- **Polling**: Clipboard monitor uses polling (500ms default) to detect changes
- **Focus Events**: Use BrowserWindow events for accurate focus tracking
- **Process Scanning**: Process monitor scans all running processes periodically
- **Platform Support**: Modules work on Windows, macOS, and Linux with platform-specific optimizations
