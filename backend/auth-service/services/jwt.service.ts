/**
 * JWT Service
 * Handles JWT generation, validation, and verification
 * Blockd Auth Service
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { JWTPayload, JWTOptions, DecodedToken, TokenPair } from '../types/jwt.types';
import { InvalidTokenError, TokenExpiredError } from '../lib/errors';
import { UserProfile } from '../types/user.types';

const KEYS_DIR = path.join(__dirname, '../../keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');

const DEFAULT_ISSUER = 'blockd-auth';
const DEFAULT_AUDIENCE = 'blockd-api';
const ACCESS_TOKEN_EXPIRY = '1h'; // 1 hour
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

let privateKey: string | null = null;
let publicKey: string | null = null;

/**
 * Load RSA keys
 */
function loadKeys(): void {
  if (!privateKey || !publicKey) {
    try {
      privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
      publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
    } catch (error) {
      throw new Error('Failed to load RSA keys. Please generate keys using npm run keys:generate');
    }
  }
}

/**
 * Generate JWT access token
 */
export function generateAccessToken(user: UserProfile): string {
  loadKeys();

  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    organization_id: user.organization_id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    iss: DEFAULT_ISSUER,
    aud: DEFAULT_AUDIENCE
  };

  const token = jwt.sign(payload, privateKey!, {
    algorithm: 'RS256'
  });

  return token;
}

/**
 * Generate a custom JWT with specific options
 */
export function generateCustomToken(
  payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>,
  options: JWTOptions
): string {
  loadKeys();

  const fullPayload: JWTPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: 0, // Will be set by jwt.sign
    iss: options.issuer || DEFAULT_ISSUER,
    aud: options.audience || DEFAULT_AUDIENCE
  };

  const token = jwt.sign(fullPayload, privateKey!, {
    algorithm: options.algorithm || 'RS256',
    expiresIn: options.expiresIn
  });

  return token;
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload {
  loadKeys();

  try {
    const decoded = jwt.verify(token, publicKey!, {
      algorithms: ['RS256'],
      issuer: DEFAULT_ISSUER,
      audience: DEFAULT_AUDIENCE
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new InvalidTokenError(error.message);
    }
    throw new InvalidTokenError();
  }
}

/**
 * Decode token without verification (for inspection)
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    const decoded = jwt.decode(token, { complete: true });
    return decoded as DecodedToken;
  } catch {
    return null;
  }
}

/**
 * Check if token is expired (without verification)
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.payload.exp) {
    return true;
  }

  return decoded.payload.exp < Math.floor(Date.now() / 1000);
}

/**
 * Get token expiration time
 */
export function getTokenExpiration(token: string): Date | null {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.payload.exp) {
    return null;
  }

  return new Date(decoded.payload.exp * 1000);
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Validate token structure
 */
export function validateTokenStructure(token: string): boolean {
  // JWT should have 3 parts separated by dots
  const parts = token.split('.');
  return parts.length === 3;
}

/**
 * Get user ID from token (without full verification)
 */
export function getUserIdFromToken(token: string): string | null {
  const decoded = decodeToken(token);
  return decoded?.payload.sub || null;
}

/**
 * Generate MFA temporary token
 */
export function generateMFAToken(userId: string, email: string): string {
  loadKeys();

  const payload = {
    sub: userId,
    email,
    type: 'mfa_required',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300 // 5 minutes
  };

  return jwt.sign(payload, privateKey!, {
    algorithm: 'RS256'
  });
}

/**
 * Verify MFA token
 */
export function verifyMFAToken(token: string): { userId: string; email: string } {
  loadKeys();

  try {
    const decoded = jwt.verify(token, publicKey!, {
      algorithms: ['RS256']
    }) as any;

    if (decoded.type !== 'mfa_required') {
      throw new InvalidTokenError('Invalid MFA token');
    }

    return {
      userId: decoded.sub,
      email: decoded.email
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError('MFA token expired');
    }
    throw new InvalidTokenError('Invalid MFA token');
  }
}

/**
 * Get public key for external verification
 */
export function getPublicKey(): string {
  loadKeys();
  return publicKey!;
}

/**
 * Get token TTL in seconds
 */
export function getAccessTokenTTL(): number {
  return 3600; // 1 hour
}

export function getRefreshTokenTTL(): number {
  return REFRESH_TOKEN_EXPIRY; // 7 days
}
