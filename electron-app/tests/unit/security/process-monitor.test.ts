/**
 * Unit tests for ProcessMonitor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessMonitor } from '../../../src/main/security/process-monitor';

// Mock systeminformation
vi.mock('systeminformation', () => ({
  default: {
    processes: vi.fn(),
  },
}));

import si from 'systeminformation';

describe('ProcessMonitor', () => {
  let processMonitor: ProcessMonitor;

  beforeEach(() => {
    processMonitor = new ProcessMonitor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scanForSuspiciousProcesses', () => {
    it('should detect screen recording processes', async () => {
      // Mock process list with OBS
      vi.mocked(si.processes).mockResolvedValue({
        all: 10,
        running: 10,
        blocked: 0,
        sleeping: 0,
        list: [
          {
            pid: 1234,
            name: 'obs64.exe',
            path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
            command: 'obs64.exe',
            cpu: 5.0,
            mem: 200,
          },
          {
            pid: 5678,
            name: 'chrome.exe',
            path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            command: 'chrome.exe',
            cpu: 2.0,
            mem: 150,
          },
        ],
      } as any);

      const result = await processMonitor.scanForSuspiciousProcesses();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'obs64.exe',
        pid: 1234,
        category: 'screen_recording',
      });
    });

    it('should detect remote access software', async () => {
      vi.mocked(si.processes).mockResolvedValue({
        all: 5,
        running: 5,
        blocked: 0,
        sleeping: 0,
        list: [
          {
            pid: 9999,
            name: 'TeamViewer.exe',
            path: 'C:\\Program Files\\TeamViewer\\TeamViewer.exe',
            command: 'TeamViewer.exe',
            cpu: 1.0,
            mem: 50,
          },
        ],
      } as any);

      const result = await processMonitor.scanForSuspiciousProcesses();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        category: 'remote_access',
      });
    });

    it('should detect VM tools', async () => {
      vi.mocked(si.processes).mockResolvedValue({
        all: 5,
        running: 5,
        blocked: 0,
        sleeping: 0,
        list: [
          {
            pid: 1111,
            name: 'vmtoolsd.exe',
            path: 'C:\\Program Files\\VMware\\VMware Tools\\vmtoolsd.exe',
            command: 'vmtoolsd.exe',
            cpu: 0.5,
            mem: 30,
          },
        ],
      } as any);

      const result = await processMonitor.scanForSuspiciousProcesses();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        category: 'vm_tools',
      });
    });

    it('should detect AI assistants', async () => {
      vi.mocked(si.processes).mockResolvedValue({
        all: 5,
        running: 5,
        blocked: 0,
        sleeping: 0,
        list: [
          {
            pid: 2222,
            name: 'copilot.exe',
            path: 'C:\\Program Files\\GitHub Copilot\\copilot.exe',
            command: 'copilot.exe',
            cpu: 2.0,
            mem: 100,
          },
        ],
      } as any);

      const result = await processMonitor.scanForSuspiciousProcesses();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        category: 'ai_assistant',
      });
    });

    it('should handle empty process list', async () => {
      vi.mocked(si.processes).mockResolvedValue({
        all: 0,
        running: 0,
        blocked: 0,
        sleeping: 0,
        list: [],
      } as any);

      const result = await processMonitor.scanForSuspiciousProcesses();

      expect(result).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(si.processes).mockRejectedValue(new Error('Failed to get processes'));

      const result = await processMonitor.scanForSuspiciousProcesses();

      expect(result).toHaveLength(0);
    });

    it('should detect multiple suspicious processes', async () => {
      vi.mocked(si.processes).mockResolvedValue({
        all: 15,
        running: 15,
        blocked: 0,
        sleeping: 0,
        list: [
          {
            pid: 1234,
            name: 'obs64.exe',
            path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
            command: 'obs64.exe',
            cpu: 5.0,
            mem: 200,
          },
          {
            pid: 5678,
            name: 'TeamViewer.exe',
            path: 'C:\\Program Files\\TeamViewer\\TeamViewer.exe',
            command: 'TeamViewer.exe',
            cpu: 1.0,
            mem: 50,
          },
          {
            pid: 9999,
            name: 'vmtoolsd.exe',
            path: 'C:\\Program Files\\VMware\\VMware Tools\\vmtoolsd.exe',
            command: 'vmtoolsd.exe',
            cpu: 0.5,
            mem: 30,
          },
        ],
      } as any);

      const result = await processMonitor.scanForSuspiciousProcesses();

      expect(result).toHaveLength(3);
      expect(result.map((p) => p.category)).toContain('screen_recording');
      expect(result.map((p) => p.category)).toContain('remote_access');
      expect(result.map((p) => p.category)).toContain('vm_tools');
    });
  });

  describe('isProcessRunning', () => {
    it('should return true if process matches pattern', async () => {
      vi.mocked(si.processes).mockResolvedValue({
        all: 5,
        running: 5,
        blocked: 0,
        sleeping: 0,
        list: [
          {
            pid: 1234,
            name: 'obs64.exe',
            path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
            command: 'obs64.exe',
            cpu: 5.0,
            mem: 200,
          },
        ],
      } as any);

      const result = await processMonitor.isProcessRunning([/obs/i]);

      expect(result).toBe(true);
    });

    it('should return false if process does not match pattern', async () => {
      vi.mocked(si.processes).mockResolvedValue({
        all: 5,
        running: 5,
        blocked: 0,
        sleeping: 0,
        list: [
          {
            pid: 1234,
            name: 'chrome.exe',
            path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            command: 'chrome.exe',
            cpu: 2.0,
            mem: 150,
          },
        ],
      } as any);

      const result = await processMonitor.isProcessRunning([/obs/i]);

      expect(result).toBe(false);
    });

    it('should handle errors and return false', async () => {
      vi.mocked(si.processes).mockRejectedValue(new Error('Failed to get processes'));

      const result = await processMonitor.isProcessRunning([/obs/i]);

      expect(result).toBe(false);
    });
  });

  describe('getProcessInfo', () => {
    it('should return process info for valid PID', async () => {
      const mockProcess = {
        pid: 1234,
        name: 'obs64.exe',
        path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
        command: 'obs64.exe',
        cpu: 5.0,
        mem: 200,
      };

      vi.mocked(si.processes).mockResolvedValue({
        all: 5,
        running: 5,
        blocked: 0,
        sleeping: 0,
        list: [mockProcess],
      } as any);

      const result = await processMonitor.getProcessInfo(1234);

      expect(result).toMatchObject(mockProcess);
    });

    it('should return null for invalid PID', async () => {
      vi.mocked(si.processes).mockResolvedValue({
        all: 5,
        running: 5,
        blocked: 0,
        sleeping: 0,
        list: [
          {
            pid: 1234,
            name: 'obs64.exe',
            path: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe',
            command: 'obs64.exe',
            cpu: 5.0,
            mem: 200,
          },
        ],
      } as any);

      const result = await processMonitor.getProcessInfo(9999);

      expect(result).toBeNull();
    });

    it('should handle errors and return null', async () => {
      vi.mocked(si.processes).mockRejectedValue(new Error('Failed to get processes'));

      const result = await processMonitor.getProcessInfo(1234);

      expect(result).toBeNull();
    });
  });
});
