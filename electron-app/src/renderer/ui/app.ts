/**
 * Application UI
 *
 * Simple vanilla TypeScript UI for the Blockd app.
 * Shows session status, connection status, meeting detection, and calibration controls.
 */

import { SecurityEvent } from '../../shared/types';
import { EyeTrackerStatus } from '../eye-tracking/eye-tracker';
import { WebcamCaptureStatus } from '../video/webcam-capture';
import { ScreenCaptureStatus } from '../video/screen-capture';
import { MeetingDetectorStatus } from '../meeting/meeting-detector';
import { getPlatformName } from '../meeting/meeting-detector';

export interface AppUIState {
  sessionStatus: string;
  sessionId: string | null;
  backendConnected: boolean;
  eyeTracker: EyeTrackerStatus | null;
  webcamCapture: WebcamCaptureStatus | null;
  screenCapture: ScreenCaptureStatus | null;
  meetingDetector: MeetingDetectorStatus | null;
  securityAlerts: SecurityEvent[];
}

/**
 * AppUI class
 * Manages the application user interface
 */
export class AppUI {
  private state: AppUIState;
  private rootElement: HTMLElement | null = null;

  // UI Elements
  private statusContainer: HTMLElement | null = null;
  private sessionStatusElement: HTMLElement | null = null;
  private backendStatusElement: HTMLElement | null = null;
  private eyeTrackerStatusElement: HTMLElement | null = null;
  private webcamStatusElement: HTMLElement | null = null;
  private meetingStatusElement: HTMLElement | null = null;
  private securityAlertsContainer: HTMLElement | null = null;
  private calibrationButton: HTMLButtonElement | null = null;

  // Callbacks
  private onCalibrationRequestCallback: (() => void) | null = null;

  constructor() {
    this.state = {
      sessionStatus: 'idle',
      sessionId: null,
      backendConnected: false,
      eyeTracker: null,
      webcamCapture: null,
      screenCapture: null,
      meetingDetector: null,
      securityAlerts: []
    };
  }

  /**
   * Initialize the UI
   */
  initialize(containerId: string = 'app'): void {
    this.rootElement = document.getElementById(containerId);
    if (!this.rootElement) {
      throw new Error(`Container element '${containerId}' not found`);
    }

    this.render();
    this.attachEventListeners();

    console.log('AppUI initialized');
  }

  /**
   * Update session status
   */
  updateSessionStatus(status: string, sessionId: string | null): void {
    this.state.sessionStatus = status;
    this.state.sessionId = sessionId;
    this.updateDisplay();
  }

  /**
   * Update backend connection status
   */
  updateBackendStatus(connected: boolean): void {
    this.state.backendConnected = connected;
    this.updateDisplay();
  }

  /**
   * Update eye tracker status
   */
  updateEyeTrackerStatus(status: EyeTrackerStatus): void {
    this.state.eyeTracker = status;
    this.updateDisplay();
  }

  /**
   * Update webcam capture status
   */
  updateWebcamStatus(status: WebcamCaptureStatus): void {
    this.state.webcamCapture = status;
    this.updateDisplay();
  }

  /**
   * Update screen capture status
   */
  updateScreenCaptureStatus(status: ScreenCaptureStatus): void {
    this.state.screenCapture = status;
    this.updateDisplay();
  }

  /**
   * Update meeting detector status
   */
  updateMeetingDetectorStatus(status: MeetingDetectorStatus): void {
    this.state.meetingDetector = status;
    this.updateDisplay();
  }

  /**
   * Add security alert
   */
  addSecurityAlert(alert: SecurityEvent): void {
    this.state.securityAlerts.push(alert);
    // Keep only last 10 alerts
    if (this.state.securityAlerts.length > 10) {
      this.state.securityAlerts.shift();
    }
    this.updateDisplay();
  }

  /**
   * Set callback for calibration button
   */
  onCalibrationRequest(callback: () => void): void {
    this.onCalibrationRequestCallback = callback;
  }

  // ========================================================================
  // Private methods
  // ========================================================================

