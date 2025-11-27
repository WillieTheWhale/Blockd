/**
 * Authentication Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Authentication Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should reject invalid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'Password123!',
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject weak password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'weak',
        },
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should validate password requirements', async () => {
      const testCases = [
        { password: 'NoNumbers!', reason: 'no numbers' },
        { password: 'nonumbers123!', reason: 'no uppercase' },
        { password: 'NOLOWERCASE123!', reason: 'no lowercase' },
        { password: 'NoSpecialChar123', reason: 'no special char' },
      ];

      for (const testCase of testCases) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email: 'test@example.com',
            password: testCase.password,
          },
        });

        expect(response.statusCode).toBe(422);
      }
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should reject missing credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {},
      });

      expect(response.statusCode).toBe(422);
    });

    it('should validate email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'invalid-email',
          password: 'password',
        },
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should require refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {},
      });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
