"""
Session-based rate limiting middleware for AI Detection Service

Uses Redis token bucket algorithm to limit requests per session,
preventing abuse and ensuring fair resource allocation.
"""
import logging
import time
from typing import Optional, Tuple

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import redis.asyncio as aioredis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


# Redis Lua script for atomic token bucket rate limiting
# Returns: (allowed: 0/1, remaining_tokens: int, retry_after_seconds: float)
RATE_LIMIT_LUA_SCRIPT = """
local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'last_update')
local tokens = tonumber(bucket[1])
local last_update = tonumber(bucket[2])

-- Initialize bucket if doesn't exist
if tokens == nil then
    tokens = max_tokens
    last_update = now
end

-- Calculate tokens to add based on time elapsed
local elapsed = now - last_update
local tokens_to_add = elapsed * refill_rate
tokens = math.min(max_tokens, tokens + tokens_to_add)

-- Check if request can be fulfilled
local allowed = 0
local retry_after = 0

if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
else
    -- Calculate time until enough tokens available
    local tokens_needed = requested - tokens
    retry_after = tokens_needed / refill_rate
end

-- Update bucket
redis.call('HMSET', key, 'tokens', tokens, 'last_update', now)
redis.call('EXPIRE', key, 3600)  -- 1 hour TTL

return {allowed, math.floor(tokens), retry_after}
"""


class SessionRateLimitMiddleware(BaseHTTPMiddleware):
    """
    Per-session rate limiting middleware using Redis token bucket algorithm.

    Configuration:
    - max_requests_per_minute: Maximum requests allowed per minute (default: 100)
    - redis_url: Redis connection URL
    - key_prefix: Redis key prefix for rate limit buckets

    Headers added to responses:
    - X-RateLimit-Limit: Maximum requests per minute
    - X-RateLimit-Remaining: Remaining requests in current window
    - X-RateLimit-Reset: Time until bucket refills (seconds)
    - Retry-After: When rate limited, seconds until retry is allowed
    """

    def __init__(
        self,
        app,
        redis_url: str = "redis://localhost:6379",
        max_requests_per_minute: int = 100,
        key_prefix: str = "ai_detection:rate_limit"
    ):
        super().__init__(app)
        self.redis_url = redis_url
        self.max_tokens = max_requests_per_minute
        self.refill_rate = max_requests_per_minute / 60.0  # tokens per second
        self.key_prefix = key_prefix
        self._redis_client: Optional[aioredis.Redis] = None
        self._script_sha: Optional[str] = None

    async def _get_redis(self) -> aioredis.Redis:
        """Get or create Redis client."""
        if self._redis_client is None:
            self._redis_client = await aioredis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_timeout=5,
                socket_connect_timeout=5,
            )
            # Load Lua script
            self._script_sha = await self._redis_client.script_load(RATE_LIMIT_LUA_SCRIPT)
        return self._redis_client

    def _extract_session_id(self, request: Request) -> Optional[str]:
        """
        Extract session ID from request.

        Priority:
        1. X-Session-ID header
        2. session_id query parameter
        3. session_id in JSON body (if available)
        """
        # Check header first
        session_id = request.headers.get("X-Session-ID")
        if session_id:
            return session_id

        # Check query parameter
        session_id = request.query_params.get("session_id")
        if session_id:
            return session_id

        return None

    async def _check_rate_limit(self, session_id: str) -> Tuple[bool, int, float]:
        """
        Check rate limit for a session.

        Returns:
            Tuple of (allowed, remaining_tokens, retry_after_seconds)
        """
        try:
            redis = await self._get_redis()
            key = f"{self.key_prefix}:{session_id}"
            now = time.time()

            result = await redis.evalsha(
                self._script_sha,
                1,  # number of keys
                key,
                self.max_tokens,
                self.refill_rate,
                now,
                1  # requesting 1 token
            )

            allowed = bool(result[0])
            remaining = int(result[1])
            retry_after = float(result[2])

            return allowed, remaining, retry_after

        except RedisError as e:
            logger.error(f"Redis error in rate limiting: {e}")
            # Fail open - allow request if Redis is unavailable
            return True, self.max_tokens, 0

    async def dispatch(self, request: Request, call_next) -> Response:
        """Process request through rate limiter."""
        # Skip rate limiting for health checks and non-analysis endpoints
        path = request.url.path
        if path in ("/health", "/", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        if not path.startswith("/api/v1/analysis"):
            return await call_next(request)

        # Extract session ID
        session_id = self._extract_session_id(request)
        if not session_id:
            # No session ID - use IP as fallback (less granular)
            client_ip = request.client.host if request.client else "unknown"
            session_id = f"ip:{client_ip}"

        # Check rate limit
        allowed, remaining, retry_after = await self._check_rate_limit(session_id)

        if not allowed:
            logger.warning(f"Rate limit exceeded for session: {session_id}")
            return JSONResponse(
                status_code=429,
                content={
                    "error": "RATE_LIMIT_EXCEEDED",
                    "message": f"Rate limit exceeded. Maximum {self.max_tokens} requests per minute allowed.",
                    "retry_after": round(retry_after, 2)
                },
                headers={
                    "X-RateLimit-Limit": str(self.max_tokens),
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": str(int(retry_after) + 1)
                }
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(self.max_tokens)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response
