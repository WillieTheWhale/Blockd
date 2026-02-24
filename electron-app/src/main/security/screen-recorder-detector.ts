/**
 * Screen Recorder Detector
 *
 * Detects common screen recording software running on the system.
 * Platform-specific detection for Windows, macOS, and Linux.
 */

import { ProcessMonitor } from './process-monitor.js';
import { SUSPICIOUS_PROCESS_PATTERNS } from '../../shared/constants.js';

export interface ScreenRecorderDetectionResult {
  isRecording: boolean;
  detectedRecorders: string[];
}

export class ScreenRecorderDetector {
  private processMonitor: ProcessMonitor;

  constructor() {
    this.processMonitor = new ProcessMonitor();
  }

  /**
   * Detect screen recording software
   */
  async detect(): Promise<ScreenRecorderDetectionResult> {
    const suspiciousProcesses = await this.processMonitor.scanForSuspiciousProcesses();

    // Filter for screen recording processes only
    const recorderProcesses = suspiciousProcesses.filter(
      (proc) => proc.category === 'screen_recording'
    );

    return {
      isRecording: recorderProcesses.length > 0,
      detectedRecorders: recorderProcesses.map((proc) => proc.name),
    };
  }

  /**
   * Check if specific screen recorder is running
   */
  async isRecorderRunning(recorderName: string): Promise<boolean> {
    const pattern = new RegExp(recorderName, 'i');
    return await this.processMonitor.isProcessRunning([pattern]);
  }

  /**
   * Get all known screen recording patterns
   */
  getKnownRecorders(): RegExp[] {
    return SUSPICIOUS_PROCESS_PATTERNS.screen_recording;
  }

  /**
   * Platform-specific detection methods
   */
  async detectPlatformSpecific(): Promise<ScreenRecorderDetectionResult> {
    const platform = process.platform;

    switch (platform) {
      case 'win32':
        return await this.detectWindows();
      case 'darwin':
        return await this.detectMacOS();
      case 'linux':
        return await this.detectLinux();
      default:
        return await this.detect();
    }
  }

  /**
   * Windows-specific detection
   */
  private async detectWindows(): Promise<ScreenRecorderDetectionResult> {
    // Common Windows screen recorders
    const windowsRecorders = [
      /obs/i,
      /obs64/i,
      /obs-studio/i,
      /camtasia/i,
      /bandicam/i,
      /bdcam/i,
      /screenrec/i,
      /sharex/i,
      /nvidia.*share/i,
      /shadowplay/i,
      /nvcontainer/i,
      /amd.*relive/i,
      /icecream.*recorder/i,
      /faststone/i,
      /hypercam/i,
      /ezvid/i,
      /snagit/i,
      /clipchamp/i,
    ];

    const detectedRecorders: string[] = [];

    for (const pattern of windowsRecorders) {
      const isRunning = await this.processMonitor.isProcessRunning([pattern]);
      if (isRunning) {
        detectedRecorders.push(pattern.source);
      }
    }

    return {
      isRecording: detectedRecorders.length > 0,
      detectedRecorders,
    };
  }

  /**
   * macOS-specific detection
   */
  private async detectMacOS(): Promise<ScreenRecorderDetectionResult> {
    // Common macOS screen recorders
    const macRecorders = [
      /obs/i,
      /screenflow/i,
      /camtasia/i,
      /quicktime/i, // QuickTime can record screen
      /loom/i,
      /snagit/i,
      /screencast/i,
    ];

    const detectedRecorders: string[] = [];

    for (const pattern of macRecorders) {
      const isRunning = await this.processMonitor.isProcessRunning([pattern]);
      if (isRunning) {
        detectedRecorders.push(pattern.source);
      }
    }

    return {
      isRecording: detectedRecorders.length > 0,
      detectedRecorders,
    };
  }

  /**
   * Linux-specific detection
   */
  private async detectLinux(): Promise<ScreenRecorderDetectionResult> {
    // Common Linux screen recorders
    const linuxRecorders = [
      /obs/i,
      /simplescreenrecorder/i,
      /recordmydesktop/i,
      /kazam/i,
      /vokoscreen/i,
      /green.*recorder/i,
      /peek/i,
    ];

    const detectedRecorders: string[] = [];

    for (const pattern of linuxRecorders) {
      const isRunning = await this.processMonitor.isProcessRunning([pattern]);
      if (isRunning) {
        detectedRecorders.push(pattern.source);
      }
    }

    return {
      isRecording: detectedRecorders.length > 0,
      detectedRecorders,
    };
  }
}
