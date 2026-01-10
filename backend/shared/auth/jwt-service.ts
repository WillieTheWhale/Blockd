/**
 * Shared JWT Service
 *
 * Centralized JWT handling for all Blockd backend services.
 * Supports both RSA (RS256) and HMAC (HS256) algorithms.
 *
 * Configuration via environment variables:
 * - JWT_ALGORITHM: 'RS256' (default) or 'HS256'
 * - JWT_PUBLIC_KEY: RSA public key (for RS256, newlines as \n)
 * - JWT_PRIVATE_KEY: RSA private key (for RS256, newlines as \n)
 * - JWT_SECRET: HMAC secret (for HS256)
 * - JWT_ISSUER: Token issuer (default: 'blockd')
 * - JWT_AUDIENCE: Token audience (default: 'blockd-platform')
 * - JWT_ACCESS_TOKEN_TTL: Access token TTL in seconds (default: 3600)
 * - JWT_REFRESH_TOKEN_TTL: Refresh token TTL in seconds (default: 604800)
 */

import jwt, { Algorithm, SignOptions, VerifyOptions } from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

/**
 * JWT payload interface used across all services
 */
export interface JWTPayload {
  sub: string; // user_id
  email: string;
  role: 'admin' | 'interviewer' | 'interviewee' | 'viewer';
  organizationId?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

/**
 * Extended payload for MFA flow
 */
export interface MFAPayload {
  sub: string;
  email: string;
  type: 'mfa_required';
  iat?: number;
  exp?: number;
}

/**
 * Token pair response
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * JWT configuration
 */
export interface JWTConfig {
  algorithm: Algorithm;
  issuer: string;
  audience: string;
  accessTokenTTL: number;
  refreshTokenTTL: number;
  publicKey?: string;
  privateKey?: string;
  secret?: string;
  // Support multiple issuers for migration period
  validIssuers?: string[];
  validAudiences?: string[];
}

/**
 * Custom JWT errors
 */
export class JWTError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'JWTError';
  }
}

export class TokenExpiredError extends JWTError {
  constructor(message = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED');
    this.name = 'TokenExpiredError';
  }
}

export class InvalidTokenError extends JWTError {
  constructor(message = 'Invalid token') {
    super(message, 'INVALID_TOKEN');
    this.name = 'InvalidTokenError';
  }
}

export class TokenRevokedError extends JWTError {
  constructor(message = 'Token has been revoked') {
    super(message, 'TOKEN_REVOKED');
    this.name = 'TokenRevokedError';
  }
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<JWTConfig> = {
  algorithm: 'RS256',
  issuer: 'blockd',
  audience: 'blockd-platform',
  accessTokenTTL: 3600, // 1 hour
  refreshTokenTTL: 7 * 24 * 60 * 60, // 7 days
  // Support legacy issuers during migration
  validIssuers: ['blockd', 'blockd-auth', 'blockd-api-gateway'],
  validAudiences: ['blockd-platform', 'blockd-api'],
};

/**
 * Load configuration from environment
 */
function loadConfig(): JWTConfig {
  const algorithm = (process.env.JWT_ALGORITHM || 'RS256') as Algorithm;
  const isRSA = algorithm.startsWith('RS') || algorithm.startsWith('PS') || algorithm.startsWith('ES');

  const config: JWTConfig = {
    algorithm,
    issuer: process.env.JWT_ISSUER || DEFAULT_CONFIG.issuer!,
    audience: process.env.JWT_AUDIENCE || DEFAULT_CONFIG.audience!,
    accessTokenTTL: parseInt(process.env.JWT_ACCESS_TOKEN_TTL || String(DEFAULT_CONFIG.accessTokenTTL!), 10),
    refreshTokenTTL: parseInt(process.env.JWT_REFRESH_TOKEN_TTL || String(DEFAULT_CONFIG.refreshTokenTTL!), 10),
    validIssuers: process.env.JWT_VALID_ISSUERS?.split(',') || DEFAULT_CONFIG.validIssuers,
    validAudiences: process.env.JWT_VALID_AUDIENCES?.split(',') || DEFAULT_CONFIG.validAudiences,
  };

  if (isRSA) {
    config.publicKey = loadPublicKey();
    config.privateKey = loadPrivateKey();
  } else {
    config.secret = loadSecret();
  }

  return config;
}

/**
 * Load RSA public key from environment or file
 */
function loadPublicKey(): string {
  // Try environment variable first
  if (process.env.JWT_PUBLIC_KEY) {
    return process.env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
  }

  // Try file path
  const keyPath = process.env.JWT_PUBLIC_KEY_PATH || path.join(process.cwd(), 'keys', 'public.pem');
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }

