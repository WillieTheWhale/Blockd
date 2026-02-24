/**
 * Eye Tracking Usage Example
 *
 * This example demonstrates how to integrate the eye tracking module
 * into the Blockd renderer process.
 */

import { EyeTracker, EyeTrackerStatus } from './eye-tracker';
import { CalibrationState } from './calibration';

// ============================================================================
// Example 1: Basic Eye Tracking without Calibration
// ============================================================================

async function basicEyeTracking(sessionId: string) {
  // Create eye tracker instance
  const eyeTracker = new EyeTracker({
    targetFps: 30,
    batchSize: 3,
    batchIntervalMs: 100,
    enableKalmanFilter: true,
    requireCalibration: false
  });

  // Set up status monitoring
  eyeTracker.onStatusChange((status: EyeTrackerStatus) => {
    console.log('Eye Tracker Status:', {
      isRunning: status.isRunning,
      faceDetected: status.faceDetected,
      fps: status.fps
    });

    // Update UI to show face detection status
    updateFaceDetectionIndicator(status.faceDetected);
  });

  try {
    // Initialize eye tracker
    await eyeTracker.initialize(sessionId);

    // Start tracking
    await eyeTracker.start();

    console.log('Eye tracking started successfully');
  } catch (error) {
    console.error('Failed to start eye tracking:', error);

    if (error instanceof Error && error.message.includes('Webcam')) {
      alert('Camera access denied. Please enable camera permissions.');
    }
  }

  // Return eye tracker for later cleanup
  return eyeTracker;
}

// ============================================================================
// Example 2: Eye Tracking with Calibration
// ============================================================================

async function eyeTrackingWithCalibration(sessionId: string) {
  // Create eye tracker instance with calibration required
  const eyeTracker = new EyeTracker({
    targetFps: 30,
    batchSize: 3,
    batchIntervalMs: 100,
    enableKalmanFilter: true,
    requireCalibration: true  // Require calibration before tracking
  });

  // Set up calibration progress monitoring
  eyeTracker.onCalibrationProgress((state: CalibrationState) => {
    console.log(`Calibration Progress: Point ${state.currentPointIndex + 1}/${state.totalPoints}`);
    console.log(`Samples: ${state.samplesCollected}/${state.targetSamples}`);

    // Update calibration UI
    updateCalibrationProgress(state);
  });

  // Set up status monitoring
  eyeTracker.onStatusChange((status: EyeTrackerStatus) => {
    console.log('Eye Tracker Status:', status);

    // Automatically start tracking after successful calibration
    if (status.calibrated && !status.isRunning && !status.isCalibrating) {
      console.log('Calibration complete. Starting tracking...');
      eyeTracker.start().catch((err: Error) => {
        console.error('Failed to start tracking:', err);
      });
    }
  });

  try {
    // Initialize eye tracker
    await eyeTracker.initialize(sessionId);

    // Show calibration instructions to user
    showCalibrationInstructions();

    // Start calibration
    await eyeTracker.startCalibration();

    console.log('Calibration started');
  } catch (error) {
    console.error('Failed to start calibration:', error);
  }

  return eyeTracker;
}

// ============================================================================
// Example 3: Complete Session Flow
// ============================================================================

class EyeTrackingSession {
  private eyeTracker: EyeTracker | null = null;
  private sessionId: string | null = null;

  async startSession(sessionId: string, requireCalibration = true) {
    this.sessionId = sessionId;

    // Create eye tracker
    this.eyeTracker = new EyeTracker({
      targetFps: 30,
      batchSize: 3,
      batchIntervalMs: 100,
      enableKalmanFilter: true,
      requireCalibration
    });

    // Set up callbacks
    this.setupCallbacks();

    // Initialize
    await this.eyeTracker.initialize(sessionId);

    // Start calibration or tracking
    if (requireCalibration) {
      await this.eyeTracker.startCalibration();
    } else {
      await this.eyeTracker.start();
    }
  }

