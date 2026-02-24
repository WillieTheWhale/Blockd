/**
 * Authentication Routes
 * Handles user registration, login, and MFA
 */

import { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.middleware';
import {
  publicRateLimiter,
  strictRateLimiter,
  loginRateLimiter,
  mfaRateLimiter,
  emailRateLimiter,
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
  changePasswordRequestSchema,
  mfaDisableRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  oauthStateRequestSchema,
  oauthCallbackRequestSchema,
  RegisterRequest,
  LoginRequest,
  RefreshTokenRequest,
  LogoutRequest,
  MfaSetupRequest,
  MfaVerifyRequest,
  ChangePasswordRequest,
  MfaDisableRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  OAuthStateRequest,
  OAuthCallbackRequest,
} from '../schemas/auth.schema';
import { generateTokenPair, verifyRefreshToken, revokeRefreshToken, revokeAllRefreshTokens } from '../lib/jwt';
import { sendSuccess, sendCreated } from '../lib/response';
import { BadRequestError, UnauthorizedError } from '../lib/errors';
import prisma from '../lib/prisma';
import { hashPassword, verifyPassword, validatePasswordStrength, isCommonPassword } from '../lib/password';
import { generateMFASecret, verifyTOTPCode, generateBackupCodes, isValidTOTPFormat, isValidBackupCodeFormat } from '../lib/mfa';
import { getRedisClient } from '../lib/redis-client';

// OAuth state TTL in seconds (5 minutes)
const OAUTH_STATE_TTL = 300;

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
  fastify.post<{ Body: RegisterRequest & { name?: string } }>('/register', {
    preHandler: [publicRateLimiter, validateBody(registerRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Register a new user',
      description: 'Creates a new user account',
    },
    handler: async (request, reply) => {
      const { email, password, firstName, lastName, role, organizationId } = request.body;
      // Support both name (from frontend) and firstName/lastName
      const body = request.body as { name?: string; organization?: string };
      const name = body.name;
      // organizationId must be a valid UUID - organization string from frontend is ignored for now
      // TODO: Look up organization by name or create new one
      const finalOrgId = organizationId || undefined;

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

      // Parse name into firstName/lastName if provided
      let finalFirstName = firstName;
      let finalLastName = lastName;
      if (name && !firstName && !lastName) {
        const nameParts = name.trim().split(' ');
        finalFirstName = nameParts[0];
        finalLastName = nameParts.slice(1).join(' ') || undefined;
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: finalFirstName,
          lastName: finalLastName,
          role: role as UserRole,
          organizationId: finalOrgId,
        },
      });

      // Generate tokens
      const tokens = await generateTokenPair({
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId || undefined,
      });

      // Build user's full name
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      // Return response in format expected by frontend (flat tokens)
      const response = {
        user: {
          id: user.id,
          email: user.email,
          name: fullName,
          role: user.role,
          avatar: null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
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
      // OAuth users may not have a password hash
      if (!user.passwordHash) {
        throw new UnauthorizedError('Invalid email or password');
      }
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

      // Build user's full name
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      // Return response in format expected by frontend (flat tokens)
      const response = {
        user: {
          id: user.id,
          email: user.email,
          name: fullName,
          role: user.role,
          avatar: null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        requiresMfa: false,
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

      // Return response in format expected by frontend
      return sendSuccess(reply, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      });
    },
  });

  // Logout endpoint
  fastify.post<{ Body: LogoutRequest }>('/logout', {
    preHandler: [authenticate, validateBody(logoutRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Logout user',
      description: 'Revokes the refresh token',
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

  // Get current authenticated user endpoint
  fastify.get('/me', {
    preHandler: [authenticate],
    schema: {
      tags: ['Authentication'],
      summary: 'Get current user',
      description: 'Returns the profile of the currently authenticated user',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          organizationId: true,
          mfaEnabled: true,
          emailVerified: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Build user's full name
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      return sendSuccess(reply, {
        id: user.id,
        email: user.email,
        name: fullName,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        mfaEnabled: user.mfaEnabled,
        emailVerified: user.emailVerified,
        lastLoginAt: user.lastLoginAt?.toISOString() || null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      });
    },
  });

  // Change password endpoint
  fastify.post<{ Body: ChangePasswordRequest }>('/change-password', {
    preHandler: [authenticate, strictRateLimiter, validateBody(changePasswordRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Change password',
      description: 'Change password for the currently authenticated user',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { currentPassword, newPassword } = request.body;
      const userId = request.user!.userId;

      // Get user with password hash
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true, email: true },
      });

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Check if user has a password (OAuth-only users don't)
      if (!user.passwordHash) {
        throw new BadRequestError('Cannot change password for OAuth-only accounts. Please set a password first.');
      }

      // Verify current password
      const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        request.log.warn({
          security_event: 'password_change_failure',
          reason: 'invalid_current_password',
          user_id: userId,
          ip: request.ip,
          timestamp: new Date().toISOString(),
        }, 'Failed password change attempt: invalid current password');

        throw new BadRequestError('Current password is incorrect');
      }

      // Validate new password strength
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        throw new BadRequestError(`Password requirements not met: ${passwordValidation.errors.join(', ')}`);
      }

      // Check if new password is too common
      if (isCommonPassword(newPassword)) {
        throw new BadRequestError('New password is too common. Please choose a stronger password.');
      }

      // Check if new password is same as current
      const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
      if (isSamePassword) {
        throw new BadRequestError('New password must be different from current password');
      }

      // Hash and update password
      const newPasswordHash = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      // Log successful password change
      request.log.info({
        security_event: 'password_changed',
        user_id: userId,
        ip: request.ip,
        timestamp: new Date().toISOString(),
      }, 'Password changed successfully');

      return sendSuccess(reply, { message: 'Password changed successfully' });
    },
  });

  // MFA disable endpoint (with password verification for security)
  fastify.post<{ Body: MfaDisableRequest }>('/mfa/disable', {
    preHandler: [authenticate, strictRateLimiter, validateBody(mfaDisableRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Disable MFA',
      description: 'Disable MFA for the currently authenticated user. Requires password verification.',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { password, mfaCode } = request.body;
      const userId = request.user!.userId;

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          passwordHash: true,
          mfaEnabled: true,
          mfaSecret: true,
        },
      });

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Check if MFA is enabled
      if (!user.mfaEnabled) {
        throw new BadRequestError('MFA is not enabled for this account');
      }

      // Verify password
      if (!user.passwordHash) {
        throw new BadRequestError('Cannot disable MFA for OAuth-only accounts without a password');
      }

      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        await recordMfaFailure(userId);
        request.log.warn({
          security_event: 'mfa_disable_failure',
          reason: 'invalid_password',
          user_id: userId,
          ip: request.ip,
          timestamp: new Date().toISOString(),
        }, 'Failed MFA disable attempt: invalid password');

        throw new BadRequestError('Invalid password');
      }

      // Optionally verify MFA code if provided
      if (mfaCode && user.mfaSecret) {
        const isValidMfa = verifyTOTPCode(user.mfaSecret, mfaCode);
        if (!isValidMfa) {
          await recordMfaFailure(userId);
          throw new BadRequestError('Invalid MFA code');
        }
      }

      // Disable MFA
      await prisma.user.update({
        where: { id: userId },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: [],
        },
      });

      // Clear failure tracking
      await recordMfaSuccess(userId);

      // Log successful MFA disable
      request.log.info({
        security_event: 'mfa_disabled',
        user_id: userId,
        ip: request.ip,
        timestamp: new Date().toISOString(),
      }, 'MFA disabled successfully');

      return sendSuccess(reply, { message: 'MFA disabled successfully' });
    },
  });

  // Forgot password endpoint (initiate password reset)
  fastify.post<{ Body: ForgotPasswordRequest }>('/forgot-password', {
    preHandler: [emailRateLimiter, validateBody(forgotPasswordRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Forgot password',
      description: 'Initiate password reset by sending a reset token to the user email',
    },
    handler: async (request, reply) => {
      const { email } = request.body;

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, firstName: true },
      });

      // Always return success to prevent email enumeration attacks
      // Even if user doesn't exist, we return the same response
      if (user) {
        // Generate password reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Store reset token in Redis
        const redis = getRedisClient();
        await redis.set(
          `password_reset:${resetTokenHash}`,
          {
            userId: user.id,
            email: user.email,
            createdAt: Date.now(),
          },
          { ttl: 3600, prefix: 'auth' } // 1 hour TTL
        );

        // Log password reset request
        request.log.info({
          security_event: 'password_reset_requested',
          user_id: user.id,
          email_masked: maskEmail(email),
          ip: request.ip,
          timestamp: new Date().toISOString(),
        }, 'Password reset requested');

        // TODO: Send email with reset link
        // In production, integrate with email service to send:
        // Reset URL: ${FRONTEND_URL}/reset-password?token=${resetToken}
        // For now, we log the token in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
        }
      }

      // Always return success message (prevents email enumeration)
      return sendSuccess(reply, {
        message: 'If an account exists with this email, a password reset link has been sent.',
      });
    },
  });

  // Reset password endpoint (complete password reset with token)
  fastify.post<{ Body: ResetPasswordRequest }>('/reset-password', {
    preHandler: [publicRateLimiter, validateBody(resetPasswordRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Reset password',
      description: 'Complete password reset using the token sent to user email',
    },
    handler: async (request, reply) => {
      const { token, newPassword } = request.body;

      // Hash the token to look up in Redis
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Look up reset token in Redis
      const redis = getRedisClient();
      const tokenData = await redis.get<{
        userId: string;
        email: string;
        createdAt: number;
      }>(`password_reset:${tokenHash}`, { prefix: 'auth' });

      if (!tokenData) {
        request.log.warn({
          security_event: 'password_reset_failure',
          reason: 'invalid_or_expired_token',
          ip: request.ip,
          timestamp: new Date().toISOString(),
        }, 'Failed password reset: invalid or expired token');

        throw new BadRequestError('Invalid or expired reset token. Please request a new password reset.');
      }

      // Verify user still exists
      const user = await prisma.user.findUnique({
        where: { id: tokenData.userId },
        select: { id: true, email: true, passwordHash: true },
      });

      if (!user) {
        // Delete the token since user doesn't exist
        await redis.del(`password_reset:${tokenHash}`, { prefix: 'auth' });
        throw new BadRequestError('User account not found');
      }

      // Validate new password strength
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        throw new BadRequestError(`Password requirements not met: ${passwordValidation.errors.join(', ')}`);
      }

      // Check if new password is too common
      if (isCommonPassword(newPassword)) {
        throw new BadRequestError('Password is too common. Please choose a stronger password.');
      }

      // Check if new password is same as current (if user has a password)
      if (user.passwordHash) {
        const isSamePassword = await verifyPassword(newPassword, user.passwordHash);
        if (isSamePassword) {
          throw new BadRequestError('New password must be different from your previous password');
        }
      }

      // Hash and update password
      const newPasswordHash = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      });

      // Delete the used reset token (one-time use)
      await redis.del(`password_reset:${tokenHash}`, { prefix: 'auth' });

      // Revoke all refresh tokens for security
      await revokeAllRefreshTokens(user.id);

      // Log successful password reset
      request.log.info({
        security_event: 'password_reset_completed',
        user_id: user.id,
        ip: request.ip,
        timestamp: new Date().toISOString(),
      }, 'Password reset completed successfully');

      return sendSuccess(reply, {
        message: 'Password reset successfully. Please log in with your new password.',
      });
    },
  });

  // OAuth state generation endpoint - generates CSRF state for OAuth flow
  fastify.post<{ Body: OAuthStateRequest }>('/oauth/state', {
    preHandler: [publicRateLimiter, validateBody(oauthStateRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'Generate OAuth state',
      description: 'Generate a CSRF state parameter for OAuth flow',
    },
    handler: async (request, reply) => {
      const { provider } = request.body;

      // Generate cryptographically secure random state
      const state = crypto.randomBytes(32).toString('hex');

      // Store state in Redis with short TTL
      const redis = getRedisClient();
      await redis.set(
        `oauth_state:${state}`,
        { provider, createdAt: Date.now() },
        { ttl: OAUTH_STATE_TTL, prefix: 'auth' }
      );

      return sendSuccess(reply, { state });
    },
  });

  // OAuth callback endpoint - handles authorization code exchange
  fastify.post<{ Body: OAuthCallbackRequest }>('/oauth/callback', {
    preHandler: [publicRateLimiter, validateBody(oauthCallbackRequestSchema)],
    schema: {
      tags: ['Authentication'],
      summary: 'OAuth callback',
      description: 'Exchange OAuth authorization code for tokens',
    },
    handler: async (request, reply) => {
      const { code, codeVerifier, provider, redirectUri, state } = request.body;

      // Validate CSRF state parameter
      const redis = getRedisClient();
      const stateKey = `oauth_state:${state}`;
      const storedState = await redis.get<{ provider: string; createdAt: number }>(stateKey, { prefix: 'auth' });

      if (!storedState) {
        request.log.warn({
          security_event: 'oauth_state_invalid',
          reason: 'state_not_found',
          provider,
          ip: request.ip,
        }, 'OAuth state validation failed: state not found or expired');
        throw new BadRequestError('Invalid or expired OAuth state. Please try again.');
      }

      // Verify the state was generated for the same provider
      if (storedState.provider !== provider) {
        request.log.warn({
          security_event: 'oauth_state_invalid',
          reason: 'provider_mismatch',
          expectedProvider: storedState.provider,
          actualProvider: provider,
          ip: request.ip,
        }, 'OAuth state validation failed: provider mismatch');
        throw new BadRequestError('Invalid OAuth state. Please try again.');
      }

      // Delete the state to prevent reuse (one-time use)
      await redis.del(stateKey, { prefix: 'auth' });

      try {
        // Exchange code for tokens with the OAuth provider
        const oauthUserInfo = await exchangeOAuthCode(provider, code, codeVerifier, redirectUri);

        // Get or create user from OAuth info
        let user = await prisma.user.findUnique({
          where: { email: oauthUserInfo.email },
        });

        if (!user) {
          // Create new user from OAuth info
          user = await prisma.user.create({
            data: {
              email: oauthUserInfo.email,
              firstName: oauthUserInfo.firstName,
              lastName: oauthUserInfo.lastName,
              role: 'interviewee' as UserRole,
              emailVerified: true, // OAuth providers verify email
              passwordHash: '', // OAuth users don't have password
            },
          });
        } else if (!user.emailVerified) {
          // Mark email as verified for existing users
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: true },
          });
          user.emailVerified = true;
        }

        // Generate tokens
        const tokens = await generateTokenPair({
          userId: user.id,
          email: user.email,
          role: user.role,
          organizationId: user.organizationId || undefined,
        });

        // Build user's full name
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

        // Return response in format expected by frontend
        const response = {
          user: {
            id: user.id,
            email: user.email,
            name: fullName,
            role: user.role,
            avatar: null,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
        };

        return sendSuccess(reply, response);
      } catch (error) {
        request.log.error({ error }, 'OAuth callback failed');
        throw new BadRequestError('OAuth authentication failed. Please try again.');
      }
    },
  });
}

