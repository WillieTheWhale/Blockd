/**
 * Telemetry Collector
 *
 * Collects system metrics using systeminformation package:
 * - CPU usage
 * - Memory usage
 * - Active process count
 * - Window focus state
 * - Battery level
 * - Network usage
 *
 * Sends telemetry data to backend at configurable intervals.
 */

import { EventEmitter } from 'events';
import si from 'systeminformation';
import { BrowserWindow } from 'electron';
import { TelemetryData } from '../../shared/types.js';
import { BackendConnector } from '../backend/backend-connector.js';
import { createTelemetryData } from '../backend/protocol.js';
import { TELEMETRY_INTERVAL_MS } from '../../shared/constants.js';

export interface TelemetryCollectorConfig {
  intervalMs: number;
  collectCpu: boolean;
  collectMemory: boolean;
  collectProcesses: boolean;
  collectBattery: boolean;
  collectNetwork: boolean;
  collectWindowFocus: boolean;
}

export interface TelemetryCollectorEvents {
  'data-collected': (data: TelemetryData) => void;
  'error': (error: Error) => void;
}

export declare interface TelemetryCollector {
  on<K extends keyof TelemetryCollectorEvents>(
    event: K,
    listener: TelemetryCollectorEvents[K]
  ): this;
  emit<K extends keyof TelemetryCollectorEvents>(
    event: K,
    ...args: Parameters<TelemetryCollectorEvents[K]>
  ): boolean;
}

export class TelemetryCollector extends EventEmitter {
  private config: TelemetryCollectorConfig;
  private connector: BackendConnector | null = null;
  private sessionId: string | null = null;
  private interval: NodeJS.Timeout | null = null;
  private isCollecting = false;
  private window: BrowserWindow | null = null;

  // Cache for network stats (needed for delta calculations)
  private lastNetworkStats: si.Systeminformation.NetworkStatsData[] | null = null;
  private lastNetworkStatsTime = 0;

