/**
 * Unit tests for Protocol functions
 */

import { describe, it, expect } from 'vitest';
import {
  validateMessage,
  serializeMessage,
  deserializeMessage,
  createSessionValidateMessage,
  createSessionStartMessage,
  createSessionEndMessage,
  createHeartbeat,
  createErrorMessage,
  getMessagePriority,
} from '../../../src/main/backend/protocol';
import { BlockedMessage } from '../../../src/shared/types';

describe('Protocol', () => {
  describe('validateMessage', () => {
    it('should return true for valid message', () => {
      const message: BlockedMessage = {
        type: 'security_event',
        timestamp: Date.now(),
        payload: { test: true },
      };

      expect(validateMessage(message)).toBe(true);
    });

    it('should return false for missing type', () => {
      const message = {
        timestamp: Date.now(),
        payload: {},
      };

      expect(validateMessage(message)).toBe(false);
    });

    it('should return false for missing timestamp', () => {
      const message = {
        type: 'security_event',
        payload: {},
      };

      expect(validateMessage(message)).toBe(false);
    });

    it('should return false for invalid type', () => {
      const message = {
        type: 'invalid_type',
        timestamp: Date.now(),
        payload: {},
      };

      expect(validateMessage(message)).toBe(false);
    });

    it('should return false for null', () => {
      expect(validateMessage(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(validateMessage('string')).toBe(false);
    });
  });

  describe('serializeMessage', () => {
    it('should serialize message to JSON string', () => {
      const message: BlockedMessage = {
        type: 'heartbeat',
        timestamp: 1234567890,
        payload: { test: true },
      };

      const result = serializeMessage(message);

      expect(result).toBe('{"type":"heartbeat","timestamp":1234567890,"payload":{"test":true}}');
    });
  });

  describe('deserializeMessage', () => {
    it('should deserialize valid JSON to message', () => {
      const json = '{"type":"heartbeat","timestamp":1234567890,"payload":{"test":true}}';

      const result = deserializeMessage(json);

      expect(result.type).toBe('heartbeat');
      expect(result.timestamp).toBe(1234567890);
      expect(result.payload).toEqual({ test: true });
    });

    it('should throw for invalid JSON', () => {
      expect(() => deserializeMessage('invalid')).toThrow();
    });

    it('should throw for invalid message format', () => {
      expect(() => deserializeMessage('{"foo":"bar"}')).toThrow();
    });
  });

  describe('createSessionValidateMessage', () => {
    it('should create session validate message', () => {
      const request = {
        sessionToken: 'test-token',
        browserVersion: '1.0.0',
        platform: 'windows' as const,
        userAgent: 'Test/1.0',
      };

      const message = createSessionValidateMessage(request);

      expect(message.type).toBe('session_validate');
      expect(message.timestamp).toBeDefined();
      expect(message.payload).toBe(request);
    });
  });

  describe('createSessionStartMessage', () => {
    it('should create session start message', () => {
      const message = createSessionStartMessage('session-123');

      expect(message.type).toBe('session_start');
      expect(message.sessionId).toBe('session-123');
      expect((message.payload as any).startedAt).toBeDefined();
    });
  });

  describe('createSessionEndMessage', () => {
    it('should create session end message', () => {
      const message = createSessionEndMessage('session-123', 'user requested');

      expect(message.type).toBe('session_end');
      expect(message.sessionId).toBe('session-123');
      expect((message.payload as any).reason).toBe('user requested');
      expect((message.payload as any).endedAt).toBeDefined();
    });
  });

  describe('createHeartbeat', () => {
    it('should create heartbeat message', () => {
      const message = createHeartbeat('session-123');

      expect(message.type).toBe('heartbeat');
      expect(message.sessionId).toBe('session-123');
      expect((message.payload as any).uptime).toBeDefined();
    });

    it('should work without sessionId', () => {
      const message = createHeartbeat();

      expect(message.type).toBe('heartbeat');
      expect(message.sessionId).toBeUndefined();
    });
  });

  describe('createErrorMessage', () => {
    it('should create error message', () => {
      const error = new Error('Test error');
      const message = createErrorMessage(error, 'session-123');

      expect(message.type).toBe('error');
      expect(message.sessionId).toBe('session-123');
      expect((message.payload as any).message).toBe('Test error');
      expect((message.payload as any).name).toBe('Error');
    });
  });

  describe('getMessagePriority', () => {
    it('should return high for session messages', () => {
      expect(getMessagePriority({ type: 'session_validate', timestamp: 0, payload: {} })).toBe('high');
      expect(getMessagePriority({ type: 'session_start', timestamp: 0, payload: {} })).toBe('high');
      expect(getMessagePriority({ type: 'session_end', timestamp: 0, payload: {} })).toBe('high');
      expect(getMessagePriority({ type: 'error', timestamp: 0, payload: {} })).toBe('high');
    });

    it('should return medium for security and heartbeat', () => {
      expect(getMessagePriority({ type: 'security_event', timestamp: 0, payload: {} })).toBe('medium');
      expect(getMessagePriority({ type: 'heartbeat', timestamp: 0, payload: {} })).toBe('medium');
    });

    it('should return low for data messages', () => {
      expect(getMessagePriority({ type: 'gaze_data', timestamp: 0, payload: {} })).toBe('low');
      expect(getMessagePriority({ type: 'telemetry_data', timestamp: 0, payload: {} })).toBe('low');
      expect(getMessagePriority({ type: 'video_frame', timestamp: 0, payload: {} })).toBe('low');
    });
  });
});