  private setupCallbacks() {
    if (!this.eyeTracker) return;

    // Status monitoring
    this.eyeTracker.onStatusChange((status: EyeTrackerStatus) => {
      // Update UI
      this.updateUI(status);

      // Auto-start tracking after calibration
      if (status.calibrated && !status.isRunning && !status.isCalibrating) {
        this.eyeTracker?.start();
      }

      // Alert if face lost for too long
      if (!status.faceDetected && status.isRunning) {
        this.handleFaceLost();
      }
    });

    // Calibration progress
    this.eyeTracker.onCalibrationProgress((state: CalibrationState) => {
      this.updateCalibrationUI(state);
    });
  }

  async recalibrate() {
    if (!this.eyeTracker) {
      throw new Error('Eye tracker not initialized');
    }

    // Stop tracking if running
    if (this.eyeTracker.getStatus().isRunning) {
      this.eyeTracker.stop();
    }

    // Start new calibration
    await this.eyeTracker.startCalibration();
  }

  stopSession() {
    if (this.eyeTracker) {
      this.eyeTracker.stop();
      this.eyeTracker.dispose();
      this.eyeTracker = null;
    }

    this.sessionId = null;
  }

  private updateUI(status: EyeTrackerStatus) {
    // Update UI elements based on status
    const statusElement = document.getElementById('eye-tracking-status');
    if (statusElement) {
      statusElement.textContent = `FPS: ${status.fps} | Face: ${status.faceDetected ? 'Detected' : 'Not Detected'}`;
    }
  }

  private updateCalibrationUI(state: CalibrationState) {
    const progressElement = document.getElementById('calibration-progress');
    if (progressElement) {
      const percentage = (state.samplesCollected / state.targetSamples) * 100;
      progressElement.textContent = `Point ${state.currentPointIndex + 1}/9 - ${percentage.toFixed(0)}%`;
    }
  }

  private handleFaceLost() {
    // Show warning if face not detected
    console.warn('Face not detected. Please ensure face is visible to camera.');
  }
}

// ============================================================================
// UI Helper Functions (pseudo-code)
// ============================================================================

function updateFaceDetectionIndicator(faceDetected: boolean) {
  const indicator = document.getElementById('face-indicator');
  if (indicator) {
    indicator.style.backgroundColor = faceDetected ? 'green' : 'red';
    indicator.textContent = faceDetected ? 'Face Detected' : 'No Face';
  }
}

function updateCalibrationProgress(state: CalibrationState) {
  const progressBar = document.getElementById('calibration-progress-bar');
  if (progressBar) {
    const percentage = (state.samplesCollected / state.targetSamples) * 100;
    progressBar.style.width = `${percentage}%`;
  }

  const pointIndicator = document.getElementById('calibration-point');
  if (pointIndicator) {
    pointIndicator.textContent = `Point ${state.currentPointIndex + 1} of ${state.totalPoints}`;
  }
}

function showCalibrationInstructions() {
  const instructions = `
    Calibration Instructions:

    1. Sit comfortably in front of your camera
    2. Keep your head relatively still
    3. Look at each red dot as it appears
    4. Follow the dot with your eyes only (don't move your head)
    5. The calibration will take about 20 seconds
  `;

  alert(instructions);
}

// ============================================================================
// Usage in Renderer Process
// ============================================================================

// Example: Start session when button clicked
document.getElementById('start-session-btn')?.addEventListener('click', async () => {
  const sessionId = 'session-' + Date.now();
  const session = new EyeTrackingSession();

  try {
    await session.startSession(sessionId, true);
    console.log('Eye tracking session started');
  } catch (error) {
    console.error('Failed to start session:', error);
  }
});

// Example: Listen for IPC events from main process
// Using window.blockd API which is exposed via preload script
if (window.blockd) {
  window.blockd.on.sessionStarted((sessionData: { sessionId: string }) => {
    const sessionId = sessionData.sessionId;
    const eyeTracker = new EyeTracker();
    eyeTracker.initialize(sessionId).then(() => {
      return eyeTracker.start();
    });
  });

  window.blockd.on.sessionEnded(() => {
    // Clean up eye tracker
    console.log('Session ended, stopping eye tracking');
  });
}

export { basicEyeTracking, eyeTrackingWithCalibration, EyeTrackingSession };
