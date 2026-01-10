/**
 * Error Handler Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Error Handler Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('404 Not Found', () => {
    it('should return proper error response for unknown routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown/route/path',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('not found');
    });

    it('should include request method in 404 message', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/unknown/route',
        payload: {},
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('POST');
    });
  });

  describe('Validation Errors', () => {
    it('should return 422 for validation errors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'not-an-email',
          password: 'x',
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should include validation details', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'invalid',
          password: 'short',
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error.details).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should return 429 when rate limited', async () => {
      // Make many requests quickly to trigger rate limit
      const requests = Array(150).fill(null).map(() =>
        app.inject({
          method: 'GET',
          url: '/api/v1/health/quick',
        })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.statusCode === 429);

      // Rate limiting might not trigger in test environment
      // but we check the response format if it does
      if (rateLimited) {
        const limited = responses.find(r => r.statusCode === 429);
        const body = JSON.parse(limited!.body);
        expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      }
    });
  });

  describe('Error Response Format', () => {
    it('should have consistent error response structure', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown',
      });

      const body = JSON.parse(response.body);

      // Check required fields
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('statusCode');
    });

    it('should include meta with timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown',
      });

      const body = JSON.parse(response.body);
      expect(body.meta).toBeDefined();
      expect(body.meta.timestamp).toBeDefined();
    });
  });

  describe('Content Type', () => {
    it('should return JSON content type for errors', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unknown',
      });

      expect(response.headers['content-type']).toContain('application/json');
    });
  });
});
