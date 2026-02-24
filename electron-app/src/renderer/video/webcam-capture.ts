/**
 * Webcam Capture Module
 *
 * Captures webcam video stream and sends frames to main process for backend transmission.
 * Configured at 640x480 @ 30fps for interviewee face recording.
 */

/// <reference path="../blockd.d.ts" />

import { VideoFrame, VideoCaptureConfig } from '../../shared/types';

export interface WebcamCaptureConfig {
  width?: number;
  height?: number;
  frameRate?: number;
  facingMode?: 'user' | 'environment';
  jpegQuality?: number;
  captureIntervalMs?: number;
}

export interface WebcamCaptureStatus {
  isCapturing: boolean;
  hasPermission: boolean;
  framesSent: number;
  lastFrameTimestamp: number;
}

/**
 * WebcamCapture class
 * Manages webcam access and frame capture for interviewee video
 */
export class WebcamCapture {
  private config: Required<WebcamCaptureConfig>;

  // Video stream components
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasContext: CanvasRenderingContext2D | null = null;

  // Capture state
  private isCapturing = false;
  private hasPermission = false;
  private captureTimer: NodeJS.Timeout | null = null;
  private framesSent = 0;
  private lastFrameTimestamp = 0;

  // Callbacks
  private onFrameCapturedCallback: ((frame: VideoFrame) => void) | null = null;
  private onStatusChangeCallback: ((status: WebcamCaptureStatus) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  constructor(config: WebcamCaptureConfig = {}) {
    this.config = {
      width: 640,
      height: 480,
      frameRate: 30,
      facingMode: 'user',
      jpegQuality: 0.8,
      captureIntervalMs: 1000 / 30, // 30fps = ~33ms per frame
      ...config
    };
  }

  /**
   * Request webcam permission and initialize stream
   */
  async initialize(): Promise<void> {
    try {
      // Request webcam access
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: this.config.width },
          height: { ideal: this.config.height },
          frameRate: { ideal: this.config.frameRate },
          facingMode: this.config.facingMode
        },
        audio: false // Audio is not needed for webcam capture
      });

      this.hasPermission = true;

      // Create video element
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.stream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) {
          reject(new Error('Video element not created'));
          return;
        }

        this.videoElement.onloadedmetadata = () => {
          this.videoElement?.play().then(() => resolve()).catch(reject);
        };

        this.videoElement.onerror = () => {
          reject(new Error('Failed to load video stream'));
        };
      });

      // Create canvas for frame capture
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.config.width;
      this.canvas.height = this.config.height;
      this.canvasContext = this.canvas.getContext('2d');

      if (!this.canvasContext) {
        throw new Error('Failed to get canvas context');
      }

      this.updateStatus();

      console.log('Webcam initialized successfully', {
        width: this.config.width,
        height: this.config.height,
        frameRate: this.config.frameRate
      });
    } catch (error) {
      this.hasPermission = false;
      this.updateStatus();

      const err = error instanceof Error ? error : new Error('Unknown error initializing webcam');
      console.error('Failed to initialize webcam:', err);

      if (this.onErrorCallback) {
        this.onErrorCallback(err);
      }

      throw err;
    }
  }

  /**
   * Start capturing frames
   */
  async start(): Promise<void> {
    if (this.isCapturing) {
      console.warn('Webcam capture already started');
      return;
    }

    if (!this.stream || !this.videoElement || !this.canvas || !this.canvasContext) {
      throw new Error('Webcam not initialized. Call initialize() first.');
    }

    this.isCapturing = true;
    this.framesSent = 0;

    // Start periodic frame capture
    this.captureTimer = setInterval(() => {
      this.captureFrame();
    }, this.config.captureIntervalMs);

    this.updateStatus();

    console.log('Webcam capture started');
  }

  /**
   * Stop capturing frames
   */
  stop(): void {
    if (!this.isCapturing) {
      return;
    }

    this.isCapturing = false;

    // Stop capture timer
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }

    this.updateStatus();

    console.log('Webcam capture stopped', {
      totalFramesSent: this.framesSent
    });
  }

  /**
   * Clean up resources and release webcam
   */
  dispose(): void {
    this.stop();

    // Stop stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // Clean up video element
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    // Clean up canvas
    this.canvas = null;
    this.canvasContext = null;

    this.hasPermission = false;
    this.updateStatus();

    console.log('Webcam capture disposed');
  }

  /**
   * Get current capture status
   */
  getStatus(): WebcamCaptureStatus {
    return {
      isCapturing: this.isCapturing,
      hasPermission: this.hasPermission,
      framesSent: this.framesSent,
      lastFrameTimestamp: this.lastFrameTimestamp
    };
  }

  /**
   * Set callback for captured frames
   */
  onFrameCaptured(callback: (frame: VideoFrame) => void): void {
    this.onFrameCapturedCallback = callback;
  }

  /**
   * Set callback for status changes
   */
  onStatusChange(callback: (status: WebcamCaptureStatus) => void): void {
    this.onStatusChangeCallback = callback;
  }

  /**
   * Set callback for errors
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  // ========================================================================
  // Private methods
  // ========================================================================

  /**
   * Capture a single frame from the video stream
   */
  private captureFrame(): void {
    if (!this.videoElement || !this.canvas || !this.canvasContext) {
      return;
    }

    try {
      // Draw current video frame to canvas
      this.canvasContext.drawImage(
        this.videoElement,
        0,
        0,
        this.config.width,
        this.config.height
      );

      // Convert canvas to JPEG blob
      this.canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.error('Failed to convert canvas to blob');
            return;
          }

          // Convert blob to Uint8Array
          blob.arrayBuffer().then((arrayBuffer) => {
            const frame: VideoFrame = {
              data: new Uint8Array(arrayBuffer),
              width: this.config.width,
              height: this.config.height,
              timestamp: Date.now(),
              format: 'jpeg'
            };

            this.lastFrameTimestamp = frame.timestamp;
            this.framesSent++;

            // Send frame via callback
            if (this.onFrameCapturedCallback) {
              this.onFrameCapturedCallback(frame);
            }

            // Send frame to main process via IPC
            if (window.blockd) {
              window.blockd.video.sendFrame(frame).catch((error) => {
                console.error('Failed to send video frame:', error);
              });
            }
          }).catch((error) => {
            console.error('Failed to convert blob to array buffer:', error);
          });
        },
        'image/jpeg',
        this.config.jpegQuality
      );
    } catch (error) {
      console.error('Error capturing frame:', error);

      if (this.onErrorCallback && error instanceof Error) {
        this.onErrorCallback(error);
      }
    }
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
