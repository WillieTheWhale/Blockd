/**
 * Unit tests for BackendConnector
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackendConnector } from '../../../src/main/backend/backend-connector';

// Mock WebSocket
vi.mock('ws', () => {
  const EventEmitter = require('events');
  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = MockWebSocket.CLOSED;

    constructor(url: string) {
      super();
      // Simulate async connection
      setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit('open');
      }, 10);
    }

    send(data: string) {
      // Mock send
    }

    close() {
      this.readyState = MockWebSocket.CLOSED;
      this.emit('close', 1000, 'Normal closure');
    }
  }

  return {
    default: MockWebSocket,
    WebSocket: MockWebSocket,
  };
});

describe('BackendConnector', () => {
  let connector: BackendConnector;

  beforeEach(() => {
    vi.useFakeTimers();
    connector = new BackendConnector({
      url: 'ws://localhost:3003',
      heartbeatIntervalMs: 30000,
      reconnectDelayMs: 1000,
      maxReconnectAttempts: 5,
      maxQueuedMessages: 100,
    });
  });

  afterEach(() => {
    connector.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should emit connecting status on connect', () => {
      const statusHandler = vi.fn();
      connector.on('status-change', statusHandler);

      connector.connect();

      expect(statusHandler).toHaveBeenCalledWith('connecting');
    });

    it('should emit connected status after successful connection', async () => {
      const connectedHandler = vi.fn();
      connector.on('connected', connectedHandler);

      connector.connect();

      // Advance timers to trigger WebSocket connection
      await vi.advanceTimersByTimeAsync(50);

      expect(connectedHandler).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should emit disconnected status on disconnect', async () => {
      const disconnectedHandler = vi.fn();
      connector.on('disconnected', disconnectedHandler);

      connector.connect();
      await vi.advanceTimersByTimeAsync(50);

      connector.disconnect('test');

      expect(disconnectedHandler).toHaveBeenCalledWith('test');
    });

    it('should not attempt to reconnect after manual disconnect', async () => {
      const reconnectingHandler = vi.fn();
      connector.on('reconnecting', reconnectingHandler);

      connector.connect();
      await vi.advanceTimersByTimeAsync(50);

      connector.disconnect('test');

      // Advance timers significantly
      await vi.advanceTimersByTimeAsync(10000);

      expect(reconnectingHandler).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('should queue messages when not connected', () => {
      const message = {
        type: 'security_event' as const,
        timestamp: Date.now(),
        payload: { test: true },
      };

      connector.send(message);

      const stats = connector.getQueueStats();
      expect(stats.size).toBe(1);
    });

    it('should reject invalid messages', () => {
      const invalidMessage = {
        type: 'invalid_type',
        timestamp: Date.now(),
        payload: {},
      };

      // This should not throw but should log an error
      connector.send(invalidMessage as any);

      const stats = connector.getQueueStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return disconnected initially', () => {
      expect(connector.getStatus()).toBe('disconnected');
    });

    it('should return connecting when connecting', () => {
      connector.connect();
      expect(connector.getStatus()).toBe('connecting');
    });

    it('should return connected after successful connection', async () => {
      connector.connect();
      await vi.advanceTimersByTimeAsync(50);
      expect(connector.getStatus()).toBe('connected');
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      expect(connector.isConnected()).toBe(false);
    });

    it('should return true when connected', async () => {
      connector.connect();
      await vi.advanceTimersByTimeAsync(50);
      expect(connector.isConnected()).toBe(true);
    });

    it('should return false after disconnect', async () => {
      connector.connect();
      await vi.advanceTimersByTimeAsync(50);
      connector.disconnect();
      expect(connector.isConnected()).toBe(false);
    });
  });

  describe('getConnectionStats', () => {
    it('should return correct stats', () => {
      const stats = connector.getConnectionStats();

      expect(stats).toHaveProperty('status');
      expect(stats).toHaveProperty('reconnectAttempts');
      expect(stats).toHaveProperty('queuedMessages');
      expect(stats).toHaveProperty('pendingMessages');
      expect(stats).toHaveProperty('lastHeartbeat');
    });
  });
});
