/**
 * Browser Routes Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Browser Routes Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/browser/session/validate', () => {
    it('should require sessionToken', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/browser/session/validate',
        payload: {},
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return valid:false for non-existent session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/browser/session/validate',
        payload: {
          sessionToken: 'non-existent-token-123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.valid).toBe(false);
    });

    it('should validate sessionToken format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/browser/session/validate',
        payload: {
          sessionToken: '', // Empty string
        },
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('POST /api/v1/browser/security/event', () => {
    it('should require all fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/browser/security/event',
        payload: {
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should validate sessionId is a UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/browser/security/event',
        payload: {
          sessionId: 'not-a-uuid',
          eventType: 'suspicious_process',
          severity: 'high',
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should reject invalid severity', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/browser/security/event',
        payload: {
          sessionId: '550e8400-e29b-41d4-a716-446655440000',
          eventType: 'suspicious_process',
          severity: 'invalid_severity',
        },
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('POST /api/v1/browser/telemetry/batch', () => {
    it('should require events array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/browser/telemetry/batch',
        payload: {},
      });

      expect(response.statusCode).toBe(422);
    });

    it('should handle empty events array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/browser/telemetry/batch',
        payload: {
          events: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.processed).toBe(0);
    });

    it('should validate event structure', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/browser/telemetry/batch',
        payload: {
          events: [
            {
              // Missing sessionId
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });

      expect(response.statusCode).toBe(422);
    });
  });
});
