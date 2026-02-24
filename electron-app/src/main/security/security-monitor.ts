/**
 * Security Monitor
 *
 * Main orchestrator for all security checks.
 * Coordinates process monitoring, VM detection, screen recorder detection,
 * focus monitoring, and clipboard monitoring.
 */

import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { SecurityEvent, SecurityEventType, Severity, VMDetectionResult } from '../../shared/types.js';
import { SECURITY_CHECK_INTERVAL_MS } from '../../shared/constants.js';
import { ProcessMonitor } from './process-monitor.js';
import { VMDetector } from './vm-detector.js';
import { ScreenRecorderDetector } from './screen-recorder-detector.js';
import { FocusMonitor } from './focus-monitor.js';
import { ClipboardMonitor } from './clipboard-monitor.js';

export interface SecurityMonitorConfig {
  checkIntervalMs: number;
  enableProcessMonitoring: boolean;
  enableVMDetection: boolean;
  enableScreenRecorderDetection: boolean;
  enableFocusMonitoring: boolean;
  enableClipboardMonitoring: boolean;
  clipboardPollIntervalMs: number;
  vmCheckIntervalMs: number; // Interval for periodic VM re-checks
}

export class SecurityMonitor extends EventEmitter {
  private config: SecurityMonitorConfig;
  private processMonitor: ProcessMonitor;
  private vmDetector: VMDetector;
  private screenRecorderDetector: ScreenRecorderDetector;
  private focusMonitor: FocusMonitor;
  private clipboardMonitor: ClipboardMonitor;

  private checkInterval: NodeJS.Timeout | null = null;
  private vmCheckInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private window: BrowserWindow | null = null;

  // VM detection result (periodically re-checked)
  private vmDetectionResult: VMDetectionResult | null = null;

  constructor(config?: Partial<SecurityMonitorConfig>) {
    super();

    this.config = {
      checkIntervalMs: SECURITY_CHECK_INTERVAL_MS,
      enableProcessMonitoring: true,
      enableVMDetection: true,
      enableScreenRecorderDetection: true,
      enableFocusMonitoring: true,
      enableClipboardMonitoring: true,
      clipboardPollIntervalMs: 500,
      vmCheckIntervalMs: 60000, // Re-check VM every 60 seconds
      ...config,
    };

    // Initialize monitors
    this.processMonitor = new ProcessMonitor();
    this.vmDetector = new VMDetector();
    this.screenRecorderDetector = new ScreenRecorderDetector();
    this.focusMonitor = new FocusMonitor();
    this.clipboardMonitor = new ClipboardMonitor({
      pollIntervalMs: this.config.clipboardPollIntervalMs,
      enableTextTracking: true,
      enableImageTracking: true,
      logContent: false, // Don't log actual content for privacy
    });

    this.setupEventListeners();
  }

  /**
   * Start security monitoring
   */
  async start(window?: BrowserWindow): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.window = window || null;

    // Run initial VM detection
    if (this.config.enableVMDetection) {
      await this.checkVMDetection();

      // Start periodic VM re-checks (attackers may start VM after initial check)
      this.vmCheckInterval = setInterval(async () => {
        await this.checkVMDetection();
      }, this.config.vmCheckIntervalMs);
    }

    // Start focus monitoring if window provided
    if (this.config.enableFocusMonitoring && this.window) {
      this.focusMonitor.start(this.window);
    }

    // Start clipboard monitoring
    if (this.config.enableClipboardMonitoring) {
      this.clipboardMonitor.start();
    }

    // Start periodic security checks
    this.checkInterval = setInterval(() => {
      this.performSecurityChecks();
    }, this.config.checkIntervalMs);

    // Run initial check
    await this.performSecurityChecks();

