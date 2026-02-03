/**
 * Redis Client for Blockd Platform
 * Using ioredis for Redis 8.4 cluster support
 */

import Redis, { Cluster, RedisOptions, ClusterOptions } from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Key prefix
}

export interface RateLimitOptions {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

class RedisClient {
  private client: Redis | Cluster;
  private isCluster: boolean;
  // Event handler references for proper cleanup
  private connectHandler?: () => void;
  private readyHandler?: () => void;
  private errorHandler?: (error: Error) => void;
  private closeHandler?: () => void;
  private reconnectingHandler?: () => void;

  constructor() {
    this.isCluster = process.env.REDIS_CLUSTER_ENABLED === 'true';

    if (this.isCluster) {
      this.client = this.createClusterClient();
    } else {
      this.client = this.createStandaloneClient();
    }

    this.setupEventHandlers();
  }

  /**
   * Create standalone Redis client
   */
  private createStandaloneClient(): Redis {
    const options: RedisOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      lazyConnect: false,
    };

    return new Redis(options);
  }

  /**
   * Create Redis cluster client
   */
  private createClusterClient(): Cluster {
    const nodes = [
      { host: '172.28.0.11', port: 6379 },
      { host: '172.28.0.12', port: 6379 },
      { host: '172.28.0.13', port: 6379 },
      { host: '172.28.0.14', port: 6379 },
      { host: '172.28.0.15', port: 6379 },
      { host: '172.28.0.16', port: 6379 },
    ];

    const options: ClusterOptions = {
      redisOptions: {
        password: process.env.REDIS_PASSWORD,
        connectTimeout: 10000,
        maxRetriesPerRequest: 3,
      },
      clusterRetryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      enableReadyCheck: true,
      enableOfflineQueue: true,
      slotsRefreshTimeout: 10000,
      natMap: {},
    };

    return new Redis.Cluster(nodes, options);
  }

