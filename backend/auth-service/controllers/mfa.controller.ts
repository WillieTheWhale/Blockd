/**
 * MFA Controller
 * Blockd Auth Service
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  generateMFASecret,
  verifyTOTPCode,
  encryptMFASecret,
  encryptBackupCodes,
  verifyMFACode,
  markBackupCodeUsed,
  isValidMFACodeFormat
} from '../services/mfa.service';
import { getUserById, updateUserMFA, getUserByEmailWithPassword, updateLastLogin } from '../services/user.service';
import { generateAccessToken, verifyMFAToken } from '../services/jwt.service';
import { createRefreshToken, clearLoginAttempts } from '../services/session.service';
import { sendMFASetupEmail } from '../lib/email';
import { handleError, InvalidMFACodeError, ValidationError } from '../lib/errors';

// Validation schemas
const mfaSetupVerifySchema = z.object({
  code: z.string().length(6, 'MFA code must be 6 digits')
});

const mfaVerifyLoginSchema = z.object({
  mfa_token: z.string().min(1, 'MFA token is required'),
  code: z.string().min(1, 'MFA code is required')
});

const mfaDisableSchema = z.object({
  password: z.string().min(1, 'Password is required')
});

/**
 * POST /auth/mfa/setup
 * Initialize MFA setup
 */
export async function setupMFA(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    if (!request.user) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    // Get user
    const user = await getUserById(request.user.sub);

    if (!user) {
      reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    // Check if MFA is already enabled
    if (user.mfa_enabled) {
      reply.code(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'MFA is already enabled'
      });
      return;
    }

    // Generate MFA secret and QR code
    const mfaData = await generateMFASecret(user.email);

    // Store the secret temporarily in the session
    // In production, you might want to use Redis for this
    // For now, we'll return it and expect it to be sent back during verification

    reply.code(200).send({
      secret: mfaData.secret,
      qr_code_url: mfaData.qr_code_url,
      backup_codes: mfaData.backup_codes
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/mfa/verify
 * Verify and enable MFA
 */
export async function verifyMFASetup(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    if (!request.user) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    const data = mfaSetupVerifySchema.parse(request.body);
    const body = request.body as any;

    // The secret and backup codes should be sent back from the setup response
    const secret = body.secret;
    const backupCodes = body.backup_codes;

    if (!secret || !backupCodes) {
      throw new ValidationError('MFA secret and backup codes are required');
    }

    // Verify the TOTP code
    const isValid = verifyTOTPCode(secret, data.code);

    if (!isValid) {
      throw new InvalidMFACodeError();
    }

    // Encrypt secret and backup codes for storage
    const encryptedSecret = encryptMFASecret(secret);
    const encryptedBackupCodes = encryptBackupCodes(backupCodes);

    // Enable MFA for user
    await updateUserMFA(request.user.sub, true, encryptedSecret);

    // Send confirmation email
    const user = await getUserById(request.user.sub);
    if (user) {
      await sendMFASetupEmail({
        email: user.email,
        name: user.first_name || undefined
      });
    }

    reply.code(200).send({
      success: true,
      message: 'Two-factor authentication enabled successfully'
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/mfa/verify-login
 * Verify MFA code during login
 */
export async function verifyMFALogin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const data = mfaVerifyLoginSchema.parse(request.body);

    // Verify MFA token
    const mfaTokenData = verifyMFAToken(data.mfa_token);

    // Get user
    const user = await getUserByEmailWithPassword(mfaTokenData.email);

    if (!user || !user.mfa_enabled || !user.mfa_secret) {
      throw new ValidationError('MFA not enabled for this account');
    }

    // Verify MFA code
    if (!isValidMFACodeFormat(data.code)) {
      throw new InvalidMFACodeError('Invalid MFA code format');
    }

    const verificationResult = await verifyMFACode(user.mfa_secret, data.code);

    if (!verificationResult.valid) {
      throw new InvalidMFACodeError();
    }

    // If backup code was used, mark it as used
    // In production, you'd store backup codes separately and update them here

    // Clear failed login attempts
    await clearLoginAttempts(user.email);

    // Update last login
    await updateLastLogin(user.id);

    // Generate JWT tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = await createRefreshToken(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    reply.code(200).send({
      user_id: user.id,
      email: user.email,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/mfa/disable
 * Disable MFA
 */
export async function disableMFA(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    if (!request.user) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    const data = mfaDisableSchema.parse(request.body);

    // Get user with password
    const user = await getUserByEmailWithPassword(request.user.email);

    if (!user) {
      reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    // Verify password (OAuth-only users must have set a password to disable MFA)
    const { verifyPassword } = await import('../services/password.service');

    if (!user.password_hash) {
      throw new ValidationError('Password authentication required to disable MFA');
    }

    const passwordValid = await verifyPassword(data.password, user.password_hash);

    if (!passwordValid) {
      throw new ValidationError('Invalid password');
    }

    // Disable MFA
    await updateUserMFA(request.user.sub, false);

    reply.code(200).send({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * GET /auth/mfa/status
 * Get MFA status for current user
 */
export async function getMFAStatus(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    if (!request.user) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    const user = await getUserById(request.user.sub);

    if (!user) {
      reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'User not found'
      });
      return;
    }

    reply.code(200).send({
      mfa_enabled: user.mfa_enabled,
      email_verified: user.email_verified
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}
