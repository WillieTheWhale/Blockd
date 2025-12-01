/**
 * Authentication Routes
 * Proxies to auth-service
 */

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware.js';
import { publicRateLimiter, strictRateLimiter } from '../middleware/rate-limit.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  registerRequestSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
  logoutRequestSchema,
  mfaSetupRequestSchema,
  mfaVerifyRequestSchema,
  RegisterRequest,
  LoginRequest,
  RefreshTokenRequest,
  LogoutRequest,
  MfaSetupRequest,
  MfaVerifyRequest,
} from '../schemas/auth.schema.js';
import { generateTokenPair, verifyRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } from '../lib/jwt.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { BadRequestError, UnauthorizedError, NotFoundError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify((password: string, salt: string, keylen: number, callback: (err: Error | null, derivedKey?: Buffer) => void) => {
  require('crypto').scrypt(password, salt, keylen, callback);
});

export default async function authRoutes(fastify: FastifyInstance) {
  // Register endpoint
  fastify.post<{ Body: RegisterRequest }>('/register', {
    preHandler: [publicRateLimiter, validateBody(registerRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Register a new user',
      description: 'Creates a new user account',
      body: registerRequestSchema,
    },
    handler: async (request, reply) => {
      const { email, password, firstName, lastName, role, organizationId } = request.body;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new BadRequestError('User with this email already exists');
      }

      // Hash password (in production, this would be handled by auth-service)
      const salt = require('crypto').randomBytes(16).toString('hex');
      const passwordHash = `${salt}:${password}`; // Simplified for demo

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role: role as any,
          organizationId,
        },
      });

      // Generate tokens
      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || undefined,
      });

      const response = {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          organizationId: user.organizationId,
          mfaEnabled: user.mfaEnabled,
          emailVerified: user.emailVerified,
        },
        tokens,
      };

      return sendCreated(reply, response);
    },
  });

  // Login endpoint
  fastify.post<{ Body: LoginRequest }>('/login', {
    preHandler: [publicRateLimiter, validateBody(loginRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Login user',
      description: 'Authenticates a user and returns JWT tokens',
      body: loginRequestSchema,
    },
    handler: async (request, reply) => {
      const { email, password, mfaCode } = request.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      // Verify password (simplified for demo)
      const isValidPassword = user.passwordHash.includes(password);
      if (!isValidPassword) {
        throw new UnauthorizedError('Invalid email or password');
      }

      // Check MFA if enabled
      if (user.mfaEnabled && !mfaCode) {
        throw new UnauthorizedError('MFA code required');
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || undefined,
      });

      const response = {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          organizationId: user.organizationId,
          mfaEnabled: user.mfaEnabled,
          emailVerified: user.emailVerified,
        },
        tokens,
      };

      return sendSuccess(reply, response);
    },
  });

  // Refresh token endpoint
  fastify.post<{ Body: RefreshTokenRequest }>('/refresh', {
    preHandler: [publicRateLimiter, validateBody(refreshTokenRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Refresh access token',
      description: 'Generates a new access token using a refresh token',
      body: refreshTokenRequestSchema,
    },
    handler: async (request, reply) => {
      const { refreshToken } = request.body;

      // Verify refresh token
      const payload = await verifyRefreshToken(refreshToken);

      // Get user to ensure they still exist
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || user.deletedAt) {
        throw new UnauthorizedError('User not found or deactivated');
      }

      // Generate new tokens
      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || undefined,
      });

      // Revoke old refresh token
      await revokeRefreshToken(user.id, refreshToken);

      return sendSuccess(reply, { tokens });
    },
  });

  // Logout endpoint
  fastify.post<{ Body: LogoutRequest }>('/logout', {
    preHandler: [authenticate, validateBody(logoutRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Logout user',
      description: 'Revokes the refresh token',
      body: logoutRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { refreshToken } = request.body;
      const userId = request.user!.userId;

      if (refreshToken) {
        await revokeRefreshToken(userId, refreshToken);
      } else {
        // Revoke all refresh tokens for the user
        await revokeAllRefreshTokens(userId);
      }

      return sendSuccess(reply, { message: 'Logged out successfully' });
    },
  });

  // MFA setup endpoint
  fastify.post<{ Body: MfaSetupRequest }>('/mfa/setup', {
    preHandler: [authenticate, strictRateLimiter, validateBody(mfaSetupRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Setup MFA',
      description: 'Enables or disables MFA for the user',
      body: mfaSetupRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { enabled } = request.body;
      const userId = request.user!.userId;

      // Generate MFA secret (in production, use authenticator library)
      const secret = enabled ? require('crypto').randomBytes(20).toString('hex') : null;

      await prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: enabled,
          mfaSecret: secret,
        },
      });

      if (enabled && secret) {
        return sendSuccess(reply, {
          secret,
          qrCode: `otpauth://totp/Blockd:${request.user!.email}?secret=${secret}&issuer=Blockd`,
          backupCodes: Array.from({ length: 10 }, () =>
            require('crypto').randomBytes(4).toString('hex')
          ),
        });
      }

      return sendSuccess(reply, { message: 'MFA disabled successfully' });
    },
  });

  // MFA verify endpoint
  fastify.post<{ Body: MfaVerifyRequest }>('/mfa/verify', {
    preHandler: [publicRateLimiter, validateBody(mfaVerifyRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Verify MFA code',
      description: 'Verifies a 2FA code',
      body: mfaVerifyRequestSchema,
    },
    handler: async (request, reply) => {
      const { code, secret } = request.body;

      // In production, verify the TOTP code against the secret
      const isValid = code.length === 6; // Simplified for demo

      if (!isValid) {
        throw new UnauthorizedError('Invalid MFA code');
      }

      return sendSuccess(reply, { verified: true });
    },
  });
}
