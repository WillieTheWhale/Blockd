/**
 * API Gateway Cache Layer
 * Provides caching for users, organizations, and sessions with cache-aside pattern
 */

import { getRedisClient } from './redis-client';
import {
  CacheManager,
  CacheKeyBuilder,
  CacheTTL,
  cacheManager as sharedCacheManager,
} from '../../shared/cache/caching-strategy';
import config from '../src/config';

// Additional cache prefixes for API Gateway
const ApiCachePrefix = {
  USER: 'user',
  ORGANIZATION: 'org',
  USER_PERMISSIONS: 'user_perms',
  ORG_SETTINGS: 'org_settings',
  TOKEN_BLACKLIST: 'token_blacklist',
} as const;

/**
 * Cache metrics for monitoring hit/miss rates
 * Useful for tuning cache TTLs and identifying caching effectiveness
 */
export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  lastReset: Date;
}

/**
 * Cache metrics tracker
 * Thread-safe tracking of cache hits and misses
 */
class CacheMetricsTracker {
  private hits = 0;
  private misses = 0;
  private lastReset = new Date();

  /** Record a cache hit */
  recordHit(): void {
    this.hits++;
  }

  /** Record a cache miss */
  recordMiss(): void {
    this.misses++;
  }

  /** Get current metrics */
  getMetrics(): CacheMetrics {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      lastReset: this.lastReset,
    };
  }

  /** Reset metrics (useful for periodic reporting) */
  reset(): CacheMetrics {
    const metrics = this.getMetrics();
    this.hits = 0;
    this.misses = 0;
    this.lastReset = new Date();
    return metrics;
  }
}

// Global metrics trackers for each cache type
export const cacheMetrics = {
  user: new CacheMetricsTracker(),
  organization: new CacheMetricsTracker(),
  session: new CacheMetricsTracker(),
  permissions: new CacheMetricsTracker(),
};

/**
 * User data structure for caching
 */
export interface CachedUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId?: string;
  mfaEnabled: boolean;
  emailVerified: boolean;
  cachedAt: string;
}

/**
 * Organization data structure for caching
 */
export interface CachedOrganization {
  id: string;
  name: string;
  slug?: string;
  settings?: Record<string, unknown>;
  cachedAt: string;
}

/**
 * User Cache Manager
 */
export class UserCache {
  private redis = getRedisClient();
  private ttl = config.cache.userTtl;

  /**
   * Build cache key for user
   */
  private buildKey(userId: string): string {
    return `${ApiCachePrefix.USER}:${userId}`;
  }

  /**
   * Build cache key for user by email
   */
  private buildEmailKey(email: string): string {
    return `${ApiCachePrefix.USER}:email:${email.toLowerCase()}`;
  }

  /**
   * Cache user data
   */
  async set(userId: string, user: CachedUser): Promise<void> {
    if (!config.cache.enabled) return;

    const key = this.buildKey(userId);
    const data = { ...user, cachedAt: new Date().toISOString() };
    await this.redis.set(key, data, { ttl: this.ttl });

    // Also cache by email for login lookups
    const emailKey = this.buildEmailKey(user.email);
    await this.redis.set(emailKey, userId, { ttl: this.ttl });
  }

  /**
   * Get cached user by ID
   */
  async get(userId: string): Promise<CachedUser | null> {
    if (!config.cache.enabled) return null;

    const key = this.buildKey(userId);
    return await this.redis.get<CachedUser>(key);
  }

  /**
   * Get cached user ID by email
   */
  async getIdByEmail(email: string): Promise<string | null> {
    if (!config.cache.enabled) return null;

    const emailKey = this.buildEmailKey(email);
    return await this.redis.get<string>(emailKey);
  }

  /**
   * Invalidate user cache
   */
  async invalidate(userId: string, email?: string): Promise<void> {
    const key = this.buildKey(userId);
    await this.redis.del(key);

    if (email) {
      const emailKey = this.buildEmailKey(email);
      await this.redis.del(emailKey);
    }
  }

  /**
   * Cache-aside pattern: get from cache or fetch and cache
   * Tracks hit/miss metrics for monitoring cache effectiveness
   */
  async getOrFetch(
    userId: string,
    fetcher: () => Promise<CachedUser | null>
  ): Promise<CachedUser | null> {
    // Try cache first
    const cached = await this.get(userId);
    if (cached) {
      cacheMetrics.user.recordHit();
      return cached;
    }

    // Cache miss - fetch from source
    cacheMetrics.user.recordMiss();
    const user = await fetcher();
    if (user) {
      await this.set(userId, user);
    }

    return user;
  }

