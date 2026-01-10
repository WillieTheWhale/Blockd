/**
 * User Service
 * Handles user CRUD operations
 * Blockd Auth Service
 */

import { User, UserRole as PrismaUserRole } from '@prisma/client';
import { CreateUserData, UpdateUserData, UserProfile, UserWithPassword } from '../types/user.types';
import { NotFoundError, EmailAlreadyExistsError } from '../lib/errors';
import { prisma, disconnectPrisma } from '../lib/database';

/**
 * Create a new user
 */
export async function createUser(data: CreateUserData): Promise<UserProfile> {
  // Check if email already exists
  const existing = await getUserByEmail(data.email);
  if (existing) {
    throw new EmailAlreadyExistsError();
  }

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash: data.password_hash,
      role: data.role as PrismaUserRole,
      organizationId: data.organization_id,
      firstName: data.first_name,
      lastName: data.last_name
    }
  });

  return mapUserToProfile(user);
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null }
  });

  return user ? mapUserToProfile(user) : null;
}

/**
 * Get user by ID (with password hash)
 */
export async function getUserByIdWithPassword(userId: string): Promise<UserWithPassword | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null }
  });

  return user ? mapUserWithPassword(user) : null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const user = await prisma.user.findUnique({
    where: { email, deletedAt: null }
  });

  return user ? mapUserToProfile(user) : null;
}

/**
 * Get user by email (with password hash)
 */
export async function getUserByEmailWithPassword(email: string): Promise<UserWithPassword | null> {
  const user = await prisma.user.findUnique({
    where: { email, deletedAt: null }
  });

  return user ? mapUserWithPassword(user) : null;
}

/**
 * Update user
 */
export async function updateUser(userId: string, data: UpdateUserData): Promise<UserProfile> {
  // If email is being updated, check for conflicts
  if (data.email) {
    const existing = await getUserByEmail(data.email);
    if (existing && existing.id !== userId) {
      throw new EmailAlreadyExistsError();
    }
  }

  const user = await prisma.user.update({
    where: { id: userId, deletedAt: null },
    data: {
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      role: data.role as PrismaUserRole,
      organizationId: data.organization_id
    }
  });

  return mapUserToProfile(user);
}

/**
 * Update user password
 */
export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId, deletedAt: null },
    data: { passwordHash }
  });
}

/**
 * Update user MFA settings
 */
export async function updateUserMFA(
  userId: string,
  mfaEnabled: boolean,
  mfaSecret?: string
): Promise<void> {
  await prisma.user.update({
    where: { id: userId, deletedAt: null },
    data: {
      mfaEnabled,
      mfaSecret: mfaSecret || null
    }
  });
}

/**
 * Mark email as verified
 */
export async function markEmailVerified(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId, deletedAt: null },
    data: { emailVerified: true }
  });
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId, deletedAt: null },
    data: { lastLoginAt: new Date() }
  });
}

/**
 * Delete user (soft delete)
 */
export async function deleteUser(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() }
  });
}

/**
 * Get users by organization
 */
export async function getUsersByOrganization(organizationId: string): Promise<UserProfile[]> {
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      deletedAt: null
    },
    orderBy: { createdAt: 'desc' }
  });

  return users.map(mapUserToProfile);
}

/**
 * Get users by role
 */
export async function getUsersByRole(role: string): Promise<UserProfile[]> {
  const users = await prisma.user.findMany({
    where: {
      role: role as PrismaUserRole,
      deletedAt: null
    },
    orderBy: { createdAt: 'desc' }
  });

  return users.map(mapUserToProfile);
}

/**
 * Map Prisma User to UserProfile
 */
function mapUserToProfile(user: User): UserProfile {
  const firstName = user.firstName || '';
  const lastName = user.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;

  return {
    id: user.id,
    email: user.email,
    role: user.role as 'admin' | 'interviewer' | 'interviewee',
    organization_id: user.organizationId,
    first_name: user.firstName,
    last_name: user.lastName,
    full_name: fullName,
    avatar_url: (user as any).avatarUrl || null,
    mfa_enabled: user.mfaEnabled,
    email_verified: user.emailVerified,
    last_login_at: user.lastLoginAt,
    created_at: user.createdAt,
    updated_at: user.updatedAt
  };
}

/**
 * Map Prisma User to UserWithPassword
 */
function mapUserWithPassword(user: User): UserWithPassword {
  return {
    ...mapUserToProfile(user),
    password_hash: user.passwordHash
  };
}

/**
 * Close Prisma connection
 */
export async function disconnectDatabase(): Promise<void> {
  await disconnectPrisma();
}
