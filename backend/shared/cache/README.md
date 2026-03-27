# Blockd Cache Utilities

Redis-based caching utilities for the Blockd platform, supporting both TypeScript and Python.

## Features

- Redis 8.4 cluster support
- TypeScript client with ioredis
- Python client with redis-py and aioredis
- Built-in rate limiting with token bucket algorithm
- Pre-configured caching strategies for Blockd use cases
- Automatic retry and failover support
- Type-safe interfaces

## Installation

### TypeScript/Node.js

```bash
npm install
# or
yarn install
```

### Python

```bash
pip install -r requirements.txt
```

## Quick Start

### TypeScript

```typescript
import { getRedisClient, cacheManager } from './redis-client';

// Basic operations
const redis = getRedisClient();
await redis.set('key', { value: 'data' }, { ttl: 3600 });
const data = await redis.get('key');

// Using cache managers
await cacheManager.session.set('session-123', { userId: 'user-456' });
const session = await cacheManager.session.get('session-123');

// Rate limiting
const result = await cacheManager.rateLimit.checkPublic('192.168.1.1', '/api/endpoint');
if (!result.allowed) {
  console.log(`Rate limited. Try again at: ${result.resetAt}`);
}

// AI answer caching
await cacheManager.aiAnswer.set(
  'What is Blockd?',
  'gpt-4',
  'Blockd is a gaze tracking platform...',
  [0.1, 0.2, 0.3]  // embedding
);
```

### Python

```python
from redis_client import get_redis_client, CacheOptions, RateLimitOptions

# Basic operations
redis = get_redis_client()
redis.set('key', {'value': 'data'}, CacheOptions(ttl=3600))
data = redis.get('key')

# Rate limiting
result = redis.rate_limit(
    'user-123',
    RateLimitOptions(max_requests=100, window_seconds=60)
)
if not result.allowed:
    print(f"Rate limited. Try again at: {result.reset_at}")

# Hash operations
redis.hset('user:123', 'name', {'first': 'John', 'last': 'Doe'})
name = redis.hget('user:123', 'name')
```

### Python Async

```python
import asyncio
from redis_client import get_async_redis_client, CacheOptions

async def main():
    redis = get_async_redis_client()
    await redis.initialize()

    await redis.set('key', {'value': 'data'}, CacheOptions(ttl=3600))
    data = await redis.get('key')

    await redis.close()

asyncio.run(main())
```

## Cache Key Patterns

### Session Data
```
Pattern: session:{session_id}
TTL: 1 hour (dynamic based on session duration)
Example: session:550e8400-e29b-41d4-a716-446655440000
```

### AI Answers
```
Pattern: ai_answer:{question_hash}:{model}
TTL: 24 hours
Example: ai_answer:a1b2c3d4e5f6g7h8:gpt-4
```

### Rate Limiting
```
Pattern: rate_limit:{ip}:{endpoint}
TTL: 60 seconds
Example: rate_limit:192.168.1.100:/api/v1/sessions
```

### User Sessions
```
Pattern: user_session:{token_hash}
TTL: 1 hour
Example: user_session:x9y8z7w6v5u4t3s2
```

### Gaze Realtime Data
```
Pattern: gaze_realtime:{session_id}
TTL: 30 seconds
Example: gaze_realtime:550e8400-e29b-41d4-a716-446655440000
```

## Rate Limiting

The cache includes built-in rate limiting using the token bucket algorithm:

### Configurations

- **Public Endpoints**: 100 requests/minute
- **Authenticated Endpoints**: 500 requests/minute
- **AI Endpoints**: 50 requests/minute
- **Gaze Upload**: 1000 requests/minute

### Usage

```typescript
// TypeScript
const result = await cacheManager.rateLimit.checkPublic('user-ip', '/api/endpoint');
if (!result.allowed) {
  throw new Error(`Rate limit exceeded. ${result.remaining} requests remaining.`);
}
```

```python
# Python
result = redis.rate_limit(
    'user-ip',
    RateLimitOptions(max_requests=100, window_seconds=60)
)
if not result.allowed:
    raise Exception(f"Rate limit exceeded. {result.remaining} requests remaining.")
```

## Cache Managers (TypeScript)

### Session Cache
```typescript
await cacheManager.session.set(sessionId, sessionData, ttl);
const session = await cacheManager.session.get(sessionId);
await cacheManager.session.extend(sessionId, 3600);
await cacheManager.session.delete(sessionId);
```

### AI Answer Cache
```typescript
await cacheManager.aiAnswer.set(question, model, answer, embedding);
const cached = await cacheManager.aiAnswer.get(question, model);
await cacheManager.aiAnswer.clearByModel('gpt-4');
```

### User Session Cache
```typescript
await cacheManager.userSession.set(token, userData);
const user = await cacheManager.userSession.get(token);
await cacheManager.userSession.refresh(token);
await cacheManager.userSession.delete(token);
```

### Gaze Realtime Cache
```typescript
await cacheManager.gazeRealtime.set(sessionId, gazeData);
const gaze = await cacheManager.gazeRealtime.get(sessionId);
const multiple = await cacheManager.gazeRealtime.getMany([sessionId1, sessionId2]);
```

### Analytics Cache
```typescript
await cacheManager.analytics.set(studyId, 'heatmap', data, ttl);
const heatmap = await cacheManager.analytics.get(studyId, 'heatmap');
await cacheManager.analytics.clearStudy(studyId);
```

## Configuration

### Environment Variables

```bash
# Cluster mode (recommended for production)
export REDIS_CLUSTER_ENABLED=true

# Standalone mode
export REDIS_CLUSTER_ENABLED=false
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_DB=0

# Optional
export REDIS_PASSWORD=your-password
```

