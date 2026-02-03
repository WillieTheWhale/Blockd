import Redis from 'ioredis';
import { config } from './config';
import { CacheError } from '../lib/errors';

// Redis client singleton
let redisClient: Redis | null = null;

// Store event handlers for proper cleanup
let redisErrorHandler: ((error: Error) => void) | null = null;
let redisConnectHandler: (() => void) | null = null;
let beforeExitHandler: (() => Promise<void>) | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      keyPrefix: config.redis.keyPrefix,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    // Store handlers for cleanup
    redisErrorHandler = (error) => {
      console.error('Redis error:', error);
    };

    redisConnectHandler = () => {
      console.log('Redis connected');
    };

    redisClient.on('error', redisErrorHandler);
    redisClient.on('connect', redisConnectHandler);

    // Handle graceful shutdown
    beforeExitHandler = async () => {
      await disconnectRedis();
    };
    process.on('beforeExit', beforeExitHandler);
  }

  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    // Remove event listeners to prevent memory leaks
    if (redisErrorHandler) {
      redisClient.removeListener('error', redisErrorHandler);
      redisErrorHandler = null;
    }
    if (redisConnectHandler) {
      redisClient.removeListener('connect', redisConnectHandler);
      redisConnectHandler = null;
    }
    // Remove process listener
    if (beforeExitHandler) {
      process.removeListener('beforeExit', beforeExitHandler);
      beforeExitHandler = null;
    }
    await redisClient.quit();
    redisClient = null;
  }
}

// Cache helper functions
export class CacheService {
  private redis: Redis;

  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Set value with TTL
   */
  async set(key: string, value: string | object, ttlSeconds?: number): Promise<void> {
    try {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, valueStr);
      } else {
        await this.redis.set(key, valueStr);
      }
    } catch (error) {
      throw new CacheError('set', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get value
   */
  async get<T = string>(key: string, parseJSON = false): Promise<T | null> {
    try {
      const value = await this.redis.get(key);

      if (!value) return null;

      if (parseJSON) {
        return JSON.parse(value) as T;
      }

      return value as T;
    } catch (error) {
      throw new CacheError('get', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Delete key
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      throw new CacheError('delete', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      throw new CacheError('exists', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Set with expiration
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.expire(key, ttlSeconds);
    } catch (error) {
      throw new CacheError('expire', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Add to set
   */
  async sadd(key: string, ...members: string[]): Promise<void> {
    try {
      await this.redis.sadd(key, ...members);
    } catch (error) {
      throw new CacheError('sadd', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Remove from set
   */
  async srem(key: string, ...members: string[]): Promise<void> {
    try {
      await this.redis.srem(key, ...members);
    } catch (error) {
      throw new CacheError('srem', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get all set members
   */
  async smembers(key: string): Promise<string[]> {
    try {
      return await this.redis.smembers(key);
    } catch (error) {
      throw new CacheError('smembers', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Check if member is in set
   */
  async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.redis.sismember(key, member);
      return result === 1;
    } catch (error) {
      throw new CacheError('sismember', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Hash set
   */
  async hset(key: string, field: string, value: string | object): Promise<void> {
    try {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      await this.redis.hset(key, field, valueStr);
    } catch (error) {
      throw new CacheError('hset', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Hash get
   */
  async hget<T = string>(key: string, field: string, parseJSON = false): Promise<T | null> {
    try {
      const value = await this.redis.hget(key, field);

      if (!value) return null;

      if (parseJSON) {
        return JSON.parse(value) as T;
      }

      return value as T;
    } catch (error) {
      throw new CacheError('hget', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Hash get all
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.redis.hgetall(key);
    } catch (error) {
      throw new CacheError('hgetall', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Hash delete
   */
  async hdel(key: string, ...fields: string[]): Promise<void> {
    try {
      await this.redis.hdel(key, ...fields);
    } catch (error) {
      throw new CacheError('hdel', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

export default getRedisClient();
