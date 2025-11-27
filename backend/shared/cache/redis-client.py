"""
Redis Client for Blockd Platform
Using redis-py and aioredis for Redis 8.4 cluster support
"""

import json
import os
import time
from typing import Any, Dict, List, Optional, Tuple, Union
from dataclasses import dataclass
from datetime import datetime, timedelta

import redis
from redis.cluster import RedisCluster, ClusterNode
from redis.exceptions import RedisError
import asyncio
import redis.asyncio as aioredis


@dataclass
class CacheOptions:
    """Cache operation options"""
    ttl: Optional[int] = None  # Time to live in seconds
    prefix: Optional[str] = None  # Key prefix


@dataclass
class RateLimitOptions:
    """Rate limiting options"""
    max_requests: int
    window_seconds: int


@dataclass
class RateLimitResult:
    """Rate limiting result"""
    allowed: bool
    remaining: int
    reset_at: datetime


class RedisClient:
    """Synchronous Redis client"""

    def __init__(self):
        self.is_cluster = os.getenv('REDIS_CLUSTER_ENABLED', 'false').lower() == 'true'
        self.client: Union[redis.Redis, RedisCluster]

        if self.is_cluster:
            self.client = self._create_cluster_client()
        else:
            self.client = self._create_standalone_client()

        self._test_connection()

    def _create_standalone_client(self) -> redis.Redis:
        """Create standalone Redis client"""
        return redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', '6379')),
            password=os.getenv('REDIS_PASSWORD'),
            db=int(os.getenv('REDIS_DB', '0')),
            decode_responses=True,
            socket_timeout=10,
            socket_connect_timeout=10,
            retry_on_timeout=True,
            health_check_interval=30,
        )

    def _create_cluster_client(self) -> RedisCluster:
        """Create Redis cluster client"""
        startup_nodes = [
            ClusterNode('172.28.0.11', 6379),
            ClusterNode('172.28.0.12', 6379),
            ClusterNode('172.28.0.13', 6379),
            ClusterNode('172.28.0.14', 6379),
            ClusterNode('172.28.0.15', 6379),
            ClusterNode('172.28.0.16', 6379),
        ]

        return RedisCluster(
            startup_nodes=startup_nodes,
            password=os.getenv('REDIS_PASSWORD'),
            decode_responses=True,
            skip_full_coverage_check=False,
            socket_timeout=10,
            socket_connect_timeout=10,
            retry_on_timeout=True,
            health_check_interval=30,
        )

    def _test_connection(self) -> None:
        """Test Redis connection"""
        try:
            self.client.ping()
            print("[Redis] Connected to Redis server")
        except RedisError as e:
            print(f"[Redis] Failed to connect to Redis: {e}")
            raise

    def _build_key(self, key: str, prefix: Optional[str] = None) -> str:
        """Build full key with optional prefix"""
        return f"{prefix}:{key}" if prefix else key

    def get(self, key: str, options: Optional[CacheOptions] = None) -> Optional[Any]:
        """Get value from cache"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            value = self.client.get(full_key)

            if value is None:
                return None

            return json.loads(value)
        except RedisError as e:
            print(f"[Redis] Error getting key {key}: {e}")
            raise

    def set(self, key: str, value: Any, options: Optional[CacheOptions] = None) -> None:
        """Set value in cache"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            serialized = json.dumps(value)

            if opts.ttl:
                self.client.setex(full_key, opts.ttl, serialized)
            else:
                self.client.set(full_key, serialized)
        except RedisError as e:
            print(f"[Redis] Error setting key {key}: {e}")
            raise

    def delete(self, key: str, options: Optional[CacheOptions] = None) -> int:
        """Delete key from cache"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            return self.client.delete(full_key)
        except RedisError as e:
            print(f"[Redis] Error deleting key {key}: {e}")
            raise

    def exists(self, key: str, options: Optional[CacheOptions] = None) -> bool:
        """Check if key exists"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            return self.client.exists(full_key) == 1
        except RedisError as e:
            print(f"[Redis] Error checking existence of key {key}: {e}")
            raise

    def expire(self, key: str, ttl: int, options: Optional[CacheOptions] = None) -> bool:
        """Set TTL on existing key"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            return self.client.expire(full_key, ttl) == 1
        except RedisError as e:
            print(f"[Redis] Error setting TTL on key {key}: {e}")
            raise

    def ttl(self, key: str, options: Optional[CacheOptions] = None) -> int:
        """Get TTL of a key"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            return self.client.ttl(full_key)
        except RedisError as e:
            print(f"[Redis] Error getting TTL of key {key}: {e}")
            raise

    def incr(self, key: str, options: Optional[CacheOptions] = None) -> int:
        """Increment counter (atomic operation)"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            return self.client.incr(full_key)
        except RedisError as e:
            print(f"[Redis] Error incrementing key {key}: {e}")
            raise

    def incrby(self, key: str, increment: int, options: Optional[CacheOptions] = None) -> int:
        """Increment counter by value (atomic operation)"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            return self.client.incrby(full_key, increment)
        except RedisError as e:
            print(f"[Redis] Error incrementing key {key} by {increment}: {e}")
            raise

    def rate_limit(
        self,
        identifier: str,
        options: RateLimitOptions
    ) -> RateLimitResult:
        """Rate limiting using token bucket algorithm"""
        key = f"rate_limit:{identifier}"
        now = int(time.time() * 1000)
        window_ms = options.window_seconds * 1000

        lua_script = """
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
        """

        try:
            result = self.client.eval(
                lua_script,
                1,
                key,
                options.max_requests,
                window_ms,
                now
            )

            return RateLimitResult(
                allowed=result[0] == 1,
                remaining=result[1],
                reset_at=datetime.fromtimestamp(result[2] / 1000)
            )
        except RedisError as e:
            print(f"[Redis] Rate limit error for {identifier}: {e}")
            # Fail open - allow request if Redis is down
            return RateLimitResult(
                allowed=True,
                remaining=options.max_requests,
                reset_at=datetime.now() + timedelta(seconds=options.window_seconds)
            )

    def mget(self, keys: List[str], options: Optional[CacheOptions] = None) -> List[Optional[Any]]:
        """Get multiple keys at once"""
        try:
            opts = options or CacheOptions()
            full_keys = [self._build_key(k, opts.prefix) for k in keys]
            values = self.client.mget(full_keys)

            result = []
            for value in values:
                if value is None:
                    result.append(None)
                else:
                    try:
                        result.append(json.loads(value))
                    except json.JSONDecodeError:
                        result.append(None)

            return result
        except RedisError as e:
            print(f"[Redis] Error getting multiple keys: {e}")
            raise

    def mset(self, entries: Dict[str, Any], options: Optional[CacheOptions] = None) -> None:
        """Set multiple keys at once"""
        try:
            opts = options or CacheOptions()
            pipeline = self.client.pipeline()

            for key, value in entries.items():
                full_key = self._build_key(key, opts.prefix)
                serialized = json.dumps(value)

                if opts.ttl:
                    pipeline.setex(full_key, opts.ttl, serialized)
                else:
                    pipeline.set(full_key, serialized)

            pipeline.execute()
        except RedisError as e:
            print(f"[Redis] Error setting multiple keys: {e}")
            raise

    def delete_pattern(self, pattern: str, options: Optional[CacheOptions] = None) -> int:
        """Delete keys by pattern"""
        try:
            opts = options or CacheOptions()
            full_pattern = self._build_key(pattern, opts.prefix)
            keys = list(self.client.scan_iter(match=full_pattern, count=100))

            if not keys:
                return 0

            return self.client.delete(*keys)
        except RedisError as e:
            print(f"[Redis] Error deleting pattern {pattern}: {e}")
            raise

    def hset(self, key: str, field: str, value: Any, options: Optional[CacheOptions] = None) -> int:
        """Hash operations - set field"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            serialized = json.dumps(value)
            return self.client.hset(full_key, field, serialized)
        except RedisError as e:
            print(f"[Redis] Error setting hash field {field} in {key}: {e}")
            raise

    def hget(self, key: str, field: str, options: Optional[CacheOptions] = None) -> Optional[Any]:
        """Hash operations - get field"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            value = self.client.hget(full_key, field)

            if value is None:
                return None

            return json.loads(value)
        except RedisError as e:
            print(f"[Redis] Error getting hash field {field} from {key}: {e}")
            raise

    def hgetall(self, key: str, options: Optional[CacheOptions] = None) -> Dict[str, Any]:
        """Hash operations - get all fields"""
        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            hash_data = self.client.hgetall(full_key)

            result = {}
            for field, value in hash_data.items():
                try:
                    result[field] = json.loads(value)
                except json.JSONDecodeError:
                    result[field] = value

            return result
        except RedisError as e:
            print(f"[Redis] Error getting all hash fields from {key}: {e}")
            raise

    def flushall(self) -> None:
        """Flush all keys (use with caution!)"""
        if os.getenv('ENV', 'development') == 'production':
            raise RuntimeError('flushall is not allowed in production')
        self.client.flushall()

    def info(self, section: Optional[str] = None) -> str:
        """Get Redis info"""
        return self.client.info(section)

    def ping(self) -> bool:
        """Ping Redis server"""
        return self.client.ping()

    def close(self) -> None:
        """Close Redis connection"""
        self.client.close()

    def get_client(self) -> Union[redis.Redis, RedisCluster]:
        """Get the underlying Redis client"""
        return self.client