  throw new Error('JWT public key not found. Set JWT_PUBLIC_KEY or JWT_PUBLIC_KEY_PATH');
}

/**
 * Load RSA private key from environment or file
 */
function loadPrivateKey(): string | undefined {
  // Try environment variable first
  if (process.env.JWT_PRIVATE_KEY) {
    return process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  // Try file path
  const keyPath = process.env.JWT_PRIVATE_KEY_PATH || path.join(process.cwd(), 'keys', 'private.pem');
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8');
  }

  // Private key is optional for verification-only services
  return undefined;
}

/**
 * Load HMAC secret
 */
function loadSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required for HMAC algorithms');
  }
  return secret;
}

// Singleton config
let configInstance: JWTConfig | null = null;

/**
 * Get JWT configuration (singleton)
 */
export function getJWTConfig(): JWTConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Get signing key based on algorithm
 */
function getSigningKey(config: JWTConfig): string {
  if (config.privateKey) {
    return config.privateKey;
  }
  if (config.secret) {
    return config.secret;
  }
  throw new Error('No signing key available. Set JWT_PRIVATE_KEY or JWT_SECRET');
}

/**
 * Get verification key based on algorithm
 */
function getVerificationKey(config: JWTConfig): string {
  if (config.publicKey) {
    return config.publicKey;
  }
  if (config.secret) {
    return config.secret;
  }
  throw new Error('No verification key available. Set JWT_PUBLIC_KEY or JWT_SECRET');
}

/**
 * Generate access token
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
  const config = getJWTConfig();
  const signingKey = getSigningKey(config);

  const signOptions: SignOptions = {
    algorithm: config.algorithm,
    expiresIn: config.accessTokenTTL,
    issuer: config.issuer,
    audience: config.audience,
  };

  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
    },
    signingKey,
    signOptions
  );
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
  const config = getJWTConfig();
  const signingKey = getSigningKey(config);

  const signOptions: SignOptions = {
    algorithm: config.algorithm,
    expiresIn: config.refreshTokenTTL,
    issuer: config.issuer,
    audience: config.audience,
  };

  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
      type: 'refresh',
    },
    signingKey,
    signOptions
  );
}

/**
 * Generate access and refresh token pair
 */
export function generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): TokenPair {
  const config = getJWTConfig();

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: config.accessTokenTTL,
  };
}

/**
 * Generate MFA temporary token
 */
export function generateMFAToken(userId: string, email: string): string {
  const config = getJWTConfig();
  const signingKey = getSigningKey(config);

  const signOptions: SignOptions = {
    algorithm: config.algorithm,
    expiresIn: 300, // 5 minutes
    issuer: config.issuer,
    audience: config.audience,
  };

  return jwt.sign(
    {
      sub: userId,
      email,
      type: 'mfa_required',
    },
    signingKey,
    signOptions
  );
}

/**
 * Verify and decode access token
 */
export function verifyAccessToken(token: string): JWTPayload {
  const config = getJWTConfig();
  const verificationKey = getVerificationKey(config);

  const verifyOptions: VerifyOptions = {
    algorithms: [config.algorithm],
    issuer: config.validIssuers,
    audience: config.validAudiences,
  };

  try {
    const decoded = jwt.verify(token, verificationKey, verifyOptions);

    if (typeof decoded === 'string') {
      throw new InvalidTokenError('Invalid token payload');
    }

    // Normalize payload to consistent format
    return normalizePayload(decoded);
  } catch (error) {
    handleJwtError(error);
  }
}

/**
 * Verify and decode refresh token
 */
