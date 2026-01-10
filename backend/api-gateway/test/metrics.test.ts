/**
 * Metrics Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Metrics Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /metrics', () => {
    it('should return Prometheus format metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should include HTTP request metrics', async () => {
      // Make a request first to generate metrics
      await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;
      expect(body).toContain('http_requests_total');
      expect(body).toContain('http_request_duration_seconds');
    });

    it('should include counter metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;
      // Check for TYPE annotations
      expect(body).toContain('# TYPE http_requests_total counter');
    });

    it('should include histogram metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;
      // Check for TYPE annotations
      expect(body).toContain('# TYPE http_request_duration_seconds histogram');
    });

    it('should include gauge metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;
      expect(body).toContain('# TYPE http_active_connections gauge');
    });

    it('should include HELP descriptions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;
      expect(body).toContain('# HELP');
    });
  });
});