    this.emit('started', { timestamp: Date.now() });
  }

  /**
   * Stop security monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop periodic checks
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Stop periodic VM re-checks
    if (this.vmCheckInterval) {
      clearInterval(this.vmCheckInterval);
      this.vmCheckInterval = null;
    }

    // Stop monitors
    this.focusMonitor.stop();
    this.clipboardMonitor.stop();

    this.emit('stopped', { timestamp: Date.now() });
  }

  /**
   * Perform all enabled security checks
   */
  private async performSecurityChecks(): Promise<void> {
    try {
      // Check for suspicious processes
      if (this.config.enableProcessMonitoring) {
        await this.checkSuspiciousProcesses();
      }

      // Check for screen recording
      if (this.config.enableScreenRecorderDetection) {
        await this.checkScreenRecording();
      }

      // VM detection is only run once at startup
    } catch (error) {
      console.error('Error performing security checks:', error);
      this.emitSecurityEvent({
        type: 'suspicious_process',
        severity: 'low',
        timestamp: Date.now(),
        description: 'Error performing security checks',
        metadata: { error: String(error) },
      });
    }
  }

  /**
   * Check for suspicious processes
   */
  private async checkSuspiciousProcesses(): Promise<void> {
    const suspiciousProcesses = await this.processMonitor.scanForSuspiciousProcesses();

    if (suspiciousProcesses.length > 0) {
      for (const process of suspiciousProcesses) {
        const severity = this.getSeverityForProcessCategory(process.category);

        this.emitSecurityEvent({
          type: 'suspicious_process',
          severity,
          timestamp: Date.now(),
          description: `Suspicious ${process.category} process detected: ${process.name}`,
          metadata: {
            processName: process.name,
            pid: process.pid,
            category: process.category,
            path: process.path,
          },
        });
      }
    }
  }

  /**
   * Check for screen recording software
   */
  private async checkScreenRecording(): Promise<void> {
    const result = await this.screenRecorderDetector.detect();

    if (result.isRecording) {
      this.emitSecurityEvent({
        type: 'screen_recording_detected',
        severity: 'critical',
        timestamp: Date.now(),
        description: `Screen recording software detected: ${result.detectedRecorders.join(', ')}`,
        metadata: {
          recorders: result.detectedRecorders,
        },
      });
    }
  }

  /**
   * Check for VM/virtualization (run once at startup)
   */
  private async checkVMDetection(): Promise<void> {
    this.vmDetectionResult = await this.vmDetector.detect();

    if (this.vmDetectionResult.isVM) {
      this.emitSecurityEvent({
        type: 'vm_detected',
        severity: 'high',
        timestamp: Date.now(),
        description: `Virtual machine detected: ${this.vmDetectionResult.vmType}`,
        metadata: {
          vmType: this.vmDetectionResult.vmType,
          confidence: this.vmDetectionResult.confidence,
          detectionMethods: this.vmDetectionResult.detectionMethods,
        },
      });
    }
  }

  /**
   * Set up event listeners for sub-monitors
   */
  private setupEventListeners(): void {
    // Focus monitor events
    this.focusMonitor.on('focus-lost', (event) => {
      this.emitSecurityEvent({
        type: 'window_focus_lost',
        severity: 'medium',
        timestamp: event.timestamp,
        description: 'Application window lost focus',
        metadata: {
          duration: event.duration,
        },
      });
    });

    this.focusMonitor.on('window-minimized', (event) => {
      this.emitSecurityEvent({
        type: 'window_focus_lost',
        severity: 'high',
        timestamp: event.timestamp,
        description: 'Application window minimized',
        metadata: {
          duration: event.duration,
        },
      });
    });

    // Clipboard monitor events
    this.clipboardMonitor.on('clipboard-change', (event) => {
      this.emitSecurityEvent({
        type: 'clipboard_activity',
        severity: 'low',
        timestamp: event.timestamp,
        description: `Clipboard ${event.changeType} detected`,
        metadata: {
          changeType: event.changeType,
          hasText: event.hasText,
          hasImage: event.hasImage,
          textLength: event.textLength,
        },
      });
    });
  }

  /**
   * Emit a security event
   */
  private emitSecurityEvent(event: SecurityEvent): void {
    this.emit('security-event', event);
    this.emit(event.type, event);
  }

  /**
   * Get severity level for process category
   */
  private getSeverityForProcessCategory(
    category: 'screen_recording' | 'remote_access' | 'vm_tools' | 'ai_assistant' | 'other'
  ): Severity {
    switch (category) {
      case 'screen_recording':
        return 'critical';
      case 'remote_access':
        return 'critical';
      case 'vm_tools':
        return 'high';
      case 'ai_assistant':
        return 'high';
      case 'other':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Register callback for security events
   */
  onSecurityEvent(callback: (event: SecurityEvent) => void): void {
    this.on('security-event', callback);
  }

  /**
   * Get current VM detection result
   */
  getVMDetectionResult(): VMDetectionResult | null {
    return this.vmDetectionResult;
  }

  /**
   * Get current focus state
   */
  getFocusState(): {
    focused: boolean;
    duration: number;
  } {
    const stats = this.focusMonitor.getStatistics();
    return {
      focused: stats.currentlyFocused,
      duration: stats.currentStateDuration,
    };
  }

  /**
   * Get clipboard statistics
   */
  getClipboardState(): {
    hasText: boolean;
    hasImage: boolean;
    textLength: number;
  } {
    return this.clipboardMonitor.getCurrentClipboard();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SecurityMonitorConfig>): void {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    this.config = {
      ...this.config,
      ...config,
    };

    if (wasRunning && this.window) {
      this.start(this.window);
    }
  }

  /**
   * Force a manual security check
   */
  async forceCheck(): Promise<void> {
    await this.performSecurityChecks();
  }

  /**
   * Get monitoring statistics
   */
  getStatistics(): {
    isRunning: boolean;
    config: SecurityMonitorConfig;
    vmDetection: VMDetectionResult | null;
    focusState: ReturnType<SecurityMonitor['getFocusState']>;
    clipboardState: ReturnType<SecurityMonitor['getClipboardState']>;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      vmDetection: this.vmDetectionResult,
      focusState: this.getFocusState(),
      clipboardState: this.getClipboardState(),
    };
  }
}
