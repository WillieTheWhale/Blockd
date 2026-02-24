/**
 * 2D Kalman Filter for gaze smoothing
 *
 * State vector: [x, y, vx, vy]
 * - (x, y): current position
 * - (vx, vy): velocity
 */

export class KalmanFilter {
  private state: number[];           // [x, y, vx, vy]
  private covariance: number[][];    // 4x4 covariance matrix
  private processNoise: number;      // Process noise (Q)
  private measurementNoise: number;  // Measurement noise (R)
  private dt: number;                // Time step (seconds)

  constructor(
    processNoise: number = 0.01,
    measurementNoise: number = 0.1,
    dt: number = 1 / 30  // 30 FPS
  ) {
    // Initialize state to zeros
    this.state = [0, 0, 0, 0];

    // Initialize covariance matrix (identity)
    this.covariance = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    this.processNoise = processNoise;
    this.measurementNoise = measurementNoise;
    this.dt = dt;
  }

  /**
   * Predict next state based on motion model
   */
  predict(): void {
    // State transition matrix (constant velocity model)
    // x_new = x + vx * dt
    // y_new = y + vy * dt
    // vx_new = vx
    // vy_new = vy
    const F = [
      [1, 0, this.dt, 0],
      [0, 1, 0, this.dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    // Predict state: x = F * x
    this.state = this.matrixVectorMultiply(F, this.state);

    // Predict covariance: P = F * P * F^T + Q
    const FP = this.matrixMultiply(F, this.covariance);
    const FPFT = this.matrixMultiply(FP, this.transpose(F));

    // Add process noise
    for (let i = 0; i < 4; i++) {
      FPFT[i][i] += this.processNoise;
    }

    this.covariance = FPFT;
  }

  /**
   * Update state with measurement
   * @param measurement - [x, y] measurement
   */
  update(measurement: [number, number]): void {
    // Measurement matrix (we only measure position, not velocity)
    const H = [
      [1, 0, 0, 0],
      [0, 1, 0, 0]
    ];

    // Measurement noise covariance
    const R = [
      [this.measurementNoise, 0],
      [0, this.measurementNoise]
    ];

    // Innovation: y = z - H * x
    const Hx = this.matrixVectorMultiply(H, this.state);
    const innovation = [
      measurement[0] - Hx[0],
      measurement[1] - Hx[1]
    ];

    // Innovation covariance: S = H * P * H^T + R
    const HP = this.matrixMultiply(H, this.covariance);
    const HPHT = this.matrixMultiply(HP, this.transpose(H));
    const S = [
      [HPHT[0][0] + R[0][0], HPHT[0][1] + R[0][1]],
      [HPHT[1][0] + R[1][0], HPHT[1][1] + R[1][1]]
    ];

    // Kalman gain: K = P * H^T * S^-1
    const PHT = this.matrixMultiply(this.covariance, this.transpose(H));
    const Sinv = this.invert2x2(S);
    const K = this.matrixMultiply(PHT, Sinv);

    // Update state: x = x + K * y
    const Ky = this.matrixVectorMultiply(K, innovation);
    for (let i = 0; i < 4; i++) {
      this.state[i] += Ky[i];
    }

    // Update covariance: P = (I - K * H) * P
    const KH = this.matrixMultiply(K, H);
    const I_KH = this.subtractFromIdentity(KH);
    this.covariance = this.matrixMultiply(I_KH, this.covariance);
  }

  /**
   * Get current filtered position
   */
  getPosition(): [number, number] {
    return [this.state[0], this.state[1]];
  }

  /**
   * Get current velocity
   */
  getVelocity(): [number, number] {
    return [this.state[2], this.state[3]];
  }

  /**
   * Reset filter with new position
   */
  reset(x: number, y: number): void {
    this.state = [x, y, 0, 0];
    this.covariance = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];
  }

  // ========================================================================
  // Matrix operations
  // ========================================================================

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

  private invert2x2(A: number[][]): number[][] {
    const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    if (Math.abs(det) < 1e-10) {
      // Singular matrix, return identity
      return [[1, 0], [0, 1]];
    }

    return [
      [A[1][1] / det, -A[0][1] / det],
      [-A[1][0] / det, A[0][0] / det]
    ];
  }

  private subtractFromIdentity(A: number[][]): number[][] {
    const size = A.length;
    const result: number[][] = [];

    for (let i = 0; i < size; i++) {
      result[i] = [];
      for (let j = 0; j < size; j++) {
        if (i === j) {
          result[i][j] = 1 - A[i][j];
        } else {
          result[i][j] = -A[i][j];
        }
      }
    }

    return result;
  }
}
