/**
 * Gaze estimation from iris positions
 *
 * Converts iris positions within eye bounds to normalized screen coordinates
 */

import { GazePoint } from '../../shared/types';
import { FaceLandmarks, FaceDetector } from './face-detector';

export interface GazeEstimatorConfig {
  offScreenThreshold?: number;  // Distance beyond eye bounds to consider off-screen
  smoothingFactor?: number;     // 0-1, higher = more smoothing
}

export class GazeEstimator {
  private faceDetector: FaceDetector;
  private config: Required<GazeEstimatorConfig>;
  private calibrationTransform: number[][] | null = null;

  constructor(
    faceDetector: FaceDetector,
    config: GazeEstimatorConfig = {}
  ) {
    this.faceDetector = faceDetector;
    this.config = {
      offScreenThreshold: 0.15,
      smoothingFactor: 0.3,
      ...config
    };
  }

  /**
   * Estimate gaze point from face landmarks
   */
  estimateGaze(landmarks: FaceLandmarks): GazePoint | null {
    // Get iris positions
    const irisPositions = this.faceDetector.getIrisPositions(landmarks);
    if (!irisPositions) {
      return null;
    }

    const [rightIris, leftIris] = irisPositions;

    // Get eye bounds
    const eyeBounds = this.faceDetector.getEyeBounds(landmarks);
    if (!eyeBounds) {
      return null;
    }

    const [rightEyeBounds, leftEyeBounds] = eyeBounds;

    // Calculate normalized iris position within each eye (0-1)
    const rightGaze = this.normalizeIrisPosition(rightIris, rightEyeBounds);
    const leftGaze = this.normalizeIrisPosition(leftIris, leftEyeBounds);

    // Average both eyes for more stable gaze estimate
    const rawX = (rightGaze.x + leftGaze.x) / 2;
    const rawY = (rightGaze.y + leftGaze.y) / 2;

    // Apply calibration transform if available
    let [gazeX, gazeY] = this.calibrationTransform
      ? this.applyCalibration(rawX, rawY)
      : [rawX, rawY];

    // Clamp to valid range for on-screen detection
    const clampedX = Math.max(0, Math.min(1, gazeX));
    const clampedY = Math.max(0, Math.min(1, gazeY));

    // Detect off-screen gaze
    const { isOffScreen, direction } = this.detectOffScreen(gazeX, gazeY);

    // Calculate confidence based on landmark confidence and eye symmetry
    const eyeSymmetry = 1 - Math.abs(rightGaze.x - leftGaze.x);
    const confidence = landmarks.confidence * eyeSymmetry;

    return {
      x: clampedX,
      y: clampedY,
      confidence,
      timestamp: landmarks.timestamp,
      isOffScreen,
      offScreenDirection: direction
    };
  }

  /**
   * Normalize iris position within eye bounds to 0-1 range
   */
  private normalizeIrisPosition(
    iris: { x: number; y: number },
    eyeBounds: { minX: number; maxX: number; minY: number; maxY: number }
  ): { x: number; y: number } {
    const eyeWidth = eyeBounds.maxX - eyeBounds.minX;
    const eyeHeight = eyeBounds.maxY - eyeBounds.minY;

    // Prevent division by zero
    if (eyeWidth < 0.001 || eyeHeight < 0.001) {
      return { x: 0.5, y: 0.5 };
    }

    // Normalize iris position within eye (0 = left/top, 1 = right/bottom)
    const normalizedX = (iris.x - eyeBounds.minX) / eyeWidth;
    const normalizedY = (iris.y - eyeBounds.minY) / eyeHeight;

    return {
      x: normalizedX,
      y: normalizedY
    };
  }

  /**
   * Detect if gaze is off-screen and determine direction
   */
  private detectOffScreen(
    x: number,
    y: number
  ): { isOffScreen: boolean; direction?: 'left' | 'right' | 'up' | 'down' } {
    const threshold = this.config.offScreenThreshold;

    // Check horizontal bounds
    if (x < -threshold) {
      return { isOffScreen: true, direction: 'left' };
    }
    if (x > 1 + threshold) {
      return { isOffScreen: true, direction: 'right' };
    }

    // Check vertical bounds
    if (y < -threshold) {
      return { isOffScreen: true, direction: 'up' };
    }
    if (y > 1 + threshold) {
      return { isOffScreen: true, direction: 'down' };
    }

    return { isOffScreen: false };
  }

  /**
   * Apply calibration transformation matrix to raw gaze coordinates
   *
   * Uses affine transformation: [x', y'] = M * [x, y, 1]
   * where M is a 2x3 matrix computed during calibration
   */
  private applyCalibration(x: number, y: number): [number, number] {
    if (!this.calibrationTransform || this.calibrationTransform.length < 2) {
      return [x, y];
    }

    // Affine transformation
    const [row1, row2] = this.calibrationTransform;

    // Ensure we have valid transformation rows
    if (row1.length < 3 || row2.length < 3) {
      return [x, y];
    }

    const transformedX = row1[0] * x + row1[1] * y + row1[2];
    const transformedY = row2[0] * x + row2[1] * y + row2[2];

    return [transformedX, transformedY];
  }

  /**
   * Set calibration transformation matrix
   */
  setCalibration(transformMatrix: number[][] | null): void {
    this.calibrationTransform = transformMatrix;
  }

  /**
   * Get current calibration matrix
   */
  getCalibration(): number[][] | null {
    return this.calibrationTransform;
  }

  /**
   * Clear calibration
   */
  clearCalibration(): void {
    this.calibrationTransform = null;
  }

  /**
   * Calculate gaze vector direction (for debugging/analysis)
   * Returns normalized 2D vector
   */
  calculateGazeVector(landmarks: FaceLandmarks): { x: number; y: number } | null {
    const irisPositions = this.faceDetector.getIrisPositions(landmarks);
    if (!irisPositions) {
      return null;
    }

    const [rightIris, leftIris] = irisPositions;

    // Average iris position
    const avgIrisX = (rightIris.x + leftIris.x) / 2;
    const avgIrisY = (rightIris.y + leftIris.y) / 2;

    // Get face center (nose tip is a good approximation at index 1)
    const noseTip = this.faceDetector.getLandmark(landmarks, 1);
    if (!noseTip) {
      return null;
    }

    // Calculate vector from nose to iris (represents gaze direction)
    const vectorX = avgIrisX - noseTip.x;
    const vectorY = avgIrisY - noseTip.y;

    // Normalize vector
    const magnitude = Math.sqrt(vectorX * vectorX + vectorY * vectorY);
    if (magnitude < 0.001) {
      return { x: 0, y: 0 };
    }

    return {
      x: vectorX / magnitude,
      y: vectorY / magnitude
    };
  }
}
