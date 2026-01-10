/**
 * Test Data and Factory Functions
 * Blockd Auth Service
 */

import { randomUUID } from 'crypto';

// User roles
export type UserRole = 'admin' | 'interviewer' | 'interviewee';

// Test user data
export interface TestUser {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  organizationId: string | null;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// Constants
export const VALID_PASSWORD = 'SecurePass123!@#';
export const WEAK_PASSWORD = 'weak';
export const INVALID_EMAIL = 'invalid-email';
export const TEST_ORG_ID = '12345678-1234-1234-1234-123456789abc';

// Pre-hashed password for VALID_PASSWORD using bcrypt
// In tests, we'll mock the password verification
export const HASHED_PASSWORD = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4/JNwWjwBuKGJOuu';

/**
 * Create test user data
 */
export function createTestUser(overrides: Partial<TestUser> = {}): TestUser {
  const id = overrides.id || randomUUID();
  const now = new Date();

  return {
    id,
    email: `test-${id.substring(0, 8)}@example.com`,
    passwordHash: HASHED_PASSWORD,
    firstName: 'Test',
    lastName: 'User',
    role: 'interviewee',
    organizationId: null,
    mfaEnabled: false,
    mfaSecret: null,
    emailVerified: false,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * Create registration request data
 */
export function createRegisterRequest(overrides: Record<string, unknown> = {}) {
  return {
    email: `test-${randomUUID().substring(0, 8)}@example.com`,
    password: VALID_PASSWORD,
    full_name: 'Test User',
    role: 'interviewee' as UserRole,
    ...overrides,
  };
}

/**
 * Create login request data
 */
export function createLoginRequest(overrides: Record<string, unknown> = {}) {
  return {
    email: 'test@example.com',
    password: VALID_PASSWORD,
    ...overrides,
  };
}

/**
 * Create refresh token request data
 */
export function createRefreshTokenRequest(refreshToken: string) {
  return {
    refresh_token: refreshToken,
  };
}

/**
 * Create MFA setup request
 */
export function createMFASetupRequest() {
  return {};
}

/**
 * Create MFA verify request
 */
export function createMFAVerifyRequest(secret: string, backupCodes: string[], code: string) {
  return {
    secret,
    backup_codes: backupCodes,
    code,
  };
}

/**
 * Create MFA login verify request
 */
export function createMFALoginVerifyRequest(mfaToken: string, code: string) {
  return {
    mfa_token: mfaToken,
    code,
  };
}

/**
 * Sample test users for specific scenarios
 */
export const TEST_USERS = {
  standard: createTestUser({
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
  }),

  mfaEnabled: createTestUser({
    id: '22222222-2222-2222-2222-222222222222',
    email: 'mfa-user@example.com',
    firstName: 'MFA',
    lastName: 'User',
    mfaEnabled: true,
    mfaSecret: 'encrypted-secret-here',
  }),

  admin: createTestUser({
    id: '33333333-3333-3333-3333-333333333333',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
  }),

  interviewer: createTestUser({
    id: '44444444-4444-4444-4444-444444444444',
    email: 'interviewer@example.com',
    firstName: 'Interviewer',
    lastName: 'User',
    role: 'interviewer',
    organizationId: TEST_ORG_ID,
  }),

  verified: createTestUser({
    id: '55555555-5555-5555-5555-555555555555',
    email: 'verified@example.com',
    firstName: 'Verified',
    lastName: 'User',
    emailVerified: true,
  }),
};
