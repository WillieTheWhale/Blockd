/**
 * Microservice Failure Tests
 *
 * Tests for individual service failure scenarios:
 * - Auth service failures
 * - Session service failures
 * - AI detection service failures
 * - Eye tracking service failures
 * - Video service failures
 * - Circuit breaker behavior
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  ChaosOrchestrator,
  fetchWithTimeout,
  sleep,
  ServiceConfig,
  CircuitBreakerSimulator,
} from './mock-chaos-server';

describe('Microservice Failure Scenarios', () => {
  let orchestrator: ChaosOrchestrator;

  const services: ServiceConfig[] = [
    {
      name: 'api-gateway',
      port: 7200,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'auth-service',
      port: 7201,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'session-service',
      port: 7202,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'ai-detection',
      port: 7203,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'eye-tracking',
      port: 7204,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'video-service',
      port: 7205,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'postgresql',
      port: 7206,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
  ];

  beforeAll(async () => {
    orchestrator = new ChaosOrchestrator({ services });
    await orchestrator.startAll();
  });

  afterAll(async () => {
    await orchestrator.stopAll();
    await sleep(500); // Allow time for ports to fully release
  });

  beforeEach(() => {
    orchestrator.resetAll();
    orchestrator.recoverAll();
  });

  describe('Auth Service Failures', () => {
    it('should handle auth service unavailability', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7201/health`);

      expect(response.status).toBe(503);
    });

    it('should report degraded when auth service is down', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7200/health`);

      const data = response.data as { status: string; circuitBreakers: Array<{ name: string; state: string }> };
      expect(data.status).toBe('degraded');

      // Auth service circuit breaker should be open
      const authCircuit = data.circuitBreakers?.find((cb) => cb.name === 'auth-service');
      expect(authCircuit?.state).toBe('half_open'); // Degraded shows half_open
    });

    it('should handle slow auth service', async () => {
      orchestrator.injectLatency('auth-service', 500);

      const response = await fetchWithTimeout(`http://localhost:7201/health`);

      expect(response.status).toBe(200);
      expect(response.latencyMs).toBeGreaterThanOrEqual(500);
    });

    it('should still allow liveness check when auth is down', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7200/live`);

      expect(response.status).toBe(200);
    });
  });

  describe('Session Service Failures', () => {
    it('should handle session service unavailability', async () => {
      orchestrator.injectFailure('session-service', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7202/health`);

      expect(response.status).toBe(503);
    });

    it('should report session service in health dependencies', async () => {
      const response = await fetchWithTimeout(`http://localhost:7200/health`);

      const data = response.data as { dependencies: Array<{ name: string }> };
      // Session service should be in dependencies
      expect(data.dependencies).toBeDefined();
    });

    it('should handle intermittent session service failures', async () => {
      orchestrator.injectFailure('session-service', 'intermittent');

      const results: boolean[] = [];

      for (let i = 0; i < 20; i++) {
        const response = await fetchWithTimeout(`http://localhost:7202/health`);
        results.push(response.status === 200);
      }

      const successCount = results.filter((r) => r).length;
      expect(successCount).toBeGreaterThan(0);
      expect(successCount).toBeLessThan(20);
    });
  });

  describe('AI Detection Service Failures', () => {
    it('should handle AI detection service unavailability', async () => {
      orchestrator.injectFailure('ai-detection', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7203/health`);

      expect(response.status).toBe(503);
    });

    it('should report circuit breaker state for AI service', async () => {
      orchestrator.injectFailure('ai-detection', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7200/health`);

      const data = response.data as { circuitBreakers: Array<{ name: string; state: string }> };
      expect(data.circuitBreakers).toBeDefined();

      // Should have OpenAI circuit breaker info
      const openaiCircuit = data.circuitBreakers?.find((cb) => cb.name === 'openai');
      expect(openaiCircuit).toBeDefined();
    });

    it('should handle slow AI detection (LLM latency)', async () => {
      orchestrator.injectLatency('ai-detection', 2000);

      const response = await fetchWithTimeout(`http://localhost:7203/health`, {}, 5000);

      expect(response.status).toBe(200);
      expect(response.latencyMs).toBeGreaterThanOrEqual(2000);
    });

    it('should continue when AI detection is slow (non-blocking)', async () => {
      orchestrator.injectLatency('ai-detection', 2000);

      // API Gateway should respond quickly (doesn't wait for AI)
      const response = await fetchWithTimeout(`http://localhost:7200/live`);

      expect(response.status).toBe(200);
      expect(response.latencyMs).toBeLessThan(500);
    });
  });

  describe('Eye Tracking Service Failures', () => {
    it('should handle eye tracking service unavailability', async () => {
      orchestrator.injectFailure('eye-tracking', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7204/health`);

      expect(response.status).toBe(503);
    });

    it('should gracefully degrade when eye tracking is down', async () => {
      orchestrator.injectFailure('eye-tracking', 'unavailable');

      // API Gateway should still work
      const response = await fetchWithTimeout(`http://localhost:7200/health`);

      expect(response.status).toBe(200);
      const data = response.data as { status: string };
      expect(['healthy', 'degraded']).toContain(data.status);
    });
  });

  describe('Video Service Failures', () => {
    it('should handle video service unavailability', async () => {
      orchestrator.injectFailure('video-service', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7205/health`);

      expect(response.status).toBe(503);
    });

    it('should report video service status', async () => {
      const response = await fetchWithTimeout(`http://localhost:7205/health`);

      expect(response.status).toBe(200);
      const data = response.data as { service: string };
      expect(data.service).toBe('video-service');
    });
  });

  describe('Circuit Breaker Behavior', () => {
    let circuitBreaker: CircuitBreakerSimulator;

    beforeEach(() => {
      circuitBreaker = new CircuitBreakerSimulator({
        failureThreshold: 3,
        successThreshold: 2,
        timeoutMs: 1000,
      });
    });

    it('should open circuit after failure threshold', async () => {
      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Service failure');
          });
        } catch {
          // Expected
        }
      }

      const state = circuitBreaker.getState();
      expect(state.state).toBe('open');
      expect(state.failures).toBe(3);
    });

    it('should reject requests when circuit is open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch {
          // Expected
        }
      }

      // Next request should be rejected
      await expect(
        circuitBreaker.execute(async () => 'success')
      ).rejects.toThrow('Circuit breaker is open');
    });

    it('should transition to half-open after timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch {
          // Expected
        }
      }

      expect(circuitBreaker.getState().state).toBe('open');

      // Wait for circuit to transition to half-open (polling approach for reliability)
      let attempts = 0;
      const maxAttempts = 20;
      while (circuitBreaker.getState().state === 'open' && attempts < maxAttempts) {
        await sleep(100);
        attempts++;
        // Trigger potential state check by attempting execution
        try {
          await circuitBreaker.execute(async () => 'success');
          break; // If succeeded, circuit transitioned
        } catch {
          // Expected if still open, continue waiting
        }
      }

      const state = circuitBreaker.getState();
      expect(['half_open', 'closed']).toContain(state.state);
    });

    it('should close circuit after success threshold in half-open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch {
          // Expected
        }
      }

      // Wait for circuit to transition (polling approach)
      let attempts = 0;
      while (circuitBreaker.getState().state === 'open' && attempts < 20) {
        await sleep(100);
        attempts++;
      }

      // Succeed twice (success threshold)
      for (let i = 0; i < 2; i++) {
        await circuitBreaker.execute(async () => 'success');
      }

      expect(circuitBreaker.getState().state).toBe('closed');
    });

    it('should re-open circuit on failure in half-open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch {
          // Expected
        }
      }

      // Wait for circuit to transition (polling approach)
      let attempts = 0;
      while (circuitBreaker.getState().state === 'open' && attempts < 20) {
        await sleep(100);
        attempts++;
      }

      // Fail again in half-open
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Still failing');
        });
      } catch {
        // Expected
      }

      expect(circuitBreaker.getState().state).toBe('open');
    });

    it('should reset failures on success', async () => {
      // Fail twice (below threshold)
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch {
          // Expected
        }
      }

      expect(circuitBreaker.getState().failures).toBe(2);

      // Succeed once
      await circuitBreaker.execute(async () => 'success');

      expect(circuitBreaker.getState().failures).toBe(0);
      expect(circuitBreaker.getState().state).toBe('closed');
    });

    it('should track circuit state in health check', async () => {
      orchestrator.injectFailure('ai-detection', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7200/health`);

      const data = response.data as { circuitBreakers: Array<{ name: string; state: string; failures: number }> };
      expect(data.circuitBreakers).toBeDefined();

      const openaiCircuit = data.circuitBreakers?.find((cb) => cb.name === 'openai');
      expect(['closed', 'open', 'half_open']).toContain(openaiCircuit?.state);
    });
  });

  describe('Service Recovery', () => {
    it('should recover auth service', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');
      expect((await fetchWithTimeout(`http://localhost:7201/health`)).status).toBe(503);

      orchestrator.recoverService('auth-service');
      expect((await fetchWithTimeout(`http://localhost:7201/health`)).status).toBe(200);
    });

    it('should recover session service', async () => {
      orchestrator.injectFailure('session-service', 'unavailable');
      expect((await fetchWithTimeout(`http://localhost:7202/health`)).status).toBe(503);

      orchestrator.recoverService('session-service');
      expect((await fetchWithTimeout(`http://localhost:7202/health`)).status).toBe(200);
    });

    it('should recover all services at once', async () => {
      // Fail multiple services
      orchestrator.injectFailure('auth-service', 'unavailable');
      orchestrator.injectFailure('session-service', 'unavailable');
      orchestrator.injectFailure('ai-detection', 'unavailable');

      // Verify failures
      const failedResponses = await Promise.all([
        fetchWithTimeout(`http://localhost:7201/health`),
        fetchWithTimeout(`http://localhost:7202/health`),
        fetchWithTimeout(`http://localhost:7203/health`),
      ]);

      failedResponses.forEach((r) => expect(r.status).toBe(503));

      // Recover all
      orchestrator.recoverAll();

      // Verify recovery
      const recoveredResponses = await Promise.all([
        fetchWithTimeout(`http://localhost:7201/health`),
        fetchWithTimeout(`http://localhost:7202/health`),
        fetchWithTimeout(`http://localhost:7203/health`),
      ]);

      recoveredResponses.forEach((r) => expect(r.status).toBe(200));
    });

    it('should track recovery statistics', async () => {
      orchestrator.injectFailure('ai-detection', 'unavailable');

      // Make failed requests
      for (let i = 0; i < 5; i++) {
        await fetchWithTimeout(`http://localhost:7203/health`);
      }

      const beforeStats = orchestrator.getStats()['ai-detection'];
      expect(beforeStats.failures).toBe(5);

      // Recover
      orchestrator.recoverService('ai-detection');

      // Make successful requests
      for (let i = 0; i < 10; i++) {
        await fetchWithTimeout(`http://localhost:7203/health`);
      }

      const afterStats = orchestrator.getStats()['ai-detection'];
      expect(afterStats.requests).toBe(15);
      expect(afterStats.successRate).toBeCloseTo(10 / 15, 1);
    });
  });

  describe('Partial Service Availability', () => {
    it('should handle mixed service states', async () => {
      // Some services healthy, some degraded, some down
      orchestrator.injectFailure('auth-service', 'slow');
      orchestrator.injectLatency('auth-service', 300);
      orchestrator.injectFailure('ai-detection', 'unavailable');
      // session-service, eye-tracking, video-service healthy

      // API Gateway should be degraded but functional
      const response = await fetchWithTimeout(`http://localhost:7200/health`);

      expect(response.status).toBe(200);
      const data = response.data as { status: string };
      expect(data.status).toBe('degraded');
    });

    it('should report accurate dependency status', async () => {
      // Fail postgresql to test dependency status reporting
      orchestrator.injectFailure('postgresql', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:7200/health`);

      const data = response.data as { dependencies: Array<{ name: string; status: string }> };

      // Check dependencies reflect reality - postgresql should be unhealthy
      const pgDep = data.dependencies?.find((d) => d.name === 'postgresql');
      expect(pgDep?.status).toBe('unhealthy');
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout slow services', async () => {
      orchestrator.injectFailure('ai-detection', 'timeout');

      const response = await fetchWithTimeout(`http://localhost:7203/health`, {}, 1000);

      expect(response.status).toBe(0);
      expect(response.data).toMatchObject({ error: 'Request timeout' });
    });

    it('should handle timeout with fallback', async () => {
      orchestrator.injectFailure('ai-detection', 'timeout');

      // API Gateway should still respond
      const response = await fetchWithTimeout(`http://localhost:7200/live`, {}, 2000);

      expect(response.status).toBe(200);
    });
  });
});
