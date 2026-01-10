/**
 * Test Setup and Teardown
 * Global test configuration and cleanup
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

// Environment setup for tests
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent'; // Suppress logs during tests

  // Set default test configuration
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-testing-only';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/blockd_test';
});

// Cleanup after each test
afterEach(async () => {
  // Reset any mocks if needed
});

// Global cleanup
afterAll(async () => {
  // Close any open connections
});

/**
 * Mock external services for isolated testing
 */
export const mockServices = {
  /**
   * Mock Redis client
   */
  redis: {
    get: async (_key: string) => null,
    set: async (_key: string, _value: string) => 'OK',
    del: async (_key: string) => 1,
    incr: async (_key: string) => 1,
    expire: async (_key: string, _seconds: number) => 1,
  },

  /**
   * Mock database responses
   */
  database: {
    user: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'interviewer',
      organizationId: '550e8400-e29b-41d4-a716-446655440001',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      sessionToken: 'test-session-token',
      status: 'active',
      interviewerId: '550e8400-e29b-41d4-a716-446655440000',
      intervieweeId: '550e8400-e29b-41d4-a716-446655440003',
    },
  },
};

/**
 * Test timeout configuration
 */
export const testTimeouts = {
  unit: 5000,
  integration: 10000,
  e2e: 30000,
};

/**
 * Skip tests if required services are unavailable
 */
export function skipIfNoDatabase(): void {
  if (!process.env.DATABASE_URL) {
    console.warn('Skipping test: DATABASE_URL not set');
    return;
  }
}

export function skipIfNoRedis(): void {
  if (!process.env.REDIS_URL) {
    console.warn('Skipping test: REDIS_URL not set');
    return;
  }
}
