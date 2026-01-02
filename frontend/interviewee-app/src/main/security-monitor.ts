/**
 * Security Monitor
 * Monitors for security-related events like process detection, window focus, etc.
 */

import { BrowserWindow, app } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SessionManager } from './session-manager';

const execAsync = promisify(exec);

export interface SecurityEvent {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// Known screen recording and suspicious applications
const SUSPICIOUS_PROCESSES = {
  windows: [
    'obs64.exe', 'obs32.exe', 'obs.exe',
    'streamlabs.exe',
    'camtasia.exe', 'camtasiastudio.exe',
    'snagit.exe', 'snagit32.exe',
    'bandicam.exe',
    'fraps.exe',
    'xsplit.exe', 'xsplitbroadcaster.exe',
    'screencastify.exe',
    'loom.exe',
    'sharex.exe',
    'ffmpeg.exe',
    'vlc.exe',
    'nvidia broadcast.exe',
  ],
  darwin: [
    'obs', 'OBS',
    'QuickTime Player',
    'ScreenFlow',
    'Camtasia',
    'Snagit',
    'Loom',
    'CloudApp',
    'Monosnap',
    'Screencast-O-Matic',
    'ffmpeg',
  ],
  linux: [
    'obs', 'obs-studio',
    'simplescreenrecorder',
    'kazam',
    'vokoscreen',
    'recordmydesktop',
    'ffmpeg',
    'vlc',
    'peek',
  ],
};

// VM detection indicators
const VM_INDICATORS = {
  processes: ['vmtoolsd', 'vmwaretray', 'vboxservice', 'vboxtray', 'parallels'],
  registryKeys: [
    'HKLM\\SOFTWARE\\VMware, Inc.\\VMware Tools',
    'HKLM\\SOFTWARE\\Oracle\\VirtualBox Guest Additions',
  ],
};

export class SecurityMonitor {
  private mainWindow: BrowserWindow;
  private sessionManager: SessionManager;
  private isRunning = false;
  private processCheckInterval: NodeJS.Timeout | null = null;
  private lastFocusState = true;
  private focusLostCount = 0;
  private lastFocusLostTime: number | null = null;

  constructor(mainWindow: BrowserWindow, sessionManager: SessionManager) {
    this.mainWindow = mainWindow;
    this.sessionManager = sessionManager;
  }

  /**
   * Start security monitoring
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[SecurityMonitor] Starting security monitoring...');

    // Initial checks
    this.checkForVM();
    this.checkForSuspiciousProcesses();

    // Periodic process checking (every 10 seconds)
    this.processCheckInterval = setInterval(() => {
      this.checkForSuspiciousProcesses();
    }, 10000);
  }

  /**
   * Stop security monitoring
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    console.log('[SecurityMonitor] Stopping security monitoring...');

    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
    }
  }

  /**
   * Handle window focus event
   */
  onWindowFocus(): void {
    if (!this.lastFocusState) {
      this.lastFocusState = true;

      // Calculate time spent unfocused
      if (this.lastFocusLostTime) {
        const unfocusedDuration = Date.now() - this.lastFocusLostTime;

        // Only report if unfocused for more than 2 seconds
        if (unfocusedDuration > 2000) {
          this.reportEvent({
            type: 'window_focus_restored',
            severity: 'low',
            description: 'Window focus was restored',
            metadata: {
              unfocusedDuration,
              focusLostCount: this.focusLostCount,
            },
          });
        }
      }
    }
  }

  /**
   * Handle window blur event
   */
  onWindowBlur(): void {
    if (this.lastFocusState && this.isRunning) {
      this.lastFocusState = false;
      this.focusLostCount++;
      this.lastFocusLostTime = Date.now();

      this.reportEvent({
        type: 'window_blur',
        severity: this.focusLostCount > 5 ? 'high' : 'medium',
        description: 'User switched away from the interview window',
        metadata: {
          focusLostCount: this.focusLostCount,
        },
      });
    }
  }

