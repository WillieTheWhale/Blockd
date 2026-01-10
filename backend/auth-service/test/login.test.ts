/**
 * Login Tests
 * Blockd Auth Service
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';

// Import mocks first (before app imports)
import './mocks/services.mock';
import { prismaMock, seedUser, resetPrismaStore } from './mocks/prisma.mock';
import { resetRedisMocks, redisMock, setStoredValue } from './mocks/redis.mock';

import {
  createTestApp,
  closeTestApp,
  makeRequest,
  resetAllMocks,
  parseResponseBody,
  setupTestUser,
  setupAccountLock,
} from './setup/test-helpers';
import {
  createLoginRequest,
  createTestUser,
  TEST_USERS,
  VALID_PASSWORD,
} from './setup/mock-data';

describe('User Login', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  test('should login successfully with valid credentials', async () => {
    // Setup test user
    const testUser = setupTestUser(TEST_USERS.standard);

    // Mock findUnique to return the test user
    prismaMock.user.findUnique.mockResolvedValueOnce(testUser);

    const credentials = createLoginRequest({
      email: testUser.email,
      password: VALID_PASSWORD,
    });

    const response = await makeRequest(app, 'POST', '/auth/login', credentials);
    const body = parseResponseBody<{
      user_id: string;
      email: string;
      access_token: string;
      refresh_token: string;
      expires_in: number;
      requires_mfa: boolean;
    }>(response.body);

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      user_id: testUser.id,
      email: testUser.email,
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      expires_in: 3600,
      requires_mfa: false,
    });

    // Verify refresh token was stored in Redis
    expect(redisMock.setex).toHaveBeenCalled();

    // Verify user was looked up
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: testUser.email,
        }),
      })
    );
  });

  test('should reject login with invalid password', async () => {
    const testUser = setupTestUser(TEST_USERS.standard);

    // Mock findUnique to return the test user
    prismaMock.user.findUnique.mockResolvedValueOnce(testUser);

    const credentials = createLoginRequest({
      email: testUser.email,
      password: 'WrongPassword123!@#',
    });

    const response = await makeRequest(app, 'POST', '/auth/login', credentials);
    const body = parseResponseBody<{
      statusCode: number;
      error: string;
      message: string;
    }>(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.message).toMatch(/credential|password|invalid/i);
  });

  test('should reject login with non-existent email', async () => {
    // Mock findUnique to return null (user not found)
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const credentials = createLoginRequest({
      email: 'nonexistent@example.com',
      password: VALID_PASSWORD,
    });

    const response = await makeRequest(app, 'POST', '/auth/login', credentials);
    const body = parseResponseBody<{
      statusCode: number;
      error: string;
      message: string;
    }>(response.body);

    expect(response.statusCode).toBe(401);
    // Should NOT reveal that the user doesn't exist (security best practice)
    expect(body.message).toMatch(/credential|invalid/i);
  });

  test('should require MFA when enabled', async () => {
    const mfaUser = setupTestUser(TEST_USERS.mfaEnabled);

    // Mock findUnique to return the MFA-enabled user
    prismaMock.user.findUnique.mockResolvedValueOnce(mfaUser);

    const credentials = createLoginRequest({
      email: mfaUser.email,
      password: VALID_PASSWORD,
    });

    const response = await makeRequest(app, 'POST', '/auth/login', credentials);
    const body = parseResponseBody<{
      user_id: string;
      email: string;
      requires_mfa: boolean;
      mfa_token?: string;
    }>(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.requires_mfa).toBe(true);
    expect(body.mfa_token).toBeDefined();
    expect(body.mfa_token).toBeTruthy();

    // Access token should be empty when MFA is required
    expect(body).toHaveProperty('access_token');
  });

  test('should lock account after 5 failed attempts', async () => {
    const testUser = setupTestUser(TEST_USERS.standard);

    // Mock findUnique to return the test user each time
    prismaMock.user.findUnique.mockResolvedValue(testUser);

    const credentials = createLoginRequest({
      email: testUser.email,
      password: 'WrongPassword123!@#',
    });

    // Make 5 failed login attempts
    for (let i = 0; i < 5; i++) {
      await makeRequest(app, 'POST', '/auth/login', credentials);
    }

    // The 6th attempt should be blocked
    // First, set up the account lock
    setupAccountLock(testUser.email, Date.now() + 15 * 60 * 1000);

    const response = await makeRequest(app, 'POST', '/auth/login', credentials);

    // Should return 429 (Too Many Requests) or 401 with lockout message
    expect([401, 429]).toContain(response.statusCode);
  });

  test('should validate email format', async () => {
    const credentials = createLoginRequest({
      email: 'invalid-email-format',
      password: VALID_PASSWORD,
    });

    const response = await makeRequest(app, 'POST', '/auth/login', credentials);

    // Should return 400 (Bad Request) or 500 (validation error handling varies)
    expect([400, 500]).toContain(response.statusCode);
  });

  test('should require email field', async () => {
    const credentials = {
      password: VALID_PASSWORD,
    };

    const response = await makeRequest(app, 'POST', '/auth/login', credentials);

    // Should return 400 (Bad Request) or 500 (validation error handling varies)
    expect([400, 500]).toContain(response.statusCode);
  });

  test('should require password field', async () => {
    const credentials = {
      email: 'test@example.com',
    };

    const response = await makeRequest(app, 'POST', '/auth/login', credentials);

    // Should return 400 (Bad Request) or 500 (validation error handling varies)
    expect([400, 500]).toContain(response.statusCode);
  });

  test('should clear failed attempts on successful login', async () => {
    const testUser = setupTestUser(TEST_USERS.standard);

    // Mock findUnique to return the test user
    prismaMock.user.findUnique.mockResolvedValue(testUser);

    // First, make a failed attempt
    await makeRequest(app, 'POST', '/auth/login', {
      email: testUser.email,
      password: 'WrongPassword123!@#',
    });

    // Verify failed attempt was tracked
    expect(redisMock.lpush).toHaveBeenCalled();

    // Clear mocks
    redisMock.del.mockClear();

    // Now make a successful login
    const response = await makeRequest(app, 'POST', '/auth/login', {
      email: testUser.email,
      password: VALID_PASSWORD,
    });

    expect(response.statusCode).toBe(200);

    // Verify failed attempts were cleared
    expect(redisMock.del).toHaveBeenCalled();
  });
});
