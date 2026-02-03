/**
 * Local Auth Module for Session Service
 *
 * Provides JWT verification for WebSocket authentication.
 * This is a simplified version for development - in production,
 * the shared auth module would be used.
 */

import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { config } from '../src/config';

// Error classes
export class JWTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JWTError';
  }
}

export class TokenExpiredError extends JWTError {
  constructor() {
    super('Token has expired');
    this.name = 'TokenExpiredError';
  }
}

export class InvalidTokenError extends JWTError {
  constructor(message = 'Invalid token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

// JWT Payload interface
export interface JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  organizationId?: string;
  type?: 'access' | 'refresh' | 'mfa';
  iat?: number;
  exp?: number;
}

// Redis client for token revocation checks
let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (!redisClient && config.redis) {
    try {
      redisClient = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        lazyConnect: true,
      });
    } catch (error) {
      console.warn('Redis not available for token revocation checks');
      return null;
    }
  }
  return redisClient;
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new InvalidTokenError(error.message);
    }
    throw new InvalidTokenError('Token verification failed');
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(header?: string): string | null {
  if (!header) return null;

  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Check if token is revoked
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    if (!redis) return false; // If Redis unavailable, allow token

    // Generate token hash
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Check revocation in Redis
    const revoked = await redis.get(`revoked:${tokenHash}`);
    return revoked !== null;
  } catch (error) {
    console.warn('Token revocation check failed:', error);
    return false; // Allow token if check fails
  }
}

/**
 * Decode token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
