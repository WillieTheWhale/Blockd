/**
 * Service Mocks Setup
 * Configures Jest mocks for external dependencies
 */

import { jest } from '@jest/globals';
import { prismaMock } from './prisma.mock';
import { RedisMockConstructor } from './redis.mock';

// Mock @prisma/client before any imports
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => prismaMock),
    Prisma: {
      PrismaClientKnownRequestError: class extends Error {
        code: string;
        constructor(message: string, { code }: { code: string }) {
          super(message);
          this.code = code;
        }
      },
    },
  };
});

// Mock ioredis
jest.mock('ioredis', () => {
  return RedisMockConstructor;
});

// Mock email service
jest.mock('../../lib/email', () => ({
  sendVerificationEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  sendMFAEnabledEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  sendMFADisabledEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  sendMFASetupEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
}));

// Mock bcrypt for faster tests (password hashing is slow)
jest.mock('bcrypt', () => ({
  hash: jest.fn<() => Promise<string>>().mockResolvedValue('$2b$12$mockedHashValue'),
  compare: jest.fn<(password: unknown, hash: unknown) => Promise<boolean>>().mockImplementation(
    async (password: unknown) => {
      // For tests, check if password matches expected test password
      const VALID_PASSWORD = 'SecurePass123!@#';
      return password === VALID_PASSWORD;
    }
  ),
  genSalt: jest.fn<() => Promise<string>>().mockResolvedValue('$2b$12$mockedSaltValue'),
}));

// Mock JWT service to avoid key loading issues
const mockGenerateAccessToken = jest.fn<() => string>().mockReturnValue('mock-access-token-12345');
const mockGenerateMFAToken = jest.fn<() => string>().mockReturnValue('mock-mfa-token-67890');
const mockVerifyToken = jest.fn<() => { sub: string; email: string; role: string }>().mockReturnValue({
  sub: 'user-123',
  email: 'test@example.com',
  role: 'interviewee',
});
const mockVerifyMFAToken = jest.fn<() => { email: string }>().mockReturnValue({
  email: 'test@example.com',
});

jest.mock('../../services/jwt.service', () => ({
  generateAccessToken: mockGenerateAccessToken,
  generateMFAToken: mockGenerateMFAToken,
  verifyToken: mockVerifyToken,
  verifyMFAToken: mockVerifyMFAToken,
}));

// Export mocked modules for test use
export { prismaMock } from './prisma.mock';
export { redisMock, resetRedisStore, setStoredValue, getStoredValue } from './redis.mock';
export { resetPrismaStore, seedUser, getStoredUser } from './prisma.mock';

// Email mock exports for assertions
export const emailMocks = {
  sendVerificationEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  sendMFAEnabledEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  sendMFADisabledEmail: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
};

// Bcrypt mock exports for assertions
export const bcryptMocks = {
  hash: jest.fn<() => Promise<string>>().mockResolvedValue('$2b$12$mockedHashValue'),
  compare: jest.fn<(password: unknown) => Promise<boolean>>().mockImplementation(
    async (password: unknown) => {
      const VALID_PASSWORD = 'SecurePass123!@#';
      return password === VALID_PASSWORD;
    }
  ),
};
