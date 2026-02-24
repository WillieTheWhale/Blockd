/**
 * User Profile Routes
 * Handles user profile retrieval and updates
 */

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimiter, strictRateLimiter } from '../middleware/rate-limit.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { sendSuccess } from '../lib/response';
import { NotFoundError, BadRequestError } from '../lib/errors';
import prisma from '../lib/prisma';
import {
  updateProfileRequestSchema,
  UpdateProfileRequest,
} from '../schemas/user.schema';

// =============================================================================
// User Response Type (excludes sensitive data)
// =============================================================================

interface UserProfileResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  role: string;
  organizationId: string | null;
  organization: {
    id: string;
    name: string;
  } | null;
  mfaEnabled: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Transform database user to safe profile response
 * Explicitly excludes sensitive fields like passwordHash, mfaSecret, etc.
 */
function toUserProfileResponse(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  organizationId: string | null;
  organization?: { id: string; name: string } | null;
  mfaEnabled: boolean;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): UserProfileResponse {
  // Build full name from first and last name
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: fullName,
    role: user.role,
    organizationId: user.organizationId,
    organization: user.organization
      ? { id: user.organization.id, name: user.organization.name }
      : null,
    mfaEnabled: user.mfaEnabled,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

// =============================================================================
// Routes
// =============================================================================

export default async function usersRoutes(fastify: FastifyInstance) {
  /**
   * GET /me - Get current user profile
   * Returns the authenticated user's profile information
   * Excludes sensitive data (password hash, MFA secret, backup codes)
   */
  fastify.get('/me', {
    preHandler: [authenticate, authRateLimiter],
    schema: {
      tags: ['Users'],
      summary: 'Get current user profile',
      description: 'Returns the authenticated user\'s profile information. Excludes sensitive authentication data.',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string', format: 'email' },
                firstName: { type: 'string', nullable: true },
                lastName: { type: 'string', nullable: true },
                name: { type: 'string' },
                role: { type: 'string', enum: ['admin', 'interviewer', 'interviewee'] },
                organizationId: { type: 'string', format: 'uuid', nullable: true },
                organization: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                  },
                },
                mfaEnabled: { type: 'boolean' },
                emailVerified: { type: 'boolean' },
                lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string' },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;

      // Fetch user with organization info
      // Explicitly select only safe fields (never select passwordHash, mfaSecret, mfaBackupCodes)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          mfaEnabled: true,
          emailVerified: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          // Explicitly NOT selecting:
          // - passwordHash
          // - mfaSecret
          // - mfaBackupCodes
        },
      });

      if (!user || user.deletedAt) {
        throw new NotFoundError('User not found');
      }

      const profileResponse = toUserProfileResponse(user);

      return sendSuccess(reply, profileResponse);
    },
  });

  /**
   * PUT /me - Update current user profile
   * Allows updating firstName, lastName, and email
   * Does NOT allow updating sensitive fields (password, MFA, role)
   */
  fastify.put<{ Body: UpdateProfileRequest }>('/me', {
    preHandler: [
      authenticate,
      strictRateLimiter, // Stricter rate limit for profile updates
      validateBody(updateProfileRequestSchema),
    ],
    schema: {
      tags: ['Users'],
      summary: 'Update current user profile',
      description: 'Updates the authenticated user\'s profile information. Only firstName, lastName, and email can be updated. Password and MFA changes must use their dedicated endpoints.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string', minLength: 1, maxLength: 100 },
          lastName: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: 'string', format: 'email', maxLength: 254 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                email: { type: 'string', format: 'email' },
                firstName: { type: 'string', nullable: true },
                lastName: { type: 'string', nullable: true },
                name: { type: 'string' },
                role: { type: 'string', enum: ['admin', 'interviewer', 'interviewee'] },
                organizationId: { type: 'string', format: 'uuid', nullable: true },
                organization: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                  },
                },
                mfaEnabled: { type: 'boolean' },
                emailVerified: { type: 'boolean' },
                lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string' },
                requestId: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;
      const { firstName, lastName, email } = request.body;

      // Verify user exists and is not deleted
      const existingUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, deletedAt: true },
      });

      if (!existingUser || existingUser.deletedAt) {
        throw new NotFoundError('User not found');
      }

      // If email is being changed, check for uniqueness
      if (email && email !== existingUser.email) {
        const emailExists = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });

        if (emailExists) {
          throw new BadRequestError('Email address is already in use');
        }

        // Log email change for security auditing
        request.log.info({
          security_event: 'email_change',
          user_id: userId,
          old_email_prefix: existingUser.email.substring(0, 3) + '***',
          new_email_prefix: email.substring(0, 3) + '***',
          ip: request.ip,
          user_agent: request.headers['user-agent']?.substring(0, 100),
        }, 'User email changed');
      }

      // Build update data (only include provided fields)
      const updateData: {
        firstName?: string;
        lastName?: string;
        email?: string;
        emailVerified?: boolean;
      } = {};

      if (firstName !== undefined) {
        updateData.firstName = firstName;
      }

      if (lastName !== undefined) {
        updateData.lastName = lastName;
      }

      if (email !== undefined && email !== existingUser.email) {
        updateData.email = email;
        // Reset email verification when email changes
        updateData.emailVerified = false;
      }

      // Update user profile
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          mfaEnabled: true,
          emailVerified: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          // Explicitly NOT selecting sensitive fields
        },
      });

      const profileResponse = toUserProfileResponse(updatedUser);

      return sendSuccess(reply, profileResponse);
    },
  });
}
