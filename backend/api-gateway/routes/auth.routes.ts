/**
 * Authentication Routes
 * Handles user registration, login, and MFA
 */

import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import { authenticate } from '../middleware/auth.middleware';
import {
  publicRateLimiter,
  strictRateLimiter,
  loginRateLimiter,
  mfaRateLimiter,
  recordMfaSuccess,
  recordMfaFailure,
} from '../middleware/rate-limit.middleware';
import { validateBody } from '../middleware/validation.middleware';
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
} from '../schemas/auth.schema';
import { generateTokenPair, verifyRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } from '../lib/jwt';
import { sendSuccess, sendCreated } from '../lib/response';
import { BadRequestError, UnauthorizedError } from '../lib/errors';
import prisma from '../lib/prisma';
import { hashPassword, verifyPassword, validatePasswordStrength, isCommonPassword } from '../lib/password';
import { generateMFASecret, verifyTOTPCode, generateBackupCodes, isValidTOTPFormat, isValidBackupCodeFormat } from '../lib/mfa';

/**
 * Mask email address for secure logging
 * Preserves domain for analysis while protecting user identity
 * Example: "john.doe@company.com" -> "joh***@company.com"
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return '***';

  const localPart = email.substring(0, atIndex);
  const domain = email.substring(atIndex);

  if (localPart.length <= 3) {
    return `${'*'.repeat(localPart.length)}${domain}`;
  }

  return `${localPart.substring(0, 3)}***${domain}`;
}

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

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        throw new BadRequestError(`Password requirements not met: ${passwordValidation.errors.join(', ')}`);
      }

      // Check if password is too common
      if (isCommonPassword(password)) {
        throw new BadRequestError('Password is too common. Please choose a stronger password.');
      }

      // Hash password using bcrypt
      const passwordHash = await hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
          role: role as UserRole,
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
    preHandler: [loginRateLimiter, validateBody(loginRequestSchema)],
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
        // Record failed attempt for rate limiting
        await recordMfaFailure(request.ip);

        // Log security event for monitoring/alerting
        // Mask email to protect privacy while preserving domain for analysis
        const maskedEmail = maskEmail(email);
        request.log.warn({
          security_event: 'authentication_failure',
          reason: 'user_not_found',
          email_masked: maskedEmail,
          ip: request.ip,
          user_agent: request.headers['user-agent']?.substring(0, 100),
          timestamp: new Date().toISOString(),
        }, 'Failed login attempt: user not found');

        throw new UnauthorizedError('Invalid email or password');
      }

      // Verify password using bcrypt
      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        // Record failed attempt for rate limiting
        await recordMfaFailure(user.id);

        // Log security event for monitoring/alerting
        request.log.warn({
          security_event: 'authentication_failure',
          reason: 'invalid_password',
          user_id: user.id,
          email_prefix: email.substring(0, 3) + '***',
          ip: request.ip,
          user_agent: request.headers['user-agent']?.substring(0, 100),
          timestamp: new Date().toISOString(),
        }, 'Failed login attempt: invalid password');

        throw new UnauthorizedError('Invalid email or password');
      }

      // Check MFA if enabled
      if (user.mfaEnabled) {
        if (!mfaCode) {
          // Return indicator that MFA is required
          return sendSuccess(reply, {
            requiresMfa: true,
            message: 'MFA code required',
          });
        }

        // Verify MFA code using speakeasy
        if (!user.mfaSecret) {
          throw new UnauthorizedError('MFA configuration error');
        }

        const isValidMfa = verifyTOTPCode(user.mfaSecret, mfaCode);
        if (!isValidMfa) {
          // Record failed MFA attempt
          await recordMfaFailure(user.id);

          // Log security event for monitoring/alerting
          request.log.warn({
            security_event: 'mfa_failure',
            reason: 'invalid_mfa_code',
            user_id: user.id,
            ip: request.ip,
            user_agent: request.headers['user-agent']?.substring(0, 100),
            timestamp: new Date().toISOString(),
          }, 'Failed MFA verification attempt');

          throw new UnauthorizedError('Invalid MFA code');
        }

        // MFA success - clear failure count
        await recordMfaSuccess(user.id);
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

      // Clear any login failure tracking on successful login
      await recordMfaSuccess(user.id);

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
      const userEmail = request.user!.email;

      if (enabled) {
        // Generate proper MFA secret using speakeasy
        const mfaData = await generateMFASecret(userEmail);

        // Store the secret (in production, you might want to encrypt this)
        await prisma.user.update({
          where: { id: userId },
          data: {
            mfaEnabled: false, // Not enabled until verified
            mfaSecret: mfaData.secret,
          },
        });

        return sendSuccess(reply, {
          secret: mfaData.secret,
          qrCode: mfaData.qrCodeDataUrl,
          backupCodes: mfaData.backupCodes,
          message: 'Scan the QR code with your authenticator app, then verify with a code',
        });
      } else {
        // Disable MFA
        await prisma.user.update({
          where: { id: userId },
          data: {
            mfaEnabled: false,
            mfaSecret: null,
          },
        });

        return sendSuccess(reply, { message: 'MFA disabled successfully' });
      }
    },
  });

  // MFA verify endpoint (used during MFA setup)
  fastify.post<{ Body: MfaVerifyRequest }>('/mfa/verify', {
    preHandler: [mfaRateLimiter, validateBody(mfaVerifyRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Verify MFA code',
      description: 'Verifies a 2FA code during setup. Rate limited to 5 attempts per 15 minutes with progressive lockout.',
      body: mfaVerifyRequestSchema,
    },
    handler: async (request, reply) => {
      const { code, secret } = request.body;

      // Validate code format first
      if (!isValidTOTPFormat(code) && !isValidBackupCodeFormat(code)) {
        throw new BadRequestError('Invalid code format. Expected 6-digit TOTP or XXXX-XXXX backup code.');
      }

      // Get identifier for rate limiting tracking
      const identifier = request.user?.userId || request.ip;

      // Verify TOTP code using speakeasy
      const isValid = verifyTOTPCode(secret, code);

      if (!isValid) {
        // Record failed attempt for progressive lockout
        await recordMfaFailure(identifier);
        throw new UnauthorizedError('Invalid MFA code');
      }

      // Clear failure count on success
      await recordMfaSuccess(identifier);

      return sendSuccess(reply, { verified: true });
    },
  });

  // MFA complete setup endpoint (enables MFA after verification)
  fastify.post<{ Body: MfaVerifyRequest }>('/mfa/complete', {
    preHandler: [authenticate, mfaRateLimiter, validateBody(mfaVerifyRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Complete MFA setup',
      description: 'Verifies MFA code and enables MFA for the user account',
      body: mfaVerifyRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { code } = request.body;
      const userId = request.user!.userId;

      // Get user's pending MFA secret
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { mfaSecret: true, mfaEnabled: true },
      });

      if (!user || !user.mfaSecret) {
        throw new BadRequestError('MFA setup not initiated. Please call /mfa/setup first.');
      }

      if (user.mfaEnabled) {
        throw new BadRequestError('MFA is already enabled for this account.');
      }

      // Verify TOTP code
      const isValid = verifyTOTPCode(user.mfaSecret, code);

      if (!isValid) {
        await recordMfaFailure(userId);
        throw new UnauthorizedError('Invalid MFA code');
      }

      // Enable MFA
      await prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });

      // Clear failure count
      await recordMfaSuccess(userId);

      return sendSuccess(reply, {
        message: 'MFA enabled successfully',
        mfaEnabled: true,
      });
    },
  });
}
