"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisClient = void 0;
exports.getRedisClient = getRedisClient;
const ioredis_1 = __importDefault(require("ioredis"));
class RedisClient {
    client;
    isCluster;
    constructor() {
        this.isCluster = process.env.REDIS_CLUSTER_ENABLED === 'true';
        if (this.isCluster) {
            this.client = this.createClusterClient();
        }
        else {
            this.client = this.createStandaloneClient();
        }
        this.setupEventHandlers();
    }
    createStandaloneClient() {
        const options = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379', 10),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0', 10),
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: true,
            connectTimeout: 10000,
            lazyConnect: false,
        };
        return new ioredis_1.default(options);
    }
    createClusterClient() {
        const nodes = [
            { host: '172.28.0.11', port: 6379 },
            { host: '172.28.0.12', port: 6379 },
            { host: '172.28.0.13', port: 6379 },
            { host: '172.28.0.14', port: 6379 },
            { host: '172.28.0.15', port: 6379 },
            { host: '172.28.0.16', port: 6379 },
        ];
        const options = {
            redisOptions: {
                password: process.env.REDIS_PASSWORD,
                connectTimeout: 10000,
                maxRetriesPerRequest: 3,
            },
            clusterRetryStrategy: (times) => {
                const delay = Math.min(times * 100, 3000);
                return delay;
            },
            enableReadyCheck: true,
            enableOfflineQueue: true,
            slotsRefreshTimeout: 10000,
            natMap: {},
        };
        return new ioredis_1.default.Cluster(nodes, options);
    }
    setupEventHandlers() {
        this.client.on('connect', () => {
            console.log('[Redis] Connected to Redis server');
        });
        this.client.on('ready', () => {
            console.log('[Redis] Redis client ready');
        });
        this.client.on('error', (error) => {
            console.error('[Redis] Redis client error:', error);
        });
        this.client.on('close', () => {
            console.log('[Redis] Redis connection closed');
        });
        this.client.on('reconnecting', () => {
            console.log('[Redis] Reconnecting to Redis...');
        });
    }
    async get(key, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            const value = await this.client.get(fullKey);
            if (!value) {
                return null;
            }
            return JSON.parse(value);
        }
        catch (error) {
            console.error(`[Redis] Error getting key ${key}:`, error);
            throw error;
        }
    }
    async set(key, value, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            const serialized = JSON.stringify(value);
            if (options?.ttl) {
                await this.client.setex(fullKey, options.ttl, serialized);
            }
            else {
                await this.client.set(fullKey, serialized);
            }
        }
        catch (error) {
            console.error(`[Redis] Error setting key ${key}:`, error);
            throw error;
        }
    }
    async del(key, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            return await this.client.del(fullKey);
        }
        catch (error) {
            console.error(`[Redis] Error deleting key ${key}:`, error);
            throw error;
        }
    }
    async exists(key, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            const result = await this.client.exists(fullKey);
            return result === 1;
        }
        catch (error) {
            console.error(`[Redis] Error checking existence of key ${key}:`, error);
            throw error;
        }
    }
    async expire(key, ttl, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            const result = await this.client.expire(fullKey, ttl);
            return result === 1;
        }
        catch (error) {
            console.error(`[Redis] Error setting TTL on key ${key}:`, error);
            throw error;
        }
    }
    async ttl(key, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            return await this.client.ttl(fullKey);
        }
        catch (error) {
            console.error(`[Redis] Error getting TTL of key ${key}:`, error);
            throw error;
        }
    }
    async incr(key, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            return await this.client.incr(fullKey);
        }
        catch (error) {
            console.error(`[Redis] Error incrementing key ${key}:`, error);
            throw error;
        }
    }
    async incrBy(key, increment, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            return await this.client.incrby(fullKey, increment);
        }
        catch (error) {
            console.error(`[Redis] Error incrementing key ${key} by ${increment}:`, error);
            throw error;
        }
    }
    async rateLimit(identifier, options) {
        const key = `rate_limit:${identifier}`;
        const now = Date.now();
        const windowMs = options.windowSeconds * 1000;
        try {
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
            const result = await this.client.eval(script, 1, key, options.maxRequests.toString(), windowMs.toString(), now.toString());
            return {
                allowed: result[0] === 1,
                remaining: result[1],
                resetAt: new Date(result[2]),
            };
        }
        catch (error) {
            console.error(`[Redis] Rate limit error for ${identifier}:`, error);
            return {
                allowed: true,
                remaining: options.maxRequests,
                resetAt: new Date(now + windowMs),
            };
        }
    }
    async mget(keys, options) {
        try {
            const fullKeys = keys.map(k => this.buildKey(k, options?.prefix));
            const values = await this.client.mget(...fullKeys);
            return values.map(v => {
                if (!v)
                    return null;
                try {
                    return JSON.parse(v);
                }
                catch {
                    return null;
                }
            });
        }
        catch (error) {
            console.error('[Redis] Error getting multiple keys:', error);
            throw error;
        }
    }
    async mset(entries, options) {
        try {
            const pipeline = this.client.pipeline();
            for (const [key, value] of Object.entries(entries)) {
                const fullKey = this.buildKey(key, options?.prefix);
                const serialized = JSON.stringify(value);
                if (options?.ttl) {
                    pipeline.setex(fullKey, options.ttl, serialized);
                }
                else {
                    pipeline.set(fullKey, serialized);
                }
            }
            await pipeline.exec();
        }
        catch (error) {
            console.error('[Redis] Error setting multiple keys:', error);
            throw error;
        }
    }
    async deletePattern(pattern, options) {
        try {
            const fullPattern = this.buildKey(pattern, options?.prefix);
            const keys = await this.client.keys(fullPattern);
            if (keys.length === 0) {
                return 0;
            }
            return await this.client.del(...keys);
        }
        catch (error) {
            console.error(`[Redis] Error deleting pattern ${pattern}:`, error);
            throw error;
        }
    }
    async hset(key, field, value, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            const serialized = JSON.stringify(value);
            return await this.client.hset(fullKey, field, serialized);
        }
        catch (error) {
            console.error(`[Redis] Error setting hash field ${field} in ${key}:`, error);
            throw error;
        }
    }
    async hget(key, field, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            const value = await this.client.hget(fullKey, field);
            if (!value) {
                return null;
            }
            return JSON.parse(value);
        }
        catch (error) {
            console.error(`[Redis] Error getting hash field ${field} from ${key}:`, error);
            throw error;
        }
    }
    async hgetall(key, options) {
        try {
            const fullKey = this.buildKey(key, options?.prefix);
            const hash = await this.client.hgetall(fullKey);
            const result = {};
            for (const [field, value] of Object.entries(hash)) {
                try {
                    result[field] = JSON.parse(value);
                }
                catch {
                    result[field] = value;
                }
            }
            return result;
        }
        catch (error) {
            console.error(`[Redis] Error getting all hash fields from ${key}:`, error);
            throw error;
        }
    }
    buildKey(key, prefix) {
        return prefix ? `${prefix}:${key}` : key;
    }
    async flushAll() {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('flushAll is not allowed in production');
        }
        await this.client.flushall();
    }
    async info(section) {
        return await this.client.info(section);
    }
    async ping() {
        return await this.client.ping();
    }
    async disconnect() {
        await this.client.quit();
    }
    getClient() {
        return this.client;
    }
}
exports.RedisClient = RedisClient;
let redisClient = null;
function getRedisClient() {
    if (!redisClient) {
        redisClient = new RedisClient();
    }
    return redisClient;
}
exports.default = getRedisClient;
//# sourceMappingURL=redis-client.js.map