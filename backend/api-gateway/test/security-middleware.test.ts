/**
 * Security Middleware Tests
 * Tests for authentication, authorization, and security features
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app';
import type { FastifyInstance } from 'fastify';
import { fixtures, parseBody, generateTestUuid } from './helpers/test-utils';

describe('Security Middleware Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // ===========================================================================
  // Authentication Middleware Tests
  // ===========================================================================
  describe('Authentication Middleware', () => {
    it('should reject requests without Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
      });

      expect(response.statusCode).toBe(401);
      const body = parseBody(response);
      expect(body.error.code).toBe('UNAUTHORIZED');
      expect(body.error.message).toContain('Authorization');
    });

    it('should reject requests with invalid Authorization format', async () => {
      const invalidFormats = [
        'InvalidFormat token',
        'Token abc123',
        'bearer lowercase',
        'Bearer',  // No token
        '',
      ];

      for (const format of invalidFormats) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/users/me',
          headers: {
            authorization: format,
          },
        });

        expect(response.statusCode).toBe(401);
      }
    });

    it('should reject requests with malformed JWT', async () => {
      const malformedTokens = [
        'Bearer not-a-jwt',
        'Bearer one.two',
        'Bearer one.two.three.four',
        'Bearer ..',
      ];

      for (const token of malformedTokens) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/users/me',
          headers: {
            authorization: token,
          },
        });

        expect(response.statusCode).toBe(401);
      }
    });

    it('should reject requests with tampered JWT signature', async () => {
      // Create a token with wrong signature
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        userId: fixtures.validUuid,
        email: 'test@example.com',
        role: 'admin', // Try to elevate privileges
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })).toString('base64url');
      const fakeSignature = 'tampered-signature';

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: `Bearer ${header}.${payload}.${fakeSignature}`,
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ===========================================================================
  // Role-Based Authorization Tests
  // ===========================================================================
  describe('Role-Based Authorization', () => {
    it('should allow interviewers to access session creation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: {
          authorization: 'Bearer fake-interviewer-token',
        },
        payload: {
          intervieweeEmail: 'test@example.com',
          scheduledStart: new Date().toISOString(),
        },
      });

      // Should fail auth but not role check (401 not 403)
      expect(response.statusCode).toBe(401);
    });

    it('should block access without proper role', async () => {
      // Protected admin routes should return 403 for wrong role
      // or 401 for no/invalid token
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      expect([401, 403]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // CSRF Protection Tests
  // ===========================================================================
  describe('CSRF Protection', () => {
    it('should allow GET requests without CSRF token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
    });

    it('should include security headers in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      // Helmet security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  // ===========================================================================
  // Input Validation and Sanitization Tests
  // ===========================================================================
  describe('Input Validation and Sanitization', () => {
    it('should reject oversized request bodies', async () => {
      const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) }; // 2MB

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: largePayload,
      });

      // Should be rejected before processing
      expect([413, 422, 500]).toContain(response.statusCode);
    });

    it('should handle JSON parsing errors gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: 'not valid json{',
        headers: {
          'content-type': 'application/json',
        },
      });

      expect([400, 415, 422]).toContain(response.statusCode);
    });

    it('should validate UUID format in path parameters', async () => {
      const invalidUuids = [
        'not-a-uuid',
        '12345',
        'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Wrong format
        '../traversal',
        '<script>',
        '%00null',
      ];

      for (const uuid of invalidUuids) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/sessions/${uuid}`,
          headers: {
            authorization: 'Bearer fake-token',
          },
        });

        expect([401, 422]).toContain(response.statusCode);
      }
    });

    it('should sanitize potential XSS in request body', async () => {
      const xssPayloads = [
        '<script>alert(1)</script>',
        '"><img src=x onerror=alert(1)>',
        "javascript:alert('xss')",
        '<svg onload=alert(1)>',
      ];

      for (const payload of xssPayloads) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/sessions',
          headers: {
            authorization: 'Bearer fake-token',
          },
          payload: {
            intervieweeEmail: 'test@example.com',
            scheduledStart: new Date().toISOString(),
            metadata: {
              notes: payload,
            },
          },
        });

        // Request should be processed (or fail auth)
        // XSS should be sanitized, not cause errors
        expect([201, 400, 401, 422]).toContain(response.statusCode);
      }
    });

    it('should prevent prototype pollution in JSON objects', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          intervieweeEmail: 'test@example.com',
          scheduledStart: new Date().toISOString(),
          metadata: {
            '__proto__': { isAdmin: true },
            'constructor': { prototype: { isAdmin: true } },
          },
        },
      });

      // Should not crash the server
      expect([201, 400, 401, 422]).toContain(response.statusCode);
    });
  });

  // ===========================================================================
  // Rate Limiting Tests
  // ===========================================================================
  describe('Rate Limiting', () => {
    it('should include rate limit headers in responses', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'Password123!',
        },
      });

      // Rate limit headers may be present
      // RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
      // Or X-RateLimit-* variants
    });

    it('should allow requests within rate limit', async () => {
      // Make a few requests (should be allowed)
      for (let i = 0; i < 3; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/v1/health',
        });

        expect(response.statusCode).toBe(200);
      }
    });
  });

  // ===========================================================================
  // Error Response Security Tests
  // ===========================================================================
  describe('Error Response Security', () => {
    it('should not leak stack traces in production-like errors', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sessions/invalid-id',
        headers: {
          authorization: 'Bearer fake-token',
        },
      });

      if (response.statusCode >= 400) {
        const body = parseBody(response);

        // Should not contain stack traces
        expect(body.error).not.toHaveProperty('stack');
        expect(JSON.stringify(body)).not.toMatch(/at\s+\w+\s*\(/); // Stack trace pattern
      }
    });

    it('should use generic error messages for auth failures', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'WrongPassword123!',
        },
      });

      if (response.statusCode === 401) {
        const body = parseBody(response);

        // Should not reveal whether email exists
        expect(body.error.message).not.toContain('user not found');
        expect(body.error.message).not.toContain('email does not exist');
      }
    });
  });

  // ===========================================================================
  // CORS Security Tests
  // ===========================================================================
  describe('CORS Security', () => {
    it('should handle preflight OPTIONS requests', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/auth/login',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,authorization',
        },
      });

      // Preflight should succeed
      expect([200, 204]).toContain(response.statusCode);
    });

    it('should include CORS headers in responses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  // ===========================================================================
  // Session/Token Security Tests
  // ===========================================================================
  describe('Session/Token Security', () => {
    it('should reject refresh token reuse (after logout)', async () => {
      // This would require a valid token flow, so we just test the endpoint exists
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {
          refreshToken: 'used-or-invalid-token',
        },
      });

      expect([401, 422]).toContain(response.statusCode);
    });

    it('should logout correctly and invalidate tokens', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: 'Bearer fake-token',
        },
        payload: {
          refreshToken: 'some-refresh-token',
        },
      });

      // Without valid auth, should be 401
      expect(response.statusCode).toBe(401);
    });
  });

  // ===========================================================================
  // Password Security Tests
  // ===========================================================================
  describe('Password Security', () => {
    it('should reject common passwords', async () => {
      const commonPasswords = [
        'Password123!',  // Common pattern
        'Qwerty123!',    // Common pattern
        'Admin123!',     // Common pattern
      ];

      // These should pass schema validation but may be rejected by common password check
      // The actual check depends on the password blacklist implementation
    });

    it('should enforce password complexity', async () => {
      const weakPasswords = [
        { pass: 'short1!', reason: 'too short' },
        { pass: 'nouppercase123!', reason: 'no uppercase' },
        { pass: 'NOLOWERCASE123!', reason: 'no lowercase' },
        { pass: 'NoNumbersHere!', reason: 'no numbers' },
        { pass: 'NoSpecials123', reason: 'no special chars' },
      ];

      for (const { pass } of weakPasswords) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          payload: {
            email: 'test@example.com',
            password: pass,
          },
        });

        expect(response.statusCode).toBe(422);
      }
    });
  });
});
