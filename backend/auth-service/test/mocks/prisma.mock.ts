/**
 * Prisma Client Mock
 * In-memory mock for Prisma database operations
 */

import { jest } from '@jest/globals';

type MockFn = ReturnType<typeof jest.fn>;
import { randomUUID } from 'crypto';
import { TestUser } from '../setup/mock-data';

// In-memory data store
const users = new Map<string, TestUser>();

/**
 * Reset the in-memory store
 */
export function resetPrismaStore(): void {
  users.clear();
}

/**
 * Seed a user into the store for testing
 */
export function seedUser(user: TestUser): void {
  users.set(user.id, user);
}

/**
 * Get a user from the store (for test assertions)
 */
export function getStoredUser(id: string): TestUser | undefined {
  return users.get(id);
}

/**
 * Get all users in the store
 */
export function getAllStoredUsers(): TestUser[] {
  return Array.from(users.values());
}

/**
 * Prisma User model mock
 */
export const userMock = {
  create: jest.fn(async ({ data }: { data: any }) => {
    const id = randomUUID();
    const now = new Date();
    const user: TestUser = {
      id,
      email: data.email,
      passwordHash: data.passwordHash,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      role: data.role || 'interviewee',
      organizationId: data.organizationId || null,
      mfaEnabled: data.mfaEnabled || false,
      mfaSecret: data.mfaSecret || null,
      emailVerified: data.emailVerified || false,
      lastLoginAt: data.lastLoginAt || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    users.set(id, user);
    return user;
  }),

  findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
    if (where.id) {
      const user = users.get(where.id);
      return user && !user.deletedAt ? user : null;
    }
    if (where.email) {
      const user = Array.from(users.values()).find(
        (u) => u.email === where.email && !u.deletedAt
      );
      return user || null;
    }
    return null;
  }),

  findFirst: jest.fn(async ({ where }: { where: any }) => {
    if (where.email) {
      const user = Array.from(users.values()).find(
        (u) => u.email === where.email && !u.deletedAt
      );
      return user || null;
    }
    return null;
  }),

  update: jest.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
    const user = users.get(where.id);
    if (!user) {
      throw new Error(`User with id ${where.id} not found`);
    }
    const updatedUser = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };
    users.set(where.id, updatedUser);
    return updatedUser;
  }),

  delete: jest.fn(async ({ where }: { where: { id: string } }) => {
    const user = users.get(where.id);
    if (!user) {
      throw new Error(`User with id ${where.id} not found`);
    }
    users.delete(where.id);
    return user;
  }),

  count: jest.fn(async ({ where }: { where?: any } = {}) => {
    if (!where) {
      return users.size;
    }
    // Basic where clause handling
    let count = 0;
    for (const user of users.values()) {
      if (user.deletedAt) continue;
      let matches = true;
      if (where.email && user.email !== where.email) matches = false;
      if (where.role && user.role !== where.role) matches = false;
      if (matches) count++;
    }
    return count;
  }),
};

/**
 * Main Prisma Client mock
 */
export const prismaMock = {
  user: userMock,
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $transaction: jest.fn(async (fn: (prisma: any) => Promise<any>) => {
    return await fn(prismaMock);
  }),
};

/**
 * Reset all Prisma mocks
 */
export function resetPrismaMocks(): void {
  resetPrismaStore();
  Object.values(userMock).forEach((mock) => {
    if (typeof mock === 'function' && 'mockClear' in mock) {
      (mock as MockFn).mockClear();
    }
  });
  prismaMock.$connect.mockClear();
  prismaMock.$disconnect.mockClear();
  prismaMock.$transaction.mockClear();
}
