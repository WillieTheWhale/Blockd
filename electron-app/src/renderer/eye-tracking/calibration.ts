/**
 * 9-point calibration system for gaze tracking
 *
 * Displays calibration overlay with 9 points in 3x3 grid
 * Collects gaze samples at each point and computes transformation matrix
 */

import { CalibrationResult, CalibrationPoint } from '../../shared/types';
import { FaceLandmarks, FaceDetector } from './face-detector';
import { GazeEstimator } from './gaze-estimator';

export interface CalibrationConfig {
  samplesPerPoint?: number;  // Number of samples to collect per point
  sampleDuration?: number;   // Duration in ms to collect samples
  pointRadius?: number;      // Radius of calibration points in pixels
  gridMargin?: number;       // Margin from screen edges (0-1)
}

export interface CalibrationState {
  isActive: boolean;
  currentPointIndex: number;
  totalPoints: number;
  samplesCollected: number;
  targetSamples: number;
}

export class Calibration {
  private faceDetector: FaceDetector;
  private gazeEstimator: GazeEstimator;
  private config: Required<CalibrationConfig>;

  private overlay: HTMLDivElement | null = null;
  private currentPoint: HTMLDivElement | null = null;

  private calibrationPoints: CalibrationPoint[] = [];
  private currentPointIndex = 0;
  private samplesCollected = 0;

  private isCalibrating = false;
  private onProgressCallback: ((state: CalibrationState) => void) | null = null;
  private onCompleteCallback: ((result: CalibrationResult) => void) | null = null;

  constructor(
    faceDetector: FaceDetector,
    gazeEstimator: GazeEstimator,
    config: CalibrationConfig = {}
  ) {
    this.faceDetector = faceDetector;
    this.gazeEstimator = gazeEstimator;

    this.config = {
      samplesPerPoint: 60,      // 2 seconds at 30 FPS
      sampleDuration: 2000,     // 2 seconds
      pointRadius: 15,          // pixels
      gridMargin: 0.1,          // 10% margin from edges
      ...config
    };
  }

  /**
   * Start calibration process
   */
  async startCalibration(): Promise<void> {
    if (this.isCalibrating) {
      throw new Error('Calibration already in progress');
    }

    this.isCalibrating = true;
    this.currentPointIndex = 0;
    this.samplesCollected = 0;
    this.calibrationPoints = [];

    // Create calibration overlay
    this.createOverlay();

    // Generate 9 calibration points (3x3 grid)
    const screenPoints = this.generateCalibrationPoints();

    // Show first point
    await this.showNextPoint(screenPoints);
  }

  /**
   * Process landmarks during calibration
   */
  processSample(landmarks: FaceLandmarks): void {
    if (!this.isCalibrating || this.currentPointIndex >= 9) {
      return;
    }

    // Get current calibration point
    const currentPoint = this.calibrationPoints[this.currentPointIndex];
    if (!currentPoint) {
      return;
    }

    // Estimate raw gaze (without calibration applied)
    const gazeEstimate = this.gazeEstimator.estimateGaze(landmarks);
    if (!gazeEstimate) {
      return;
    }

    // Store sample
    currentPoint.samples.push({
      gazeX: gazeEstimate.x,
      gazeY: gazeEstimate.y,
      timestamp: landmarks.timestamp
    });

    this.samplesCollected++;

    // Update progress
    this.updateProgress();

    // Move to next point when enough samples collected
    if (this.samplesCollected >= this.config.samplesPerPoint) {
      this.moveToNextPoint();
    }
  }

  /**
   * Cancel calibration
   */
  cancelCalibration(): void {
    this.isCalibrating = false;
    this.removeOverlay();

    if (this.onCompleteCallback) {
      this.onCompleteCallback({
        success: false,
        accuracy: 0,
        points: []
      });
    }
  }

  /**
   * Set progress callback
   */
  onProgress(callback: (state: CalibrationState) => void): void {
    this.onProgressCallback = callback;
  }

  /**
   * Set completion callback
   */
  onComplete(callback: (result: CalibrationResult) => void): void {
    this.onCompleteCallback = callback;
  }

  /**
   * Generate 9 calibration points in 3x3 grid
   */
  private generateCalibrationPoints(): Array<{ x: number; y: number }> {
    const margin = this.config.gridMargin;
    const positions = [
      // Top row
      { x: margin, y: margin },
      { x: 0.5, y: margin },
      { x: 1 - margin, y: margin },
      // Middle row
      { x: margin, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 1 - margin, y: 0.5 },
      // Bottom row
      { x: margin, y: 1 - margin },
      { x: 0.5, y: 1 - margin },
      { x: 1 - margin, y: 1 - margin }
    ];

    return positions;
  }

