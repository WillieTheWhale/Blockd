/**
 * JWT Authentication Middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, JwtPayload } from '../lib/jwt.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

// Extend FastifyRequest to include user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

/**
 * Authentication middleware - verifies JWT token
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedError('Authorization header is missing');
    }

    // Check if it's a Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Invalid authorization header format');
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw new UnauthorizedError('Token is missing');
    }

    // Verify token and attach user to request
    const payload = verifyAccessToken(token);
    request.user = payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Invalid or expired token');
  }
}

/**
 * Optional authentication middleware - doesn't throw if token is missing
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token) {
        const payload = verifyAccessToken(token);
        request.user = payload;
      }
    }
  } catch (error) {
    // Silently fail for optional authentication
    request.log.debug({ err: error }, 'Optional authentication failed');
  }
}

/**
 * Role-based authorization middleware factory
 */
export function requireRole(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const userRole = request.user.role;

    if (!allowedRoles.includes(userRole)) {
      throw new ForbiddenError(
        `Access denied. Required roles: ${allowedRoles.join(', ')}`
      );
    }
  };
}

/**
 * Check if user owns the resource
 */
export function requireOwnership(userIdParam = 'userId') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const params = request.params as Record<string, string>;
    const resourceUserId = params[userIdParam];

    if (!resourceUserId) {
      throw new ForbiddenError('Resource user ID not found');
    }

    // Admin can access any resource
    if (request.user.role === 'admin') {
      return;
    }

    // User can only access their own resources
    if (request.user.userId !== resourceUserId) {
      throw new ForbiddenError('Access denied. You can only access your own resources');
    }
  };
}

/**
 * Check if user belongs to the organization
 */
export function requireOrganization(orgIdParam = 'organizationId') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const params = request.params as Record<string, string>;
    const resourceOrgId = params[orgIdParam];

    if (!resourceOrgId) {
      throw new ForbiddenError('Organization ID not found');
    }

    // Admin can access any organization
    if (request.user.role === 'admin') {
      return;
    }

    // User must belong to the organization
    if (request.user.organizationId !== resourceOrgId) {
      throw new ForbiddenError('Access denied. You must belong to this organization');
    }
  };
}
