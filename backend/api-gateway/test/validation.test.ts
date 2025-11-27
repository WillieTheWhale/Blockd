/**
 * Validation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  registerRequestSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
} from '../schemas/auth.schema.js';
import {
  createSessionRequestSchema,
  listSessionsQuerySchema,
} from '../schemas/session.schema.js';

describe('Validation Tests', () => {
  describe('Auth Schemas', () => {
    it('should validate valid registration data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
        role: 'interviewee' as const,
      };

      const result = registerRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'Password123!',
      };

      const result = registerRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject weak password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'weak',
      };

      const result = registerRequestSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should validate login data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const result = loginRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate refresh token request', () => {
      const validData = {
        refreshToken: 'valid-token-string',
      };

      const result = refreshTokenRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('Session Schemas', () => {
    it('should validate session creation', () => {
      const validData = {
        intervieweeEmail: 'interviewee@example.com',
        scheduledStart: new Date(),
      };

      const result = createSessionRequestSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should validate pagination parameters', () => {
      const validData = {
        page: '1',
        pageSize: '20',
        sortOrder: 'desc' as const,
      };

      const result = listSessionsQuerySchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.pageSize).toBe(20);
      }
    });

    it('should apply default pagination values', () => {
      const result = listSessionsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.pageSize).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });
  });
});
