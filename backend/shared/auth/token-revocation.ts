/**
 * Token Revocation Service
 *
 * Manages token revocation using Redis for distributed token blacklisting.
 * Supports both individual token revocation and user-wide revocation.
 */

import { getRedisClient } from '../cache/redis-client';
import { getTokenTTL, decodeToken } from './jwt-service';

// Redis key prefixes
const TOKEN_BLACKLIST_PREFIX = 'auth:token:blacklist:';
const USER_TOKENS_PREFIX = 'auth:user:tokens:';
const TOKEN_FAMILY_PREFIX = 'auth:token:family:';

/**
 * Token revocation options
 */
export interface RevokeOptions {
  reason?: string;
  revokedBy?: string;
}

/**
 * Revoked token metadata
 */
export interface RevocationRecord {
  revokedAt: number;
  reason?: string;
  revokedBy?: string;
}

/**
 * Add a token to the blacklist
 */
export async function revokeToken(token: string, options: RevokeOptions = {}): Promise<void> {
  const redis = getRedisClient();
  const tokenTTL = getTokenTTL(token);

  if (tokenTTL <= 0) {
    // Token already expired, no need to blacklist
    return;
  }

  const decoded = decodeToken(token);
  if (!decoded) {
    return;
  }

  const revocationRecord: RevocationRecord = {
    revokedAt: Date.now(),
    reason: options.reason,
    revokedBy: options.revokedBy,
  };

  // Add to blacklist with TTL matching token expiration
  await redis.set(`${TOKEN_BLACKLIST_PREFIX}${token}`, revocationRecord, {
    ttl: tokenTTL,
    prefix: '',
  });

  // Remove from user's active tokens
  if (decoded.sub) {
    await redis.srem(`${USER_TOKENS_PREFIX}${decoded.sub}`, token);
  }
}

/**
 * Check if a token has been revoked
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  const redis = getRedisClient();
  return await redis.exists(`${TOKEN_BLACKLIST_PREFIX}${token}`, { prefix: '' });
}

/**
 * Get revocation record for a token
 */
export async function getRevocationRecord(token: string): Promise<RevocationRecord | null> {
  const redis = getRedisClient();
  const record = await redis.get<RevocationRecord>(`${TOKEN_BLACKLIST_PREFIX}${token}`, { prefix: '' });
  return record || null;
}

/**
 * Revoke all tokens for a user
 */
export async function revokeAllUserTokens(userId: string, options: RevokeOptions = {}): Promise<number> {
  const redis = getRedisClient();

  // Get all active tokens for the user
  const tokens = await redis.smembers<string>(`${USER_TOKENS_PREFIX}${userId}`);

  if (!tokens || tokens.length === 0) {
    return 0;
  }

  // Revoke each token
  await Promise.all(tokens.map((token) => revokeToken(token, options)));

  // Clear the user's token set
  await redis.del(`${USER_TOKENS_PREFIX}${userId}`, { prefix: '' });

  return tokens.length;
}

/**
 * Register a token for a user (for tracking active tokens)
 */
export async function registerUserToken(userId: string, token: string): Promise<void> {
  const redis = getRedisClient();
  const tokenTTL = getTokenTTL(token);

  if (tokenTTL <= 0) {
    return;
  }

  // Add to user's active tokens set
  await redis.sadd(`${USER_TOKENS_PREFIX}${userId}`, token);

  // Ensure the set expires when the longest token expires
  // Get current TTL and extend if this token lives longer
  const currentTTL = await redis.ttl(`${USER_TOKENS_PREFIX}${userId}`);
  if (currentTTL < tokenTTL) {
    await redis.expire(`${USER_TOKENS_PREFIX}${userId}`, tokenTTL);
  }
}

/**
 * Get count of active tokens for a user
 */
export async function getActiveTokenCount(userId: string): Promise<number> {
  const redis = getRedisClient();
  return await redis.scard(`${USER_TOKENS_PREFIX}${userId}`);
}

/**
 * Token family for refresh token rotation
 * When a refresh token is used, the new token inherits its family ID
 * If an old token from the family is reused, the entire family is revoked
 */

/**
 * Create a token family
 */
export async function createTokenFamily(familyId: string, initialToken: string, userId: string): Promise<void> {
  const redis = getRedisClient();
  const decoded = decodeToken(initialToken);

  if (!decoded?.exp) {
    return;
  }

  const ttl = decoded.exp - Math.floor(Date.now() / 1000);

  await redis.hset(`${TOKEN_FAMILY_PREFIX}${familyId}`, {
    userId,
    currentToken: initialToken,
    createdAt: Date.now(),
    rotationCount: 0,
  });

  // Set expiration based on refresh token TTL
  await redis.expire(`${TOKEN_FAMILY_PREFIX}${familyId}`, ttl);
}

/**
 * Rotate token within a family
 */
export async function rotateTokenFamily(
  familyId: string,
  oldToken: string,
  newToken: string
): Promise<boolean> {
  const redis = getRedisClient();

  // Get current family state
  const family = await redis.hgetall<{
    userId: string;
    currentToken: string;
    rotationCount: string;
  }>(`${TOKEN_FAMILY_PREFIX}${familyId}`);

  if (!family) {
    // Family doesn't exist, likely expired
    return false;
  }

  // Verify the old token is the current token
  if (family.currentToken !== oldToken) {
    // Token reuse detected! Revoke entire family
    await revokeTokenFamily(familyId, {
      reason: 'Token reuse detected - possible token theft',
    });
    return false;
  }

  // Update family with new token
  await redis.hset(`${TOKEN_FAMILY_PREFIX}${familyId}`, {
    currentToken: newToken,
    rotationCount: parseInt(family.rotationCount || '0', 10) + 1,
    lastRotatedAt: Date.now(),
  });

  return true;
}

/**
 * Revoke an entire token family
 */
export async function revokeTokenFamily(familyId: string, options: RevokeOptions = {}): Promise<void> {
  const redis = getRedisClient();

  // Get family info
  const family = await redis.hgetall<{
    userId: string;
    currentToken: string;
  }>(`${TOKEN_FAMILY_PREFIX}${familyId}`);

  if (family) {
    // Revoke the current token
    if (family.currentToken) {
      await revokeToken(family.currentToken, {
        ...options,
        reason: options.reason || 'Token family revoked',
      });
    }
  }

  // Delete the family
  await redis.del(`${TOKEN_FAMILY_PREFIX}${familyId}`, { prefix: '' });
}

/**
 * Check if a token family exists and is valid
 */
export async function isTokenFamilyValid(familyId: string): Promise<boolean> {
  const redis = getRedisClient();
  return await redis.exists(`${TOKEN_FAMILY_PREFIX}${familyId}`, { prefix: '' });
}
