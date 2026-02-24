/**
 * Renderer Process Entry Point
 *
 * Initializes and coordinates all renderer-side modules:
 * - Eye tracking
 * - Video capture (webcam)
 * - Meeting detection
 * - UI
 * - IPC event handlers
 */

/// <reference path="./blockd.d.ts" />

import { EyeTracker } from './eye-tracking/eye-tracker';
import { WebcamCapture } from './video/webcam-capture';
import { ScreenCapture } from './video/screen-capture';
import { MeetingDetector } from './meeting/meeting-detector';
import { AppUI } from './ui/app';

/**
 * Main Application class
 * Orchestrates all renderer modules
 */
class BlockdApp {
  // Core modules
  private eyeTracker: EyeTracker | null = null;
  private webcamCapture: WebcamCapture | null = null;
  private screenCapture: ScreenCapture | null = null;
  private meetingDetector: MeetingDetector | null = null;
  private ui: AppUI | null = null;

  // State
  private sessionId: string | null = null;
  private isInitialized = false;
  private isSessionActive = false;

  constructor() {
    console.log('Blockd App starting...');
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing Blockd application...');

      // Verify window.blockd API is available
      if (!window.blockd) {
        throw new Error('Blockd API not available. Preload script may have failed.');
      }

      // Initialize UI
      this.ui = new AppUI();
      this.ui.initialize('app');
      this.ui.onCalibrationRequest(() => this.handleCalibrationRequest());

      // Initialize modules
      await this.initializeModules();

      // Set up IPC event listeners
      this.setupEventListeners();

      // Get initial system info
      await this.loadSystemInfo();

      this.isInitialized = true;

      console.log('Blockd application initialized successfully');

      // Show app, hide loading screen
      this.showApp();
    } catch (error) {
      console.error('Failed to initialize Blockd application:', error);
      this.showError(error instanceof Error ? error.message : 'Unknown initialization error');
      throw error;
    }
  }

  /**
   * Initialize all modules
   */
  private async initializeModules(): Promise<void> {
    // Initialize Eye Tracker
    this.eyeTracker = new EyeTracker({
      targetFps: 30,
      batchSize: 3,
      batchIntervalMs: 100,
      enableKalmanFilter: true,
      requireCalibration: false
    });

    this.eyeTracker.onStatusChange((status) => {
      if (this.ui) {
        this.ui.updateEyeTrackerStatus(status);
      }
    });

    // Initialize Webcam Capture
    this.webcamCapture = new WebcamCapture({
      width: 640,
      height: 480,
      frameRate: 30,
      facingMode: 'user',
      jpegQuality: 0.8
    });

    this.webcamCapture.onStatusChange((status) => {
      if (this.ui) {
        this.ui.updateWebcamStatus(status);
      }
    });

    this.webcamCapture.onError((error) => {
      console.error('Webcam capture error:', error);
    });

    // Initialize Screen Capture (optional, for recording interviewer's screen share)
    this.screenCapture = new ScreenCapture({
      width: 1920,
      height: 1080,
      frameRate: 5,
      jpegQuality: 0.7
    });

    this.screenCapture.onStatusChange((status) => {
      if (this.ui) {
        this.ui.updateScreenCaptureStatus(status);
      }
    });

    this.screenCapture.onError((error) => {
      console.error('Screen capture error:', error);
    });

    // Initialize Meeting Detector
    this.meetingDetector = new MeetingDetector({
      checkIntervalMs: 1000,
      enableAutoDetection: true
    });

    this.meetingDetector.onStatusChange((status) => {
      if (this.ui) {
        this.ui.updateMeetingDetectorStatus(status);
      }
    });

    this.meetingDetector.onMeetingDetected((meeting) => {
      console.log('Meeting detected:', meeting);
      // Meeting detector already notifies main process via IPC
    });

    this.meetingDetector.onMeetingEnded((meeting) => {
      console.log('Meeting ended:', meeting);
      // Meeting detector already notifies main process via IPC
    });

    // Start meeting detector
    this.meetingDetector.start();

    console.log('All modules initialized');
  }

  /**
   * Set up IPC event listeners
   */
  private setupEventListeners(): void {
    // Session events
    window.blockd.on.sessionStarted((data) => {
      console.log('Session started:', data);
      this.handleSessionStarted(data);
    });

    window.blockd.on.sessionEnded((data) => {
      console.log('Session ended:', data);
      this.handleSessionEnded(data);
    });

    window.blockd.on.sessionError((error) => {
      console.error('Session error:', error);
      this.handleSessionError(error);
    });

    // Backend connection events
    window.blockd.on.backendConnected(() => {
      console.log('Backend connected');
      if (this.ui) {
        this.ui.updateBackendStatus(true);
      }
    });

    window.blockd.on.backendDisconnected(() => {
      console.log('Backend disconnected');
      if (this.ui) {
        this.ui.updateBackendStatus(false);
      }
    });

    window.blockd.on.backendError((error) => {
      console.error('Backend error:', error);
    });

    // Security alerts
    window.blockd.on.securityAlert((event) => {
      console.warn('Security alert:', event);
      if (this.ui) {
        this.ui.addSecurityAlert(event);
      }
    });

    // Window events
    window.blockd.on.fullscreenChanged((data) => {
      console.log('Fullscreen changed:', data.fullscreen);
    });

    window.blockd.on.focusChanged((data) => {
      console.log('Focus changed:', data.focused);
    });

    // Meeting lockdown events
    window.blockd.on.meetingLockdownActivated((info) => {
      console.log('Meeting lockdown activated:', info);
    });

    window.blockd.on.meetingLockdownDeactivated(() => {
      console.log('Meeting lockdown deactivated');
    });

    console.log('Event listeners set up');
  }

  /**
   * Load initial system info
   */
  private async loadSystemInfo(): Promise<void> {
    try {
      const systemInfo = await window.blockd.system.getInfo();
      console.log('System info:', systemInfo);

      const appVersion = await window.blockd.system.getAppVersion();
      console.log('App version:', appVersion);

      const sessionStatus = await window.blockd.session.getStatus();
      console.log('Session status:', sessionStatus);

      if (this.ui) {
        this.ui.updateSessionStatus(sessionStatus.status, sessionStatus.sessionId);
      }
    } catch (error) {
      console.error('Failed to load system info:', error);
    }
  }

  /**
   * Handle session started event
   */
  private async handleSessionStarted(data: any): Promise<void> {
    this.isSessionActive = true;
    this.sessionId = data.sessionId;

    if (this.ui) {
      this.ui.updateSessionStatus('active', this.sessionId);
    }

    // Initialize eye tracker for session
    if (this.eyeTracker && this.sessionId) {
      try {
        await this.eyeTracker.initialize(this.sessionId);
        console.log('Eye tracker initialized for session');
      } catch (error) {
        console.error('Failed to initialize eye tracker:', error);
      }
    }

    // Initialize and start webcam capture
    if (this.webcamCapture) {
      try {
        await this.webcamCapture.initialize();
        await this.webcamCapture.start();
        console.log('Webcam capture started');
      } catch (error) {
        console.error('Failed to start webcam capture:', error);
      }
    }
  }

  /**
   * Handle session ended event
   */
  private handleSessionEnded(data: any): void {
    this.isSessionActive = false;

    if (this.ui) {
      this.ui.updateSessionStatus('ended', null);
    }

    // Stop eye tracking
    if (this.eyeTracker) {
      this.eyeTracker.stop();
    }

    // Stop webcam capture
    if (this.webcamCapture) {
      this.webcamCapture.stop();
    }

    // Stop screen capture if active
    if (this.screenCapture) {
      this.screenCapture.stop();
    }

    this.sessionId = null;
  }

  /**
   * Handle session error event
   */
  private handleSessionError(error: any): void {
    console.error('Session error:', error);

    if (this.ui) {
      this.ui.updateSessionStatus('error', null);
    }
  }

  /**
   * Handle calibration request from UI
   */
  private async handleCalibrationRequest(): Promise<void> {
    if (!this.eyeTracker) {
      console.error('Eye tracker not initialized');
      return;
    }

    try {
      // Initialize eye tracker if not already initialized
      if (!this.sessionId) {
        this.sessionId = 'calibration-' + Date.now();
        await this.eyeTracker.initialize(this.sessionId);
      }

      console.log('Starting calibration...');
      await this.eyeTracker.startCalibration();
    } catch (error) {
      console.error('Failed to start calibration:', error);
      alert('Failed to start calibration. Please ensure your webcam is accessible.');
    }
  }

  /**
   * Show the application
   */
  private showApp(): void {
    const loadingElement = document.getElementById('loading');
    const appElement = document.getElementById('app');

    if (loadingElement) {
      loadingElement.classList.add('hidden');
    }

    if (appElement) {
      appElement.classList.add('ready');
    }
  }

  /**
   * Show error screen
   */
  private showError(message: string): void {
    const loadingElement = document.getElementById('loading');
    const appElement = document.getElementById('app');
    const errorElement = document.getElementById('error');
    const errorMessageElement = document.getElementById('error-message');

    if (loadingElement) {
      loadingElement.classList.add('hidden');
    }

    if (appElement) {
      appElement.style.display = 'none';
    }

    if (errorElement) {
      errorElement.style.display = 'block';
    }

    if (errorMessageElement) {
      errorMessageElement.textContent = message;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.eyeTracker) {
      this.eyeTracker.dispose();
      this.eyeTracker = null;
    }

    if (this.webcamCapture) {
      this.webcamCapture.dispose();
      this.webcamCapture = null;
    }

    if (this.screenCapture) {
      this.screenCapture.dispose();
      this.screenCapture = null;
    }

    if (this.meetingDetector) {
      this.meetingDetector.dispose();
      this.meetingDetector = null;
    }
  }
}

// ============================================================================
// Application Entry Point
// ============================================================================

// Create and initialize the application
const app = new BlockdApp();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app.initialize().catch((error) => {
      console.error('Fatal error during initialization:', error);
    });
  });
} else {
  app.initialize().catch((error) => {
    console.error('Fatal error during initialization:', error);
  });
}

// Clean up on window unload
window.addEventListener('beforeunload', () => {
  app.dispose();
});

// Expose app instance for debugging (development mode only)
if (process.env.NODE_ENV === 'development') {
  (window as any).blockdApp = app;
}

console.log('Renderer entry point loaded');
