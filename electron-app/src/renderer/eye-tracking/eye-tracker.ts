/**
 * Main Eye Tracking Controller
 *
 * Orchestrates face detection, gaze estimation, and data transmission
 * Runs at 30 FPS and sends batched gaze data to main process
 */

import { GazePoint, GazeDataBatch, CalibrationResult } from '../../shared/types';
import { RendererToMain } from '../../shared/ipc-channels';
import { FaceDetector, FaceLandmarks } from './face-detector';
import { GazeEstimator } from './gaze-estimator';
import { KalmanFilter } from './kalman-filter';
import { Calibration, CalibrationState } from './calibration';

export interface EyeTrackerConfig {
  targetFps?: number;
  batchSize?: number;           // Number of gaze points per batch
  batchIntervalMs?: number;      // Interval to send batches (ms)
  enableKalmanFilter?: boolean;
  requireCalibration?: boolean;
}

export interface EyeTrackerStatus {
  isRunning: boolean;
  isCalibrating: boolean;
  faceDetected: boolean;
  calibrated: boolean;
  fps: number;
}

export class EyeTracker {
  private config: Required<EyeTrackerConfig>;

  // Core components
  private faceDetector: FaceDetector;
  private gazeEstimator: GazeEstimator;
  private kalmanFilter: KalmanFilter;
  private calibration: Calibration;

  // Video stream
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;

  // Tracking state
  private isRunning = false;
  private isCalibrating = false;
  private isCalibrated = false;
  private faceDetected = false;

  // Frame processing
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private frameInterval: number;
  private actualFps = 0;
  private fpsUpdateTime = 0;
  private frameCount = 0;

