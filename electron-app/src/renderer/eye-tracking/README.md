# Eye Tracking Module

Eye tracking implementation for the Blockd Electron app using MediaPipe FaceMesh.

## Overview

The eye tracking system consists of five main components:

1. **eye-tracker.ts** - Main controller that orchestrates the entire eye tracking pipeline
2. **face-detector.ts** - MediaPipe FaceMesh wrapper for facial landmark detection
3. **gaze-estimator.ts** - Converts iris positions to screen gaze coordinates
4. **kalman-filter.ts** - 2D Kalman filter for gaze smoothing
5. **calibration.ts** - 9-point calibration system

## Usage

### Basic Setup

```typescript
import { EyeTracker } from './eye-tracking';

// Create eye tracker instance
const eyeTracker = new EyeTracker({
  targetFps: 30,
  batchSize: 3,
  batchIntervalMs: 100,
  enableKalmanFilter: true,
  requireCalibration: false
});

// Initialize with session ID
await eyeTracker.initialize('session-123');

// Start tracking
await eyeTracker.start();
```

### With Calibration

```typescript
// Initialize eye tracker
await eyeTracker.initialize('session-123');

// Set up calibration progress callback
eyeTracker.onCalibrationProgress((state) => {
  console.log(`Point ${state.currentPointIndex + 1}/9 - Samples: ${state.samplesCollected}/${state.targetSamples}`);
});

// Start calibration
await eyeTracker.startCalibration();

// After calibration completes, start tracking
eyeTracker.onStatusChange((status) => {
  if (status.calibrated && !status.isRunning) {
    eyeTracker.start();
  }
});
```

### Monitor Status

```typescript
eyeTracker.onStatusChange((status) => {
  console.log('Eye Tracker Status:', {
    isRunning: status.isRunning,
    isCalibrating: status.isCalibrating,
    faceDetected: status.faceDetected,
    calibrated: status.calibrated,
    fps: status.fps
  });
});
```

### Stop Tracking

```typescript
eyeTracker.stop();
eyeTracker.dispose();
```

## Architecture

### Data Flow

```
Video Frame (30 FPS)
  ↓
FaceDetector (MediaPipe)
  ↓
468 Facial Landmarks + Iris Positions
  ↓
GazeEstimator
  ↓
Raw Gaze Coordinates (0-1)
  ↓
Calibration Transform (if calibrated)
  ↓
KalmanFilter (smoothing)
  ↓
GazePoint { x, y, confidence, isOffScreen }
  ↓
Batch (3 points per ~100ms)
  ↓
IPC → Main Process → Backend
```

### Components

#### 1. EyeTracker

Main controller that:
- Manages webcam stream
- Runs 30 FPS tracking loop
- Coordinates all components
- Batches gaze data (3 points per 100ms)
- Sends data to main process via IPC

#### 2. FaceDetector

MediaPipe FaceMesh wrapper that:
- Detects 468 facial landmarks
- Extracts iris positions (landmarks 468, 473)
- Provides eye bounding boxes
- Estimates detection confidence

#### 3. GazeEstimator

Gaze calculation engine that:
- Normalizes iris position within eye bounds
- Applies calibration transformation
- Detects off-screen gaze (threshold: 0.15)
- Returns GazePoint with confidence

#### 4. KalmanFilter

2D smoothing filter with:
- State: [x, y, vx, vy]
- Process noise: 0.01
- Measurement noise: 0.1
- 30 FPS time step

#### 5. Calibration

9-point calibration system that:
- Displays fullscreen overlay
- Shows 3x3 grid of calibration points
- Collects 60 samples per point (2 seconds)
- Computes affine transformation matrix
- Calculates accuracy metric

## MediaPipe Integration

The module loads MediaPipe FaceMesh from CDN:

```typescript
locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}
```

For offline use, bundle MediaPipe WASM files in `assets/mediapipe/` and update the path.

## IPC Communication

Gaze data is sent to the main process via IPC:

```typescript
// Gaze data batch
window.electronAPI.send(RendererToMain.GAZE_DATA_BATCH, {
  sessionId: 'session-123',
  points: [
    { x: 0.5, y: 0.5, confidence: 0.9, timestamp: 1234567890, isOffScreen: false },
    // ... more points
  ]
});

// Calibration complete
window.electronAPI.invoke(RendererToMain.CALIBRATION_COMPLETE, {
  success: true,
  accuracy: 0.85,
  points: [...],
  transformMatrix: [[...], [...]]
});
```

## Configuration

### EyeTrackerConfig

```typescript
interface EyeTrackerConfig {
  targetFps?: number;              // Default: 30
  batchSize?: number;              // Default: 3 points
  batchIntervalMs?: number;        // Default: 100ms
  enableKalmanFilter?: boolean;    // Default: true
  requireCalibration?: boolean;    // Default: false
}
```

### CalibrationConfig

```typescript
interface CalibrationConfig {
  samplesPerPoint?: number;   // Default: 60 (2 seconds at 30 FPS)
  sampleDuration?: number;    // Default: 2000ms
  pointRadius?: number;       // Default: 15px
  gridMargin?: number;        // Default: 0.1 (10% from edges)
}
```

## Performance

- **Target FPS**: 30 FPS
- **Actual FPS**: Monitored and reported in status
- **Batch Rate**: 10 batches/second (100ms interval)
- **Data Rate**: ~30 gaze points/second
- **Calibration Time**: ~20 seconds (9 points × 2 seconds + transitions)

## Browser Compatibility

Requires:
- WebRTC (getUserMedia)
- WebAssembly
- Canvas API
- RequestAnimationFrame

Tested on:
- Chromium 100+ (Electron)
- Chrome 100+
- Edge 100+

## Dependencies

```json
{
  "@mediapipe/face_mesh": "^0.4.1633559619",
  "@mediapipe/camera_utils": "^0.3.1620248357"
}
```

## Troubleshooting

### Camera not detected
- Check browser permissions
- Ensure camera is not in use by another app
- Verify `navigator.mediaDevices.getUserMedia` is available

### Low FPS
- Reduce video resolution (default: 640×480)
- Disable Kalman filter
- Check CPU usage

### Poor calibration accuracy
- Ensure good lighting
- Keep head still during calibration
- Increase samples per point
- Re-calibrate if accuracy < 0.7

### Face not detected
- Ensure face is clearly visible
- Check lighting conditions
- Face should be 30-80cm from camera
- Look directly at camera

## License

Proprietary - Blockd