  /**
   * Render the UI
   */
  private render(): void {
    if (!this.rootElement) return;

    this.rootElement.innerHTML = `
      <div class="blockd-app">
        <header class="blockd-header">
          <h1>Blockd Interview Monitor</h1>
        </header>

        <main class="blockd-main">
          <!-- Status Section -->
          <section class="status-section">
            <h2>Session Status</h2>
            <div id="session-status" class="status-item">
              <span class="status-label">Session:</span>
              <span class="status-value" id="session-status-value">Idle</span>
            </div>
            <div id="backend-status" class="status-item">
              <span class="status-label">Backend:</span>
              <span class="status-value" id="backend-status-value">Disconnected</span>
            </div>
          </section>

          <!-- Eye Tracker Section -->
          <section class="status-section">
            <h2>Eye Tracking</h2>
            <div id="eye-tracker-status" class="status-item">
              <span class="status-label">Status:</span>
              <span class="status-value" id="eye-tracker-status-value">Not Started</span>
            </div>
            <button id="calibration-button" class="btn btn-primary">Start Calibration</button>
          </section>

          <!-- Webcam Section -->
          <section class="status-section">
            <h2>Video Capture</h2>
            <div id="webcam-status" class="status-item">
              <span class="status-label">Webcam:</span>
              <span class="status-value" id="webcam-status-value">Not Capturing</span>
            </div>
          </section>

          <!-- Meeting Detection Section -->
          <section class="status-section">
            <h2>Meeting Detection</h2>
            <div id="meeting-status" class="status-item">
              <span class="status-label">Meeting:</span>
              <span class="status-value" id="meeting-status-value">No Meeting Detected</span>
            </div>
          </section>

          <!-- Security Alerts Section -->
          <section class="status-section">
            <h2>Security Alerts</h2>
            <div id="security-alerts-container" class="security-alerts">
              <p class="no-alerts">No security alerts</p>
            </div>
          </section>
        </main>

        <footer class="blockd-footer">
          <p>Blockd Interview Integrity System</p>
        </footer>
      </div>
    `;

    // Get references to UI elements
    this.sessionStatusElement = document.getElementById('session-status-value');
    this.backendStatusElement = document.getElementById('backend-status-value');
    this.eyeTrackerStatusElement = document.getElementById('eye-tracker-status-value');
    this.webcamStatusElement = document.getElementById('webcam-status-value');
    this.meetingStatusElement = document.getElementById('meeting-status-value');
    this.securityAlertsContainer = document.getElementById('security-alerts-container');
    this.calibrationButton = document.getElementById('calibration-button') as HTMLButtonElement;

    // Apply styles
    this.injectStyles();
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    // Calibration button
    if (this.calibrationButton) {
      this.calibrationButton.addEventListener('click', () => {
        if (this.onCalibrationRequestCallback) {
          this.onCalibrationRequestCallback();
        }
      });
    }
  }

  /**
   * Update the display based on current state
   */
  private updateDisplay(): void {
    // Update session status
    if (this.sessionStatusElement) {
      const statusText = this.state.sessionId
        ? `Active (${this.state.sessionId.substring(0, 8)}...)`
        : this.state.sessionStatus.charAt(0).toUpperCase() + this.state.sessionStatus.slice(1);

      this.sessionStatusElement.textContent = statusText;
      this.sessionStatusElement.className = `status-value status-${this.state.sessionStatus}`;
    }

    // Update backend status
    if (this.backendStatusElement) {
      this.backendStatusElement.textContent = this.state.backendConnected ? 'Connected' : 'Disconnected';
      this.backendStatusElement.className = `status-value ${this.state.backendConnected ? 'status-connected' : 'status-disconnected'}`;
    }

    // Update eye tracker status
    if (this.eyeTrackerStatusElement && this.state.eyeTracker) {
      const et = this.state.eyeTracker;
      let statusText = 'Not Running';
      let statusClass = 'status-inactive';

      if (et.isCalibrating) {
        statusText = 'Calibrating...';
        statusClass = 'status-calibrating';
      } else if (et.isRunning) {
        statusText = `Running (${et.fps} fps, ${et.faceDetected ? 'Face Detected' : 'No Face'})`;
        statusClass = et.faceDetected ? 'status-active' : 'status-warning';
      }

      this.eyeTrackerStatusElement.textContent = statusText;
      this.eyeTrackerStatusElement.className = `status-value ${statusClass}`;

      // Update calibration button
      if (this.calibrationButton) {
        this.calibrationButton.disabled = et.isRunning || et.isCalibrating;
        this.calibrationButton.textContent = et.calibrated ? 'Recalibrate' : 'Start Calibration';
      }
    }

    // Update webcam status
    if (this.webcamStatusElement && this.state.webcamCapture) {
      const wc = this.state.webcamCapture;
      const statusText = wc.isCapturing
        ? `Capturing (${wc.framesSent} frames)`
        : wc.hasPermission ? 'Ready' : 'Not Initialized';
      const statusClass = wc.isCapturing ? 'status-active' : 'status-inactive';

      this.webcamStatusElement.textContent = statusText;
      this.webcamStatusElement.className = `status-value ${statusClass}`;
    }

    // Update meeting status
    if (this.meetingStatusElement && this.state.meetingDetector) {
      const md = this.state.meetingDetector;
      let statusText = 'No Meeting Detected';
      let statusClass = 'status-inactive';

      if (md.currentMeeting) {
        const platform = getPlatformName(md.currentMeeting.platform);
        statusText = `${platform} Meeting Active`;
        statusClass = 'status-active';
      }

      this.meetingStatusElement.textContent = statusText;
      this.meetingStatusElement.className = `status-value ${statusClass}`;
    }

    // Update security alerts
    if (this.securityAlertsContainer) {
      if (this.state.securityAlerts.length === 0) {
        this.securityAlertsContainer.innerHTML = '<p class="no-alerts">No security alerts</p>';
      } else {
        const alertsHtml = this.state.securityAlerts
          .reverse()
          .map(alert => {
            const time = new Date(alert.timestamp).toLocaleTimeString();
            return `
              <div class="security-alert severity-${alert.severity}">
                <span class="alert-time">${time}</span>
                <span class="alert-type">${alert.type}</span>
                <span class="alert-description">${alert.description}</span>
              </div>
            `;
          })
          .join('');

        this.securityAlertsContainer.innerHTML = alertsHtml;
      }
    }
  }

