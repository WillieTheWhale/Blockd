/**
 * Reconnection Logic
 * Client-side reconnection strategy with exponential backoff
 */

/**
 * Reconnection configuration
 */
export interface ReconnectConfig {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

/**
 * Reconnection strategy
 */
export class ReconnectStrategy {
  private config: Required<ReconnectConfig>;
  private currentAttempt: number = 0;

  constructor(config: ReconnectConfig = {}) {
    this.config = {
      maxAttempts: config.maxAttempts || 10,
      initialDelay: config.initialDelay || 1000, // 1 second
      maxDelay: config.maxDelay || 30000, // 30 seconds
      backoffMultiplier: config.backoffMultiplier || 2,
    };
  }

  /**
   * Get next reconnection delay
   */
  getNextDelay(): number | null {
    if (this.currentAttempt >= this.config.maxAttempts) {
      return null; // Max attempts reached
    }

    let delay: number;

    if (this.currentAttempt === 0) {
      // First attempt - immediate reconnection
      delay = 0;
    } else {
      // Exponential backoff
      delay = Math.min(
        this.config.initialDelay * Math.pow(this.config.backoffMultiplier, this.currentAttempt - 1),
        this.config.maxDelay
      );

      // Add jitter to prevent thundering herd
      delay = delay * (0.8 + Math.random() * 0.4);
    }

    this.currentAttempt++;
    return Math.floor(delay);
  }

  /**
   * Reset reconnection attempts
   */
  reset(): void {
    this.currentAttempt = 0;
  }

  /**
   * Get current attempt number
   */
  getCurrentAttempt(): number {
    return this.currentAttempt;
  }

  /**
   * Check if max attempts reached
   */
  isMaxAttemptsReached(): boolean {
    return this.currentAttempt >= this.config.maxAttempts;
  }

  /**
   * Get remaining attempts
   */
  getRemainingAttempts(): number {
    return Math.max(0, this.config.maxAttempts - this.currentAttempt);
  }
}

/**
 * Get client-side reconnection configuration
 * This is meant to be sent to clients to configure their reconnection logic
 */
export function getClientReconnectConfig(): {
  attempts: number[];
  maxAttempts: number;
  totalTime: number;
} {
  const strategy = new ReconnectStrategy();
  const attempts: number[] = [];
  let totalTime = 0;

  for (let i = 0; i < 10; i++) {
    const delay = strategy.getNextDelay();
    if (delay === null) break;

    attempts.push(delay);
    totalTime += delay;
  }

  return {
    attempts,
    maxAttempts: 10,
    totalTime,
  };
}

/**
 * Exponential backoff delays (reference)
 * Attempt 1: Immediate (0ms)
 * Attempt 2: 1s
 * Attempt 3: 2s
 * Attempt 4: 4s
 * Attempt 5: 8s
 * Attempt 6: 16s
 * Attempt 7: 30s (capped)
 * Attempt 8: 30s (capped)
 * Attempt 9: 30s (capped)
 * Attempt 10: 30s (capped)
 */