  /**
   * Create calibration overlay UI
   */
  private createOverlay(): void {
    this.overlay = document.createElement('div');
    this.overlay.style.position = 'fixed';
    this.overlay.style.top = '0';
    this.overlay.style.left = '0';
    this.overlay.style.width = '100vw';
    this.overlay.style.height = '100vh';
    this.overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.overlay.style.zIndex = '9999';
    this.overlay.style.cursor = 'none';

    // Add instructions
    const instructions = document.createElement('div');
    instructions.style.position = 'absolute';
    instructions.style.top = '20px';
    instructions.style.left = '50%';
    instructions.style.transform = 'translateX(-50%)';
    instructions.style.color = 'white';
    instructions.style.fontSize = '24px';
    instructions.style.textAlign = 'center';
    instructions.textContent = 'Look at each point as it appears';
    this.overlay.appendChild(instructions);

    document.body.appendChild(this.overlay);
  }

  /**
   * Remove calibration overlay
   */
  private removeOverlay(): void {
    if (this.overlay) {
      document.body.removeChild(this.overlay);
      this.overlay = null;
    }
    if (this.currentPoint) {
      this.currentPoint = null;
    }
  }

  /**
   * Show next calibration point
   */
  private async showNextPoint(screenPoints: Array<{ x: number; y: number }>): Promise<void> {
    if (this.currentPointIndex >= screenPoints.length) {
      // All points collected, compute calibration
      this.completeCalibration();
      return;
    }

    const point = screenPoints[this.currentPointIndex];

    // Create calibration point
    this.calibrationPoints.push({
      screenX: point.x,
      screenY: point.y,
      samples: []
    });

    // Remove previous point if exists
    if (this.currentPoint) {
      this.overlay?.removeChild(this.currentPoint);
    }

    // Create new point element
    this.currentPoint = document.createElement('div');
    this.currentPoint.style.position = 'absolute';
    this.currentPoint.style.left = `${point.x * 100}%`;
    this.currentPoint.style.top = `${point.y * 100}%`;
    this.currentPoint.style.width = `${this.config.pointRadius * 2}px`;
    this.currentPoint.style.height = `${this.config.pointRadius * 2}px`;
    this.currentPoint.style.borderRadius = '50%';
    this.currentPoint.style.backgroundColor = 'red';
    this.currentPoint.style.transform = 'translate(-50%, -50%)';
    this.currentPoint.style.animation = 'pulse 1s infinite';

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.8; }
      }
    `;
    document.head.appendChild(style);

    this.overlay?.appendChild(this.currentPoint);

    // Reset sample counter
    this.samplesCollected = 0;
  }

  /**
   * Move to next calibration point
   */
  private async moveToNextPoint(): Promise<void> {
    this.currentPointIndex++;

    if (this.currentPointIndex >= 9) {
      // All points collected
      this.completeCalibration();
    } else {
      // Show next point
      const screenPoints = this.generateCalibrationPoints();
      await this.showNextPoint(screenPoints);
    }
  }

  /**
   * Complete calibration and compute transformation matrix
   */
  private completeCalibration(): void {
    this.isCalibrating = false;
    this.removeOverlay();

    // Compute transformation matrix
    const transformMatrix = this.computeTransformMatrix(this.calibrationPoints);

    // Calculate accuracy
    const accuracy = this.calculateAccuracy(this.calibrationPoints, transformMatrix);

    const result: CalibrationResult = {
      success: transformMatrix !== null,
      accuracy,
      points: this.calibrationPoints,
      transformMatrix: transformMatrix || undefined
    };

    // Apply calibration to gaze estimator
    if (transformMatrix) {
      this.gazeEstimator.setCalibration(transformMatrix);
    }

    // Call completion callback
    if (this.onCompleteCallback) {
      this.onCompleteCallback(result);
    }
  }

  /**
   * Compute affine transformation matrix using least squares
   *
   * Maps raw gaze coordinates to screen coordinates
   * Returns 2x3 matrix for affine transformation
   */
  private computeTransformMatrix(points: CalibrationPoint[]): number[][] | null {
    if (points.length < 4) {
      return null; // Need at least 4 points for reliable calibration
    }

    // Build matrices for least squares: Ax = b
    const A: number[][] = [];
    const bX: number[] = [];
    const bY: number[] = [];

    for (const point of points) {
      if (point.samples.length === 0) continue;

      // Average gaze samples for this point
      const avgGazeX = point.samples.reduce((sum, s) => sum + s.gazeX, 0) / point.samples.length;
      const avgGazeY = point.samples.reduce((sum, s) => sum + s.gazeY, 0) / point.samples.length;

      // Add equation: [gazeX, gazeY, 1] * [a, b, c]^T = screenX
      A.push([avgGazeX, avgGazeY, 1]);
      bX.push(point.screenX);
      bY.push(point.screenY);
    }

    if (A.length < 3) {
      return null;
    }

    // Solve least squares for X and Y separately
    const xParams = this.leastSquares(A, bX);
    const yParams = this.leastSquares(A, bY);

    if (!xParams || !yParams) {
      return null;
    }

    // Return 2x3 transformation matrix
    return [xParams, yParams];
  }

  /**
   * Solve least squares: minimize ||Ax - b||^2
   * Returns x using normal equations: x = (A^T A)^-1 A^T b
   */
  private leastSquares(A: number[][], b: number[]): number[] | null {
    const AT = this.transpose(A);
    const ATA = this.matrixMultiply(AT, A);
    const ATb = this.matrixVectorMultiply(AT, b);

    // Solve ATA * x = ATb
    const x = this.solveLinearSystem(ATA, ATb);
    return x;
  }

  /**
   * Calculate calibration accuracy (average error in normalized coordinates)
   */
  private calculateAccuracy(points: CalibrationPoint[], transformMatrix: number[][] | null): number {
    if (!transformMatrix || points.length === 0) {
      return 0;
    }

    let totalError = 0;
    let pointCount = 0;

    for (const point of points) {
      if (point.samples.length === 0) continue;

      const avgGazeX = point.samples.reduce((sum, s) => sum + s.gazeX, 0) / point.samples.length;
      const avgGazeY = point.samples.reduce((sum, s) => sum + s.gazeY, 0) / point.samples.length;

      // Apply transformation
      const [row1, row2] = transformMatrix;
      const predictedX = row1[0] * avgGazeX + row1[1] * avgGazeY + row1[2];
      const predictedY = row2[0] * avgGazeX + row2[1] * avgGazeY + row2[2];

      // Calculate Euclidean distance error
      const error = Math.sqrt(
        Math.pow(predictedX - point.screenX, 2) +
        Math.pow(predictedY - point.screenY, 2)
      );

      totalError += error;
      pointCount++;
    }

    // Return accuracy as 1 - normalized_error (1 = perfect, 0 = terrible)
    const avgError = totalError / pointCount;
    const accuracy = Math.max(0, 1 - avgError);
    return accuracy;
  }

  /**
   * Update progress callback
   */
  private updateProgress(): void {
    if (this.onProgressCallback) {
      this.onProgressCallback({
        isActive: this.isCalibrating,
        currentPointIndex: this.currentPointIndex,
        totalPoints: 9,
        samplesCollected: this.samplesCollected,
        targetSamples: this.config.samplesPerPoint
      });
    }
  }

  // ========================================================================
  // Matrix operations
  // ========================================================================

  private transpose(A: number[][]): number[][] {
    const rows = A.length;
    const cols = A[0].length;
    const result: number[][] = [];

    for (let j = 0; j < cols; j++) {
      result[j] = [];
      for (let i = 0; i < rows; i++) {
        result[j][i] = A[i][j];
      }
    }

    return result;
  }

  private matrixMultiply(A: number[][], B: number[][]): number[][] {
    const rows = A.length;
    const cols = B[0].length;
    const inner = B.length;
    const result: number[][] = [];

    for (let i = 0; i < rows; i++) {
      result[i] = [];
      for (let j = 0; j < cols; j++) {
        let sum = 0;
        for (let k = 0; k < inner; k++) {
          sum += A[i][k] * B[k][j];
        }
        result[i][j] = sum;
      }
    }

    return result;
  }

  private matrixVectorMultiply(A: number[][], v: number[]): number[] {
    const result: number[] = [];
    for (let i = 0; i < A.length; i++) {
      let sum = 0;
      for (let j = 0; j < v.length; j++) {
        sum += A[i][j] * v[j];
      }
      result[i] = sum;
    }
    return result;
  }

  /**
   * Solve linear system Ax = b using Gaussian elimination
   */
  private solveLinearSystem(A: number[][], b: number[]): number[] | null {
    const n = A.length;
    const augmented: number[][] = [];

    // Create augmented matrix [A|b]
    for (let i = 0; i < n; i++) {
      augmented[i] = [...A[i], b[i]];
    }

    // Forward elimination
    for (let i = 0; i < n; i++) {
      // Find pivot
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
          maxRow = k;
        }
      }

      // Swap rows
      [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

      // Check for singular matrix
      if (Math.abs(augmented[i][i]) < 1e-10) {
        return null;
      }

      // Eliminate below
      for (let k = i + 1; k < n; k++) {
        const factor = augmented[k][i] / augmented[i][i];
        for (let j = i; j <= n; j++) {
          augmented[k][j] -= factor * augmented[i][j];
        }
      }
    }

    // Back substitution
    const x: number[] = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = augmented[i][n];
      for (let j = i + 1; j < n; j++) {
        x[i] -= augmented[i][j] * x[j];
      }
      x[i] /= augmented[i][i];
    }

    return x;
  }
}