  /**
   * Get cache metrics for this cache type
   */
  getMetrics(): CacheMetrics {
    return cacheMetrics.user.getMetrics();
  }
}

/**
 * Organization Cache Manager
 */
export class OrganizationCache {
  private redis = getRedisClient();
  private ttl = config.cache.organizationTtl;

  /**
   * Build cache key for organization
   */
  private buildKey(orgId: string): string {
    return `${ApiCachePrefix.ORGANIZATION}:${orgId}`;
  }

  /**
   * Build cache key for organization by slug
   */
  private buildSlugKey(slug: string): string {
    return `${ApiCachePrefix.ORGANIZATION}:slug:${slug.toLowerCase()}`;
  }

  /**
   * Cache organization data
   */
  async set(orgId: string, org: CachedOrganization): Promise<void> {
    if (!config.cache.enabled) return;

    const key = this.buildKey(orgId);
    const data = { ...org, cachedAt: new Date().toISOString() };
    await this.redis.set(key, data, { ttl: this.ttl });

    // Also cache by slug if available
    if (org.slug) {
      const slugKey = this.buildSlugKey(org.slug);
      await this.redis.set(slugKey, orgId, { ttl: this.ttl });
    }
  }

  /**
   * Get cached organization by ID
   */
  async get(orgId: string): Promise<CachedOrganization | null> {
    if (!config.cache.enabled) return null;

    const key = this.buildKey(orgId);
    return await this.redis.get<CachedOrganization>(key);
  }

  /**
   * Get cached organization ID by slug
   */
  async getIdBySlug(slug: string): Promise<string | null> {
    if (!config.cache.enabled) return null;

    const slugKey = this.buildSlugKey(slug);
    return await this.redis.get<string>(slugKey);
  }

  /**
   * Invalidate organization cache
   */
  async invalidate(orgId: string, slug?: string): Promise<void> {
    const key = this.buildKey(orgId);
    await this.redis.del(key);

    if (slug) {
      const slugKey = this.buildSlugKey(slug);
      await this.redis.del(slugKey);
    }
  }

  /**
   * Cache-aside pattern: get from cache or fetch and cache
   */
  async getOrFetch(
    orgId: string,
    fetcher: () => Promise<CachedOrganization | null>
  ): Promise<CachedOrganization | null> {
    // Try cache first
    const cached = await this.get(orgId);
    if (cached) {
      return cached;
    }

    // Fetch from source
    const org = await fetcher();
    if (org) {
      await this.set(orgId, org);
    }

    return org;
  }
}

/**
 * Session Cache Manager (API Gateway specific)
 */
export class ApiSessionCache {
  private redis = getRedisClient();
  private ttl = config.cache.sessionTtl;

  /**
   * Build cache key for session
   */
  private buildKey(sessionId: string): string {
    return CacheKeyBuilder.session(sessionId);
  }

  /**
   * Cache session data
   */
  async set(sessionId: string, sessionData: Record<string, unknown>): Promise<void> {
    if (!config.cache.enabled) return;

    const key = this.buildKey(sessionId);
    const data = { ...sessionData, cachedAt: new Date().toISOString() };
    await this.redis.set(key, data, { ttl: this.ttl });
  }

  /**
   * Get cached session
   */
  async get<T = Record<string, unknown>>(sessionId: string): Promise<T | null> {
    if (!config.cache.enabled) return null;

    const key = this.buildKey(sessionId);
    return await this.redis.get<T>(key);
  }

  /**
   * Invalidate session cache
   */
  async invalidate(sessionId: string): Promise<void> {
    const key = this.buildKey(sessionId);
    await this.redis.del(key);
  }

  /**
   * Extend session cache TTL
   */
  async extend(sessionId: string, additionalSeconds?: number): Promise<boolean> {
    if (!config.cache.enabled) return false;

    const key = this.buildKey(sessionId);
    const newTtl = additionalSeconds ? this.ttl + additionalSeconds : this.ttl;
    return await this.redis.expire(key, newTtl);
  }

  /**
   * Cache-aside pattern: get from cache or fetch and cache
   */
  async getOrFetch<T>(
    sessionId: string,
    fetcher: () => Promise<T | null>
  ): Promise<T | null> {
    // Try cache first
    const cached = await this.get<T>(sessionId);
    if (cached) {
      return cached;
    }

    // Fetch from source
    const session = await fetcher();
    if (session) {
      await this.set(sessionId, session as Record<string, unknown>);
    }

    return session;
  }
}

