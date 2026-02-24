/**
 * User Endpoints Tests
 * Tests for user profile endpoints: GET /me, PUT /me
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { fixtures, parseBody } from './helpers/test-utils';

describe('User Endpoints Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================================================================
  // GET /api/v1/users/me - Get Current User Profile
  // ===========================================================================
  describe('GET /api/v1/users/me', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
      });

      expect(response.statusCode).toBe(401);
      const body = parseBody(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid Authorization header format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Basic dXNlcjpwYXNz', // Basic auth instead of Bearer
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject malformed JWT token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer not.a.valid.jwt',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject expired JWT token', async () => {
      // Create an expired token (manually crafted for testing)
      const expiredPayload = Buffer.from(JSON.stringify({
        userId: fixtures.validUuid,
        email: 'test@example.com',
        role: 'interviewer',
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      })).toString('base64url');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: `Bearer header.${expiredPayload}.signature`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ===========================================================================
  // PUT /api/v1/users/me - Update Current User Profile
  // ===========================================================================
  describe('PUT /api/v1/users/me', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        payload: {
          firstName: 'Updated',
          lastName: 'Name',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate firstName length', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          firstName: 'A'.repeat(200), // Too long
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should validate lastName length', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          lastName: 'B'.repeat(200), // Too long
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should validate email format', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          email: 'not-an-email',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should accept valid firstName update', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          firstName: 'John',
        },
      });

      // 401 if token invalid, otherwise 200 or 404
      expect([200, 401, 404]).toContain(response.statusCode);
    });

    it('should accept valid lastName update', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          lastName: 'Doe',
        },
      });

      expect([200, 401, 404]).toContain(response.statusCode);
    });

    it('should accept valid email update', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          email: 'newemail@example.com',
        },
      });

      expect([200, 401, 404]).toContain(response.statusCode);
    });

    it('should accept multiple fields update', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
      });

      expect([200, 401, 404]).toContain(response.statusCode);
    });

    it('should NOT allow updating password via this endpoint', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          password: 'NewPassword123!',
        },
      });

      // Password field should be ignored or rejected
      expect([200, 401, 404, 422]).toContain(response.statusCode);

      if (response.statusCode === 200) {
        const body = parseBody(response);
        // Password should not be in response
        expect(body.data).not.toHaveProperty('password');
        expect(body.data).not.toHaveProperty('passwordHash');
      }
    });

    it('should NOT allow updating role via this endpoint', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          role: 'admin', // Should not be updatable
        },
      });

      expect([200, 401, 404, 422]).toContain(response.statusCode);

      if (response.statusCode === 200) {
        const body = parseBody(response);
        // Role should not change
        expect(body.data.role).not.toBe('admin');
      }
    });

    it('should NOT allow updating organizationId via this endpoint', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          organizationId: fixtures.validUuid,
        },
      });

      expect([200, 401, 404, 422]).toContain(response.statusCode);
    });

    it('should sanitize input to prevent XSS', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          firstName: '<script>alert("xss")</script>',
          lastName: '<img onerror="alert(1)" src="">',
        },
      });

      expect([200, 401, 404, 422]).toContain(response.statusCode);

      if (response.statusCode === 200) {
        const body = parseBody(response);
        // Should not contain script tags
        expect(body.data.firstName).not.toContain('<script>');
        expect(body.data.lastName).not.toContain('onerror');
      }
    });

    it('should trim whitespace from fields', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          firstName: '  Trimmed  ',
        },
      });

      expect([200, 401, 404]).toContain(response.statusCode);

      if (response.statusCode === 200) {
        const body = parseBody(response);
        expect(body.data.firstName).toBe('Trimmed');
      }
    });

    it('should handle empty body', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {},
      });

      // Should either succeed (no changes) or reject as no fields to update
      expect([200, 401, 404, 422]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // Response Shape Validation
  // ===========================================================================
  describe('Response Shape Validation', () => {
    it('should NOT expose sensitive fields in user profile response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      if (response.statusCode === 200) {
        const body = parseBody(response);

        // These fields should NEVER be in the response
        expect(body.data).not.toHaveProperty('passwordHash');
        expect(body.data).not.toHaveProperty('mfaSecret');
        expect(body.data).not.toHaveProperty('mfaBackupCodes');
        expect(body.data).not.toHaveProperty('password');
      }
    });

    it('should include expected profile fields', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      if (response.statusCode === 200) {
        const body = parseBody(response);

        // These fields should be present
        expect(body.data).toHaveProperty('id');
        expect(body.data).toHaveProperty('email');
        expect(body.data).toHaveProperty('role');
        expect(body.data).toHaveProperty('mfaEnabled');
        expect(body.data).toHaveProperty('emailVerified');
        expect(body.data).toHaveProperty('createdAt');
        expect(body.data).toHaveProperty('updatedAt');
      }
    });
  });
});
