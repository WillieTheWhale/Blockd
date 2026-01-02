/**
 * JWT Validation Middleware
 * Blockd Auth Service
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, extractTokenFromHeader } from '../services/jwt.service';
import { UnauthorizedError, InvalidTokenError } from '../lib/errors';
import { JWTPayload } from '../types/jwt.types';

// Extend Fastify request to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

/**
 * Middleware to validate JWT token
 */
export async function validateJWT(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Extract token from Authorization header
    const token = extractTokenFromHeader(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedError('No authentication token provided');
    }

    // Verify token
    const payload = verifyToken(token);

    // Attach user to request
    request.user = payload;
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof InvalidTokenError) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: error.message
      });
      return;
    }

    reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Middleware to validate JWT token (optional - doesn't fail if missing)
 */
export async function validateJWTOptional(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = extractTokenFromHeader(request.headers.authorization);

    if (token) {
      const payload = verifyToken(token);
      request.user = payload;
    }
  } catch {
    // Silently fail for optional authentication
  }
}

/**
 * Middleware to check user role
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    if (!roles.includes(request.user.role)) {
      reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
      return;
    }
  };
}

/**
 * Middleware to check organization access
 */
export function requireOrganization(organizationId: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    if (request.user.organization_id !== organizationId) {
      reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Access denied to this organization'
      });
      return;
    }
  };
}

/**
 * Middleware to verify user owns resource
 */
export function requireOwnership(userIdParam: string = 'userId') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    const params = request.params as any;
    const resourceUserId = params[userIdParam];

    if (request.user.sub !== resourceUserId && request.user.role !== 'admin') {
      reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Access denied to this resource'
      });
      return;
    }
  };
}