export function verifyRefreshToken(token: string): JWTPayload {
  const config = getJWTConfig();
  const verificationKey = getVerificationKey(config);

  const verifyOptions: VerifyOptions = {
    algorithms: [config.algorithm],
    issuer: config.validIssuers,
    audience: config.validAudiences,
  };

  try {
    const decoded = jwt.verify(token, verificationKey, verifyOptions);

    if (typeof decoded === 'string') {
      throw new InvalidTokenError('Invalid token payload');
    }

    const typedDecoded = decoded as Record<string, unknown>;
    if (typedDecoded.type !== 'refresh') {
      throw new InvalidTokenError('Not a refresh token');
    }

    return normalizePayload(decoded);
  } catch (error) {
    handleJwtError(error);
  }
}

/**
 * Verify MFA token
 */
export function verifyMFAToken(token: string): { userId: string; email: string } {
  const config = getJWTConfig();
  const verificationKey = getVerificationKey(config);

  const verifyOptions: VerifyOptions = {
    algorithms: [config.algorithm],
    issuer: config.validIssuers,
    audience: config.validAudiences,
  };

  try {
    const decoded = jwt.verify(token, verificationKey, verifyOptions);

    if (typeof decoded === 'string') {
      throw new InvalidTokenError('Invalid MFA token');
    }

    const typedDecoded = decoded as Record<string, unknown>;
    if (typedDecoded.type !== 'mfa_required') {
      throw new InvalidTokenError('Not an MFA token');
    }

    return {
      userId: typedDecoded.sub as string,
      email: typedDecoded.email as string,
    };
  } catch (error) {
    if (error instanceof JWTError) {
      throw error;
    }
    handleJwtError(error);
  }
}

/**
 * Decode token without verification (for inspection)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === 'string') {
      return null;
    }
    return normalizePayload(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded?.exp) {
    return true;
  }
  return decoded.exp < Math.floor(Date.now() / 1000);
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
 * Get time until token expires in seconds
 */
export function getTokenTTL(token: string): number {
  const decoded = decodeToken(token);
  if (!decoded?.exp) {
    return 0;
  }
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, decoded.exp - now);
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) {
    return match[1];
  }

  // Support direct token (not recommended)
  return authHeader;
}

/**
 * Get user ID from token without full verification
 */
export function getUserIdFromToken(token: string): string | null {
  const decoded = decodeToken(token);
  return decoded?.sub || null;
}

/**
 * Validate token structure (basic check)
 */
export function validateTokenStructure(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  const parts = token.split('.');
  return parts.length === 3;
}

/**
 * Get public key for external verification
 */
export function getPublicKey(): string {
  const config = getJWTConfig();
  if (config.publicKey) {
    return config.publicKey;
  }
  throw new Error('Public key not available');
}

/**
 * Get access token TTL
 */
export function getAccessTokenTTL(): number {
  return getJWTConfig().accessTokenTTL;
}

/**
 * Get refresh token TTL
 */
export function getRefreshTokenTTL(): number {
  return getJWTConfig().refreshTokenTTL;
}

/**
 * Normalize payload to consistent format
 */
function normalizePayload(decoded: jwt.JwtPayload): JWTPayload {
  return {
    sub: (decoded.sub || decoded.userId || decoded.user_id) as string,
    email: decoded.email as string,
    role: decoded.role as JWTPayload['role'],
    organizationId: (decoded.organizationId || decoded.organization_id) as string | undefined,
    iat: decoded.iat,
    exp: decoded.exp,
    iss: decoded.iss,
    aud: decoded.aud,
  };
}

/**
 * Handle JWT library errors and convert to our error types
 */
function handleJwtError(error: unknown): never {
  if (error instanceof JWTError) {
    throw error;
  }

  if (error instanceof jwt.TokenExpiredError) {
    throw new TokenExpiredError('Token has expired');
  }

  if (error instanceof jwt.NotBeforeError) {
    throw new InvalidTokenError('Token not yet valid');
  }

  if (error instanceof jwt.JsonWebTokenError) {
    throw new InvalidTokenError(error.message);
  }

  throw new InvalidTokenError('Token verification failed');
}
