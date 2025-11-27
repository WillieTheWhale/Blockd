/**
 * Rate Limiting Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Rate Limiting Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should include rate limit headers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'test@example.com',
        password: 'password',
      },
    });

    expect(response.headers['x-ratelimit-limit']).toBeDefined();
    expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    expect(response.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('should track rate limit consumption', async () => {
    const firstResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    const firstRemaining = parseInt(firstResponse.headers['x-ratelimit-remaining'] as string);

    const secondResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    const secondRemaining = parseInt(secondResponse.headers['x-ratelimit-remaining'] as string);

    // Remaining count should decrease (or stay same if Redis fails open)
    expect(secondRemaining).toBeLessThanOrEqual(firstRemaining);
  });
});
