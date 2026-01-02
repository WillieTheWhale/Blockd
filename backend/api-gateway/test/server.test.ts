/**
 * Server Tests
 * Tests for server startup and shutdown
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';

describe('Server Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create Fastify app instance', () => {
    expect(app).toBeDefined();
    expect(app.server).toBeDefined();
  });

  it('should respond to root endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.name).toBe('Blockd API Gateway');
    expect(body.status).toBe('running');
  });

  it('should have health check endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.status).toBeDefined();
  });

  it('should return 404 for unknown routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/unknown-route',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('should have CORS headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        origin: 'http://localhost:3000',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeDefined();
  });
});