/**
 * Token Blacklist Cache
 * Used for tracking revoked tokens
 */
export class TokenBlacklistCache {
  private redis = getRedisClient();

  /**
   * Build cache key for blacklisted token
   */
  private buildKey(tokenHash: string): string {
    return `${ApiCachePrefix.TOKEN_BLACKLIST}:${tokenHash}`;
  }

  /**
   * Add token to blacklist
   * TTL should match or exceed the token's remaining lifetime
   */
  async add(tokenHash: string, ttlSeconds: number): Promise<void> {
    const key = this.buildKey(tokenHash);
    await this.redis.set(key, { revokedAt: new Date().toISOString() }, { ttl: ttlSeconds });
  }

  /**
   * Check if token is blacklisted
   */
  async isBlacklisted(tokenHash: string): Promise<boolean> {
    const key = this.buildKey(tokenHash);
    return await this.redis.exists(key);
  }
}

/**
 * User Permissions Cache
 */
export class UserPermissionsCache {
  private redis = getRedisClient();
  private ttl = config.cache.defaultTtl; // Shorter TTL for permissions

  /**
   * Build cache key for user permissions
   */
  private buildKey(userId: string): string {
    return `${ApiCachePrefix.USER_PERMISSIONS}:${userId}`;
  }

  /**
   * Cache user permissions
   */
  async set(userId: string, permissions: string[]): Promise<void> {
    if (!config.cache.enabled) return;

    const key = this.buildKey(userId);
    await this.redis.set(key, permissions, { ttl: this.ttl });
  }

  /**
   * Get cached user permissions
   */
  async get(userId: string): Promise<string[] | null> {
    if (!config.cache.enabled) return null;

    const key = this.buildKey(userId);
    return await this.redis.get<string[]>(key);
  }

  /**
   * Invalidate user permissions cache
   */
  async invalidate(userId: string): Promise<void> {
    const key = this.buildKey(userId);
    await this.redis.del(key);
  }

  /**
   * Cache-aside pattern
   */
  async getOrFetch(
    userId: string,
    fetcher: () => Promise<string[]>
  ): Promise<string[]> {
    const cached = await this.get(userId);
    if (cached) {
      return cached;
    }

    const permissions = await fetcher();
    await this.set(userId, permissions);
    return permissions;
  }
}

/**
 * API Gateway Cache Manager
 * Combines all cache managers into a single interface
 */
export class ApiCacheManager {
  public user = new UserCache();
  public organization = new OrganizationCache();
  public session = new ApiSessionCache();
  public tokenBlacklist = new TokenBlacklistCache();
  public permissions = new UserPermissionsCache();

  // Re-export shared cache managers
  public aiAnswer = sharedCacheManager.aiAnswer;
  public rateLimit = sharedCacheManager.rateLimit;
  public gazeRealtime = sharedCacheManager.gazeRealtime;

  private redis = getRedisClient();

  /**
   * Check if caching is enabled
   */
  get enabled(): boolean {
    return config.cache.enabled;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Invalidate all caches for a user (used on logout, role change, etc.)
   */
  async invalidateUser(userId: string, email?: string): Promise<void> {
    await Promise.all([
      this.user.invalidate(userId, email),
      this.permissions.invalidate(userId),
    ]);
  }

  /**
   * Warm up cache with commonly accessed data
   */
  async warmup(data: {
    users?: Array<{ id: string; user: CachedUser }>;
    organizations?: Array<{ id: string; org: CachedOrganization }>;
  }): Promise<void> {
    const promises: Promise<void>[] = [];

    if (data.users) {
      for (const { id, user } of data.users) {
        promises.push(this.user.set(id, user));
      }
    }

    if (data.organizations) {
      for (const { id, org } of data.organizations) {
        promises.push(this.organization.set(id, org));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<Record<string, unknown> | null> {
    try {
      const info = await this.redis.info('stats');
      return { raw: info };
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const apiCache = new ApiCacheManager();

// Export individual managers
export const userCache = new UserCache();
export const organizationCache = new OrganizationCache();
export const sessionCache = new ApiSessionCache();
export const tokenBlacklistCache = new TokenBlacklistCache();
export const permissionsCache = new UserPermissionsCache();

export default apiCache;
