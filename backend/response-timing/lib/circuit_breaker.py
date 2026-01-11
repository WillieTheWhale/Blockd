"""
Circuit Breaker Pattern Implementation for Response Timing Service
Prevents cascading failures when Whisper API or S3 are unavailable

This is a copy of the circuit breaker from ai-detection service,
configured with appropriate settings for audio processing.
"""
import asyncio
import logging
import time
from dataclasses import dataclass
from enum import Enum
from typing import Callable, Dict, Optional, Any, TypeVar, Generic
from functools import wraps

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation, requests flow through
    OPEN = "open"          # Failing, requests are blocked
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class CircuitStats:
    """Statistics for a circuit breaker"""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None
    consecutive_failures: int = 0
    consecutive_successes: int = 0


@dataclass
class CircuitBreakerConfig:
    """Configuration for a circuit breaker"""
    # Failure threshold - number of failures before opening circuit
    failure_threshold: int = 5
    # Failure rate threshold (0.0 to 1.0) - alternative to count
    failure_rate_threshold: float = 0.5
    # Minimum number of calls before failure rate is evaluated
    minimum_calls: int = 10
    # Time in seconds to wait before attempting recovery (half-open)
    recovery_timeout: float = 30.0
    # Number of successful calls in half-open state to close circuit
    success_threshold: int = 3
    # Time window in seconds for failure rate calculation
    failure_window: float = 60.0
    # Optional fallback function
    fallback: Optional[Callable] = None


