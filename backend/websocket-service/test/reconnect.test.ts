/**
 * Reconnect Tests
 * Tests for reconnection logic
 */

import { ReconnectStrategy, getClientReconnectConfig } from '../lib/reconnect';

describe('Reconnection Strategy', () => {
  describe('Delay Calculation', () => {
    it('should return 0 delay for first attempt', () => {
      const strategy = new ReconnectStrategy();
      const delay = strategy.getNextDelay();

      expect(delay).toBe(0);
    });

    it('should apply exponential backoff', () => {
      const strategy = new ReconnectStrategy({
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 30000,
      });

      const delays: number[] = [];
      for (let i = 0; i < 5; i++) {
        const delay = strategy.getNextDelay();
        if (delay !== null) {
          delays.push(delay);
        }
      }

      // First delay should be 0
      expect(delays[0]).toBe(0);

      // Subsequent delays should increase
      // (with jitter, they won't be exact multiples)
      expect(delays[1]).toBeGreaterThan(0);
      expect(delays[2]).toBeGreaterThan(delays[1]);
      expect(delays[3]).toBeGreaterThan(delays[2]);
    });

    it('should cap delay at maxDelay', () => {
      const strategy = new ReconnectStrategy({
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 5000,
      });

      // Skip first attempt (0 delay)
      strategy.getNextDelay();

      // Get several delays
      for (let i = 0; i < 10; i++) {
        const delay = strategy.getNextDelay();
        if (delay !== null) {
          expect(delay).toBeLessThanOrEqual(5000);
        }
      }
    });

    it('should return null after max attempts', () => {
      const strategy = new ReconnectStrategy({
        maxAttempts: 3,
      });

      strategy.getNextDelay(); // Attempt 1
      strategy.getNextDelay(); // Attempt 2
      strategy.getNextDelay(); // Attempt 3
      const delay = strategy.getNextDelay(); // Attempt 4

      expect(delay).toBeNull();
    });
  });

  describe('Attempt Tracking', () => {
    it('should track current attempt', () => {
      const strategy = new ReconnectStrategy();

      expect(strategy.getCurrentAttempt()).toBe(0);

      strategy.getNextDelay();
      expect(strategy.getCurrentAttempt()).toBe(1);

      strategy.getNextDelay();
      expect(strategy.getCurrentAttempt()).toBe(2);
    });

    it('should check if max attempts reached', () => {
      const strategy = new ReconnectStrategy({ maxAttempts: 2 });

      expect(strategy.isMaxAttemptsReached()).toBe(false);

      strategy.getNextDelay(); // Attempt 1
      expect(strategy.isMaxAttemptsReached()).toBe(false);

      strategy.getNextDelay(); // Attempt 2
      expect(strategy.isMaxAttemptsReached()).toBe(true);
    });

    it('should calculate remaining attempts', () => {
      const strategy = new ReconnectStrategy({ maxAttempts: 5 });

      expect(strategy.getRemainingAttempts()).toBe(5);

      strategy.getNextDelay();
      expect(strategy.getRemainingAttempts()).toBe(4);

      strategy.getNextDelay();
      expect(strategy.getRemainingAttempts()).toBe(3);
    });

    it('should reset attempts', () => {
      const strategy = new ReconnectStrategy();

      strategy.getNextDelay();
      strategy.getNextDelay();
      expect(strategy.getCurrentAttempt()).toBe(2);

      strategy.reset();
      expect(strategy.getCurrentAttempt()).toBe(0);
    });
  });

  describe('Client Config', () => {
    it('should generate client reconnect config', () => {
      const config = getClientReconnectConfig();

      expect(config).toHaveProperty('attempts');
      expect(config).toHaveProperty('maxAttempts');
      expect(config).toHaveProperty('totalTime');

      expect(Array.isArray(config.attempts)).toBe(true);
      expect(config.maxAttempts).toBe(10);
      expect(config.totalTime).toBeGreaterThan(0);
    });

    it('should include all attempt delays', () => {
      const config = getClientReconnectConfig();

      expect(config.attempts.length).toBeLessThanOrEqual(config.maxAttempts);
      expect(config.attempts[0]).toBe(0); // First attempt immediate
    });
  });

  describe('Custom Configuration', () => {
    it('should accept custom maxAttempts', () => {
      const strategy = new ReconnectStrategy({ maxAttempts: 5 });

      let count = 0;
      while (strategy.getNextDelay() !== null) {
        count++;
      }

      expect(count).toBe(5);
    });

    it('should accept custom initialDelay', () => {
      const strategy = new ReconnectStrategy({
        initialDelay: 2000,
        backoffMultiplier: 1, // No multiplier for predictable testing
        maxDelay: 10000,
      });

      strategy.getNextDelay(); // Skip first (0)
      const delay = strategy.getNextDelay();

      // With jitter (0.8-1.2x), should be around 2000ms
      expect(delay).toBeGreaterThanOrEqual(1600);
      expect(delay).toBeLessThanOrEqual(2400);
    });
  });
});
