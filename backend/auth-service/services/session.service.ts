/**
 * Session Service
 * Handles session management with Redis
 * Blockd Auth Service
 */

import Redis from 'ioredis';
import { generateRandomToken } from '../lib/crypto';
import { RefreshTokenData } from '../types/jwt.types';
import { UserSession } from '../types/user.types';
import { RateLimitInfo, LoginAttempt } from '../types/auth.types';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const USER_SESSIONS_PREFIX = 'user_sessions:';
const EMAIL_VERIFICATION_PREFIX = 'email_verification:';
const PASSWORD_RESET_PREFIX = 'password_reset:';
const RATE_LIMIT_PREFIX = 'rate_limit:login:';
const ACCOUNT_LOCK_PREFIX = 'account_lock:';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days
const EMAIL_VERIFICATION_TTL = 24 * 60 * 60; // 24 hours
const PASSWORD_RESET_TTL = 60 * 60; // 1 hour
const ACCOUNT_LOCK_TTL = 15 * 60; // 15 minutes

/**
 * Generate and store refresh token
 */
export async function createRefreshToken(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const token = generateRandomToken(32);
  const key = `${REFRESH_TOKEN_PREFIX}${token}`;

  const data: RefreshTokenData = {
    user_id: userId,
    token,
    created_at: Date.now(),
    expires_at: Date.now() + (REFRESH_TOKEN_TTL * 1000),
    ip_address: ipAddress,
    user_agent: userAgent
  };

  await redis.setex(key, REFRESH_TOKEN_TTL, JSON.stringify(data));

  // Track token for user
  await redis.sadd(`${USER_SESSIONS_PREFIX}${userId}`, token);

  return token;
}

/**
 * Verify refresh token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenData | null> {
  const key = `${REFRESH_TOKEN_PREFIX}${token}`;
  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  try {
    const tokenData: RefreshTokenData = JSON.parse(data);

    // Check if expired
    if (Date.now() > tokenData.expires_at) {
      await revokeRefreshToken(token);
      return null;
    }

    return tokenData;
  } catch {
    return null;
  }
}

/**
 * Revoke refresh token
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const key = `${REFRESH_TOKEN_PREFIX}${token}`;

  // Get token data to remove from user sessions
  const data = await redis.get(key);
  if (data) {
    try {
      const tokenData: RefreshTokenData = JSON.parse(data);
      await redis.srem(`${USER_SESSIONS_PREFIX}${tokenData.user_id}`, token);
    } catch {
      // Ignore parsing errors
    }
  }

  await redis.del(key);
}

/**
 * Revoke all refresh tokens for user
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const tokens = await redis.smembers(`${USER_SESSIONS_PREFIX}${userId}`);

  const pipeline = redis.pipeline();
  for (const token of tokens) {
    pipeline.del(`${REFRESH_TOKEN_PREFIX}${token}`);
  }
  pipeline.del(`${USER_SESSIONS_PREFIX}${userId}`);

  await pipeline.exec();
}

/**
 * Get active sessions for user
 */
export async function getUserSessions(userId: string): Promise<string[]> {
  return await redis.smembers(`${USER_SESSIONS_PREFIX}${userId}`);
}

/**
 * Store email verification token
 */
export async function createEmailVerificationToken(email: string): Promise<string> {
  const token = generateRandomToken(32);
  const key = `${EMAIL_VERIFICATION_PREFIX}${token}`;

  await redis.setex(key, EMAIL_VERIFICATION_TTL, email);

  return token;
}

/**
 * Verify email verification token
 */
export async function verifyEmailVerificationToken(token: string): Promise<string | null> {
  const key = `${EMAIL_VERIFICATION_PREFIX}${token}`;
  const email = await redis.get(key);

  if (email) {
    await redis.del(key); // One-time use
  }

  return email;
}

/**
 * Store password reset token
 */
export async function createPasswordResetToken(email: string): Promise<string> {
  const token = generateRandomToken(32);
  const key = `${PASSWORD_RESET_PREFIX}${token}`;

  await redis.setex(key, PASSWORD_RESET_TTL, email);

  return token;
}

/**
 * Verify password reset token
 */
export async function verifyPasswordResetToken(token: string): Promise<string | null> {
  const key = `${PASSWORD_RESET_PREFIX}${token}`;
  const email = await redis.get(key);

  return email;
}

/**
 * Consume password reset token
 */
export async function consumePasswordResetToken(token: string): Promise<void> {
  const key = `${PASSWORD_RESET_PREFIX}${token}`;
  await redis.del(key);
}

/**
 * Track login attempt
 */
export async function trackLoginAttempt(
  email: string,
  success: boolean,
  ipAddress?: string
): Promise<RateLimitInfo> {
  const key = `${RATE_LIMIT_PREFIX}${email}`;

  const attempt: LoginAttempt = {
    email,
    timestamp: Date.now(),
    success,
    ip_address: ipAddress
  };

  // Add attempt to list
  await redis.lpush(key, JSON.stringify(attempt));
  await redis.expire(key, ACCOUNT_LOCK_TTL);

  // Get all attempts in the time window
  const attempts = await redis.lrange(key, 0, -1);
  const recentAttempts = attempts
    .map(a => JSON.parse(a))
    .filter(a => Date.now() - a.timestamp < ACCOUNT_LOCK_TTL * 1000);

  const failedAttempts = recentAttempts.filter(a => !a.success);

  // Lock account if too many failed attempts
  if (failedAttempts.length >= 5) {
    const lockedUntil = Date.now() + (ACCOUNT_LOCK_TTL * 1000);
    await lockAccount(email, lockedUntil);

    return {
      attempts: failedAttempts.length,
      locked_until: lockedUntil
    };
  }

  return {
    attempts: failedAttempts.length
  };
}

/**
 * Lock account
 */
export async function lockAccount(email: string, lockedUntil: number): Promise<void> {
  const key = `${ACCOUNT_LOCK_PREFIX}${email}`;
  const ttl = Math.ceil((lockedUntil - Date.now()) / 1000);

  if (ttl > 0) {
    await redis.setex(key, ttl, lockedUntil.toString());
  }
}

/**
 * Check if account is locked
 */
export async function isAccountLocked(email: string): Promise<{ locked: boolean; until?: number }> {
  const key = `${ACCOUNT_LOCK_PREFIX}${email}`;
  const lockedUntil = await redis.get(key);

  if (!lockedUntil) {
    return { locked: false };
  }

  const until = parseInt(lockedUntil);
  if (Date.now() > until) {
    await redis.del(key);
    return { locked: false };
  }

  return { locked: true, until };
}

/**
 * Unlock account
 */
export async function unlockAccount(email: string): Promise<void> {
  const key = `${ACCOUNT_LOCK_PREFIX}${email}`;
  await redis.del(key);

  // Clear failed login attempts
  await redis.del(`${RATE_LIMIT_PREFIX}${email}`);
}

/**
 * Clear failed login attempts on successful login
 */
export async function clearLoginAttempts(email: string): Promise<void> {
  const key = `${RATE_LIMIT_PREFIX}${email}`;
  await redis.del(key);
}

/**
 * Store temporary MFA session
 */
export async function createMFASession(userId: string, email: string): Promise<string> {
  const sessionId = generateRandomToken(32);
  const key = `mfa_session:${sessionId}`;

  await redis.setex(key, 300, JSON.stringify({ userId, email })); // 5 minutes

  return sessionId;
}

/**
 * Verify MFA session
 */
export async function verifyMFASession(sessionId: string): Promise<{ userId: string; email: string } | null> {
  const key = `mfa_session:${sessionId}`;
  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Close Redis connection
 */
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
