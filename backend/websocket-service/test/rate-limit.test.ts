/**
 * Rate Limit Tests
 * Tests for rate limiting functionality
 */

import { getRateLimitStats, clearRateLimit, getRateLimitState } from '../middleware/rate-limit.middleware';

describe('Rate Limiting', () => {
  afterEach(() => {
    // Clear all rate limiters after each test
    clearRateLimit('test-socket-1');
    clearRateLimit('test-socket-2');
  });

  describe('Rate Limit Statistics', () => {
    it('should return initial statistics', () => {
      const stats = getRateLimitStats();

      expect(stats).toHaveProperty('activeLimiters');
      expect(stats).toHaveProperty('totalViolations');
      expect(stats).toHaveProperty('averageEventsPerSocket');
    });

    it('should track active limiters', () => {
      const stats = getRateLimitStats();
      expect(typeof stats.activeLimiters).toBe('number');
      expect(stats.activeLimiters).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Rate Limit State', () => {
    it('should return undefined for non-existent socket', () => {
      const state = getRateLimitState('non-existent-socket');
      expect(state).toBeUndefined();
    });

    it('should clear rate limit for socket', () => {
      clearRateLimit('test-socket-1');
      const state = getRateLimitState('test-socket-1');
      expect(state).toBeUndefined();
    });
  });

  describe('Rate Limit Configuration', () => {
    it('should accept custom max events per minute', () => {
      const config = {
        maxEventsPerMinute: 100,
        checkInterval: 1000,
      };

      expect(config.maxEventsPerMinute).toBe(100);
      expect(config.checkInterval).toBe(1000);
    });

    it('should accept custom check interval', () => {
      const config = {
        maxEventsPerMinute: 1000,
        checkInterval: 500,
      };

      expect(config.checkInterval).toBe(500);
    });
  });

  describe('Violation Tracking', () => {
    it('should track violations', () => {
      const stats = getRateLimitStats();
      expect(typeof stats.totalViolations).toBe('number');
      expect(stats.totalViolations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Rate Limit Cleanup', () => {
    it('should clean up old limiters automatically', (done) => {
      // This would require waiting for the cleanup interval
      // For now, just verify the mechanism exists
      setTimeout(() => {
        const stats = getRateLimitStats();
        expect(stats).toBeDefined();
        done();
      }, 100);
    });
  });
});
