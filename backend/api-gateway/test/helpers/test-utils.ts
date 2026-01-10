/**
 * Test Utilities and Helpers
 * Provides common test functions for integration testing
 */

import { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { createApp } from '../../src/app';

/**
 * Test user credentials
 */
export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken?: string;
  refreshToken?: string;
}

/**
 * Test session data
 */
export interface TestSession {
  id: string;
  sessionToken: string;
  interviewerId: string;
  intervieweeId: string;
}

/**
 * Create a configured app instance for testing
 */
export async function createTestApp(): Promise<FastifyInstance> {
  return await createApp();
}

/**
 * Generate a valid JWT for testing (mock)
 */
export function generateMockJwt(userId: string, role = 'interviewer'): string {
  // In tests, this would use the same JWT secret as the app
  // For now, return a placeholder that matches expected format
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    userId,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');

  return `${header}.${payload}.mock-signature`;
}

/**
 * Make authenticated request helper
 */
export async function authenticatedRequest(
  app: FastifyInstance,
  options: InjectOptions,
  token: string
): Promise<LightMyRequestResponse> {
  return app.inject({
    ...options,
    headers: {
      ...options.headers,
      authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Generate a random UUID for testing
 */
export function generateTestUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate test email
 */
export function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Generate valid password for testing
 */
export function generateTestPassword(): string {
  return 'TestPassword123!';
}

/**
 * Wait for a specified duration
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Assert response is successful
 */
export function assertSuccess(response: LightMyRequestResponse): void {
  const body = JSON.parse(response.body);
  if (!body.success) {
    throw new Error(`Expected success but got error: ${JSON.stringify(body.error)}`);
  }
}

/**
 * Assert response is an error with specific code
 */
export function assertError(
  response: LightMyRequestResponse,
  expectedCode: string,
  expectedStatus?: number
): void {
  const body = JSON.parse(response.body);
  if (body.success) {
    throw new Error(`Expected error ${expectedCode} but got success`);
  }
  if (body.error.code !== expectedCode) {
    throw new Error(`Expected error code ${expectedCode} but got ${body.error.code}`);
  }
  if (expectedStatus && response.statusCode !== expectedStatus) {
    throw new Error(`Expected status ${expectedStatus} but got ${response.statusCode}`);
  }
}

/**
 * Create mock security event data
 */
export function createMockSecurityEvent(sessionId: string) {
  return {
    sessionId,
    eventType: 'suspicious_process',
    severity: 'medium',
    description: 'Test security event',
    metadata: {
      processName: 'test.exe',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Create mock telemetry data
 */
export function createMockTelemetryData(sessionId: string, count = 1) {
  return Array(count).fill(null).map((_, i) => ({
    sessionId,
    timestamp: new Date(Date.now() - i * 1000).toISOString(),
    cpuPercent: Math.random() * 100,
    memoryMb: Math.floor(Math.random() * 8192),
    activeProcesses: [],
    windowTitle: 'Test Window',
    browserTabsCount: Math.floor(Math.random() * 10),
    networkRequests: [],
    metadata: {},
  }));
}

/**
 * Create mock gaze data
 */
export function createMockGazeMessage(sessionId: string, sessionToken: string) {
  return {
    type: 'gaze',
    sessionToken,
    sessionId,
    timestamp: Date.now(),
    gazeX: Math.random(),
    gazeY: Math.random(),
    isOffScreen: false,
    confidence: 0.95,
  };
}

/**
 * Parse JSON body helper
 */
export function parseBody<T = Record<string, unknown>>(response: LightMyRequestResponse): T {
  return JSON.parse(response.body) as T;
}

/**
 * Test fixtures for common scenarios
 */
export const fixtures = {
  validUuid: '550e8400-e29b-41d4-a716-446655440000',
  invalidUuid: 'not-a-uuid',
  validEmail: 'test@example.com',
  invalidEmail: 'not-an-email',
  validPassword: 'SecurePassword123!',
  weakPassword: 'weak',
  validSessionToken: 'valid-session-token-12345',
};

/**
 * Clean up test data after tests
 */
export async function cleanupTestData(
  _app: FastifyInstance,
  _ids: { users?: string[]; sessions?: string[] }
): Promise<void> {
  // In real integration tests, this would delete test data from the database
  // For now, this is a placeholder
}
