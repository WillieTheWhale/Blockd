/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches user data to socket
 */

import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import { Config } from '../src/config';
import { logger } from '../lib/logger';
import { AuthenticationError, InvalidTokenError } from '../lib/errors';

/**
 * JWT payload interface
 */
interface JWTPayload {
  sub: string;        // user_id
  email: string;
  role: 'interviewer' | 'interviewee' | 'admin';
  organization_id?: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

/**
 * Read JWT public key
 */
let publicKey: string | null = null;

function getPublicKey(config: Config): string {
  if (publicKey) {
    return publicKey;
  }

  try {
    publicKey = fs.readFileSync(config.jwt.publicKeyPath, 'utf8');
    logger.info('JWT public key loaded successfully');
    return publicKey;
  } catch (error) {
    logger.error('Failed to load JWT public key', error);
    throw new Error('Failed to load JWT public key');
  }
}

/**
 * Verify JWT token
 */
async function verifyToken(token: string, config: Config): Promise<JWTPayload> {
  return new Promise((resolve, reject) => {
    const key = getPublicKey(config);

    jwt.verify(
      token,
      key,
      {
        algorithms: [config.jwt.algorithm as jwt.Algorithm],
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      },
      (err, decoded) => {
        if (err) {
          reject(new InvalidTokenError(err.message));
          return;
        }

        if (!decoded || typeof decoded === 'string') {
          reject(new InvalidTokenError('Invalid token payload'));
          return;
        }

        resolve(decoded as JWTPayload);
      }
    );
  });
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
  if (authHeader) {
    // Support "Bearer <token>" format
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }
    // Support direct token
    return authHeader;
  }

  // Try query parameter (fallback, less secure)
  if (socket.handshake.query?.token) {
    return socket.handshake.query.token as string;
  }

  return null;
}

/**
 * Authentication middleware
 */
export function authMiddleware(config: Config) {
  return async (socket: Socket, next: (err?: ExtendedError) => void) => {
    try {
      // Extract token
      const token = extractToken(socket);

      if (!token) {
        logger.warn('Authentication failed: No token provided', {
          socketId: socket.id,
          ip: socket.handshake.address,
        });
        return next(new AuthenticationError('Authentication token required'));
      }

      // Verify token
      const decoded = await verifyToken(token, config);

      // Attach user data to socket
      socket.data.user = {
        user_id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        organization_id: decoded.organization_id,
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

      if (error instanceof AuthenticationError || error instanceof InvalidTokenError) {
        return next(error as ExtendedError);
      }

      next(new AuthenticationError('Authentication failed'));
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
 * Update last activity timestamp
 */
export function updateActivity(socket: Socket): void {
  if (socket.data) {
    socket.data.lastActivity = new Date();
  }
}
