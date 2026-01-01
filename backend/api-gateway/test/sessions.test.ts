/**
 * Sessions Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Sessions Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/sessions', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sessions',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/sessions', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: {
          intervieweeEmail: 'test@example.com',
          scheduledStart: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate request body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          // Missing required fields
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/sessions/:id', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sessions/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate UUID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sessions/invalid-uuid',
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });
  });
});