class CircuitBreaker(Generic[T]):
    """
    Circuit Breaker implementation for protecting external service calls.

    Configured for response-timing use cases:
    - Whisper API calls (can be slow, ~5 minutes)
    - S3 downloads
    - Internal service calls
    """

    def __init__(self, name: str, config: Optional[CircuitBreakerConfig] = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitState.CLOSED
        self._stats = CircuitStats()
        self._last_state_change = time.time()
        self._lock = asyncio.Lock()
        self._failure_times: list[float] = []

    async def get_state(self) -> CircuitState:
        """Get current circuit state, checking for automatic state transitions"""
        async with self._lock:
            if self._state == CircuitState.OPEN:
                if time.time() - self._last_state_change >= self.config.recovery_timeout:
                    self._transition_to(CircuitState.HALF_OPEN)
            return self._state

    @property
    def state_sync(self) -> CircuitState:
        """Get current state synchronously (no state transition check)"""
        return self._state

    @property
    def stats(self) -> CircuitStats:
        """Get circuit statistics"""
        return self._stats

    async def is_closed(self) -> bool:
        """Check if circuit is closed (allowing requests)"""
        return await self.get_state() == CircuitState.CLOSED

    async def is_open(self) -> bool:
        """Check if circuit is open (blocking requests)"""
        return await self.get_state() == CircuitState.OPEN

    async def is_half_open(self) -> bool:
        """Check if circuit is in half-open state (testing)"""
        return await self.get_state() == CircuitState.HALF_OPEN

    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to a new state"""
        old_state = self._state
        self._state = new_state
        self._last_state_change = time.time()

        logger.info(
            f"Circuit breaker '{self.name}' transitioned from {old_state.value} to {new_state.value}"
        )

        if new_state == CircuitState.CLOSED:
            self._stats.consecutive_failures = 0
            self._stats.consecutive_successes = 0
        elif new_state == CircuitState.HALF_OPEN:
            self._stats.consecutive_successes = 0

    async def _record_success(self) -> None:
        """Record a successful call"""
        async with self._lock:
            self._stats.total_calls += 1
            self._stats.successful_calls += 1
            self._stats.last_success_time = time.time()
            self._stats.consecutive_successes += 1
            self._stats.consecutive_failures = 0

            if self._state == CircuitState.HALF_OPEN:
                if self._stats.consecutive_successes >= self.config.success_threshold:
                    self._transition_to(CircuitState.CLOSED)

    async def _record_failure(self) -> None:
        """Record a failed call"""
        async with self._lock:
            current_time = time.time()
            self._stats.total_calls += 1
            self._stats.failed_calls += 1
            self._stats.last_failure_time = current_time
            self._stats.consecutive_failures += 1
            self._stats.consecutive_successes = 0

            self._failure_times.append(current_time)
            cutoff = current_time - self.config.failure_window
            self._failure_times = [t for t in self._failure_times if t > cutoff]

            if self._state == CircuitState.HALF_OPEN:
                self._transition_to(CircuitState.OPEN)
            elif self._state == CircuitState.CLOSED:
                should_open = False

                if self._stats.consecutive_failures >= self.config.failure_threshold:
                    should_open = True
                    logger.warning(
                        f"Circuit breaker '{self.name}': consecutive failures "
                        f"({self._stats.consecutive_failures}) exceeded threshold "
                        f"({self.config.failure_threshold})"
                    )

                if (self._stats.total_calls >= self.config.minimum_calls and
                    self._stats.total_calls > 0 and
                    len(self._failure_times) >= self.config.minimum_calls):
                    failure_rate = len(self._failure_times) / self._stats.total_calls
                    if failure_rate >= self.config.failure_rate_threshold:
                        should_open = True
                        logger.warning(
                            f"Circuit breaker '{self.name}': failure rate "
                            f"({failure_rate:.2%}) exceeded threshold "
                            f"({self.config.failure_rate_threshold:.2%})"
                        )

                if should_open:
                    self._transition_to(CircuitState.OPEN)

    async def _record_rejected(self) -> None:
        """Record a rejected call (circuit open)"""
        async with self._lock:
            self._stats.rejected_calls += 1

    async def call(
        self,
        func: Callable[..., T],
        *args,
        fallback: Optional[Callable[..., T]] = None,
        **kwargs
    ) -> T:
        """Execute a function through the circuit breaker."""
        state = await self.get_state()

        if state == CircuitState.OPEN:
            await self._record_rejected()
            fallback_fn = fallback or self.config.fallback
            if fallback_fn:
                logger.debug(f"Circuit breaker '{self.name}' is open, using fallback")
                if asyncio.iscoroutinefunction(fallback_fn):
                    return await fallback_fn(*args, **kwargs)
                return fallback_fn(*args, **kwargs)
            raise CircuitOpenError(
                f"Circuit breaker '{self.name}' is open. "
                f"Last failure: {self._stats.last_failure_time}, "
                f"Consecutive failures: {self._stats.consecutive_failures}"
            )

        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)
            await self._record_success()
            return result
        except Exception as e:
            await self._record_failure()
            raise

    def __call__(self, func: Callable) -> Callable:
        """Decorator to wrap a function with circuit breaker protection."""
        if not asyncio.iscoroutinefunction(func):
            logger.warning(
                f"Circuit breaker '{self.name}' wrapping non-async function '{func.__name__}'. "
                "Consider using an async function instead."
            )

        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            return await self.call(func, *args, **kwargs)

        return async_wrapper

    async def reset(self) -> None:
        """Reset the circuit breaker to closed state"""
        async with self._lock:
            self._state = CircuitState.CLOSED
            self._stats = CircuitStats()
            self._failure_times = []
            self._last_state_change = time.time()
            logger.info(f"Circuit breaker '{self.name}' reset to closed state")

    def to_dict(self) -> Dict[str, Any]:
        """Get circuit breaker status as dictionary"""
        return {
            "name": self.name,
            "state": self.state_sync.value,
            "stats": {
                "total_calls": self._stats.total_calls,
                "successful_calls": self._stats.successful_calls,
                "failed_calls": self._stats.failed_calls,
                "rejected_calls": self._stats.rejected_calls,
                "consecutive_failures": self._stats.consecutive_failures,
                "consecutive_successes": self._stats.consecutive_successes,
            },
            "config": {
                "failure_threshold": self.config.failure_threshold,
                "recovery_timeout": self.config.recovery_timeout,
            }
        }


class CircuitOpenError(Exception):
    """Exception raised when circuit breaker is open"""
    pass


class CircuitBreakerRegistry:
    """Registry for managing multiple circuit breakers."""

    _instance: Optional['CircuitBreakerRegistry'] = None

    def __new__(cls) -> 'CircuitBreakerRegistry':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._breakers: Dict[str, CircuitBreaker] = {}
        return cls._instance

    def register(self, breaker: CircuitBreaker) -> None:
        """Register a circuit breaker"""
        self._breakers[breaker.name] = breaker
        logger.debug(f"Registered circuit breaker: {breaker.name}")

    def get(self, name: str) -> Optional[CircuitBreaker]:
        """Get a circuit breaker by name"""
        return self._breakers.get(name)

    def get_or_create(
        self,
        name: str,
        config: Optional[CircuitBreakerConfig] = None
    ) -> CircuitBreaker:
        """Get an existing circuit breaker or create a new one"""
        if name not in self._breakers:
            breaker = CircuitBreaker(name, config)
            self.register(breaker)
        return self._breakers[name]

    def get_all_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status of all circuit breakers"""
        return {
            name: breaker.to_dict()
            for name, breaker in self._breakers.items()
        }

    async def reset_all(self) -> None:
        """Reset all circuit breakers"""
        for breaker in self._breakers.values():
            await breaker.reset()


def get_circuit_registry() -> CircuitBreakerRegistry:
    """Get the global circuit breaker registry"""
    return CircuitBreakerRegistry()


def create_circuit_breaker(
    name: str,
    failure_threshold: int = 5,
    recovery_timeout: float = 30.0,
    failure_rate_threshold: float = 0.5,
    **kwargs
) -> CircuitBreaker:
    """Create and register a circuit breaker."""
    config = CircuitBreakerConfig(
        failure_threshold=failure_threshold,
        recovery_timeout=recovery_timeout,
        failure_rate_threshold=failure_rate_threshold,
        **kwargs
    )
    breaker = CircuitBreaker(name, config)
    get_circuit_registry().register(breaker)
    return breaker


# Pre-configured circuit breakers for response-timing service
whisper_breaker = create_circuit_breaker(
    name="whisper",
    failure_threshold=3,           # Open after 3 consecutive failures
    recovery_timeout=60.0,         # Wait 1 minute before retry
    failure_rate_threshold=0.5,    # Open if 50% failure rate
    minimum_calls=5,               # Need at least 5 calls to evaluate rate
)

s3_breaker = create_circuit_breaker(
    name="s3",
    failure_threshold=5,           # S3 is more reliable, higher threshold
    recovery_timeout=30.0,         # Quicker recovery attempt
    failure_rate_threshold=0.6,
)