// OAuth user info from provider
interface OAuthUserInfo {
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

/**
 * Exchange OAuth authorization code for user info
 */
async function exchangeOAuthCode(
  provider: 'google' | 'microsoft',
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<OAuthUserInfo> {
  if (provider === 'google') {
    return exchangeGoogleCode(code, codeVerifier, redirectUri);
  } else {
    return exchangeMicrosoftCode(code, codeVerifier, redirectUri);
  }
}

/**
 * Exchange Google OAuth code for user info
 */
async function exchangeGoogleCode(
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<OAuthUserInfo> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const finalRedirectUri = redirectUri || process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5174/auth/callback';

  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID not configured');
  }

  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret || '',
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: finalRedirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Google token exchange failed:', error);
    throw new Error('Failed to exchange Google authorization code');
  }

  const tokenData = await tokenResponse.json() as { access_token: string };

  // Get user info
  const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userInfoResponse.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  const userInfo = await userInfoResponse.json() as {
    email: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
  };

  return {
    email: userInfo.email,
    firstName: userInfo.given_name,
    lastName: userInfo.family_name,
    picture: userInfo.picture,
  };
}

/**
 * Exchange Microsoft OAuth code for user info
 */
async function exchangeMicrosoftCode(
  code: string,
  codeVerifier: string,
  redirectUri?: string
): Promise<OAuthUserInfo> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const finalRedirectUri = redirectUri || process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:5174/auth/callback';

  if (!clientId) {
    throw new Error('MICROSOFT_CLIENT_ID not configured');
  }

  // Exchange code for tokens
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: finalRedirectUri,
  });

  // Microsoft requires client_secret for web apps if configured
  if (clientSecret) {
    tokenParams.append('client_secret', clientSecret);
  }

  const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams,
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Microsoft token exchange failed:', error);
    throw new Error('Failed to exchange Microsoft authorization code');
  }

  const tokenData = await tokenResponse.json() as { access_token: string };

  // Get user info
  const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  if (!userInfoResponse.ok) {
    throw new Error('Failed to fetch Microsoft user info');
  }

  const userInfo = await userInfoResponse.json() as {
    mail?: string;
    userPrincipalName: string;
    givenName?: string;
    surname?: string;
  };

  return {
    email: userInfo.mail || userInfo.userPrincipalName,
    firstName: userInfo.givenName,
    lastName: userInfo.surname,
  };
}
