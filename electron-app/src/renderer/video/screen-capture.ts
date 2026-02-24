/**
 * Screen Capture Module
 *
 * Captures screen content (meeting tab) for recording interviewer's screen share.
 * Uses lower framerate (5fps) to reduce bandwidth.
 * Relies on desktopCapturer API via IPC to main process.
 */

/// <reference path="../blockd.d.ts" />

import { VideoFrame } from '../../shared/types';

export interface ScreenCaptureConfig {
  width?: number;
  height?: number;
  frameRate?: number;
  jpegQuality?: number;
  captureIntervalMs?: number;
}

export interface ScreenCaptureStatus {
  isCapturing: boolean;
  hasPermission: boolean;
  framesSent: number;
  lastFrameTimestamp: number;
  sourceId: string | null;
  sourceName: string | null;
}

export interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  display_id?: string;
  appIcon?: string;
}

/**
 * ScreenCapture class
 * Manages screen/window capture for recording meeting content
 */
export class ScreenCapture {
  private config: Required<ScreenCaptureConfig>;

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
  private sourceId: string | null = null;
  private sourceName: string | null = null;

  // Callbacks
  private onFrameCapturedCallback: ((frame: VideoFrame) => void) | null = null;
  private onStatusChangeCallback: ((status: ScreenCaptureStatus) => void) | null = null;
  private onErrorCallback: ((error: Error) => void) | null = null;

  constructor(config: ScreenCaptureConfig = {}) {
    this.config = {
      width: 1920,
      height: 1080,
      frameRate: 5, // Lower framerate for screen capture
      jpegQuality: 0.7,
      captureIntervalMs: 1000 / 5, // 5fps = 200ms per frame
      ...config
    };
  }

  /**
   * Get available desktop sources (windows/screens)
   * Note: This requires IPC call to main process since desktopCapturer is not available in renderer
   */
  async getDesktopSources(): Promise<DesktopSource[]> {
    try {
      // In a real implementation, this would call the main process via IPC
      // For now, we'll use the Electron desktopCapturer API if available

      if (!('electron' in window)) {
        throw new Error('Desktop capture not available (not running in Electron)');
      }

      // This is a placeholder - in production, you'd need to expose this via preload script
      const sources = await (navigator.mediaDevices as any).getDisplayMedia({
        video: {
          width: { ideal: this.config.width },
          height: { ideal: this.config.height },
          frameRate: { ideal: this.config.frameRate }
        }
      });

      // For now, return empty array as this needs main process integration
      return [];
    } catch (error) {
      console.error('Failed to get desktop sources:', error);
      throw error;
    }
  }

  /**
   * Initialize screen capture with a specific source
   */
  async initialize(sourceId?: string): Promise<void> {
    try {
      // Use getDisplayMedia API for screen capture
      // In Electron, this prompts the user to select a screen/window
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: this.config.width },
          height: { ideal: this.config.height },
          frameRate: { ideal: this.config.frameRate },
          cursor: 'always'
        } as any,
        audio: false
      });

      this.hasPermission = true;
      this.sourceId = sourceId || 'display-capture';
      this.sourceName = 'Screen Capture';

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
          reject(new Error('Failed to load screen capture stream'));
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

      // Listen for stream ending (user stops sharing)
      this.stream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('Screen sharing stopped by user');
        this.stop();
        this.dispose();
      });

      this.updateStatus();

      console.log('Screen capture initialized successfully', {
        width: this.config.width,
        height: this.config.height,
        frameRate: this.config.frameRate,
        sourceId: this.sourceId
      });
    } catch (error) {
      this.hasPermission = false;
      this.updateStatus();

      const err = error instanceof Error ? error : new Error('Unknown error initializing screen capture');
      console.error('Failed to initialize screen capture:', err);

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
      console.warn('Screen capture already started');
      return;
    }

    if (!this.stream || !this.videoElement || !this.canvas || !this.canvasContext) {
      throw new Error('Screen capture not initialized. Call initialize() first.');
    }

    this.isCapturing = true;
    this.framesSent = 0;

    // Start periodic frame capture
    this.captureTimer = setInterval(() => {
      this.captureFrame();
    }, this.config.captureIntervalMs);

    this.updateStatus();

    console.log('Screen capture started');
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

    console.log('Screen capture stopped', {
      totalFramesSent: this.framesSent
    });
  }

  /**
   * Clean up resources and release screen capture
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
    this.sourceId = null;
    this.sourceName = null;
    this.updateStatus();

    console.log('Screen capture disposed');
  }

  /**
   * Get current capture status
   */
  getStatus(): ScreenCaptureStatus {
    return {
      isCapturing: this.isCapturing,
      hasPermission: this.hasPermission,
      framesSent: this.framesSent,
      lastFrameTimestamp: this.lastFrameTimestamp,
      sourceId: this.sourceId,
      sourceName: this.sourceName
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
  onStatusChange(callback: (status: ScreenCaptureStatus) => void): void {
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
   * Capture a single frame from the screen stream
   */
  private captureFrame(): void {
    if (!this.videoElement || !this.canvas || !this.canvasContext) {
      return;
    }

    try {
      // Get actual video dimensions
      const videoWidth = this.videoElement.videoWidth;
      const videoHeight = this.videoElement.videoHeight;

      if (videoWidth === 0 || videoHeight === 0) {
        return; // Video not ready yet
      }

      // Calculate scaling to fit canvas while maintaining aspect ratio
      const scaleX = this.config.width / videoWidth;
      const scaleY = this.config.height / videoHeight;
      const scale = Math.min(scaleX, scaleY);

      const scaledWidth = videoWidth * scale;
      const scaledHeight = videoHeight * scale;

      const offsetX = (this.config.width - scaledWidth) / 2;
      const offsetY = (this.config.height - scaledHeight) / 2;

      // Clear canvas
      this.canvasContext.fillStyle = '#000';
      this.canvasContext.fillRect(0, 0, this.config.width, this.config.height);

      // Draw video frame to canvas (scaled and centered)
      this.canvasContext.drawImage(
        this.videoElement,
        offsetX,
        offsetY,
        scaledWidth,
        scaledHeight
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
                console.error('Failed to send screen capture frame:', error);
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
      console.error('Error capturing screen frame:', error);

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
