/**
 * Circuit Breaker Pattern Implementation
 * Provides fault tolerance for external service calls
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit tripped, requests fail fast
 * - HALF_OPEN: Testing if service has recovered
 */

import { ServiceUnavailableError } from './errors';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  /** Name for logging/identification */
  name: string;
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold?: number;
  /** Number of successful calls to close circuit (default: 3) */
  successThreshold?: number;
  /** Time in ms before attempting recovery (default: 30000) */
  timeout?: number;
  /** Time window in ms to count failures (default: 60000) */
  failureWindow?: number;
  /** Custom function to determine if error should count as failure */
  isFailure?: (error: Error) => boolean;
  /** Callback when circuit state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

/**
 * Circuit Breaker Implementation
 */
export class CircuitBreaker {
  private name: string;
  private state: CircuitState = CircuitState.CLOSED;
  private failureThreshold: number;
  private successThreshold: number;
  private timeout: number;
  private failureWindow: number;
  private isFailure: (error: Error) => boolean;
  private onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;

  // Tracking
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private openedAt: number | null = null;
  private failureTimestamps: number[] = [];

  // Stats
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 3;
    this.timeout = options.timeout ?? 30000; // 30 seconds
    this.failureWindow = options.failureWindow ?? 60000; // 60 seconds
    this.isFailure = options.isFailure ?? (() => true);
    this.onStateChange = options.onStateChange;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new ServiceUnavailableError(
          `Circuit breaker is open for service: ${this.name}`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(): boolean {
    if (!this.openedAt) return false;
    return Date.now() - this.openedAt >= this.timeout;
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failures = 0;
      this.failureTimestamps = [];
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: Error): void {
    // Check if this error should count as a failure
    if (!this.isFailure(error)) {
      return;
    }

    this.lastFailureTime = Date.now();
    this.totalFailures++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      this.recordFailure();

      // Count failures within the window
      const recentFailures = this.getRecentFailures();
      if (recentFailures >= this.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Record a failure timestamp
   */
  private recordFailure(): void {
    const now = Date.now();
    this.failureTimestamps.push(now);
    this.failures++;

    // Clean up old timestamps
    const windowStart = now - this.failureWindow;
    this.failureTimestamps = this.failureTimestamps.filter(t => t > windowStart);
  }

  /**
   * Get count of failures within the window
   */
  private getRecentFailures(): number {
    const windowStart = Date.now() - this.failureWindow;
    return this.failureTimestamps.filter(t => t > windowStart).length;
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.OPEN) {
      this.openedAt = Date.now();
      this.successes = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
      this.failureTimestamps = [];
      this.openedAt = null;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successes = 0;
    }

    if (this.onStateChange && oldState !== newState) {
      this.onStateChange(oldState, newState, this.name);
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Manually open the circuit breaker
   */
  trip(): void {
    this.transitionTo(CircuitState.OPEN);
  }
}

// ============================================================================
// Circuit Breaker Registry
// ============================================================================

const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a service
 */
export function getCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const existing = circuitBreakers.get(options.name);
  if (existing) {
    return existing;
  }

  const breaker = new CircuitBreaker(options);
  circuitBreakers.set(options.name, breaker);
  return breaker;
}

/**
 * Get all circuit breaker statistics
 */
export function getAllCircuitBreakerStats(): CircuitBreakerStats[] {
  return Array.from(circuitBreakers.values()).map(cb => cb.getStats());
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  circuitBreakers.forEach(cb => cb.reset());
}

// ============================================================================
// Pre-configured Circuit Breakers for Services
// ============================================================================

const defaultStateChangeHandler = (from: CircuitState, to: CircuitState, name: string) => {
  console.log(`[CircuitBreaker] ${name}: ${from} -> ${to}`);
};

export function getAuthServiceCircuitBreaker(): CircuitBreaker {
  return getCircuitBreaker({
    name: 'auth-service',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    failureWindow: 60000,
    onStateChange: defaultStateChangeHandler,
  });
}

export function getSessionServiceCircuitBreaker(): CircuitBreaker {
  return getCircuitBreaker({
    name: 'session-service',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    failureWindow: 60000,
    onStateChange: defaultStateChangeHandler,
  });
}

export function getAiDetectionServiceCircuitBreaker(): CircuitBreaker {
  return getCircuitBreaker({
    name: 'ai-detection-service',
    failureThreshold: 3, // More sensitive for AI service
    successThreshold: 2,
    timeout: 60000, // Longer timeout for AI service
    failureWindow: 120000,
    onStateChange: defaultStateChangeHandler,
  });
}

export function getEyeTrackingServiceCircuitBreaker(): CircuitBreaker {
  return getCircuitBreaker({
    name: 'eye-tracking-service',
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    failureWindow: 60000,
    onStateChange: defaultStateChangeHandler,
  });
}

// ============================================================================
// Utility: Wrap HTTP Client with Circuit Breaker
// ============================================================================

/**
 * Execute an HTTP request with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  circuitBreaker: CircuitBreaker,
  fn: () => Promise<T>
): Promise<T> {
  return circuitBreaker.execute(fn);
}
