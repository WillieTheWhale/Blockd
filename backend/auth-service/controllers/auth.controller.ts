/**
 * Authentication Controller
 * Blockd Auth Service
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createUser, getUserByEmailWithPassword, updateLastLogin, markEmailVerified } from '../services/user.service';
import { hashPassword, verifyPassword, enforcePasswordStrength } from '../services/password.service';
import { generateAccessToken } from '../services/jwt.service';
import {
  createRefreshToken,
  createEmailVerificationToken,
  verifyEmailVerificationToken,
  trackLoginAttempt,
  clearLoginAttempts,
  createPasswordResetToken,
  verifyPasswordResetToken,
  consumePasswordResetToken
} from '../services/session.service';
import { sendVerificationEmail, sendPasswordResetEmail, sendWelcomeEmail } from '../lib/email';
import {
  InvalidCredentialsError,
  EmailNotVerifiedError,
  MFARequiredError,
  ValidationError,
  InvalidMFACodeError,
  handleError
} from '../lib/errors';
import { verifyMFACode, isValidMFACodeFormat } from '../services/mfa.service';
import { RegisterRequest, LoginRequest, RegisterResponse, LoginResponse } from '../types/auth.types';
import { generateMFAToken } from '../services/jwt.service';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  full_name: z.string().min(1, 'Full name is required'),
  role: z.enum(['interviewer', 'interviewee']),
  organization_id: z.string().uuid().optional()
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  mfa_code: z.string().optional()
});

const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address')
});

const passwordResetConfirmSchema = z.object({
  reset_token: z.string().min(1, 'Reset token is required'),
  new_password: z.string().min(12, 'Password must be at least 12 characters')
});

/**
 * POST /auth/register
 * User registration
 */
export async function register(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate request body
    const data = registerSchema.parse(request.body);

    // Validate password strength
    enforcePasswordStrength(data.password);

    // Hash password
    const passwordHash = await hashPassword(data.password);

    // Parse full name
    const nameParts = data.full_name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || undefined;

    // Create user
    const user = await createUser({
      email: data.email,
      password_hash: passwordHash,
      role: data.role,
      organization_id: data.organization_id,
      first_name: firstName,
      last_name: lastName
    });

    // Generate email verification token
    const verificationToken = await createEmailVerificationToken(user.email);

    // Send verification email
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await sendVerificationEmail({
      email: user.email,
      name: data.full_name,
      verificationUrl,
      token: verificationToken
    });

    // Generate JWT tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = await createRefreshToken(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    // Send welcome email
    await sendWelcomeEmail(user.email, data.full_name);

    const response: RegisterResponse = {
      user_id: user.id,
      email: user.email,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600
    };

    reply.code(201).send(response);
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/login
 * User login
 */
export async function login(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Validate request body
    const data = loginSchema.parse(request.body);

    // Get user with password
    const user = await getUserByEmailWithPassword(data.email);

    if (!user) {
      // Track failed attempt
      await trackLoginAttempt(data.email, false, request.ip);
      throw new InvalidCredentialsError();
    }

    // Verify password
    const passwordValid = await verifyPassword(data.password, user.password_hash);

    if (!passwordValid) {
      // Track failed attempt
      await trackLoginAttempt(data.email, false, request.ip);
      throw new InvalidCredentialsError();
    }

    // Check if email is verified (optional - can be enforced)
    // if (!user.email_verified) {
    //   throw new EmailNotVerifiedError();
    // }

    // Check if MFA is enabled
    if (user.mfa_enabled) {
      if (!data.mfa_code) {
        // MFA required but not provided - return temporary token
        const mfaToken = generateMFAToken(user.id, user.email);

        const response: LoginResponse = {
          user_id: user.id,
          email: user.email,
          access_token: '',
          refresh_token: '',
          expires_in: 0,
          requires_mfa: true,
          mfa_token: mfaToken
        };

        reply.code(200).send(response);
        return;
      }

      // MFA code provided - verify it
      if (!isValidMFACodeFormat(data.mfa_code)) {
        throw new InvalidMFACodeError('Invalid MFA code format');
      }

      if (!user.mfa_secret) {
        throw new ValidationError('MFA is enabled but secret not found');
      }

      // Verify TOTP code (backup codes should use the 2-step /auth/mfa/verify-login flow)
      const mfaResult = await verifyMFACode(user.mfa_secret, data.mfa_code);
      if (!mfaResult.valid) {
        await trackLoginAttempt(data.email, false, request.ip);
        throw new InvalidMFACodeError();
      }
    }

    // Clear failed login attempts
    await clearLoginAttempts(data.email);

    // Update last login
    await updateLastLogin(user.id);

    // Track successful attempt
    await trackLoginAttempt(data.email, true, request.ip);

    // Generate JWT tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = await createRefreshToken(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    const response: LoginResponse = {
      user_id: user.id,
      email: user.email,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      requires_mfa: false
    };

    reply.code(200).send(response);
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/verify-email
 * Verify email address
 */
export async function verifyEmail(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const data = emailVerificationSchema.parse(request.body);

    // Verify token and get email
    const email = await verifyEmailVerificationToken(data.token);

    if (!email) {
      throw new ValidationError('Invalid or expired verification token');
    }

    // Get user and mark email as verified
    const user = await getUserByEmailWithPassword(email);

    if (!user) {
      throw new ValidationError('User not found');
    }

    await markEmailVerified(user.id);

    reply.code(200).send({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/password-reset/request
 * Request password reset
 */
export async function requestPasswordReset(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const data = passwordResetRequestSchema.parse(request.body);

    // Check if user exists
    const user = await getUserByEmailWithPassword(data.email);

    // Always return success to prevent email enumeration
    if (user) {
      // Generate reset token
      const resetToken = await createPasswordResetToken(user.email);

      // Send reset email
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      await sendPasswordResetEmail({
        email: user.email,
        name: user.first_name || undefined,
        resetUrl,
        token: resetToken
      });
    }

    reply.code(200).send({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/password-reset/confirm
 * Confirm password reset
 */
export async function confirmPasswordReset(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const data = passwordResetConfirmSchema.parse(request.body);

    // Verify reset token
    const email = await verifyPasswordResetToken(data.reset_token);

    if (!email) {
      throw new ValidationError('Invalid or expired reset token');
    }

    // Validate new password
    enforcePasswordStrength(data.new_password);

    // Get user
    const user = await getUserByEmailWithPassword(email);

    if (!user) {
      throw new ValidationError('User not found');
    }

    // Hash new password
    const passwordHash = await hashPassword(data.new_password);

    // Update password
    const { updateUserPassword } = await import('../services/user.service');
    await updateUserPassword(user.id, passwordHash);

    // Consume reset token
    await consumePasswordResetToken(data.reset_token);

    reply.code(200).send({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/logout
 * User logout
 */
export async function logout(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const body = request.body as any;
    const refreshToken = body?.refresh_token;

    if (refreshToken) {
      const { revokeRefreshToken } = await import('../services/session.service');
      await revokeRefreshToken(refreshToken);
    }

    reply.code(200).send({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}