### TypeScript Configuration

```typescript
// The client automatically detects cluster mode based on environment variables
// No additional configuration needed
```

### Python Configuration

```python
# The client automatically detects cluster mode based on environment variables
# No additional configuration needed
```

## Testing

### TypeScript Tests

```bash
# Make sure Redis is running
cd infrastructure/redis
./start-cluster.sh

# Run tests
cd backend/shared/cache
npm test
```

### Python Tests

```bash
# Make sure Redis is running
cd infrastructure/redis
./start-cluster.sh

# Run tests
cd backend/shared/cache
python test-redis.py
```

## Performance

### Benchmarks

Expected performance on modern hardware:

- **Get operations**: 100,000+ ops/sec
- **Set operations**: 80,000+ ops/sec
- **Atomic operations**: 50,000+ ops/sec
- **Latency (p50)**: < 1ms
- **Latency (p99)**: < 10ms

### Optimization Tips

1. **Use pipelining** for batch operations
2. **Use hash operations** for related data
3. **Set appropriate TTLs** to prevent memory bloat
4. **Use atomic operations** (INCR, HINCRBY) for counters
5. **Monitor memory usage** and adjust eviction policy

## Error Handling

The cache clients implement automatic retry logic and fail-safe behavior:

```typescript
// TypeScript - automatically retries with exponential backoff
try {
  await redis.set('key', 'value');
} catch (error) {
  console.error('Cache operation failed:', error);
  // Application continues without cache
}

// Rate limiting fails open (allows request if Redis is down)
const result = await rateLimit.check('user', 'endpoint', config);
// result.allowed will be true if Redis is unavailable
```

```python
# Python - automatically retries with exponential backoff
try:
    redis.set('key', 'value')
except RedisError as e:
    print(f"Cache operation failed: {e}")
    # Application continues without cache

# Rate limiting fails open (allows request if Redis is down)
result = redis.rate_limit('user', options)
# result.allowed will be True if Redis is unavailable
```

## Monitoring

### Health Check

```typescript
// TypeScript
const healthy = await cacheManager.healthCheck();
console.log('Cache healthy:', healthy);

const stats = await cacheManager.getStats();
console.log('Cache stats:', stats);
```

```python
# Python
healthy = redis.ping()
print(f"Cache healthy: {healthy}")

info = redis.info('stats')
print(f"Cache stats: {info}")
```

### Key Metrics

Monitor these Redis metrics:

- `used_memory` - Current memory usage
- `mem_fragmentation_ratio` - Memory fragmentation
- `instantaneous_ops_per_sec` - Operations per second
- `keyspace_hits` and `keyspace_misses` - Cache hit rate
- `connected_clients` - Number of connections
- `evicted_keys` - Number of evicted keys
- `expired_keys` - Number of expired keys

## Production Checklist

- [ ] Enable password authentication (`REDIS_PASSWORD`)
- [ ] Configure TLS/SSL for encryption in transit
- [ ] Set up monitoring and alerting
- [ ] Configure backup procedures
- [ ] Test failover scenarios
- [ ] Set appropriate memory limits
- [ ] Configure firewall rules
- [ ] Enable Redis ACLs for fine-grained permissions
- [ ] Regular security audits and updates
- [ ] Load testing and capacity planning

## API Reference

### RedisClient (TypeScript/Python)

#### Basic Operations
- `get(key, options?)` - Get value from cache
- `set(key, value, options?)` - Set value in cache
- `del(key, options?)` - Delete key from cache
- `exists(key, options?)` - Check if key exists
- `expire(key, ttl, options?)` - Set TTL on existing key
- `ttl(key, options?)` - Get TTL of a key

#### Atomic Operations
- `incr(key, options?)` - Increment counter
- `incrBy(key, increment, options?)` - Increment counter by value

#### Batch Operations
- `mget(keys, options?)` - Get multiple keys
- `mset(entries, options?)` - Set multiple keys
- `deletePattern(pattern, options?)` - Delete keys by pattern

#### Hash Operations
- `hset(key, field, value, options?)` - Set hash field
- `hget(key, field, options?)` - Get hash field
- `hgetall(key, options?)` - Get all hash fields

#### Rate Limiting
- `rateLimit(identifier, options)` - Check rate limit

#### Utility
- `ping()` - Ping Redis server
- `info(section?)` - Get Redis info
- `disconnect()` / `close()` - Close connection

## Troubleshooting

### Connection Issues

**Problem**: Cannot connect to Redis cluster

**Solution**:
1. Verify Redis is running: `docker-compose ps`
2. Check cluster status: `docker exec blockd-redis-node-1 redis-cli cluster info`
3. Verify network connectivity
4. Check environment variables

### Performance Issues

**Problem**: Slow cache operations

**Solution**:
1. Check Redis latency: `redis-cli --latency`
2. Review slow log: `redis-cli slowlog get 10`
3. Monitor memory usage: `redis-cli info memory`
4. Check network latency
5. Review query patterns

### Memory Issues

**Problem**: Redis running out of memory

**Solution**:
1. Check current usage: `redis-cli info memory`
2. Find largest keys: `redis-cli --bigkeys`
3. Review TTL configurations
4. Adjust eviction policy
5. Increase memory limit or add nodes

## Additional Resources

- [Redis Documentation](https://redis.io/documentation)
- [ioredis Documentation](https://github.com/redis/ioredis)
- [redis-py Documentation](https://redis-py.readthedocs.io/)
- [Blockd Documentation](/docs/)

## License

MIT