  /**
   * Inject CSS styles
   */
  private injectStyles(): void {
    const styleId = 'blockd-app-styles';

    // Check if styles already exist
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        background: #1a1a1a;
        color: #e0e0e0;
        line-height: 1.6;
      }

      .blockd-app {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }

      .blockd-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 30px;
        border-radius: 8px;
        margin-bottom: 30px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      }

      .blockd-header h1 {
        font-size: 28px;
        font-weight: 600;
        color: white;
      }

      .blockd-main {
        display: grid;
        gap: 20px;
      }

      .status-section {
        background: #2a2a2a;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      .status-section h2 {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 15px;
        color: #a0a0a0;
        border-bottom: 2px solid #3a3a3a;
        padding-bottom: 10px;
      }

      .status-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 0;
      }

      .status-label {
        font-weight: 500;
        color: #b0b0b0;
      }

      .status-value {
        font-weight: 600;
        padding: 4px 12px;
        border-radius: 4px;
      }

      .status-active {
        background: #22c55e;
        color: white;
      }

      .status-inactive {
        background: #6b7280;
        color: white;
      }

      .status-connected {
        background: #22c55e;
        color: white;
      }

      .status-disconnected {
        background: #ef4444;
        color: white;
      }

      .status-warning {
        background: #f59e0b;
        color: white;
      }

      .status-calibrating {
        background: #3b82f6;
        color: white;
      }

      .status-idle {
        background: #6b7280;
        color: white;
      }

      .status-validating {
        background: #f59e0b;
        color: white;
      }

      .status-ending {
        background: #f59e0b;
        color: white;
      }

      .btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        margin-top: 10px;
      }

      .btn-primary {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .btn-primary:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .security-alerts {
        max-height: 300px;
        overflow-y: auto;
      }

      .no-alerts {
        color: #6b7280;
        font-style: italic;
        text-align: center;
        padding: 20px;
      }

      .security-alert {
        padding: 12px;
        margin-bottom: 8px;
        border-radius: 6px;
        border-left: 4px solid;
        background: #3a3a3a;
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 10px;
      }

      .security-alert.severity-low {
        border-left-color: #22c55e;
      }

      .security-alert.severity-medium {
        border-left-color: #f59e0b;
      }

      .security-alert.severity-high {
        border-left-color: #ef4444;
      }

      .security-alert.severity-critical {
        border-left-color: #dc2626;
        background: #4a1a1a;
      }

      .alert-time {
        font-size: 12px;
        color: #9ca3af;
      }

      .alert-type {
        font-weight: 600;
        color: #e5e7eb;
        grid-column: 2;
      }

      .alert-description {
        font-size: 14px;
        color: #d1d5db;
        grid-column: 1 / -1;
      }

      .blockd-footer {
        margin-top: 30px;
        padding: 20px;
        text-align: center;
        color: #6b7280;
        font-size: 14px;
      }

      /* Scrollbar styling */
      .security-alerts::-webkit-scrollbar {
        width: 8px;
      }

      .security-alerts::-webkit-scrollbar-track {
        background: #2a2a2a;
        border-radius: 4px;
      }

      .security-alerts::-webkit-scrollbar-thumb {
        background: #4a4a4a;
        border-radius: 4px;
      }

      .security-alerts::-webkit-scrollbar-thumb:hover {
        background: #5a5a5a;
      }
    `;

    document.head.appendChild(style);
  }
}