class AsyncRedisClient:
    """Asynchronous Redis client"""

    def __init__(self):
        self.is_cluster = os.getenv('REDIS_CLUSTER_ENABLED', 'false').lower() == 'true'
        self.client: Optional[Union[aioredis.Redis, aioredis.RedisCluster]] = None
        self._initialized = False

    async def initialize(self):
        """Initialize the async client"""
        if self._initialized:
            return

        if self.is_cluster:
            self.client = await self._create_cluster_client()
        else:
            self.client = await self._create_standalone_client()

        await self._test_connection()
        self._initialized = True

    async def _create_standalone_client(self) -> aioredis.Redis:
        """Create standalone async Redis client"""
        return aioredis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', '6379')),
            password=os.getenv('REDIS_PASSWORD'),
            db=int(os.getenv('REDIS_DB', '0')),
            decode_responses=True,
            socket_timeout=10,
            socket_connect_timeout=10,
        )

    async def _create_cluster_client(self) -> aioredis.RedisCluster:
        """Create async Redis cluster client"""
        startup_nodes = [
            aioredis.cluster.ClusterNode('172.28.0.11', 6379),
            aioredis.cluster.ClusterNode('172.28.0.12', 6379),
            aioredis.cluster.ClusterNode('172.28.0.13', 6379),
            aioredis.cluster.ClusterNode('172.28.0.14', 6379),
            aioredis.cluster.ClusterNode('172.28.0.15', 6379),
            aioredis.cluster.ClusterNode('172.28.0.16', 6379),
        ]

        return aioredis.RedisCluster(
            startup_nodes=startup_nodes,
            password=os.getenv('REDIS_PASSWORD'),
            decode_responses=True,
        )

    async def _test_connection(self) -> None:
        """Test Redis connection"""
        try:
            await self.client.ping()
            print("[Redis] Connected to async Redis server")
        except RedisError as e:
            print(f"[Redis] Failed to connect to async Redis: {e}")
            raise

    def _build_key(self, key: str, prefix: Optional[str] = None) -> str:
        """Build full key with optional prefix"""
        return f"{prefix}:{key}" if prefix else key

    async def get(self, key: str, options: Optional[CacheOptions] = None) -> Optional[Any]:
        """Get value from cache"""
        if not self._initialized:
            await self.initialize()

        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            value = await self.client.get(full_key)

            if value is None:
                return None

            return json.loads(value)
        except RedisError as e:
            print(f"[Redis] Error getting key {key}: {e}")
            raise

    async def set(self, key: str, value: Any, options: Optional[CacheOptions] = None) -> None:
        """Set value in cache"""
        if not self._initialized:
            await self.initialize()

        try:
            opts = options or CacheOptions()
            full_key = self._build_key(key, opts.prefix)
            serialized = json.dumps(value)

            if opts.ttl:
                await self.client.setex(full_key, opts.ttl, serialized)
            else:
                await self.client.set(full_key, serialized)
        except RedisError as e:
            print(f"[Redis] Error setting key {key}: {e}")
            raise

    async def close(self) -> None:
        """Close Redis connection"""
        if self.client:
            await self.client.close()


# Singleton instances
_redis_client: Optional[RedisClient] = None
_async_redis_client: Optional[AsyncRedisClient] = None


def get_redis_client() -> RedisClient:
    """Get singleton Redis client instance"""
    global _redis_client
    if _redis_client is None:
        _redis_client = RedisClient()
    return _redis_client


def get_async_redis_client() -> AsyncRedisClient:
    """Get singleton async Redis client instance"""
    global _async_redis_client
    if _async_redis_client is None:
        _async_redis_client = AsyncRedisClient()
    return _async_redis_client
