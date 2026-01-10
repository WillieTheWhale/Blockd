/**
 * JWT Utilities for API Gateway
 *
 * This module wraps the shared auth module and adds API Gateway-specific
 * functionality like Redis-backed refresh token management.
 */

import {
  // Re-export types
  JWTPayload,
  TokenPair,
  JWTError,
  TokenExpiredError,
  InvalidTokenError,
  TokenRevokedError,
  // Re-export functions
  verifyAccessToken as sharedVerifyAccessToken,
  verifyRefreshToken as sharedVerifyRefreshToken,
  generateTokenPair as sharedGenerateTokenPair,
  decodeToken,
  isTokenExpired,
  getTokenExpiration,
  extractTokenFromHeader,
  // Token revocation
  revokeToken,
  revokeAllUserTokens,
  isTokenRevoked,
  registerUserToken,
  createTokenFamily,
  rotateTokenFamily,
} from '@blockd/shared/auth';
import { v4 as uuidv4 } from 'uuid';

// Re-export types for backwards compatibility
export type { JWTPayload, TokenPair };

// Re-export errors
export { JWTError, TokenExpiredError, InvalidTokenError, TokenRevokedError };

// Re-export utility functions
export { decodeToken, isTokenExpired, getTokenExpiration, extractTokenFromHeader };

// Legacy type alias
export interface JwtPayload extends JWTPayload {
  userId: string; // Alias for sub
}

/**
 * Generate access and refresh token pair with revocation tracking
 */
export async function generateTokenPair(
  payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>
): Promise<TokenPair> {
  const tokens = sharedGenerateTokenPair(payload);

  // Create a token family for refresh token rotation
  const familyId = uuidv4();
  await createTokenFamily(familyId, tokens.refreshToken, payload.sub);

  // Register tokens for the user
  await registerUserToken(payload.sub, tokens.accessToken);
  await registerUserToken(payload.sub, tokens.refreshToken);

  return tokens;
}

/**
 * Verify access token with revocation check
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  // First check if token is revoked
  if (await isTokenRevoked(token)) {
    throw new TokenRevokedError('Access token has been revoked');
  }

  // Verify the token
  return sharedVerifyAccessToken(token);
}

/**
 * Verify refresh token with revocation check
 */
export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  // First check if token is revoked
  if (await isTokenRevoked(token)) {
    throw new TokenRevokedError('Refresh token has been revoked');
  }

  // Verify the token
  return sharedVerifyRefreshToken(token);
}

/**
 * Refresh tokens (rotate refresh token)
 */
export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  // Verify the refresh token (includes revocation check)
  const decoded = await verifyRefreshToken(refreshToken);

  // Generate new token pair
  const newTokens = await generateTokenPair({
    sub: decoded.sub,
    email: decoded.email,
    role: decoded.role,
    organizationId: decoded.organizationId,
  });

  // Revoke the old refresh token
  await revokeToken(refreshToken, { reason: 'Token rotation' });

  return newTokens;
}

/**
 * Revoke a specific refresh token
 */
export async function revokeRefreshToken(userId: string, token: string): Promise<void> {
  await revokeToken(token, {
    reason: 'User requested revocation',
    revokedBy: userId,
  });
}

/**
 * Revoke all tokens for a user (logout from all devices)
 */
export async function revokeAllTokens(userId: string): Promise<number> {
  return await revokeAllUserTokens(userId, {
    reason: 'User logged out from all devices',
    revokedBy: userId,
  });
}

/**
 * Legacy function alias for backwards compatibility
 */
export const verifyToken = verifyAccessToken;
