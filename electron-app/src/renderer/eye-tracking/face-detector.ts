/**
 * MediaPipe FaceMesh wrapper for face landmark detection
 *
 * Detects 468 facial landmarks including iris positions
 */

import { FaceMesh, Results } from '@mediapipe/face_mesh';

export interface FaceLandmarks {
  landmarks: Array<{ x: number; y: number; z: number }>;
  confidence: number;
  timestamp: number;
}

export interface FaceDetectorConfig {
  maxNumFaces?: number;
  refineLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

export class FaceDetector {
  private faceMesh: FaceMesh | null = null;
  private isInitialized = false;
  private onResultsCallback: ((landmarks: FaceLandmarks | null) => void) | null = null;

  constructor(private config: FaceDetectorConfig = {}) {
    this.config = {
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
      ...config
    };
  }

  /**
   * Initialize MediaPipe FaceMesh
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Create FaceMesh instance
      this.faceMesh = new FaceMesh({
        locateFile: (file) => {
          // Load from CDN or bundled assets
          return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
      });

      // Configure FaceMesh
      this.faceMesh.setOptions({
        maxNumFaces: this.config.maxNumFaces,
        refineLandmarks: this.config.refineLandmarks,
        minDetectionConfidence: this.config.minDetectionConfidence,
        minTrackingConfidence: this.config.minTrackingConfidence,
      });

      // Set up results callback
      this.faceMesh.onResults((results: Results) => {
        this.handleResults(results);
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize FaceDetector:', error);
      throw new Error('FaceDetector initialization failed');
    }
  }

  /**
   * Process a video frame to detect face landmarks
   */
  async detectLandmarks(videoElement: HTMLVideoElement): Promise<void> {
    if (!this.isInitialized || !this.faceMesh) {
      throw new Error('FaceDetector not initialized');
    }

    try {
      await this.faceMesh.send({ image: videoElement });
    } catch (error) {
      console.error('Error detecting landmarks:', error);
      // Call callback with null to indicate detection failure
      if (this.onResultsCallback) {
        this.onResultsCallback(null);
      }
    }
  }

  /**
   * Set callback for detection results
   */
  onResults(callback: (landmarks: FaceLandmarks | null) => void): void {
    this.onResultsCallback = callback;
  }

  /**
   * Handle MediaPipe results
   */
  private handleResults(results: Results): void {
    if (!this.onResultsCallback) {
      return;
    }

    // Check if face was detected
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      this.onResultsCallback(null);
      return;
    }

    // Get first face (we only track one face)
    const faceLandmarks = results.multiFaceLandmarks[0];

    // Convert to our format
    const landmarks: FaceLandmarks = {
      landmarks: faceLandmarks.map(lm => ({
        x: lm.x,
        y: lm.y,
        z: lm.z || 0
      })),
      confidence: this.estimateConfidence(faceLandmarks),
      timestamp: Date.now()
    };

    this.onResultsCallback(landmarks);
  }

  /**
   * Estimate detection confidence based on landmark stability
   * MediaPipe doesn't provide a direct confidence score, so we estimate it
   */
  private estimateConfidence(landmarks: Array<{ x: number; y: number; z?: number }>): number {
    // Check if landmarks are within valid bounds (0-1)
    let validCount = 0;
    for (const lm of landmarks) {
      if (lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1) {
        validCount++;
      }
    }

    const validRatio = validCount / landmarks.length;

    // High confidence if most landmarks are valid
    if (validRatio > 0.95) return 0.9;
    if (validRatio > 0.85) return 0.7;
    if (validRatio > 0.70) return 0.5;
    return 0.3;
  }

  /**
   * Get specific landmark by index
   * Common indices:
   * - 468-473: Right iris (468 is center)
   * - 473-478: Left iris (473 is center)
   * - 33, 133: Right eye corners
   * - 362, 263: Left eye corners
   */
  getLandmark(landmarks: FaceLandmarks, index: number): { x: number; y: number; z: number } | null {
    if (index < 0 || index >= landmarks.landmarks.length) {
      return null;
    }
    return landmarks.landmarks[index];
  }

  /**
   * Get iris center positions
   * Returns [rightIris, leftIris]
   */
  getIrisPositions(landmarks: FaceLandmarks): [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number }
  ] | null {
    // MediaPipe provides iris landmarks at indices 468-477
    // 468: right iris center
    // 473: left iris center
    const rightIris = this.getLandmark(landmarks, 468);
    const leftIris = this.getLandmark(landmarks, 473);

    if (!rightIris || !leftIris) {
      return null;
    }

    return [rightIris, leftIris];
  }

  /**
   * Get eye bounding boxes
   * Returns [rightEye, leftEye]
   */
  getEyeBounds(landmarks: FaceLandmarks): [
    { minX: number; maxX: number; minY: number; maxY: number },
    { minX: number; maxX: number; minY: number; maxY: number }
  ] | null {
    // Right eye landmarks (approximate)
    const rightEyeIndices = [33, 160, 158, 133, 153, 144];
    // Left eye landmarks (approximate)
    const leftEyeIndices = [362, 385, 387, 263, 373, 380];

    const rightEyePoints = rightEyeIndices.map(i => this.getLandmark(landmarks, i)).filter(p => p !== null);
    const leftEyePoints = leftEyeIndices.map(i => this.getLandmark(landmarks, i)).filter(p => p !== null);

    if (rightEyePoints.length === 0 || leftEyePoints.length === 0) {
      return null;
    }

    const getRectBounds = (points: Array<{ x: number; y: number; z: number }>) => {
      const xs = points.map(p => p.x);
      const ys = points.map(p => p.y);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys)
      };
    };

    return [
      getRectBounds(rightEyePoints as Array<{ x: number; y: number; z: number }>),
      getRectBounds(leftEyePoints as Array<{ x: number; y: number; z: number }>)
    ];
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.faceMesh) {
      this.faceMesh.close();
      this.faceMesh = null;
    }
    this.isInitialized = false;
    this.onResultsCallback = null;
  }

  /**
   * Check if initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
}