  // Gaze data batching
  private gazeDataBatch: GazePoint[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  // Session ID
  private sessionId: string | null = null;

  // Callbacks
  private onStatusChangeCallback: ((status: EyeTrackerStatus) => void) | null = null;
  private onCalibrationProgressCallback: ((state: CalibrationState) => void) | null = null;

  constructor(config: EyeTrackerConfig = {}) {
    this.config = {
      targetFps: 30,
      batchSize: 3,
      batchIntervalMs: 100,
      enableKalmanFilter: true,
      requireCalibration: false,
      ...config
    };

    this.frameInterval = 1000 / this.config.targetFps;

    // Initialize components
    this.faceDetector = new FaceDetector({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.gazeEstimator = new GazeEstimator(this.faceDetector, {
      offScreenThreshold: 0.15
    });

    this.kalmanFilter = new KalmanFilter(0.01, 0.1, 1 / this.config.targetFps);

    this.calibration = new Calibration(this.faceDetector, this.gazeEstimator, {
      samplesPerPoint: 60,
      sampleDuration: 2000
    });

    // Set up calibration callbacks
    this.calibration.onProgress((state) => {
      if (this.onCalibrationProgressCallback) {
        this.onCalibrationProgressCallback(state);
      }
    });

    this.calibration.onComplete((result) => {
      this.handleCalibrationComplete(result);
    });
  }

  /**
   * Initialize eye tracker
   */
  async initialize(sessionId: string): Promise<void> {
    this.sessionId = sessionId;

    // Initialize face detector
    await this.faceDetector.initialize();

    // Set up face detection results callback
    this.faceDetector.onResults((landmarks) => {
      this.handleFaceDetectionResults(landmarks);
    });
  }

  /**
   * Start eye tracking
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    // Check if calibration is required
    if (this.config.requireCalibration && !this.isCalibrated) {
      throw new Error('Calibration required before starting tracking');
    }

    // Start webcam
    await this.startWebcam();

    // Start tracking loop
    this.isRunning = true;
    this.startTrackingLoop();

    // Start batch sending
    this.startBatchSending();

    this.updateStatus();
  }

  /**
   * Stop eye tracking
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop tracking loop
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop batch sending
    if (this.batchTimer !== null) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    // Send remaining batch
    this.sendGazeDataBatch();

    // Stop webcam
    this.stopWebcam();

    this.updateStatus();
  }

  /**
   * Start calibration flow
   */
  async startCalibration(): Promise<void> {
    if (this.isCalibrating) {
      throw new Error('Calibration already in progress');
    }

    if (!this.faceDetector.initialized) {
      throw new Error('Eye tracker not initialized');
    }

    this.isCalibrating = true;
    this.updateStatus();

    await this.calibration.startCalibration();
  }

  /**
   * Cancel calibration
   */
  cancelCalibration(): void {
    if (!this.isCalibrating) {
      return;
    }

    this.calibration.cancelCalibration();
    this.isCalibrating = false;
    this.updateStatus();
  }

  /**
   * Get current status
   */
  getStatus(): EyeTrackerStatus {
    return {
      isRunning: this.isRunning,
      isCalibrating: this.isCalibrating,
      faceDetected: this.faceDetected,
      calibrated: this.isCalibrated,
      fps: this.actualFps
    };
  }

  /**
   * Set status change callback
   */
  onStatusChange(callback: (status: EyeTrackerStatus) => void): void {
    this.onStatusChangeCallback = callback;
  }

  /**
   * Set calibration progress callback
   */
  onCalibrationProgress(callback: (state: CalibrationState) => void): void {
    this.onCalibrationProgressCallback = callback;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.faceDetector.dispose();
  }

  // ========================================================================
  // Private methods
  // ========================================================================

  /**
   * Start webcam stream
   */
  private async startWebcam(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
          facingMode: 'user'
        },
        audio: false
      });

      // Create video element
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.stream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;

      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        if (!this.videoElement) return;
        this.videoElement.onloadedmetadata = () => {
          this.videoElement?.play();
          resolve();
        };
      });
    } catch (error) {
      console.error('Failed to start webcam:', error);
      throw new Error('Webcam access denied or unavailable');
    }
  }

  /**
   * Stop webcam stream
   */
  private stopWebcam(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  /**
   * Start tracking loop
   */
  private startTrackingLoop(): void {
    this.lastFrameTime = performance.now();
    this.fpsUpdateTime = performance.now();
    this.frameCount = 0;

    const processFrame = async (timestamp: number) => {
      if (!this.isRunning) {
        return;
      }

      // Calculate frame timing
      const elapsed = timestamp - this.lastFrameTime;

      // Throttle to target FPS
      if (elapsed >= this.frameInterval) {
        this.lastFrameTime = timestamp - (elapsed % this.frameInterval);

        // Process frame
        await this.processFrame();

        // Update FPS counter
        this.frameCount++;
        const fpsDelta = timestamp - this.fpsUpdateTime;
        if (fpsDelta >= 1000) {
          this.actualFps = Math.round((this.frameCount * 1000) / fpsDelta);
          this.frameCount = 0;
          this.fpsUpdateTime = timestamp;
          this.updateStatus();
        }
      }

      // Schedule next frame
      this.animationFrameId = requestAnimationFrame(processFrame);
    };

    this.animationFrameId = requestAnimationFrame(processFrame);
  }

  /**
   * Process single frame
   */
  private async processFrame(): Promise<void> {
    if (!this.videoElement || !this.faceDetector.initialized) {
      return;
    }

    try {
      // Detect face landmarks
      await this.faceDetector.detectLandmarks(this.videoElement);
    } catch (error) {
      console.error('Error processing frame:', error);
      this.faceDetected = false;
      this.updateStatus();
    }
  }

  /**
   * Handle face detection results
   */
  private handleFaceDetectionResults(landmarks: FaceLandmarks | null): void {
    this.faceDetected = landmarks !== null;

    if (!landmarks) {
      this.updateStatus();
      return;
    }

    // If calibrating, process calibration sample
    if (this.isCalibrating) {
      this.calibration.processSample(landmarks);
      return;
    }

    // Estimate gaze
    const gazePoint = this.gazeEstimator.estimateGaze(landmarks);
    if (!gazePoint) {
      return;
    }

    // Apply Kalman filter if enabled
    let filteredGaze = gazePoint;
    if (this.config.enableKalmanFilter) {
      this.kalmanFilter.predict();
      this.kalmanFilter.update([gazePoint.x, gazePoint.y]);
      const [smoothedX, smoothedY] = this.kalmanFilter.getPosition();

      filteredGaze = {
        ...gazePoint,
        x: smoothedX,
        y: smoothedY
      };
    }

    // Add to batch
    this.gazeDataBatch.push(filteredGaze);

    // Send batch if size limit reached
    if (this.gazeDataBatch.length >= this.config.batchSize) {
      this.sendGazeDataBatch();
    }
  }

  /**
   * Handle calibration completion
   */
  private handleCalibrationComplete(result: CalibrationResult): void {
    this.isCalibrating = false;
    this.isCalibrated = result.success;

    if (result.success) {
      console.log(`Calibration complete. Accuracy: ${(result.accuracy * 100).toFixed(1)}%`);
    } else {
      console.warn('Calibration failed');
    }

    // Send calibration result to main process
    if (window.blockd) {
      window.blockd.eyeTracking.sendCalibration(result);
    }

    this.updateStatus();
  }

  /**
   * Start batch sending timer
   */
  private startBatchSending(): void {
    this.batchTimer = setInterval(() => {
      this.sendGazeDataBatch();
    }, this.config.batchIntervalMs);
  }

  /**
   * Send gaze data batch to main process
   */
  private sendGazeDataBatch(): void {
    if (this.gazeDataBatch.length === 0 || !this.sessionId) {
      return;
    }

    const batch: GazeDataBatch = {
      sessionId: this.sessionId,
      points: [...this.gazeDataBatch]
    };

    // Send via IPC
    if (window.blockd) {
      window.blockd.eyeTracking.sendGazeBatch(batch);
    }

    // Clear batch
    this.gazeDataBatch = [];
  }

  /**
   * Update status and notify callback
   */
  private updateStatus(): void {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(this.getStatus());
    }
  }
}

// Type declaration for Blockd API (defined in preload script)
// Note: Full type is declared in blockd.d.ts and preload.ts
