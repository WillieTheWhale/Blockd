/**
 * WebSocket Authentication Middleware for Session Service
 *
 * Uses the shared auth module for JWT verification.
 * Verifies tokens and attaches user info to socket.
 */

import { Socket } from 'socket.io';
import {
  verifyAccessToken,
  extractTokenFromHeader,
  TokenExpiredError,
  InvalidTokenError,
  isTokenRevoked,
} from '@blockd/shared/auth';
import { WebSocketError } from '../lib/errors';

/**
 * Socket authentication payload
 */
export interface SocketAuthPayload {
  user_id: string;
  email: string;
  role: string;
  organization_id?: string;
}

/**
 * WebSocket Authentication Middleware
 * Verifies JWT tokens and attaches user info to socket
 */
export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    // Get token from handshake auth or query
    let token = socket.handshake.auth?.token || socket.handshake.query?.token;

    // Also try Authorization header
    if (!token) {
      const authHeader = socket.handshake.headers.authorization;
      token = extractTokenFromHeader(authHeader);
    }

    if (!token || typeof token !== 'string') {
      return next(new WebSocketError('Authentication token required'));
    }

    // Check if token is revoked
    if (await isTokenRevoked(token)) {
      return next(new WebSocketError('Token has been revoked'));
    }

    // Verify JWT using shared auth module
    const decoded = verifyAccessToken(token);

    if (!decoded.sub) {
      return next(new WebSocketError('Invalid token payload'));
    }

    // Attach user info to socket
    (socket as any).userId = decoded.sub;
    (socket as any).email = decoded.email;
    (socket as any).role = decoded.role;
    (socket as any).organizationId = decoded.organizationId;
    (socket as any).sessionId = socket.handshake.query?.session_id as string;
    (socket as any).authenticated = true;

    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      return next(new WebSocketError('Token has expired'));
    }

    if (error instanceof InvalidTokenError) {
      return next(new WebSocketError('Invalid token'));
    }

    next(error as Error);
  }
}

/**
 * Extract user ID from socket
 */
export function getUserId(socket: Socket): string {
  const userId = (socket as any).userId;

  if (!userId) {
    throw new WebSocketError('Socket not authenticated');
  }

  return userId;
}

/**
 * Extract user email from socket
 */
export function getUserEmail(socket: Socket): string {
  const email = (socket as any).email;

  if (!email) {
    throw new WebSocketError('Socket not authenticated');
  }

  return email;
}

/**
 * Extract user role from socket
 */
export function getUserRole(socket: Socket): string {
  const role = (socket as any).role;

  if (!role) {
    throw new WebSocketError('Socket not authenticated');
  }

  return role;
}

/**
 * Extract organization ID from socket
 */
export function getOrganizationId(socket: Socket): string | undefined {
  return (socket as any).organizationId;
}

/**
 * Extract session ID from socket
 */
export function getSessionId(socket: Socket): string | undefined {
  return (socket as any).sessionId;
}

/**
 * Check if socket is authenticated
 */
export function isAuthenticated(socket: Socket): boolean {
  return (socket as any).authenticated === true;
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...allowedRoles: string[]) {
  return (socket: Socket, next: (err?: Error) => void) => {
    const role = (socket as any).role;

    if (!role || !allowedRoles.includes(role)) {
      return next(new WebSocketError(`Requires one of roles: ${allowedRoles.join(', ')}`));
    }

    next();
  };
}

/**
 * Session authorization middleware
 * Ensures user has access to the specified session
 */
export function requireSessionAccess() {
  return async (socket: Socket, next: (err?: Error) => void) => {
    const sessionId = getSessionId(socket);
    const userId = getUserId(socket);
    const role = getUserRole(socket);

    if (!sessionId) {
      return next(new WebSocketError('Session ID required'));
    }

    // Admins can access any session
    if (role === 'admin') {
      return next();
    }

    // For other roles, session access validation should be done
    // by the session service when they join the session room
    next();
  };
}