  /**
   * Setup event handlers for Redis connection
   * Stores handler references for proper cleanup
   */
  private setupEventHandlers(): void {
    this.connectHandler = () => {
      console.log('[Redis] Connected to Redis server');
    };

    this.readyHandler = () => {
      console.log('[Redis] Redis client ready');
    };

    this.errorHandler = (error: Error) => {
      console.error('[Redis] Redis client error:', error);
    };

    this.closeHandler = () => {
      console.log('[Redis] Redis connection closed');
    };

    this.reconnectingHandler = () => {
      console.log('[Redis] Reconnecting to Redis...');
    };

    this.client.on('connect', this.connectHandler);
    this.client.on('ready', this.readyHandler);
    this.client.on('error', this.errorHandler);
    this.client.on('close', this.closeHandler);
    this.client.on('reconnecting', this.reconnectingHandler);
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string, options?: CacheOptions): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const value = await this.client.get(fullKey);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Redis] Error getting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const serialized = JSON.stringify(value);

      if (options?.ttl) {
        await this.client.setex(fullKey, options.ttl, serialized);
      } else {
        await this.client.set(fullKey, serialized);
      }
    } catch (error) {
      console.error(`[Redis] Error setting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string, options?: CacheOptions): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      return await this.client.del(fullKey);
    } catch (error) {
      console.error(`[Redis] Error deleting key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch (error) {
      console.error(`[Redis] Error checking existence of key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set TTL on existing key
   */
  async expire(key: string, ttl: number, options?: CacheOptions): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const result = await this.client.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      console.error(`[Redis] Error setting TTL on key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string, options?: CacheOptions): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      return await this.client.ttl(fullKey);
    } catch (error) {
      console.error(`[Redis] Error getting TTL of key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Increment counter (atomic operation)
   */
  async incr(key: string, options?: CacheOptions): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      return await this.client.incr(fullKey);
    } catch (error) {
      console.error(`[Redis] Error incrementing key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Increment counter by value (atomic operation)
   */
  async incrBy(key: string, increment: number, options?: CacheOptions): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      return await this.client.incrby(fullKey, increment);
    } catch (error) {
      console.error(`[Redis] Error incrementing key ${key} by ${increment}:`, error);
      throw error;
    }
  }

  /**
   * Rate limiting using token bucket algorithm
   */
  async rateLimit(
    identifier: string,
    options: RateLimitOptions
  ): Promise<RateLimitResult> {
    const key = `rate_limit:${identifier}`;
    const now = Date.now();
    const windowMs = options.windowSeconds * 1000;

    try {
      // Use Lua script for atomic operation
      const script = `
        local key = KEYS[1]
        local max_requests = tonumber(ARGV[1])
        local window_ms = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])

        local current = redis.call('GET', key)

        if current == false then
          redis.call('SET', key, 1, 'PX', window_ms)
          return {1, max_requests - 1, now + window_ms}
        end

        local count = tonumber(current)

        if count < max_requests then
          redis.call('INCR', key)
          local ttl = redis.call('PTTL', key)
          return {1, max_requests - count - 1, now + ttl}
        else
          local ttl = redis.call('PTTL', key)
          return {0, 0, now + ttl}
        end
      `;

      const result = await this.client.eval(
        script,
        1,
        key,
        options.maxRequests.toString(),
        windowMs.toString(),
        now.toString()
      ) as [number, number, number];

      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetAt: new Date(result[2]),
      };
    } catch (error) {
      console.error(`[Redis] Rate limit error for ${identifier}:`, error);
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: options.maxRequests,
        resetAt: new Date(now + windowMs),
      };
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T = any>(keys: string[], options?: CacheOptions): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(k => this.buildKey(k, options?.prefix));
      const values = await this.client.mget(...fullKeys);

      return values.map(v => {
        if (!v) return null;
        try {
          return JSON.parse(v) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      console.error('[Redis] Error getting multiple keys:', error);
      throw error;
    }
  }

  /**
   * Set multiple keys at once
   */
  async mset(entries: Record<string, any>, options?: CacheOptions): Promise<void> {
    try {
      const pipeline = this.client.pipeline();

      for (const [key, value] of Object.entries(entries)) {
        const fullKey = this.buildKey(key, options?.prefix);
        const serialized = JSON.stringify(value);

        if (options?.ttl) {
          pipeline.setex(fullKey, options.ttl, serialized);
        } else {
          pipeline.set(fullKey, serialized);
        }
      }

      await pipeline.exec();
    } catch (error) {
      console.error('[Redis] Error setting multiple keys:', error);
      throw error;
    }
  }

  /**
   * Delete keys by pattern
   */
  async deletePattern(pattern: string, options?: CacheOptions): Promise<number> {
    try {
      const fullPattern = this.buildKey(pattern, options?.prefix);
      const keys = await this.client.keys(fullPattern);

      if (keys.length === 0) {
        return 0;
      }

      return await this.client.del(...keys);
    } catch (error) {
      console.error(`[Redis] Error deleting pattern ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Hash operations - set field
   */
  async hset(key: string, field: string, value: any, options?: CacheOptions): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const serialized = JSON.stringify(value);
      return await this.client.hset(fullKey, field, serialized);
    } catch (error) {
      console.error(`[Redis] Error setting hash field ${field} in ${key}:`, error);
      throw error;
    }
  }

  /**
   * Hash operations - get field
   */
  async hget<T = any>(key: string, field: string, options?: CacheOptions): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const value = await this.client.hget(fullKey, field);

      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Redis] Error getting hash field ${field} from ${key}:`, error);
      throw error;
    }
  }

  /**
   * Hash operations - get all fields
   */
  async hgetall<T = any>(key: string, options?: CacheOptions): Promise<Record<string, T>> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const hash = await this.client.hgetall(fullKey);

      const result: Record<string, T> = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value) as T;
        } catch {
          result[field] = value as unknown as T;
        }
      }

      return result;
    } catch (error) {
      console.error(`[Redis] Error getting all hash fields from ${key}:`, error);
      throw error;
    }
  }

  /**
   * Build full key with optional prefix
   */
  private buildKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  /**
   * Flush all keys (use with caution!)
   */
  async flushAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('flushAll is not allowed in production');
    }
    await this.client.flushall();
  }

  /**
   * Get Redis info
   */
  async info(section?: string): Promise<string> {
    return await this.client.info(section);
  }

  /**
   * Ping Redis server
   */
  async ping(): Promise<string> {
    return await this.client.ping();
  }

  /**
   * Close Redis connection
   * Removes event listeners to prevent memory leaks
   */
  async disconnect(): Promise<void> {
    // Remove event listeners before disconnecting
    if (this.connectHandler) {
      this.client.removeListener('connect', this.connectHandler);
      this.connectHandler = undefined;
    }
    if (this.readyHandler) {
      this.client.removeListener('ready', this.readyHandler);
      this.readyHandler = undefined;
    }
    if (this.errorHandler) {
      this.client.removeListener('error', this.errorHandler);
      this.errorHandler = undefined;
    }
    if (this.closeHandler) {
      this.client.removeListener('close', this.closeHandler);
      this.closeHandler = undefined;
    }
    if (this.reconnectingHandler) {
      this.client.removeListener('reconnecting', this.reconnectingHandler);
      this.reconnectingHandler = undefined;
    }
    await this.client.quit();
  }

  /**
   * Get the underlying Redis client
   */
  getClient(): Redis | Cluster {
    return this.client;
  }
}

// Singleton instance
let redisClient: RedisClient | null = null;

export function getRedisClient(): RedisClient {
  if (!redisClient) {
    redisClient = new RedisClient();
  }
  return redisClient;
}

export { RedisClient };
export default getRedisClient;