  constructor(config?: Partial<TelemetryCollectorConfig>) {
    super();

    this.config = {
      intervalMs: config?.intervalMs || TELEMETRY_INTERVAL_MS,
      collectCpu: config?.collectCpu ?? true,
      collectMemory: config?.collectMemory ?? true,
      collectProcesses: config?.collectProcesses ?? true,
      collectBattery: config?.collectBattery ?? true,
      collectNetwork: config?.collectNetwork ?? true,
      collectWindowFocus: config?.collectWindowFocus ?? true,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start collecting telemetry
   */
  start(
    sessionId: string,
    connector: BackendConnector,
    window?: BrowserWindow
  ): void {
    if (this.isCollecting) {
      console.warn('[TelemetryCollector] Already collecting');
      return;
    }

    console.log('[TelemetryCollector] Starting telemetry collection');
    this.sessionId = sessionId;
    this.connector = connector;
    this.window = window || null;
    this.isCollecting = true;

    // Collect immediately
    this.collect().catch((error) => {
      console.error('[TelemetryCollector] Initial collection failed:', error);
    });

    // Start interval
    this.interval = setInterval(() => {
      this.collect().catch((error) => {
        console.error('[TelemetryCollector] Collection failed:', error);
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      });
    }, this.config.intervalMs);
  }

  /**
   * Stop collecting telemetry
   */
  stop(): void {
    if (!this.isCollecting) {
      return;
    }

    console.log('[TelemetryCollector] Stopping telemetry collection');
    this.isCollecting = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.sessionId = null;
    this.connector = null;
    this.window = null;
    this.lastNetworkStats = null;
  }

  /**
   * Check if collector is running
   */
  isRunning(): boolean {
    return this.isCollecting;
  }

  // ============================================================================
  // Data Collection
  // ============================================================================

  /**
   * Collect telemetry data
   */
  private async collect(): Promise<void> {
    if (!this.sessionId || !this.connector) {
      throw new Error('Telemetry collector not initialized');
    }

    const data: TelemetryData = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      cpuPercent: 0,
      memoryMb: 0,
      activeProcesses: 0,
      windowFocused: false,
    };

    try {
      // Collect all metrics in parallel
      const results = await Promise.allSettled([
        this.config.collectCpu ? this.collectCpuUsage() : Promise.resolve(0),
        this.config.collectMemory ? this.collectMemoryUsage() : Promise.resolve(0),
        this.config.collectProcesses ? this.collectProcessCount() : Promise.resolve(0),
        this.config.collectBattery ? this.collectBatteryLevel() : Promise.resolve(undefined),
        this.config.collectNetwork ? this.collectNetworkUsage() : Promise.resolve({ up: 0, down: 0 }),
        this.config.collectWindowFocus ? this.collectWindowFocus() : Promise.resolve(false),
      ]);

      // Extract results
      data.cpuPercent = results[0].status === 'fulfilled' ? results[0].value : 0;
      data.memoryMb = results[1].status === 'fulfilled' ? results[1].value : 0;
      data.activeProcesses = results[2].status === 'fulfilled' ? results[2].value : 0;
      data.batteryLevel = results[3].status === 'fulfilled' ? results[3].value : undefined;

      const networkUsage = results[4].status === 'fulfilled' ? results[4].value : { up: 0, down: 0 };
      data.networkUpKbps = networkUsage.up;
      data.networkDownKbps = networkUsage.down;

      data.windowFocused = results[5].status === 'fulfilled' ? results[5].value : false;

      // Emit event
      this.emit('data-collected', data);

      // Send to backend
      const message = createTelemetryData(this.sessionId, data);
      this.connector.send(message);

      console.log('[TelemetryCollector] Telemetry collected:', {
        cpu: `${data.cpuPercent.toFixed(1)}%`,
        memory: `${data.memoryMb.toFixed(0)}MB`,
        processes: data.activeProcesses,
        battery: data.batteryLevel ? `${data.batteryLevel}%` : 'N/A',
        focused: data.windowFocused,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[TelemetryCollector] Failed to collect telemetry:', err);
      throw err;
    }
  }

  /**
   * Collect CPU usage percentage
   */
  private async collectCpuUsage(): Promise<number> {
    try {
      const load = await si.currentLoad();
      return load.currentLoad;
    } catch (error) {
      console.error('[TelemetryCollector] Failed to collect CPU usage:', error);
      return 0;
    }
  }

  /**
   * Collect memory usage in MB
   */
  private async collectMemoryUsage(): Promise<number> {
    try {
      const mem = await si.mem();
      return mem.used / (1024 * 1024); // Convert to MB
    } catch (error) {
      console.error('[TelemetryCollector] Failed to collect memory usage:', error);
      return 0;
    }
  }

  /**
   * Collect active process count
   */
  private async collectProcessCount(): Promise<number> {
    try {
      const processes = await si.processes();
      return processes.all;
    } catch (error) {
      console.error('[TelemetryCollector] Failed to collect process count:', error);
      return 0;
    }
  }

  /**
   * Collect battery level percentage
   */
  private async collectBatteryLevel(): Promise<number | undefined> {
    try {
      const battery = await si.battery();
      return battery.hasBattery && battery.percent !== undefined
        ? battery.percent
        : undefined;
    } catch (error) {
      // Battery info not available on some systems
      return undefined;
    }
  }

  /**
   * Collect network usage in KB/s
   */
  private async collectNetworkUsage(): Promise<{ up: number; down: number }> {
    try {
      const stats = await si.networkStats();
      const now = Date.now();

      if (!this.lastNetworkStats || !this.lastNetworkStatsTime) {
        // First measurement - no delta yet
        this.lastNetworkStats = stats;
        this.lastNetworkStatsTime = now;
        return { up: 0, down: 0 };
      }

      // Calculate delta
      const timeDelta = (now - this.lastNetworkStatsTime) / 1000; // seconds

      if (timeDelta === 0 || stats.length === 0) {
        return { up: 0, down: 0 };
      }

      // Sum up all interfaces
      let totalTxBytes = 0;
      let totalRxBytes = 0;
      let lastTotalTxBytes = 0;
      let lastTotalRxBytes = 0;

      for (const iface of stats) {
        totalTxBytes += iface.tx_bytes;
        totalRxBytes += iface.rx_bytes;
      }

      for (const iface of this.lastNetworkStats) {
        lastTotalTxBytes += iface.tx_bytes;
        lastTotalRxBytes += iface.rx_bytes;
      }

      const txDelta = totalTxBytes - lastTotalTxBytes;
      const rxDelta = totalRxBytes - lastTotalRxBytes;

      const upKbps = (txDelta / timeDelta) / 1024; // KB/s
      const downKbps = (rxDelta / timeDelta) / 1024; // KB/s

      // Update cache
      this.lastNetworkStats = stats;
      this.lastNetworkStatsTime = now;

      return {
        up: Math.max(0, upKbps),
        down: Math.max(0, downKbps),
      };
    } catch (error) {
      console.error('[TelemetryCollector] Failed to collect network usage:', error);
      return { up: 0, down: 0 };
    }
  }

  /**
   * Check if window is focused
   */
  private collectWindowFocus(): boolean {
    if (!this.window || this.window.isDestroyed()) {
      return false;
    }

    return this.window.isFocused();
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Update collection interval
   */
  setInterval(intervalMs: number): void {
    this.config.intervalMs = intervalMs;

    if (this.isCollecting) {
      // Restart with new interval
      const sessionId = this.sessionId;
      const connector = this.connector;
      const window = this.window;

      this.stop();

      if (sessionId && connector) {
        this.start(sessionId, connector, window || undefined);
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): TelemetryCollectorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TelemetryCollectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================================================
  // Manual Collection
  // ============================================================================

  /**
   * Collect telemetry data once (without sending to backend)
   */
  async collectOnce(): Promise<TelemetryData> {
    const data: TelemetryData = {
      sessionId: this.sessionId || 'manual',
      timestamp: Date.now(),
      cpuPercent: await this.collectCpuUsage(),
      memoryMb: await this.collectMemoryUsage(),
      activeProcesses: await this.collectProcessCount(),
      windowFocused: this.collectWindowFocus(),
      batteryLevel: await this.collectBatteryLevel(),
    };

    const networkUsage = await this.collectNetworkUsage();
    data.networkUpKbps = networkUsage.up;
    data.networkDownKbps = networkUsage.down;

    return data;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

let telemetryCollectorInstance: TelemetryCollector | null = null;

/**
 * Get or create the telemetry collector singleton
 */
export function getTelemetryCollector(
  config?: Partial<TelemetryCollectorConfig>
): TelemetryCollector {
  if (!telemetryCollectorInstance) {
    telemetryCollectorInstance = new TelemetryCollector(config);
  }
  return telemetryCollectorInstance;
}

/**
 * Destroy the telemetry collector singleton
 */
export function destroyTelemetryCollector(): void {
  if (telemetryCollectorInstance) {
    telemetryCollectorInstance.destroy();
    telemetryCollectorInstance = null;
  }
}
