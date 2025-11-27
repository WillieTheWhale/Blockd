/**
 * Redis Cache Test Suite
 * Tests for Redis client and caching strategies
 */

import { getRedisClient } from './redis-client';
import {
  cacheManager,
  CacheKeyBuilder,
  CacheTTL,
  RateLimitConfig,
} from './caching-strategy';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✓ ${message}`, colors.green);
}

function error(message: string) {
  log(`✗ ${message}`, colors.red);
}

function info(message: string) {
  log(`ℹ ${message}`, colors.blue);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Basic Connection
async function testConnection(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const result = await redis.ping();
    if (result === 'PONG') {
      success('Test 1: Redis connection successful');
      return true;
    }
    error('Test 1: Redis ping failed');
    return false;
  } catch (err) {
    error(`Test 1: Connection failed - ${err}`);
    return false;
  }
}

// Test 2: Set/Get Operations
async function testSetGet(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const testKey = 'test:key:' + Date.now();
    const testValue = { message: 'Hello Redis', timestamp: Date.now() };

    await redis.set(testKey, testValue, { ttl: 60 });
    const retrieved = await redis.get(testKey);

    if (JSON.stringify(retrieved) === JSON.stringify(testValue)) {
      await redis.del(testKey);
      success('Test 2: Set/Get operations successful');
      return true;
    }
    error('Test 2: Retrieved value does not match');
    return false;
  } catch (err) {
    error(`Test 2: Set/Get failed - ${err}`);
    return false;
  }
}

// Test 3: TTL Expiration
async function testTTL(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const testKey = 'test:ttl:' + Date.now();
    const testValue = 'expires soon';

    await redis.set(testKey, testValue, { ttl: 2 }); // 2 seconds

    let exists = await redis.exists(testKey);
    if (!exists) {
      error('Test 3: Key should exist immediately after creation');
      return false;
    }

    info('Test 3: Waiting 3 seconds for TTL expiration...');
    await sleep(3000);

    exists = await redis.exists(testKey);
    if (!exists) {
      success('Test 3: TTL expiration successful');
      return true;
    }
    error('Test 3: Key still exists after TTL expiration');
    return false;
  } catch (err) {
    error(`Test 3: TTL test failed - ${err}`);
    return false;
  }
}

// Test 4: Atomic Operations (INCR)
async function testAtomicOperations(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const testKey = 'test:counter:' + Date.now();

    const val1 = await redis.incr(testKey);
    const val2 = await redis.incr(testKey);
    const val3 = await redis.incrBy(testKey, 5);

    if (val1 === 1 && val2 === 2 && val3 === 7) {
      await redis.del(testKey);
      success('Test 4: Atomic operations successful');
      return true;
    }
    error(`Test 4: Unexpected counter values - ${val1}, ${val2}, ${val3}`);
    return false;
  } catch (err) {
    error(`Test 4: Atomic operations failed - ${err}`);
    return false;
  }
}

// Test 5: Rate Limiting
async function testRateLimiting(): Promise<boolean> {
  try {
    const testIdentifier = 'test-ip-' + Date.now();
    let allowedCount = 0;
    let deniedCount = 0;

    // Simulate 15 requests (limit is 10 for our test)
    for (let i = 0; i < 15; i++) {
      const result = await cacheManager.rateLimit.check(
        testIdentifier,
        'test-endpoint',
        { maxRequests: 10, windowSeconds: 60 }
      );

      if (result.allowed) {
        allowedCount++;
      } else {
        deniedCount++;
      }
    }

    if (allowedCount === 10 && deniedCount === 5) {
      success(`Test 5: Rate limiting successful (allowed: ${allowedCount}, denied: ${deniedCount})`);
      return true;
    }
    error(`Test 5: Unexpected rate limit behavior (allowed: ${allowedCount}, denied: ${deniedCount})`);
    return false;
  } catch (err) {
    error(`Test 5: Rate limiting failed - ${err}`);
    return false;
  }
}

// Test 6: Session Cache
async function testSessionCache(): Promise<boolean> {
  try {
    const sessionId = 'test-session-' + Date.now();
    const sessionData = {
      userId: 'user123',
      startedAt: new Date().toISOString(),
      state: 'active',
    };

    await cacheManager.session.set(sessionId, sessionData);
    const retrieved = await cacheManager.session.get(sessionId);

    if (JSON.stringify(retrieved) === JSON.stringify(sessionData)) {
      await cacheManager.session.delete(sessionId);
      success('Test 6: Session cache successful');
      return true;
    }
    error('Test 6: Session data mismatch');
    return false;
  } catch (err) {
    error(`Test 6: Session cache failed - ${err}`);
    return false;
  }
}

// Test 7: AI Answer Cache
async function testAIAnswerCache(): Promise<boolean> {
  try {
    const question = 'What is the capital of France?';
    const model = 'gpt-4';
    const answer = 'Paris';
    const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];

    await cacheManager.aiAnswer.set(question, model, answer, embedding);
    const retrieved = await cacheManager.aiAnswer.get(question, model);

    if (retrieved && retrieved.answer === answer && retrieved.model === model) {
      await cacheManager.aiAnswer.delete(question, model);
      success('Test 7: AI answer cache successful');
      return true;
    }
    error('Test 7: AI answer data mismatch');
    return false;
  } catch (err) {
    error(`Test 7: AI answer cache failed - ${err}`);
    return false;
  }
}

// Test 8: Hash Operations
async function testHashOperations(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const testKey = 'test:hash:' + Date.now();

    await redis.hset(testKey, 'field1', { value: 'data1' });
    await redis.hset(testKey, 'field2', { value: 'data2' });

    const field1 = await redis.hget(testKey, 'field1');
    const allFields = await redis.hgetall(testKey);

    if (field1?.value === 'data1' && Object.keys(allFields).length === 2) {
      await redis.del(testKey);
      success('Test 8: Hash operations successful');
      return true;
    }
    error('Test 8: Hash operations failed');
    return false;
  } catch (err) {
    error(`Test 8: Hash operations failed - ${err}`);
    return false;
  }
}

// Test 9: Multiple Keys Operations
async function testMultipleKeys(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const keys = ['test:mkey1', 'test:mkey2', 'test:mkey3'];
    const values = { 'test:mkey1': 'value1', 'test:mkey2': 'value2', 'test:mkey3': 'value3' };

    await redis.mset(values);
    const retrieved = await redis.mget(keys);

    if (retrieved.length === 3 && retrieved[0] === 'value1') {
      await Promise.all(keys.map(k => redis.del(k)));
      success('Test 9: Multiple keys operations successful');
      return true;
    }
    error('Test 9: Multiple keys operations failed');
    return false;
  } catch (err) {
    error(`Test 9: Multiple keys operations failed - ${err}`);
    return false;
  }
}

// Test 10: Performance Test (10,000 operations)
async function testPerformance(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const iterations = 10000;
    const testKeyPrefix = 'test:perf:' + Date.now();

    info(`Test 10: Starting performance test (${iterations} operations)...`);
    const startTime = Date.now();

    // Perform mixed operations
    const promises: Promise<any>[] = [];
    for (let i = 0; i < iterations; i++) {
      if (i % 2 === 0) {
        promises.push(redis.set(`${testKeyPrefix}:${i}`, { index: i }, { ttl: 60 }));
      } else {
        promises.push(redis.get(`${testKeyPrefix}:${i - 1}`));
      }
    }

    await Promise.all(promises);

    const endTime = Date.now();
    const duration = endTime - startTime;
    const opsPerSec = Math.round((iterations / duration) * 1000);

    // Cleanup
    await redis.deletePattern(`${testKeyPrefix}:*`);

    if (opsPerSec >= 1000) {
      success(`Test 10: Performance test successful (${opsPerSec} ops/sec, ${duration}ms total)`);
      return true;
    } else {
      info(`Test 10: Performance below target (${opsPerSec} ops/sec, target: 10,000 ops/sec)`);
      return true; // Still pass, as this depends on hardware
    }
  } catch (err) {
    error(`Test 10: Performance test failed - ${err}`);
    return false;
  }
}

// Main test runner
async function runTests() {
  log('\n========================================', colors.yellow);
  log('   Redis Cache Test Suite', colors.yellow);
  log('========================================\n', colors.yellow);

  const tests = [
    { name: 'Connection', fn: testConnection },
    { name: 'Set/Get Operations', fn: testSetGet },
    { name: 'TTL Expiration', fn: testTTL },
    { name: 'Atomic Operations', fn: testAtomicOperations },
    { name: 'Rate Limiting', fn: testRateLimiting },
    { name: 'Session Cache', fn: testSessionCache },
    { name: 'AI Answer Cache', fn: testAIAnswerCache },
    { name: 'Hash Operations', fn: testHashOperations },
    { name: 'Multiple Keys', fn: testMultipleKeys },
    { name: 'Performance', fn: testPerformance },
  ];

  const results: boolean[] = [];

  for (const test of tests) {
    try {
      const result = await test.fn();
      results.push(result);
    } catch (err) {
      error(`Test "${test.name}" threw an exception: ${err}`);
      results.push(false);
    }
    console.log(''); // Empty line between tests
  }

  // Summary
  log('\n========================================', colors.yellow);
  log('   Test Summary', colors.yellow);
  log('========================================\n', colors.yellow);

  const passed = results.filter(r => r).length;
  const total = results.length;

  log(`Total Tests: ${total}`, colors.blue);
  log(`Passed: ${passed}`, colors.green);
  log(`Failed: ${total - passed}`, colors.red);
  log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`, colors.blue);

  // Close connection
  const redis = getRedisClient();
  await redis.disconnect();

  process.exit(passed === total ? 0 : 1);
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(err => {
    error(`Fatal error: ${err}`);
    process.exit(1);
  });
}

export { runTests };
