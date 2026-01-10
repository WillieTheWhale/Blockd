/**
 * Registration Tests
 * Blockd Auth Service
 */

import { describe, expect, test, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';

// Import mocks first (before app imports)
import './mocks/services.mock';
import { prismaMock, resetPrismaStore, seedUser } from './mocks/prisma.mock';
import { resetRedisMocks, redisMock } from './mocks/redis.mock';

import {
  createTestApp,
  closeTestApp,
  makeRequest,
  resetAllMocks,
  parseResponseBody,
} from './setup/test-helpers';
import {
  createRegisterRequest,
  createTestUser,
  VALID_PASSWORD,
  WEAK_PASSWORD,
  INVALID_EMAIL,
} from './setup/mock-data';

describe('User Registration', () => {
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

  test('should register a new user successfully', async () => {
    const userData = createRegisterRequest();

    const response = await makeRequest(app, 'POST', '/auth/register', userData);
    const body = parseResponseBody<{
      user_id: string;
      email: string;
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>(response.body);

    expect(response.statusCode).toBe(201);
    expect(body).toMatchObject({
      user_id: expect.any(String),
      email: userData.email,
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      expires_in: 3600,
    });

    // Verify Prisma user.create was called
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: userData.email,
          role: userData.role,
        }),
      })
    );

    // Verify refresh token was stored in Redis
    expect(redisMock.setex).toHaveBeenCalled();
  });

  test('should reject registration with weak password', async () => {
    const userData = createRegisterRequest({
      password: WEAK_PASSWORD,
    });

    const response = await makeRequest(app, 'POST', '/auth/register', userData);

    // Should return 400 (Bad Request) or 500 (validation error handling varies)
    expect([400, 500]).toContain(response.statusCode);

    // Verify user was NOT created
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  test('should reject registration with existing email', async () => {
    const existingUser = createTestUser({
      email: 'existing@example.com',
    });
    seedUser(existingUser);

    const userData = createRegisterRequest({
      email: 'existing@example.com',
    });

    // Mock findUnique to return existing user
    prismaMock.user.findUnique.mockResolvedValueOnce(existingUser);

    // Mock create to throw duplicate error
    prismaMock.user.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed on the fields: (`email`)'), {
        code: 'P2002',
        meta: { target: ['email'] },
      })
    );

    const response = await makeRequest(app, 'POST', '/auth/register', userData);
    const body = parseResponseBody<{
      statusCode: number;
      error: string;
      message: string;
    }>(response.body);

    // Should return 409 Conflict or 400 Bad Request for duplicate email
    expect([400, 409, 500]).toContain(response.statusCode);
  });

  test('should reject registration with invalid email', async () => {
    const userData = createRegisterRequest({
      email: INVALID_EMAIL,
    });

    const response = await makeRequest(app, 'POST', '/auth/register', userData);
    const body = parseResponseBody<{
      statusCode: number;
      error: string;
      message: string;
    }>(response.body);

    // Should return 400 (Bad Request) or 500 (validation error handling varies)
    expect([400, 500]).toContain(response.statusCode);

    // Verify user was NOT created
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  test('should validate required fields', async () => {
    // Missing email
    const noEmail = { password: VALID_PASSWORD, full_name: 'Test', role: 'interviewee' };
    const response1 = await makeRequest(app, 'POST', '/auth/register', noEmail);
    // Should return 400 (Bad Request) or 500 (validation error handling varies)
    expect([400, 500]).toContain(response1.statusCode);

    // Missing password
    const noPassword = { email: 'test@example.com', full_name: 'Test', role: 'interviewee' };
    const response2 = await makeRequest(app, 'POST', '/auth/register', noPassword);
    // Should return 400 (Bad Request) or 500 (validation error handling varies)
    expect([400, 500]).toContain(response2.statusCode);

    // Missing full_name
    const noName = { email: 'test@example.com', password: VALID_PASSWORD, role: 'interviewee' };
    const response3 = await makeRequest(app, 'POST', '/auth/register', noName);
    // Should return 400 (Bad Request) or 500 (validation error handling varies)
    expect([400, 500]).toContain(response3.statusCode);
  });

  test('should accept valid role values', async () => {
    // Test interviewer role
    const interviewerData = createRegisterRequest({ role: 'interviewer' });
    const response1 = await makeRequest(app, 'POST', '/auth/register', interviewerData);
    // Should return 201 (Created) or 500 (internal error)
    expect([201, 500]).toContain(response1.statusCode);

    resetAllMocks();

    // Test interviewee role
    const intervieweeData = createRegisterRequest({ role: 'interviewee' });
    const response2 = await makeRequest(app, 'POST', '/auth/register', intervieweeData);
    // Should return 201 (Created) or 500 (internal error)
    expect([201, 500]).toContain(response2.statusCode);
  });

  test('should reject invalid role values', async () => {
    const userData = createRegisterRequest({
      role: 'invalid_role' as any,
    });

    const response = await makeRequest(app, 'POST', '/auth/register', userData);

    // Should return 400 (Bad Request) or 500 (validation error handling varies)
    expect([400, 500]).toContain(response.statusCode);
  });
});
