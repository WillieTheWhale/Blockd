/**
 * JWT Utilities for Blockd Platform
 * Handles JWT token generation, verification, and management
 */

import jwt from 'jsonwebtoken';
import { getRedisClient } from '../../shared/cache/redis-client';
import { UnauthorizedError } from './errors';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  organizationId?: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// JWT Configuration
const ACCESS_TOKEN_EXPIRY = '1h'; // 1 hour
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Get keys from environment
const getPrivateKey = (): string => {
  const key = process.env.JWT_PRIVATE_KEY;
  if (!key) {
    throw new Error('JWT_PRIVATE_KEY environment variable is not set');
  }
  // Replace \n placeholders with actual newlines
  return key.replace(/\\n/g, '\n');
};

const getPublicKey = (): string => {
  const key = process.env.JWT_PUBLIC_KEY;
  if (!key) {
    throw new Error('JWT_PUBLIC_KEY environment variable is not set');
  }
  // Replace \n placeholders with actual newlines
  return key.replace(/\\n/g, '\n');
};

/**
 * Generate access and refresh token pair
 */
export async function generateTokenPair(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<TokenPair> {
  const privateKey = getPrivateKey();
  const redis = getRedisClient();

  // Generate access token (short-lived)
  const accessToken = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: 'blockd-api-gateway',
    audience: 'blockd-platform',
  });

  // Generate refresh token (long-lived)
  const refreshToken = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: 'blockd-api-gateway',
    audience: 'blockd-platform',
  });

  // Store refresh token in Redis
  await redis.set(
    `refresh_token:${payload.userId}:${refreshToken}`,
    { userId: payload.userId, email: payload.email, role: payload.role },
    { ttl: REFRESH_TOKEN_TTL, prefix: 'auth' }
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: 3600, // 1 hour in seconds
  };
}

/**
 * Verify and decode access token
 */
export function verifyAccessToken(token: string): JwtPayload {
  try {
    const publicKey = getPublicKey();
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'blockd-api-gateway',
      audience: 'blockd-platform',
    }) as JwtPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid access token');
    }
    throw new UnauthorizedError('Token verification failed');
  }
}

/**
 * Verify refresh token and check Redis
 */
export async function verifyRefreshToken(token: string): Promise<JwtPayload> {
  try {
    const publicKey = getPublicKey();
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'blockd-api-gateway',
      audience: 'blockd-platform',
    }) as JwtPayload;

    // Check if refresh token exists in Redis
    const redis = getRedisClient();
    const storedToken = await redis.exists(
      `refresh_token:${decoded.userId}:${token}`,
      { prefix: 'auth' }
    );

    if (!storedToken) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Token verification failed');
  }
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(userId: string, token: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`refresh_token:${userId}:${token}`, { prefix: 'auth' });
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.deletePattern(`refresh_token:${userId}:*`, { prefix: 'auth' });
}

/**
 * Decode token without verification (use with caution)
 */
export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Get token expiration time
 */
export function getTokenExpiration(token: string): Date | null {
  const decoded = decodeToken(token);
  if (!decoded?.exp) {
    return null;
  }
  return new Date(decoded.exp * 1000);
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return true;
  }
  return expiration < new Date();
}
