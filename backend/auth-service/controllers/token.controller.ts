/**
 * Token Controller
 * Handles token refresh and revocation
 * Blockd Auth Service
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyRefreshToken, revokeRefreshToken, createRefreshToken, revokeAllUserTokens } from '../services/session.service';
import { getUserById } from '../services/user.service';
import { generateAccessToken } from '../services/jwt.service';
import { handleError, InvalidTokenError } from '../lib/errors';
import { RefreshTokenRequest, RefreshTokenResponse, RevokeTokenRequest } from '../types/auth.types';

// Validation schemas
const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required')
});

const revokeTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required')
});

/**
 * POST /auth/refresh
 * Refresh access token
 */
export async function refreshToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const data = refreshTokenSchema.parse(request.body);

    // Verify refresh token
    const tokenData = await verifyRefreshToken(data.refresh_token);

    if (!tokenData) {
      throw new InvalidTokenError('Invalid or expired refresh token');
    }

    // Get user
    const user = await getUserById(tokenData.user_id);

    if (!user) {
      throw new InvalidTokenError('User not found');
    }

    // Revoke old refresh token
    await revokeRefreshToken(data.refresh_token);

    // Generate new tokens (token rotation)
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = await createRefreshToken(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    const response: RefreshTokenResponse = {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: 3600
    };

    reply.code(200).send(response);
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/revoke
 * Revoke refresh token
 */
export async function revokeToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const data = revokeTokenSchema.parse(request.body);

    // Revoke the token
    await revokeRefreshToken(data.refresh_token);

    reply.code(200).send({
      success: true,
      message: 'Token revoked successfully'
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/revoke-all
 * Revoke all refresh tokens for current user
 */
export async function revokeAllTokens(
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

    // Revoke all tokens for user
    await revokeAllUserTokens(request.user.sub);

    reply.code(200).send({
      success: true,
      message: 'All sessions revoked successfully'
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * GET /auth/sessions
 * Get active sessions for current user
 */
export async function getActiveSessions(
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

    const { getUserSessions } = await import('../services/session.service');
    const sessions = await getUserSessions(request.user.sub);

    reply.code(200).send({
      active_sessions: sessions.length,
      sessions: sessions.map(token => ({
        token_id: token.substring(0, 8) + '...',
        // In production, you'd return more details like:
        // created_at, last_used, ip_address, user_agent
      }))
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/verify-token
 * Verify if an access token is valid
 */
export async function verifyAccessToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const body = request.body as any;
    const token = body?.token;

    if (!token) {
      throw new InvalidTokenError('Token is required');
    }

    // Verify token
    const { verifyToken } = await import('../services/jwt.service');
    const payload = verifyToken(token);

    reply.code(200).send({
      valid: true,
      payload: {
        user_id: payload.sub,
        email: payload.email,
        role: payload.role,
        organization_id: payload.organization_id,
        expires_at: new Date(payload.exp * 1000).toISOString()
      }
    });
  } catch (error) {
    // Token is invalid
    reply.code(200).send({
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid token'
    });
  }
}
