/**
 * Process Monitor
 *
 * Detects suspicious processes running on the system using systeminformation.
 * Categorizes processes by type (screen recording, remote access, VM tools, AI assistants).
 */

import si from 'systeminformation';
import { SuspiciousProcess } from '../../shared/types.js';
import { SUSPICIOUS_PROCESS_PATTERNS } from '../../shared/constants.js';

export class ProcessMonitor {
  /**
   * Scan for suspicious processes currently running on the system
   */
  async scanForSuspiciousProcesses(): Promise<SuspiciousProcess[]> {
    try {
      const processes = await si.processes();
      const suspiciousProcesses: SuspiciousProcess[] = [];

      if (!processes.list || !Array.isArray(processes.list)) {
        return suspiciousProcesses;
      }

      for (const proc of processes.list) {
        const processName = proc.name?.toLowerCase() || '';
        const processPath = proc.path?.toLowerCase() || '';
        const processCommand = proc.command?.toLowerCase() || '';

        // Check all text fields for pattern matches
        const textToCheck = `${processName} ${processPath} ${processCommand}`;

        // Check against each category
        const category = this.categorizeProcess(textToCheck);
        if (category) {
          suspiciousProcesses.push({
            name: proc.name || 'unknown',
            pid: proc.pid || 0,
            path: proc.path,
            category,
          });
        }
      }

      return suspiciousProcesses;
    } catch (error) {
      console.error('Error scanning processes:', error);
      return [];
    }
  }

  /**
   * Categorize a process based on pattern matching
   */
  private categorizeProcess(
    text: string
  ): SuspiciousProcess['category'] | null {
    // Check screen recording patterns
    for (const pattern of SUSPICIOUS_PROCESS_PATTERNS.screen_recording) {
      if (pattern.test(text)) {
        return 'screen_recording';
      }
    }

    // Check remote access patterns
    for (const pattern of SUSPICIOUS_PROCESS_PATTERNS.remote_access) {
      if (pattern.test(text)) {
        return 'remote_access';
      }
    }

    // Check VM tools patterns
    for (const pattern of SUSPICIOUS_PROCESS_PATTERNS.vm_tools) {
      if (pattern.test(text)) {
        return 'vm_tools';
      }
    }

    // Check AI assistant patterns
    for (const pattern of SUSPICIOUS_PROCESS_PATTERNS.ai_assistant) {
      if (pattern.test(text)) {
        return 'ai_assistant';
      }
    }

    return null;
  }

  /**
   * Check if specific process patterns are running
   */
  async isProcessRunning(patterns: RegExp[]): Promise<boolean> {
    try {
      const processes = await si.processes();

      if (!processes.list || !Array.isArray(processes.list)) {
        return false;
      }

      for (const proc of processes.list) {
        const processName = proc.name?.toLowerCase() || '';
        const processPath = proc.path?.toLowerCase() || '';
        const processCommand = proc.command?.toLowerCase() || '';
        const textToCheck = `${processName} ${processPath} ${processCommand}`;

        for (const pattern of patterns) {
          if (pattern.test(textToCheck)) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking process:', error);
      return false;
    }
  }

  /**
   * Get detailed information about a specific process by PID
   */
  async getProcessInfo(pid: number): Promise<si.Systeminformation.ProcessesProcessData | null> {
    try {
      const processes = await si.processes();

      if (!processes.list || !Array.isArray(processes.list)) {
        return null;
      }

      const process = processes.list.find((p) => p.pid === pid);
      return process || null;
    } catch (error) {
      console.error('Error getting process info:', error);
      return null;
    }
  }
}
