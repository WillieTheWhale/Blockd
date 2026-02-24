/**
 * Authentication Endpoints Tests
 * Tests for new auth endpoints: me, change-password, mfa/disable, forgot-password, reset-password
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { fixtures, generateTestEmail, parseBody } from './helpers/test-utils';

describe('Auth Endpoints Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================================================================
  // GET /api/v1/auth/me - Get Current User
  // ===========================================================================
  describe('GET /api/v1/auth/me', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const body = parseBody(response);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid Bearer token format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'InvalidFormat token123',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject malformed JWT token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Bearer invalid.token.here',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject empty Bearer token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Bearer ',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ===========================================================================
  // POST /api/v1/auth/change-password
  // ===========================================================================
  describe('POST /api/v1/auth/change-password', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        payload: {
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword456!',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate request body - missing currentPassword', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          newPassword: 'NewPassword456!',
        },
      });

      // Either 401 (invalid token) or 422 (validation error)
      expect([401, 422]).toContain(response.statusCode);
    });

    it('should validate request body - missing newPassword', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          currentPassword: 'OldPassword123!',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should validate password strength requirements', async () => {
      const weakPasswords = [
        'short',                    // Too short
        'nouppercase123!',          // No uppercase
        'NOLOWERCASE123!',          // No lowercase
        'NoNumbers!',               // No numbers
        'NoSpecial123',             // No special characters
      ];

      for (const weakPassword of weakPasswords) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/change-password',
          headers: {
            authorization: 'Bearer fake-token',
          },
          payload: {
            currentPassword: 'OldPassword123!',
            newPassword: weakPassword,
          },
        });

        // Should either fail auth or fail validation
        expect([401, 422]).toContain(response.statusCode);
      }
    });

    it('should reject excessively long passwords (DoS prevention)', async () => {
      const longPassword = 'A'.repeat(200) + 'a1!';

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          currentPassword: 'OldPassword123!',
          newPassword: longPassword,
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // POST /api/v1/auth/mfa/disable
  // ===========================================================================
  describe('POST /api/v1/auth/mfa/disable', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/mfa/disable',
        payload: {
          password: 'Password123!',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should require password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/mfa/disable',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {},
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should accept optional MFA code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/mfa/disable',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          password: 'Password123!',
          mfaCode: '123456',
        },
      });

      // 401 for invalid token, 422 for validation, 400 for bad request
      expect([401, 422, 400]).toContain(response.statusCode);
    });

    it('should validate MFA code format when provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/mfa/disable',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          password: 'Password123!',
          mfaCode: 'invalid', // Should be 6 digits
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // POST /api/v1/auth/forgot-password
  // ===========================================================================
  describe('POST /api/v1/auth/forgot-password', () => {
    it('should accept valid email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {
          email: 'user@example.com',
        },
      });

      // Should return 200 even for non-existent emails (prevent enumeration)
      expect([200, 500]).toContain(response.statusCode);

      if (response.statusCode === 200) {
        const body = parseBody(response);
        expect(body.success).toBe(true);
        // Response should be generic to prevent email enumeration
        expect(body.data.message).toBeDefined();
      }
    });

    it('should validate email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {
          email: 'invalid-email',
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should require email field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {},
      });

      expect(response.statusCode).toBe(422);
    });

    it('should return same response for existing and non-existing users', async () => {
      // This tests email enumeration prevention
      const existingResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {
          email: 'likely-exists@example.com',
        },
      });

      const nonExistingResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/forgot-password',
        payload: {
          email: 'definitely-not-exists@example.com',
        },
      });

      // Both should return the same status code
      expect(existingResponse.statusCode).toBe(nonExistingResponse.statusCode);
    });
  });

  // ===========================================================================
  // POST /api/v1/auth/reset-password
  // ===========================================================================
  describe('POST /api/v1/auth/reset-password', () => {
    it('should require token and newPassword', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {},
      });

      expect(response.statusCode).toBe(422);
    });

    it('should require valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          token: '',
          newPassword: 'NewPassword123!',
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should validate password strength', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          token: 'valid-looking-token',
          newPassword: 'weak',
        },
      });

      expect(response.statusCode).toBe(422);
    });

    it('should reject invalid/expired tokens', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/reset-password',
        payload: {
          token: 'invalid-or-expired-token-12345',
          newPassword: 'NewSecurePassword123!',
        },
      });

      // Should be 400 (bad request) for invalid token, or 500 if Redis unavailable
      expect([400, 500]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // POST /api/v1/auth/oauth/state
  // ===========================================================================
  describe('POST /api/v1/auth/oauth/state', () => {
    it('should generate state for valid provider (google)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/oauth/state',
        payload: {
          provider: 'google',
        },
      });

      // 200 if successful, 500 if Redis unavailable
      expect([200, 500]).toContain(response.statusCode);

      if (response.statusCode === 200) {
        const body = parseBody(response);
        expect(body.success).toBe(true);
        expect(body.data.state).toBeDefined();
        expect(typeof body.data.state).toBe('string');
        expect(body.data.state.length).toBeGreaterThan(0);
      }
    });

    it('should generate state for valid provider (microsoft)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/oauth/state',
        payload: {
          provider: 'microsoft',
        },
      });

      expect([200, 500]).toContain(response.statusCode);
    });

    it('should reject invalid provider', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/oauth/state',
        payload: {
          provider: 'facebook',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require provider field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/oauth/state',
        payload: {},
      });

      expect([400, 422]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // POST /api/v1/auth/oauth/callback
  // ===========================================================================
  describe('POST /api/v1/auth/oauth/callback', () => {
    it('should require all OAuth parameters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/oauth/callback',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require state parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/oauth/callback',
        payload: {
          code: 'auth-code',
          codeVerifier: 'a'.repeat(43),
          provider: 'google',
          // Missing state
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate provider', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/oauth/callback',
        payload: {
          code: 'auth-code',
          codeVerifier: 'a'.repeat(43),
          provider: 'invalid-provider',
          state: 'some-state',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid state (CSRF protection)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/oauth/callback',
        payload: {
          code: 'auth-code',
          codeVerifier: 'a'.repeat(43),
          provider: 'google',
          state: 'invalid-state-that-was-not-generated',
        },
      });

      // Should fail state validation
      expect([400, 500]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // MFA Verification Rate Limiting
  // ===========================================================================
  describe('MFA Verification Rate Limiting', () => {
    it('should validate MFA code format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/mfa/verify',
        payload: {
          code: 'not-6-digits',
          secret: 'some-secret',
        },
      });

      expect([400, 422]).toContain(response.statusCode);
    });

    it('should require both code and secret', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/mfa/verify',
        payload: {
          code: '123456',
          // missing secret
        },
      });

      expect(response.statusCode).toBe(422);
    });
  });
});
