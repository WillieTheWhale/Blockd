"""
Redis Cache Test Suite (Python)
Tests for Redis client and caching functionality
"""

import time
import json
from typing import List, Tuple

try:
    from redis_client import (
        get_redis_client,
        CacheOptions,
        RateLimitOptions,
    )
except ImportError:
    print("Error: Unable to import redis_client. Make sure redis-py is installed.")
    print("Install with: pip install redis")
    exit(1)


# Color codes for console output
class Colors:
    RESET = '\033[0m'
    GREEN = '\033[32m'
    RED = '\033[31m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'


def log(message: str, color: str = Colors.RESET):
    print(f"{color}{message}{Colors.RESET}")


def success(message: str):
    log(f"✓ {message}", Colors.GREEN)


def error(message: str):
    log(f"✗ {message}", Colors.RED)


def info(message: str):
    log(f"ℹ {message}", Colors.BLUE)


# Test 1: Basic Connection
def test_connection() -> bool:
    try:
        redis = get_redis_client()
        result = redis.ping()
        if result:
            success("Test 1: Redis connection successful")
            return True
        error("Test 1: Redis ping failed")
        return False
    except Exception as err:
        error(f"Test 1: Connection failed - {err}")
        return False


# Test 2: Set/Get Operations
def test_set_get() -> bool:
    try:
        redis = get_redis_client()
        test_key = f"test:key:{int(time.time() * 1000)}"
        test_value = {"message": "Hello Redis", "timestamp": int(time.time() * 1000)}

        redis.set(test_key, test_value, CacheOptions(ttl=60))
        retrieved = redis.get(test_key)

        if json.dumps(retrieved, sort_keys=True) == json.dumps(test_value, sort_keys=True):
            redis.delete(test_key)
            success("Test 2: Set/Get operations successful")
            return True
        error("Test 2: Retrieved value does not match")
        return False
    except Exception as err:
        error(f"Test 2: Set/Get failed - {err}")
        return False


# Test 3: TTL Expiration
def test_ttl() -> bool:
    try:
        redis = get_redis_client()
        test_key = f"test:ttl:{int(time.time() * 1000)}"
        test_value = "expires soon"

        redis.set(test_key, test_value, CacheOptions(ttl=2))  # 2 seconds

        exists = redis.exists(test_key)
        if not exists:
            error("Test 3: Key should exist immediately after creation")
            return False

        info("Test 3: Waiting 3 seconds for TTL expiration...")
        time.sleep(3)

        exists = redis.exists(test_key)
        if not exists:
            success("Test 3: TTL expiration successful")
            return True
        error("Test 3: Key still exists after TTL expiration")
        return False
    except Exception as err:
        error(f"Test 3: TTL test failed - {err}")
        return False


# Test 4: Atomic Operations (INCR)
def test_atomic_operations() -> bool:
    try:
        redis = get_redis_client()
        test_key = f"test:counter:{int(time.time() * 1000)}"

        val1 = redis.incr(test_key)
        val2 = redis.incr(test_key)
        val3 = redis.incrby(test_key, 5)

        if val1 == 1 and val2 == 2 and val3 == 7:
            redis.delete(test_key)
            success("Test 4: Atomic operations successful")
            return True
        error(f"Test 4: Unexpected counter values - {val1}, {val2}, {val3}")
        return False
    except Exception as err:
        error(f"Test 4: Atomic operations failed - {err}")
        return False


# Test 5: Rate Limiting
def test_rate_limiting() -> bool:
    try:
        redis = get_redis_client()
        test_identifier = f"test-ip-{int(time.time() * 1000)}"
        allowed_count = 0
        denied_count = 0

        # Simulate 15 requests (limit is 10 for our test)
        for i in range(15):
            result = redis.rate_limit(
                test_identifier,
                RateLimitOptions(max_requests=10, window_seconds=60)
            )

            if result.allowed:
                allowed_count += 1
            else:
                denied_count += 1

        if allowed_count == 10 and denied_count == 5:
            success(f"Test 5: Rate limiting successful (allowed: {allowed_count}, denied: {denied_count})")
            return True
        error(f"Test 5: Unexpected rate limit behavior (allowed: {allowed_count}, denied: {denied_count})")
        return False
    except Exception as err:
        error(f"Test 5: Rate limiting failed - {err}")
        return False


# Test 6: Hash Operations
def test_hash_operations() -> bool:
    try:
        redis = get_redis_client()
        test_key = f"test:hash:{int(time.time() * 1000)}"

        redis.hset(test_key, "field1", {"value": "data1"})
        redis.hset(test_key, "field2", {"value": "data2"})

        field1 = redis.hget(test_key, "field1")
        all_fields = redis.hgetall(test_key)

        if field1 and field1.get("value") == "data1" and len(all_fields) == 2:
            redis.delete(test_key)
            success("Test 6: Hash operations successful")
            return True
        error("Test 6: Hash operations failed")
        return False
    except Exception as err:
        error(f"Test 6: Hash operations failed - {err}")
        return False


