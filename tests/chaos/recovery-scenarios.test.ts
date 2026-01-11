/**
 * Recovery Scenarios Tests
 *
 * Tests for system recovery behavior:
 * - Single service recovery
 * - Multi-service recovery
 * - Recovery ordering
 * - Data consistency after recovery
 * - Health check progression
 * - Recovery time objectives (RTO)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  ChaosOrchestrator,
  fetchWithTimeout,
  sleep,
  ServiceConfig,
} from './mock-chaos-server';

describe('Recovery Scenarios', () => {
  let orchestrator: ChaosOrchestrator;

  const services: ServiceConfig[] = [
    {
      name: 'api-gateway',
      port: 7500,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'postgresql',
      port: 7501,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'redis',
      port: 7502,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'auth-service',
      port: 7503,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'session-service',
      port: 7504,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'ai-detection',
      port: 7505,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'websocket-service',
      port: 7506,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'video-service',
      port: 7507,
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

  describe('Single Service Recovery', () => {
    it('should recover database service', async () => {
      orchestrator.injectFailure('postgresql', 'unavailable');
      expect((await fetchWithTimeout(`http://localhost:7501/health`)).status).toBe(503);

      orchestrator.recoverService('postgresql');

      const response = await fetchWithTimeout(`http://localhost:7501/health`);
      expect(response.status).toBe(200);
      expect((response.data as { status: string }).status).toBe('healthy');
    });

    it('should recover Redis service', async () => {
      orchestrator.injectFailure('redis', 'unavailable');
      expect((await fetchWithTimeout(`http://localhost:7502/health`)).status).toBe(503);

      orchestrator.recoverService('redis');

      const response = await fetchWithTimeout(`http://localhost:7502/health`);
      expect(response.status).toBe(200);
    });

    it('should recover auth service', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');
      expect((await fetchWithTimeout(`http://localhost:7503/health`)).status).toBe(503);

      orchestrator.recoverService('auth-service');

      const response = await fetchWithTimeout(`http://localhost:7503/health`);
      expect(response.status).toBe(200);
    });

    it('should recover session service', async () => {
      orchestrator.injectFailure('session-service', 'unavailable');
      expect((await fetchWithTimeout(`http://localhost:7504/health`)).status).toBe(503);

      orchestrator.recoverService('session-service');

      const response = await fetchWithTimeout(`http://localhost:7504/health`);
      expect(response.status).toBe(200);
    });

    it('should recover AI detection service', async () => {
      orchestrator.injectFailure('ai-detection', 'unavailable');
      expect((await fetchWithTimeout(`http://localhost:7505/health`)).status).toBe(503);

      orchestrator.recoverService('ai-detection');

      const response = await fetchWithTimeout(`http://localhost:7505/health`);
      expect(response.status).toBe(200);
    });

    it('should recover WebSocket service', async () => {
      orchestrator.injectFailure('websocket-service', 'unavailable');
      expect((await fetchWithTimeout(`http://localhost:7506/health`)).status).toBe(503);

      orchestrator.recoverService('websocket-service');

      const response = await fetchWithTimeout(`http://localhost:7506/health`);
      expect(response.status).toBe(200);
    });

    it('should recover video service', async () => {
      orchestrator.injectFailure('video-service', 'unavailable');
      expect((await fetchWithTimeout(`http://localhost:7507/health`)).status).toBe(503);

      orchestrator.recoverService('video-service');

      const response = await fetchWithTimeout(`http://localhost:7507/health`);
      expect(response.status).toBe(200);
    });
  });

  describe('Recovery From Different Failure Modes', () => {
    it('should recover from timeout mode', async () => {
      orchestrator.injectFailure('auth-service', 'timeout');

      const timeoutResponse = await fetchWithTimeout(
        `http://localhost:7503/health`,
        {},
        500
      );
      expect(timeoutResponse.status).toBe(0);

      orchestrator.recoverService('auth-service');

      const recoveredResponse = await fetchWithTimeout(`http://localhost:7503/health`);
      expect(recoveredResponse.status).toBe(200);
      expect(recoveredResponse.latencyMs).toBeLessThan(100);
    });

    it('should recover from slow mode', async () => {
      orchestrator.injectFailure('auth-service', 'slow');
      orchestrator.injectLatency('auth-service', 2000);

      const slowResponse = await fetchWithTimeout(
        `http://localhost:7503/health`,
        {},
        5000
      );
      expect(slowResponse.latencyMs).toBeGreaterThanOrEqual(2000);

      orchestrator.recoverService('auth-service');

      const recoveredResponse = await fetchWithTimeout(`http://localhost:7503/health`);
      expect(recoveredResponse.latencyMs).toBeLessThan(100);
    });

    it('should recover from intermittent mode', async () => {
      orchestrator.injectFailure('auth-service', 'intermittent');

      // Some requests should fail
      let failuresSeen = false;
      for (let i = 0; i < 10; i++) {
        const response = await fetchWithTimeout(`http://localhost:7503/health`);
        if (response.status !== 200) {
          failuresSeen = true;
          break;
        }
      }
      expect(failuresSeen).toBe(true);

      // Recover
      orchestrator.recoverService('auth-service');

      // All should succeed now
      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        const response = await fetchWithTimeout(`http://localhost:7503/health`);
        results.push(response.status === 200);
      }
      expect(results.every((r) => r)).toBe(true);
    });

    it('should recover from error_rate mode', async () => {
      orchestrator.injectFailure('auth-service', 'error_rate');
      orchestrator.injectErrorRate('auth-service', 0.8);

      // Most should fail
      let failures = 0;
      for (let i = 0; i < 10; i++) {
        const response = await fetchWithTimeout(`http://localhost:7503/health`);
        if (response.status !== 200) failures++;
      }
      expect(failures).toBeGreaterThan(5);

      // Recover
      orchestrator.recoverService('auth-service');

      // All should succeed
      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        const response = await fetchWithTimeout(`http://localhost:7503/health`);
        results.push(response.status === 200);
      }
      expect(results.every((r) => r)).toBe(true);
    });
  });

  describe('Multi-Service Recovery', () => {
    it('should recover all services at once', async () => {
      // Fail multiple services
      orchestrator.injectFailure('postgresql', 'unavailable');
      orchestrator.injectFailure('redis', 'unavailable');
      orchestrator.injectFailure('auth-service', 'unavailable');
      orchestrator.injectFailure('session-service', 'unavailable');

      // Verify all are down
      const failedResponses = await Promise.all([
        fetchWithTimeout(`http://localhost:7501/health`),
        fetchWithTimeout(`http://localhost:7502/health`),
        fetchWithTimeout(`http://localhost:7503/health`),
        fetchWithTimeout(`http://localhost:7504/health`),
      ]);
      failedResponses.forEach((r) => expect(r.status).toBe(503));

      // Recover all at once
      orchestrator.recoverAll();

      // All should be healthy
      const recoveredResponses = await Promise.all([
        fetchWithTimeout(`http://localhost:7501/health`),
        fetchWithTimeout(`http://localhost:7502/health`),
        fetchWithTimeout(`http://localhost:7503/health`),
        fetchWithTimeout(`http://localhost:7504/health`),
      ]);
      recoveredResponses.forEach((r) => {
        expect(r.status).toBe(200);
        expect((r.data as { status: string }).status).toBe('healthy');
      });
    });

    it('should recover services in correct order', async () => {
      // Fail all infrastructure
      orchestrator.injectFailure('postgresql', 'unavailable');
      orchestrator.injectFailure('redis', 'unavailable');
      orchestrator.injectFailure('auth-service', 'unavailable');

      // Recovery order: DB -> Redis -> Auth (dependencies first)
      // Recover DB first
      orchestrator.recoverService('postgresql');
      let apiResponse = await fetchWithTimeout(`http://localhost:7500/health`);
      expect((apiResponse.data as { status: string }).status).toBe('degraded');

      // Recover Redis
      orchestrator.recoverService('redis');
      apiResponse = await fetchWithTimeout(`http://localhost:7500/health`);
      expect((apiResponse.data as { status: string }).status).toBe('degraded');

      // Recover Auth
      orchestrator.recoverService('auth-service');
      apiResponse = await fetchWithTimeout(`http://localhost:7500/health`);
      expect((apiResponse.data as { status: string }).status).toBe('healthy');
    });

    it('should handle partial recovery', async () => {
      // Fail everything
      orchestrator.injectCascadingFailure([
        'postgresql',
        'redis',
        'auth-service',
        'ai-detection',
      ]);

      // Only recover critical services
      orchestrator.recoverService('postgresql');
      orchestrator.recoverService('redis');
      orchestrator.recoverService('auth-service');

      // System should be partially functional
      const response = await fetchWithTimeout(`http://localhost:7500/health`);
      expect(response.status).toBe(200);

      const data = response.data as { status: string };
      // May still be degraded due to AI detection
      expect(['healthy', 'degraded']).toContain(data.status);
    });
  });

  describe('Recovery Time Tracking', () => {
    it('should track recovery time for single service', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      const failTime = Date.now();

      // Wait a bit to simulate outage
      await sleep(200);

      orchestrator.recoverService('auth-service');
      const recoveryTime = Date.now();

      // Verify recovery
      const response = await fetchWithTimeout(`http://localhost:7503/health`);
      expect(response.status).toBe(200);

      // Recovery should be fast after calling recoverService
      const recoveryDuration = recoveryTime - failTime;
      expect(recoveryDuration).toBeGreaterThanOrEqual(200);
    });

    it('should meet RTO for critical services', async () => {
      const rtoMs = 500; // 500ms RTO for critical services

      orchestrator.injectFailure('auth-service', 'unavailable');

      const startTime = Date.now();
      orchestrator.recoverService('auth-service');

      // Verify recovery within RTO
      const response = await fetchWithTimeout(`http://localhost:7503/health`);
      const recoveryTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(recoveryTime).toBeLessThan(rtoMs);
    });
  });

  describe('Health Check Progression', () => {
    it('should progress from unhealthy to degraded to healthy', async () => {
      // Start with full failure
      orchestrator.injectCascadingFailure(['postgresql', 'redis', 'auth-service']);

      // Verify unhealthy/degraded
      let response = await fetchWithTimeout(`http://localhost:7500/health`);
      expect((response.data as { status: string }).status).toBe('degraded');

      // Recover one at a time and check progression
      orchestrator.recoverService('postgresql');
      response = await fetchWithTimeout(`http://localhost:7500/health`);
      expect((response.data as { status: string }).status).toBe('degraded');

      orchestrator.recoverService('redis');
      response = await fetchWithTimeout(`http://localhost:7500/health`);
      expect((response.data as { status: string }).status).toBe('degraded');

      orchestrator.recoverService('auth-service');
      response = await fetchWithTimeout(`http://localhost:7500/health`);
      expect((response.data as { status: string }).status).toBe('healthy');
    });

    it('should update readiness status during recovery', async () => {
      orchestrator.injectFailure('postgresql', 'unavailable');

      // Not ready
      let response = await fetchWithTimeout(`http://localhost:7500/ready`);
      expect(response.status).toBe(503);
      expect((response.data as { ready: boolean }).ready).toBe(false);

      // Recover
      orchestrator.recoverService('postgresql');

      // Ready
      response = await fetchWithTimeout(`http://localhost:7500/ready`);
      expect(response.status).toBe(200);
      expect((response.data as { ready: boolean }).ready).toBe(true);
    });

    it('should maintain liveness during recovery', async () => {
      orchestrator.injectFailure('postgresql', 'unavailable');
      orchestrator.injectFailure('redis', 'unavailable');

      // Liveness should still pass
      const liveResponse = await fetchWithTimeout(`http://localhost:7500/live`);
      expect(liveResponse.status).toBe(200);

      // Recover
      orchestrator.recoverAll();

      // Liveness still passes
      const liveAfterResponse = await fetchWithTimeout(`http://localhost:7500/live`);
      expect(liveAfterResponse.status).toBe(200);
    });
  });

  describe('Statistics After Recovery', () => {
    it('should preserve failure statistics after recovery', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      // Make failed requests
      for (let i = 0; i < 5; i++) {
        await fetchWithTimeout(`http://localhost:7503/health`);
      }

      const beforeStats = orchestrator.getStats()['auth-service'];
      expect(beforeStats.failures).toBe(5);

      // Recover
      orchestrator.recoverService('auth-service');

      // Make successful requests
      for (let i = 0; i < 10; i++) {
        await fetchWithTimeout(`http://localhost:7503/health`);
      }

      const afterStats = orchestrator.getStats()['auth-service'];
      expect(afterStats.requests).toBe(15);
      expect(afterStats.failures).toBe(5); // Failures preserved
      expect(afterStats.successRate).toBeCloseTo(10 / 15, 1);
    });

    it('should track recovery events', async () => {
      orchestrator.injectFailure('postgresql', 'unavailable');

      // Make requests during failure
      for (let i = 0; i < 3; i++) {
        await fetchWithTimeout(`http://localhost:7501/health`);
      }

      // Recover
      orchestrator.recoverService('postgresql');

      // Make requests after recovery
      for (let i = 0; i < 5; i++) {
        await fetchWithTimeout(`http://localhost:7501/health`);
      }

      const stats = orchestrator.getStats()['postgresql'];

      // Should have record of both phases
      expect(stats.requests).toBe(8);
      expect(stats.failures).toBe(3);
    });

    it('should reset statistics on resetAll', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      for (let i = 0; i < 5; i++) {
        await fetchWithTimeout(`http://localhost:7503/health`);
      }

      expect(orchestrator.getStats()['auth-service'].failures).toBe(5);

      // Reset
      orchestrator.resetAll();
      orchestrator.recoverAll();

      const resetStats = orchestrator.getStats()['auth-service'];
      expect(resetStats.requests).toBe(0);
      expect(resetStats.failures).toBe(0);
    });
  });

  describe('Concurrent Recovery Requests', () => {
    it('should handle concurrent requests during recovery', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      // Start recovery and make concurrent requests
      orchestrator.recoverService('auth-service');

      const requests = Array(20)
        .fill(null)
        .map(() => fetchWithTimeout(`http://localhost:7503/health`));

      const responses = await Promise.all(requests);

      // All should succeed after recovery
      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBe(20);
    });

    it('should handle rapid fail/recover cycles', async () => {
      const results: boolean[] = [];

      for (let i = 0; i < 5; i++) {
        orchestrator.injectFailure('auth-service', 'unavailable');
        const failResponse = await fetchWithTimeout(`http://localhost:7503/health`);
        results.push(failResponse.status === 503);

        orchestrator.recoverService('auth-service');
        const recoverResponse = await fetchWithTimeout(`http://localhost:7503/health`);
        results.push(recoverResponse.status === 200);
      }

      // All states should be as expected
      expect(results.every((r) => r)).toBe(true);
    });
  });

  describe('Dependency Chain Recovery', () => {
    it('should recover dependent services when dependency recovers', async () => {
      // DB down affects everything
      orchestrator.injectFailure('postgresql', 'unavailable');

      // Session service should be degraded
      let sessionResponse = await fetchWithTimeout(`http://localhost:7504/health`);
      expect((sessionResponse.data as { status: string }).status).toBe('degraded');

      // Recover DB
      orchestrator.recoverService('postgresql');

      // Session should be healthy
      sessionResponse = await fetchWithTimeout(`http://localhost:7504/health`);
      expect((sessionResponse.data as { status: string }).status).toBe('healthy');
    });

    it('should handle out-of-order recovery', async () => {
      // Fail: DB -> Auth -> Session (chain)
      orchestrator.injectFailure('postgresql', 'unavailable');
      orchestrator.injectFailure('auth-service', 'unavailable');
      orchestrator.injectFailure('session-service', 'unavailable');

      // Recover in wrong order (Session before Auth before DB)
      orchestrator.recoverService('session-service');
      let response = await fetchWithTimeout(`http://localhost:7504/health`);
      // Should still be degraded (dependencies still down)
      expect((response.data as { status: string }).status).toBe('degraded');

      orchestrator.recoverService('auth-service');
      response = await fetchWithTimeout(`http://localhost:7503/health`);
      expect((response.data as { status: string }).status).toBe('degraded');

      orchestrator.recoverService('postgresql');
      // Now everything should be healthy
      response = await fetchWithTimeout(`http://localhost:7504/health`);
      expect((response.data as { status: string }).status).toBe('healthy');
    });
  });

  describe('Circuit Breaker Recovery', () => {
    it('should close circuit breaker after recovery', async () => {
      orchestrator.injectFailure('ai-detection', 'unavailable');

      // Trip circuit breaker
      for (let i = 0; i < 5; i++) {
        await fetchWithTimeout(`http://localhost:7505/health`);
      }

      // Check circuit state
      let gwResponse = await fetchWithTimeout(`http://localhost:7500/health`);
      let data = gwResponse.data as {
        circuitBreakers: Array<{ name: string; state: string }>;
      };
      let aiCircuit = data.circuitBreakers?.find(
        (cb) => cb.name === 'ai-detection' || cb.name === 'openai'
      );
      expect(['open', 'half_open']).toContain(aiCircuit?.state);

      // Recover and make successful requests
      orchestrator.recoverService('ai-detection');

      // Allow circuit breaker to close
      for (let i = 0; i < 5; i++) {
        await fetchWithTimeout(`http://localhost:7505/health`);
      }

      // Circuit should be closed
      gwResponse = await fetchWithTimeout(`http://localhost:7500/health`);
      data = gwResponse.data as {
        circuitBreakers: Array<{ name: string; state: string }>;
      };
      aiCircuit = data.circuitBreakers?.find(
        (cb) => cb.name === 'ai-detection' || cb.name === 'openai'
      );
      expect(aiCircuit?.state).toBe('closed');
    });
  });

  describe('Full System Recovery', () => {
    it('should recover entire system from total failure', async () => {
      // Total system failure
      services.forEach((s) => {
        if (s.name !== 'api-gateway') {
          orchestrator.injectFailure(s.name, 'unavailable');
        }
      });

      // API Gateway degraded
      let response = await fetchWithTimeout(`http://localhost:7500/health`);
      expect((response.data as { status: string }).status).toBe('degraded');

      // Recover all
      orchestrator.recoverAll();

      // Full health
      response = await fetchWithTimeout(`http://localhost:7500/health`);
      expect((response.data as { status: string }).status).toBe('healthy');

      // All individual services healthy
      const healthChecks = await Promise.all([
        fetchWithTimeout(`http://localhost:7501/health`),
        fetchWithTimeout(`http://localhost:7502/health`),
        fetchWithTimeout(`http://localhost:7503/health`),
        fetchWithTimeout(`http://localhost:7504/health`),
        fetchWithTimeout(`http://localhost:7505/health`),
        fetchWithTimeout(`http://localhost:7506/health`),
        fetchWithTimeout(`http://localhost:7507/health`),
      ]);

      healthChecks.forEach((r) => {
        expect(r.status).toBe(200);
      });
    });

    it('should pass full readiness after total recovery', async () => {
      // Fail critical services
      orchestrator.injectFailure('postgresql', 'unavailable');
      orchestrator.injectFailure('redis', 'unavailable');

      // Not ready
      let readyResponse = await fetchWithTimeout(`http://localhost:7500/ready`);
      expect(readyResponse.status).toBe(503);

      // Recover
      orchestrator.recoverAll();

      // Ready
      readyResponse = await fetchWithTimeout(`http://localhost:7500/ready`);
      expect(readyResponse.status).toBe(200);
      expect((readyResponse.data as { ready: boolean }).ready).toBe(true);
    });
  });
});
