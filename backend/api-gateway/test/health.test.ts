/**
 * Health Routes Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Health Routes Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('should return comprehensive health status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBeDefined();
      expect(body.data).toBeDefined();
      expect(body.data.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(body.data.status);
      expect(body.data.timestamp).toBeDefined();
    });

    it('should include dependency status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.dependencies).toBeDefined();
      expect(Array.isArray(body.data.dependencies)).toBe(true);
    });
  });

  describe('GET /api/v1/health/quick', () => {
    it('should return quick health check', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/quick',
      });

      expect([200, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);
      expect(body.status).toBeDefined();
      expect(['healthy', 'unhealthy']).toContain(body.status);
    });

    it('should be fast (< 100ms)', async () => {
      const start = Date.now();
      await app.inject({
        method: 'GET',
        url: '/api/v1/health/quick',
      });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('GET /api/v1/ready', () => {
    it('should return readiness status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ready',
      });

      expect([200, 503]).toContain(response.statusCode);
      const body = JSON.parse(response.body);

      if (response.statusCode === 200) {
        expect(body.success).toBe(true);
        expect(body.data.ready).toBeDefined();
      } else {
        expect(body.success).toBe(false);
      }
    });
  });

  describe('GET /api/v1/live', () => {
    it('should return liveness status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/live',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.alive).toBe(true);
    });

    it('should include timestamp', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/live',
      });

      const body = JSON.parse(response.body);
      expect(body.data.timestamp).toBeDefined();
    });
  });

  describe('GET /api/v1/health/dependencies', () => {
    it('should return dependency details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/dependencies',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.dependencies).toBeDefined();
      expect(body.data.timestamp).toBeDefined();
    });
  });
});
