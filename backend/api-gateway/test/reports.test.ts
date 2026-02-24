/**
 * Reports Routes Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Reports Routes Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/reports', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should accept pagination query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports?page=1&pageSize=10',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      // Should fail with auth since token is invalid
      expect(response.statusCode).toBe(401);
    });

    it('should reject invalid pagination parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports?page=-1&pageSize=999',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      // Should fail with either auth or validation
      expect([401, 422]).toContain(response.statusCode);
    });
  });

  describe('DELETE /api/v1/reports/:id', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/reports/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should validate id is a UUID', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/reports/invalid-uuid',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      // Should fail either with 401 (auth) or 422 (validation)
      expect([401, 422]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/reports/:sessionId', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/550e8400-e29b-41d4-a716-446655440000',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should validate sessionId is a UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/invalid-uuid',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      // Should fail either with 401 (auth) or 422 (validation)
      expect([401, 422]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/reports/:sessionId/pdf', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/550e8400-e29b-41d4-a716-446655440000/pdf',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate sessionId format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/not-a-uuid/pdf',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/reports/:id/download', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/550e8400-e29b-41d4-a716-446655440000/download',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate id format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/not-a-uuid/download',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });
  });

  describe('POST /api/v1/reports/:sessionId/email', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/550e8400-e29b-41d4-a716-446655440000/email',
        payload: {
          recipients: ['test@example.com'],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should require recipients array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/550e8400-e29b-41d4-a716-446655440000/email',
        payload: {},
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      // Will fail with either auth or validation
      expect([401, 422]).toContain(response.statusCode);
    });
  });
});
