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
   * Create Redis cluster client for Kubernetes deployment
   */
  private createClusterClient(): Cluster {
    // Get cluster nodes from environment or use Kubernetes DNS discovery
    const clusterNodes = process.env.REDIS_CLUSTER_NODES;
    const clusterServiceName = process.env.REDIS_CLUSTER_SERVICE || 'redis-cluster-headless';
    const clusterNamespace = process.env.REDIS_CLUSTER_NAMESPACE || 'blockd';
    const clusterPort = parseInt(process.env.REDIS_CLUSTER_PORT || '6379', 10);
    const clusterReplicas = parseInt(process.env.REDIS_CLUSTER_REPLICAS || '6', 10);

    let nodes: { host: string; port: number }[];

    if (clusterNodes) {
      // Parse nodes from comma-separated environment variable
      // Format: "host1:port1,host2:port2,..."
      nodes = clusterNodes.split(',').map(node => {
        const [host, port] = node.trim().split(':');
        return { host, port: parseInt(port || '6379', 10) };
      });
    } else {
      // Use Kubernetes DNS discovery with headless service
      // Each pod gets a DNS entry like: redis-cluster-0.redis-cluster-headless.blockd.svc.cluster.local
      nodes = Array.from({ length: clusterReplicas }, (_, i) => ({
        host: `redis-cluster-${i}.${clusterServiceName}.${clusterNamespace}.svc.cluster.local`,
        port: clusterPort,
      }));
    }

    console.log('[Redis] Cluster nodes:', nodes.map(n => `${n.host}:${n.port}`).join(', '));

    const options: ClusterOptions = {
      redisOptions: {
        password: process.env.REDIS_PASSWORD,
        connectTimeout: 15000,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 100, 3000);
          console.log(`[Redis] Cluster node retry attempt ${times}, waiting ${delay}ms`);
          return delay;
        },
      },
      clusterRetryStrategy: (times: number) => {
        if (times > 10) {
          console.error('[Redis] Cluster max retries exceeded');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 5000);
        console.log(`[Redis] Cluster retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      enableReadyCheck: true,
      enableOfflineQueue: true,
      slotsRefreshTimeout: 10000,
      slotsRefreshInterval: 5000,
      dnsLookup: (address, callback) => callback(null, address),
      scaleReads: 'slave', // Read from replicas to distribute load
      maxRedirections: 16,
      retryDelayOnFailover: 100,
      retryDelayOnClusterDown: 100,
      retryDelayOnTryAgain: 100,
      retryDelayOnMoved: 10,
      natMap: {}, // Can be configured for NAT environments
    };

    return new Redis.Cluster(nodes, options);
  }

  /**
   * Setup event handlers for Redis connection
   */
  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('[Redis] Connected to Redis server');
    });

    this.client.on('ready', () => {
      console.log('[Redis] Redis client ready');
    });

    this.client.on('error', (error: Error) => {
      console.error('[Redis] Redis client error:', error);
    });

    this.client.on('close', () => {
      console.log('[Redis] Redis connection closed');
    });

    this.client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting to Redis...');
    });

    // Cluster-specific events
    if (this.isCluster) {
      const clusterClient = this.client as Cluster;

      clusterClient.on('+node', (node: any) => {
        console.log(`[Redis Cluster] Node added: ${node.options?.host}:${node.options?.port}`);
      });

      clusterClient.on('-node', (node: any) => {
        console.log(`[Redis Cluster] Node removed: ${node.options?.host}:${node.options?.port}`);
      });

      clusterClient.on('node error', (error: Error, node: any) => {
        console.error(`[Redis Cluster] Node error on ${node?.options?.host}:${node?.options?.port}:`, error.message);
      });
    }
  }

  /**
   * Get cluster health status
   */
  async getClusterHealth(): Promise<{
    isHealthy: boolean;
    clusterState: string;
    nodesCount: number;
    slotsAssigned: number;
    message: string;
  }> {
    try {
      if (!this.isCluster) {
        const pong = await this.client.ping();
        return {
          isHealthy: pong === 'PONG',
          clusterState: 'standalone',
          nodesCount: 1,
          slotsAssigned: 16384,
          message: 'Standalone Redis connection',
        };
      }

      const clusterClient = this.client as Cluster;
      const clusterInfo = await clusterClient.cluster('INFO') as string;

      // Parse cluster info
      const lines = clusterInfo.split('\r\n');
      const info: Record<string, string> = {};
      for (const line of lines) {
        const [key, value] = line.split(':');
        if (key && value) {
          info[key] = value;
        }
      }

      const clusterState = info.cluster_state || 'unknown';
      const nodesCount = parseInt(info.cluster_known_nodes || '0', 10);
      const slotsAssigned = parseInt(info.cluster_slots_assigned || '0', 10);

      const isHealthy = clusterState === 'ok' && slotsAssigned === 16384;

      return {
        isHealthy,
        clusterState,
        nodesCount,
        slotsAssigned,
        message: isHealthy
          ? `Cluster healthy with ${nodesCount} nodes`
          : `Cluster degraded: state=${clusterState}, slots=${slotsAssigned}/16384`,
      };
    } catch (error) {
      return {
        isHealthy: false,
        clusterState: 'error',
        nodesCount: 0,
        slotsAssigned: 0,
        message: `Health check failed: ${error}`,
      };
    }
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
   */
  async disconnect(): Promise<void> {
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