  /**
   * Check for virtual machine indicators
   */
  private async checkForVM(): Promise<void> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        await this.checkVMWindows();
      } else if (platform === 'darwin') {
        await this.checkVMMacOS();
      } else if (platform === 'linux') {
        await this.checkVMLinux();
      }
    } catch (error) {
      console.error('[SecurityMonitor] VM check error:', error);
    }
  }

  private async checkVMWindows(): Promise<void> {
    try {
      // Check for VM processes
      const { stdout } = await execAsync('wmic process get name');
      const processes = stdout.toLowerCase();

      for (const vmProcess of VM_INDICATORS.processes) {
        if (processes.includes(vmProcess.toLowerCase())) {
          this.reportEvent({
            type: 'vm_detected',
            severity: 'critical',
            description: 'Virtual machine environment detected',
            metadata: { indicator: vmProcess },
          });
          return;
        }
      }

      // Check system manufacturer
      const { stdout: sysInfo } = await execAsync(
        'wmic computersystem get manufacturer,model'
      );
      const sysInfoLower = sysInfo.toLowerCase();

      if (
        sysInfoLower.includes('vmware') ||
        sysInfoLower.includes('virtualbox') ||
        sysInfoLower.includes('hyper-v') ||
        sysInfoLower.includes('parallels')
      ) {
        this.reportEvent({
          type: 'vm_detected',
          severity: 'critical',
          description: 'Virtual machine environment detected',
          metadata: { systemInfo: sysInfo },
        });
      }
    } catch (error) {
      // Command not available or failed
      console.log('[SecurityMonitor] Windows VM check skipped:', error);
    }
  }

  private async checkVMMacOS(): Promise<void> {
    try {
      const { stdout } = await execAsync('system_profiler SPHardwareDataType');
      const hardware = stdout.toLowerCase();

      if (
        hardware.includes('vmware') ||
        hardware.includes('virtualbox') ||
        hardware.includes('parallels')
      ) {
        this.reportEvent({
          type: 'vm_detected',
          severity: 'critical',
          description: 'Virtual machine environment detected',
        });
      }
    } catch (error) {
      console.log('[SecurityMonitor] macOS VM check skipped:', error);
    }
  }

  private async checkVMLinux(): Promise<void> {
    try {
      const { stdout } = await execAsync('systemd-detect-virt 2>/dev/null || echo none');
      const virt = stdout.trim().toLowerCase();

      if (virt !== 'none' && virt !== '') {
        this.reportEvent({
          type: 'vm_detected',
          severity: 'critical',
          description: 'Virtual machine environment detected',
          metadata: { virtualization: virt },
        });
      }
    } catch (error) {
      console.log('[SecurityMonitor] Linux VM check skipped:', error);
    }
  }

  /**
   * Check for suspicious processes (screen recorders, etc.)
   */
  private async checkForSuspiciousProcesses(): Promise<void> {
    const platform = process.platform;
    const suspiciousList =
      platform === 'win32'
        ? SUSPICIOUS_PROCESSES.windows
        : platform === 'darwin'
          ? SUSPICIOUS_PROCESSES.darwin
          : SUSPICIOUS_PROCESSES.linux;

    try {
      let processes: string;

      if (platform === 'win32') {
        const { stdout } = await execAsync('wmic process get name');
        processes = stdout.toLowerCase();
      } else if (platform === 'darwin') {
        const { stdout } = await execAsync('ps -e -o comm=');
        processes = stdout.toLowerCase();
      } else {
        const { stdout } = await execAsync('ps -e -o comm=');
        processes = stdout.toLowerCase();
      }

      for (const suspicious of suspiciousList) {
        if (processes.includes(suspicious.toLowerCase())) {
          this.reportEvent({
            type: 'suspicious_process_detected',
            severity: 'high',
            description: `Screen recording or suspicious application detected: ${suspicious}`,
            metadata: { processName: suspicious },
          });
        }
      }
    } catch (error) {
      console.error('[SecurityMonitor] Process check error:', error);
    }
  }

  /**
   * Report a security event
   */
  async reportEvent(event: Omit<SecurityEvent, 'timestamp'>): Promise<void> {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    console.log('[SecurityMonitor] Security event:', fullEvent);

    // Send to backend via session manager
    try {
      await this.sessionManager.sendSecurityEvent(fullEvent);
    } catch (error) {
      console.error('[SecurityMonitor] Failed to send security event:', error);
    }

    // Notify renderer
    this.mainWindow.webContents.send('security:event', fullEvent);
  }

  /**
   * Get current security status
   */
  getStatus(): {
    isRunning: boolean;
    focusLostCount: number;
    lastFocusState: boolean;
  } {
    return {
      isRunning: this.isRunning,
      focusLostCount: this.focusLostCount,
      lastFocusState: this.lastFocusState,
    };
  }
}
