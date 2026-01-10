/**
 * Redis Client and OAuth State Management
 * Blockd Auth Service
 */

import Redis from 'ioredis';

/**
 * Redis client configuration
 */
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
};

/**
 * Singleton Redis client
 */
let redisClient: Redis | null = null;

/**
 * Get or create Redis client
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(redisConfig);

    redisClient.on('error', (error) => {
      console.error('Redis client error:', error);
    });

    redisClient.on('connect', () => {
      console.log('Redis client connected');
    });
  }
  return redisClient;
}

/**
 * OAuth state data stored in Redis
 */
export interface OAuthStateData {
  codeVerifier: string;
  provider: 'google' | 'microsoft';
  redirectUri?: string;
  createdAt: number;
}

/**
 * TTL for OAuth state (5 minutes)
 * Short window to prevent replay attacks
 */
const OAUTH_STATE_TTL = 300;

/**
 * Store OAuth state in Redis
 * State is used for CSRF protection, verifier for PKCE
 */
export async function storeOAuthState(
  state: string,
  data: OAuthStateData
): Promise<void> {
  const redis = getRedisClient();
  const key = `oauth:state:${state}`;
  await redis.setex(key, OAUTH_STATE_TTL, JSON.stringify(data));
}

/**
 * Retrieve and delete OAuth state from Redis (one-time use)
 * Returns null if not found or expired
 */
export async function getAndDeleteOAuthState(
  state: string
): Promise<OAuthStateData | null> {
  const redis = getRedisClient();
  const key = `oauth:state:${state}`;

  // Get the state
  const data = await redis.get(key);
  if (!data) {
    return null;
  }

  // Delete immediately (one-time use prevents replay attacks)
  await redis.del(key);

  try {
    const parsed = JSON.parse(data) as OAuthStateData;

    // Additional timestamp validation (defense in depth)
    const age = Date.now() - parsed.createdAt;
    if (age > OAUTH_STATE_TTL * 1000) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Store a temporary token (for email verification, password reset, etc.)
 */
export async function storeTemporaryToken(
  tokenType: string,
  token: string,
  data: Record<string, unknown>,
  ttlSeconds: number = 3600
): Promise<void> {
  const redis = getRedisClient();
  const key = `token:${tokenType}:${token}`;
  await redis.setex(key, ttlSeconds, JSON.stringify(data));
}

/**
 * Get and delete a temporary token
 */
export async function getAndDeleteTemporaryToken(
  tokenType: string,
  token: string
): Promise<Record<string, unknown> | null> {
  const redis = getRedisClient();
  const key = `token:${tokenType}:${token}`;

  const data = await redis.get(key);
  if (!data) {
    return null;
  }

  await redis.del(key);

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Rate limiting: increment attempt counter
 */
export async function incrementRateLimit(
  key: string,
  windowSeconds: number
): Promise<number> {
  const redis = getRedisClient();
  const fullKey = `ratelimit:${key}`;

  const multi = redis.multi();
  multi.incr(fullKey);
  multi.expire(fullKey, windowSeconds);

  const results = await multi.exec();
  return results ? (results[0][1] as number) : 0;
}

/**
 * Rate limiting: get current count
 */
export async function getRateLimitCount(key: string): Promise<number> {
  const redis = getRedisClient();
  const fullKey = `ratelimit:${key}`;
  const count = await redis.get(fullKey);
  return count ? parseInt(count, 10) : 0;
}

/**
 * Gracefully disconnect Redis client
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
