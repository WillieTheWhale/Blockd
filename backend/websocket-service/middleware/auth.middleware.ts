/**
 * Authentication Middleware for WebSocket Service
 *
 * Verifies JWT tokens and attaches user data to socket.
 */

import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { logger } from '../lib/logger';
import { loadConfig } from '../src/config';

// Load config on startup
const config = loadConfig();

/**
 * Authentication error for WebSocket
 */
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * JWT payload interface
 */
interface JWTPayloadData extends JwtPayload {
  sub: string;
  email: string;
  role: string;
  organizationId?: string;
}

/**
 * Socket user data interface
 */
export interface SocketUserData {
  user_id: string;
  email: string;
  role: 'interviewer' | 'interviewee' | 'admin';
  organization_id?: string;
}

/**
 * Extract token from Authorization header
 */
function extractTokenFromHeader(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1];
  }
  return null;
}

/**
 * Extract token from socket handshake
 */
function extractToken(socket: Socket): string | null {
  // Try auth object first (recommended)
  if (socket.handshake.auth?.token) {
    return socket.handshake.auth.token;
  }

  // Try Authorization header
  const authHeader = socket.handshake.headers.authorization;
  const headerToken = extractTokenFromHeader(authHeader);
  if (headerToken) {
    return headerToken;
  }

  // Try query parameter (fallback, less secure)
  if (socket.handshake.query?.token) {
    return socket.handshake.query.token as string;
  }

  return null;
}

/**
 * Verify access token
 */
function verifyAccessToken(token: string): JWTPayloadData {
  const secret = config.jwt.accessTokenSecret;
  if (!secret) {
    throw new Error('JWT secret not configured');
  }

  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
  });

  if (typeof decoded === 'string') {
    throw new AuthenticationError('Invalid token format');
  }

  const payload = decoded as JWTPayloadData;

  if (!payload.sub || !payload.email || !payload.role) {
    throw new AuthenticationError('Invalid token payload');
  }

  return payload;
}

/**
 * Authentication middleware
 */
export function authMiddleware() {
  return async (socket: Socket, next: (err?: ExtendedError) => void) => {
    try {
      // Extract token
      const token = extractToken(socket);

      if (!token) {
        logger.warn('Authentication failed: No token provided', {
          socketId: socket.id,
          ip: socket.handshake.address,
        });
        return next(new AuthenticationError('Authentication token required') as ExtendedError);
      }

      // Verify token
      const decoded = verifyAccessToken(token);

      // Attach user data to socket
      socket.data.user = {
        user_id: decoded.sub,
        email: decoded.email,
        role: decoded.role as 'interviewer' | 'interviewee' | 'admin',
        organization_id: decoded.organizationId,
      };

      socket.data.connectedAt = new Date();
      socket.data.lastActivity = new Date();

      logger.debug('Socket authenticated successfully', {
        socketId: socket.id,
        userId: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      });

      next();
    } catch (error) {
      logger.warn('Authentication failed', {
        socketId: socket.id,
        ip: socket.handshake.address,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      if (error instanceof jwt.TokenExpiredError) {
        return next(new AuthenticationError('Token has expired') as ExtendedError);
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return next(new AuthenticationError('Invalid token') as ExtendedError);
      }

      if (error instanceof AuthenticationError) {
        return next(error as ExtendedError);
      }

      next(new AuthenticationError('Authentication failed') as ExtendedError);
    }
  };
}

/**
 * Check if user has required role
 */
export function requireRole(...allowedRoles: Array<'interviewer' | 'interviewee' | 'admin'>) {
  return (socket: Socket, next: (err?: ExtendedError) => void) => {
    const userRole = socket.data.user?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      logger.warn('Authorization failed: Insufficient permissions', {
        socketId: socket.id,
        userId: socket.data.user?.user_id,
        userRole,
        requiredRoles: allowedRoles,
      });

      return next(
        new AuthenticationError(`Requires one of: ${allowedRoles.join(', ')}`) as ExtendedError
      );
    }

    next();
  };
}

/**
 * Check if user belongs to the specified organization
 */
export function requireOrganization(getOrgId: (socket: Socket) => string | undefined) {
  return (socket: Socket, next: (err?: ExtendedError) => void) => {
    const userOrgId = socket.data.user?.organization_id;
    const requiredOrgId = getOrgId(socket);

    // Admins can access any organization
    if (socket.data.user?.role === 'admin') {
      return next();
    }

    if (!userOrgId || userOrgId !== requiredOrgId) {
      logger.warn('Authorization failed: Organization mismatch', {
        socketId: socket.id,
        userId: socket.data.user?.user_id,
        userOrgId,
        requiredOrgId,
      });

      return next(
        new AuthenticationError('Not authorized for this organization') as ExtendedError
      );
    }

    next();
  };
}

/**
 * Update last activity timestamp
 */
export function updateActivity(socket: Socket): void {
  if (socket.data) {
    socket.data.lastActivity = new Date();
  }
}

/**
 * Get user ID from socket
 */
export function getUserId(socket: Socket): string {
  const userId = socket.data.user?.user_id;
  if (!userId) {
    throw new AuthenticationError('Socket not authenticated');
  }
  return userId;
}

/**
 * Get user role from socket
 */
export function getUserRole(socket: Socket): string {
  const role = socket.data.user?.role;
  if (!role) {
    throw new AuthenticationError('Socket not authenticated');
  }
  return role;
}

/**
 * Get organization ID from socket
 */
export function getOrganizationId(socket: Socket): string | undefined {
  return socket.data.user?.organization_id;
}

/**
 * Check if socket is authenticated
 */
export function isAuthenticated(socket: Socket): boolean {
  return socket.data.user !== undefined;
}