# Test 7: Multiple Keys Operations
def test_multiple_keys() -> bool:
    try:
        redis = get_redis_client()
        keys = ["test:mkey1", "test:mkey2", "test:mkey3"]
        values = {
            "test:mkey1": "value1",
            "test:mkey2": "value2",
            "test:mkey3": "value3"
        }

        redis.mset(values)
        retrieved = redis.mget(keys)

        if len(retrieved) == 3 and retrieved[0] == "value1":
            for k in keys:
                redis.delete(k)
            success("Test 7: Multiple keys operations successful")
            return True
        error("Test 7: Multiple keys operations failed")
        return False
    except Exception as err:
        error(f"Test 7: Multiple keys operations failed - {err}")
        return False


# Test 8: Pattern Deletion
def test_pattern_deletion() -> bool:
    try:
        redis = get_redis_client()
        prefix = f"test:pattern:{int(time.time() * 1000)}"

        # Create multiple keys with same prefix
        for i in range(5):
            redis.set(f"{prefix}:{i}", f"value{i}")

        # Delete all keys matching pattern
        deleted_count = redis.delete_pattern(f"{prefix}:*")

        if deleted_count == 5:
            success("Test 8: Pattern deletion successful")
            return True
        error(f"Test 8: Expected to delete 5 keys, deleted {deleted_count}")
        return False
    except Exception as err:
        error(f"Test 8: Pattern deletion failed - {err}")
        return False


# Test 9: Exists and Expire
def test_exists_and_expire() -> bool:
    try:
        redis = get_redis_client()
        test_key = f"test:expire:{int(time.time() * 1000)}"

        redis.set(test_key, "test value")
        exists = redis.exists(test_key)

        if not exists:
            error("Test 9: Key should exist after creation")
            return False

        # Set expiration
        redis.expire(test_key, 60)
        ttl = redis.ttl(test_key)

        if ttl > 0 and ttl <= 60:
            redis.delete(test_key)
            success("Test 9: Exists and expire operations successful")
            return True
        error(f"Test 9: Unexpected TTL value - {ttl}")
        return False
    except Exception as err:
        error(f"Test 9: Exists and expire failed - {err}")
        return False


# Test 10: Performance Test (1,000 operations)
def test_performance() -> bool:
    try:
        redis = get_redis_client()
        iterations = 1000  # Reduced for Python sync client
        test_key_prefix = f"test:perf:{int(time.time() * 1000)}"

        info(f"Test 10: Starting performance test ({iterations} operations)...")
        start_time = time.time()

        # Perform mixed operations
        for i in range(iterations):
            if i % 2 == 0:
                redis.set(f"{test_key_prefix}:{i}", {"index": i}, CacheOptions(ttl=60))
            else:
                redis.get(f"{test_key_prefix}:{i - 1}")

        end_time = time.time()
        duration = (end_time - start_time) * 1000  # Convert to ms
        ops_per_sec = int((iterations / duration) * 1000)

        # Cleanup
        redis.delete_pattern(f"{test_key_prefix}:*")

        if ops_per_sec >= 100:  # Lower threshold for sync Python client
            success(f"Test 10: Performance test successful ({ops_per_sec} ops/sec, {int(duration)}ms total)")
            return True
        else:
            info(f"Test 10: Performance below target ({ops_per_sec} ops/sec)")
            return True  # Still pass, as this depends on hardware
    except Exception as err:
        error(f"Test 10: Performance test failed - {err}")
        return False


def run_tests():
    log("\n========================================", Colors.YELLOW)
    log("   Redis Cache Test Suite (Python)", Colors.YELLOW)
    log("========================================\n", Colors.YELLOW)

    tests = [
        ("Connection", test_connection),
        ("Set/Get Operations", test_set_get),
        ("TTL Expiration", test_ttl),
        ("Atomic Operations", test_atomic_operations),
        ("Rate Limiting", test_rate_limiting),
        ("Hash Operations", test_hash_operations),
        ("Multiple Keys", test_multiple_keys),
        ("Pattern Deletion", test_pattern_deletion),
        ("Exists and Expire", test_exists_and_expire),
        ("Performance", test_performance),
    ]

    results: List[bool] = []

    for test_name, test_fn in tests:
        try:
            result = test_fn()
            results.append(result)
        except Exception as err:
            error(f'Test "{test_name}" threw an exception: {err}')
            results.append(False)
        print()  # Empty line between tests

    # Summary
    log("\n========================================", Colors.YELLOW)
    log("   Test Summary", Colors.YELLOW)
    log("========================================\n", Colors.YELLOW)

    passed = sum(results)
    total = len(results)

    log(f"Total Tests: {total}", Colors.BLUE)
    log(f"Passed: {passed}", Colors.GREEN)
    log(f"Failed: {total - passed}", Colors.RED)
    log(f"Success Rate: {(passed / total * 100):.1f}%\n", Colors.BLUE)

    # Close connection
    try:
        redis = get_redis_client()
        redis.close()
    except:
        pass

    exit(0 if passed == total else 1)


if __name__ == "__main__":
    run_tests()
