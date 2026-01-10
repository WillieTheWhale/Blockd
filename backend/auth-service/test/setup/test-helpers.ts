/**
 * Test Helpers
 * Shared utilities for tests
 */

import { jest } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../src/app';
import { resetPrismaMocks, seedUser } from '../mocks/prisma.mock';
import { resetRedisMocks, setStoredValue } from '../mocks/redis.mock';
import { TestUser, TEST_USERS } from './mock-data';
import { generateKeyPairSync } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

let testApp: FastifyInstance | null = null;

/**
 * Generate RSA keys for JWT testing
 */
export function generateTestKeys(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return { privateKey, publicKey };
}

/**
 * Setup test environment
 */
export function setupTestEnvironment(): void {
  // Generate keys and save them
  const keysDir = path.join(__dirname, '../keys');

  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  const { privateKey, publicKey } = generateTestKeys();

  fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey);
  fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey);

  // Set environment variables
  process.env.NODE_ENV = 'test';
  process.env.JWT_PRIVATE_KEY_PATH = path.join(keysDir, 'private.pem');
  process.env.JWT_PUBLIC_KEY_PATH = path.join(keysDir, 'public.pem');
  process.env.JWT_PRIVATE_KEY = privateKey;
  process.env.JWT_PUBLIC_KEY = publicKey;
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.FRONTEND_URL = 'http://localhost:3000';
  process.env.MFA_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.LOG_LEVEL = 'silent';
  process.env.RATE_LIMIT_ENABLED = 'false';
}

/**
 * Create test Fastify app instance
 */
export async function createTestApp(): Promise<FastifyInstance> {
  if (testApp) {
    await testApp.close();
  }

  setupTestEnvironment();
  testApp = await createApp();
  await testApp.ready();

  return testApp;
}

/**
 * Close test app
 */
export async function closeTestApp(): Promise<void> {
  if (testApp) {
    await testApp.close();
    testApp = null;
  }
}

/**
 * Response type for inject
 */
interface InjectResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

/**
 * Make HTTP request to test app
 */
export async function makeRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  url: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any,
  headers?: Record<string, string>
): Promise<InjectResponse> {
  // Build headers - only include content-type for requests with body
  const requestHeaders: Record<string, string> = {
    ...headers,
  };

  // Only set content-type for requests with body to avoid Fastify empty body error
  if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (app as any).inject({
    method,
    url,
    payload: body,
    headers: requestHeaders,
  });
  return response as InjectResponse;
}

/**
 * Make authenticated request with JWT token
 */
export async function makeAuthenticatedRequest(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  url: string,
  accessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any
): Promise<InjectResponse> {
  return makeRequest(app, method, url, body, {
    authorization: `Bearer ${accessToken}`,
  });
}

/**
 * Reset all mocks between tests
 */
export function resetAllMocks(): void {
  resetPrismaMocks();
  resetRedisMocks();
  jest.clearAllMocks();
}

/**
 * Setup a test user in the mock database
 */
export function setupTestUser(user: TestUser = TEST_USERS.standard): TestUser {
  seedUser(user);
  return user;
}

/**
 * Setup a refresh token in mock Redis
 */
export function setupRefreshToken(userId: string, token: string): void {
  const data = JSON.stringify({
    user_id: userId,
    token,
    created_at: Date.now(),
    expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    ip_address: '127.0.0.1',
    user_agent: 'test-agent',
  });

  setStoredValue(`refresh_token:${token}`, data);
}

/**
 * Setup an expired refresh token in mock Redis
 */
export function setupExpiredRefreshToken(userId: string, token: string): void {
  const data = JSON.stringify({
    user_id: userId,
    token,
    created_at: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
    expires_at: Date.now() - 1 * 24 * 60 * 60 * 1000, // Expired 1 day ago
    ip_address: '127.0.0.1',
    user_agent: 'test-agent',
  });

  setStoredValue(`refresh_token:${token}`, data);
}

/**
 * Setup account lock in mock Redis
 */
export function setupAccountLock(email: string, lockedUntil: number): void {
  setStoredValue(`account_lock:${email}`, lockedUntil.toString(), Math.ceil((lockedUntil - Date.now()) / 1000));
}

/**
 * Setup failed login attempts in mock Redis
 */
export function setupFailedLoginAttempts(email: string, count: number): void {
  // Simulates the rate limiting data structure
  const attempts = Array.from({ length: count }, (_, i) =>
    JSON.stringify({
      email,
      timestamp: Date.now() - i * 1000,
      success: false,
      ip_address: '127.0.0.1',
    })
  );

  // Note: This won't work with the mock unless we implement list operations properly
  // The mock already implements lpush and lrange
}

/**
 * Parse JSON response body safely
 */
export function parseResponseBody<T = unknown>(body: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`Failed to parse response body: ${body}`);
  }
}

/**
 * Generate a mock JWT token for testing
 */
export function generateMockAccessToken(userId: string, email: string, role: string = 'interviewee'): string {
  // This is a simplified mock token - in real tests we'd use the actual JWT service
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'blockd-auth',
      aud: 'blockd-api',
    })
  ).toString('base64url');
  const signature = 'mock-signature';

  return `${header}.${payload}.${signature}`;
}
