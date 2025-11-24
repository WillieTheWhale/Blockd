/**
 * MFA Check Middleware
 * Blockd Auth Service
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getUserById } from '../services/user.service';
import { MFARequiredError } from '../lib/errors';

/**
 * Middleware to check if MFA is required and verified
 */
export async function checkMFA(
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

    // Get user to check MFA status
    const user = await getUserById(request.user.sub);

    if (!user) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'User not found'
      });
      return;
    }

    // If MFA is enabled for user, check if it's been verified
    if (user.mfa_enabled) {
      // Check if request has MFA verification marker
      // This would be set by the login endpoint after MFA verification
      const mfaVerified = request.headers['x-mfa-verified'] === 'true';

      if (!mfaVerified) {
        throw new MFARequiredError();
      }
    }
  } catch (error) {
    if (error instanceof MFARequiredError) {
      reply.code(403).send({
        statusCode: 403,
        error: 'MFA Required',
        message: error.message,
        code: 'MFA_REQUIRED'
      });
      return;
    }

    reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'MFA check failed'
    });
  }
}

/**
 * Middleware to enforce MFA for sensitive operations
 */
export async function requireMFA(
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
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'User not found'
      });
      return;
    }

    // Require MFA to be enabled for sensitive operations
    if (!user.mfa_enabled) {
      reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Two-factor authentication must be enabled for this operation',
        code: 'MFA_SETUP_REQUIRED'
      });
      return;
    }
  } catch (error) {
    reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'MFA check failed'
    });
  }
}

/**
 * Middleware to check if user can setup MFA
 */
export async function canSetupMFA(
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
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'User not found'
      });
      return;
    }

    // Check if email is verified
    if (!user.email_verified) {
      reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Email must be verified before enabling MFA',
        code: 'EMAIL_NOT_VERIFIED'
      });
      return;
    }

    // Check if MFA is already enabled
    if (user.mfa_enabled) {
      reply.code(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Two-factor authentication is already enabled',
        code: 'MFA_ALREADY_ENABLED'
      });
      return;
    }
  } catch (error) {
    reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'MFA setup check failed'
    });
  }
}
