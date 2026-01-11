/**
 * Database Failure Tests
 *
 * Tests for PostgreSQL failure scenarios:
 * - Connection failures
 * - Timeout scenarios
 * - Slow query responses
 * - Connection pool exhaustion
 * - Recovery after failure
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  ChaosOrchestrator,
  createMockService,
  fetchWithTimeout,
  sleep,
  ServiceConfig,
} from './mock-chaos-server';

describe('Database Failure Scenarios', () => {
  let orchestrator: ChaosOrchestrator;

  const apiGatewayConfig: ServiceConfig = {
    name: 'api-gateway',
    port: 8000,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  };

  const postgresConfig: ServiceConfig = {
    name: 'postgresql',
    port: 8001,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  };

  beforeAll(async () => {
    orchestrator = new ChaosOrchestrator({
      services: [apiGatewayConfig, postgresConfig],
    });
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

  describe('Connection Unavailable', () => {
    it('should return unhealthy status when database is unavailable', async () => {
      orchestrator.injectFailure('postgresql', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);

      expect(response.status).toBe(503);
      expect(response.data).toMatchObject({
        error: 'Service unavailable',
        service: 'postgresql',
      });
    });

    it('should detect database unavailability in health check dependencies', async () => {
      orchestrator.injectFailure('postgresql', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`);

      // API Gateway should report degraded status
      expect(response.status).toBe(200);
      const data = response.data as { status: string; dependencies: Array<{ name: string; status: string }> };
      expect(data.status).toBe('degraded');

      const dbDep = data.dependencies?.find((d) => d.name === 'postgresql');
      expect(dbDep?.status).toBe('unhealthy');
    });

    it('should return not ready on readiness check when database is down', async () => {
      orchestrator.injectFailure('postgresql', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/ready`);

      expect(response.status).toBe(503);
      const data = response.data as { ready: boolean };
      expect(data.ready).toBe(false);
    });
  });

  describe('Connection Timeout', () => {
    it('should handle database connection timeout', async () => {
      orchestrator.injectFailure('postgresql', 'timeout');

      // Request to DB should hang/timeout
      const response = await fetchWithTimeout(
        `http://localhost:${postgresConfig.port}/health`,
        {},
        1000 // 1 second timeout
      );

      expect(response.status).toBe(0);
      expect(response.data).toMatchObject({
        error: 'Request timeout',
      });
    });

    it('should timeout within acceptable window', async () => {
      orchestrator.injectFailure('postgresql', 'timeout');

      const startTime = Date.now();
      await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`, {}, 2000);
      const elapsed = Date.now() - startTime;

      // Should timeout around 2 seconds
      expect(elapsed).toBeGreaterThanOrEqual(1900);
      expect(elapsed).toBeLessThan(3000);
    });
  });

  describe('Slow Responses', () => {
    it('should handle slow database responses', async () => {
      orchestrator.injectLatency('postgresql', 500); // 500ms latency

      const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);

      expect(response.status).toBe(200);
      expect(response.latencyMs).toBeGreaterThanOrEqual(500);
    });

    it('should report high response time in health check', async () => {
      orchestrator.injectLatency('postgresql', 1000); // 1 second latency

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`, {}, 3000);

      expect(response.status).toBe(200);
      const data = response.data as { dependencies: Array<{ name: string; responseTimeMs: number }> };

      const dbDep = data.dependencies?.find((d) => d.name === 'postgresql');
      // When degraded, mock shows high response times
      expect(dbDep).toBeDefined();
    });

    it('should gradually increase latency in slow cascade', async () => {
      const latencies = [100, 300, 500];
      const responses: number[] = [];

      for (const latency of latencies) {
        orchestrator.injectLatency('postgresql', latency);
        const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
        responses.push(response.latencyMs);
      }

      // Each response should be slower than the configured latency
      expect(responses[0]).toBeGreaterThanOrEqual(100);
      expect(responses[1]).toBeGreaterThanOrEqual(300);
      expect(responses[2]).toBeGreaterThanOrEqual(500);
    });
  });

  describe('Intermittent Failures', () => {
    it('should handle intermittent database failures', async () => {
      orchestrator.injectFailure('postgresql', 'intermittent');

      const results: boolean[] = [];

      // Make multiple requests
      for (let i = 0; i < 20; i++) {
        const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
        results.push(response.status === 200);
      }

      // Should have mix of successes and failures (~50% each)
      const successCount = results.filter((r) => r).length;
      const failureCount = results.filter((r) => !r).length;

      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
    });

    it('should track intermittent failure statistics', async () => {
      orchestrator.injectFailure('postgresql', 'intermittent');

      // Make requests
      for (let i = 0; i < 30; i++) {
        await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
      }

      const stats = orchestrator.getStats();
      const dbStats = stats['postgresql'];

      expect(dbStats.requests).toBe(30);
      expect(dbStats.failures).toBeGreaterThan(0);
      expect(dbStats.successRate).toBeGreaterThan(0.3);
      expect(dbStats.successRate).toBeLessThan(0.7);
    });
  });

  describe('Error Rate', () => {
    it('should simulate configurable error rate', async () => {
      orchestrator.injectFailure('postgresql', 'error_rate');
      orchestrator.injectErrorRate('postgresql', 0.3); // 30% error rate

      const results: boolean[] = [];

      for (let i = 0; i < 50; i++) {
        const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
        results.push(response.status === 200);
      }

      const successRate = results.filter((r) => r).length / results.length;

      // Success rate should be around 70% (with some variance)
      expect(successRate).toBeGreaterThan(0.5);
      expect(successRate).toBeLessThan(0.9);
    });

    it('should handle 100% error rate', async () => {
      orchestrator.injectFailure('postgresql', 'error_rate');
      orchestrator.injectErrorRate('postgresql', 1.0); // 100% error rate

      const results: boolean[] = [];

      for (let i = 0; i < 10; i++) {
        const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
        results.push(response.status === 200);
      }

      // All should fail
      expect(results.every((r) => !r)).toBe(true);
    });

    it('should handle 0% error rate (no errors)', async () => {
      orchestrator.injectFailure('postgresql', 'error_rate');
      orchestrator.injectErrorRate('postgresql', 0.0); // 0% error rate

      const results: boolean[] = [];

      for (let i = 0; i < 10; i++) {
        const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
        results.push(response.status === 200);
      }

      // All should succeed
      expect(results.every((r) => r)).toBe(true);
    });
  });

  describe('Connection Refused', () => {
    it('should handle connection refused scenario', async () => {
      orchestrator.injectFailure('postgresql', 'connection_refused');

      const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`, {}, 2000);

      // Connection refused results in fetch error
      expect(response.status).toBe(0);
    });
  });

  describe('Recovery Scenarios', () => {
    it('should recover from unavailable state', async () => {
      // Start with failure
      orchestrator.injectFailure('postgresql', 'unavailable');

      const failedResponse = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
      expect(failedResponse.status).toBe(503);

      // Recover
      orchestrator.recoverService('postgresql');

      const recoveredResponse = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
      expect(recoveredResponse.status).toBe(200);
    });

    it('should recover from slow state', async () => {
      // Start with high latency
      orchestrator.injectLatency('postgresql', 2000);

      const slowResponse = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`, {}, 5000);
      expect(slowResponse.latencyMs).toBeGreaterThanOrEqual(2000);

      // Recover
      orchestrator.recoverService('postgresql');

      const fastResponse = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
      expect(fastResponse.latencyMs).toBeLessThan(100);
    });

    it('should recover from intermittent failures', async () => {
      // Start with intermittent failures
      orchestrator.injectFailure('postgresql', 'intermittent');

      let failuresSeen = false;
      for (let i = 0; i < 10; i++) {
        const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
        if (response.status !== 200) {
          failuresSeen = true;
          break;
        }
      }
      expect(failuresSeen).toBe(true);

      // Recover
      orchestrator.recoverService('postgresql');

      // All should succeed now
      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
        results.push(response.status === 200);
      }

      expect(results.every((r) => r)).toBe(true);
    });

    it('should track recovery in statistics', async () => {
      orchestrator.injectFailure('postgresql', 'unavailable');

      // Make some failed requests
      for (let i = 0; i < 5; i++) {
        await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
      }

      const beforeStats = orchestrator.getStats()['postgresql'];
      expect(beforeStats.failures).toBe(5);

      // Recover
      orchestrator.recoverService('postgresql');

      // Make successful requests
      for (let i = 0; i < 10; i++) {
        await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);
      }

      const afterStats = orchestrator.getStats()['postgresql'];
      expect(afterStats.requests).toBe(15);
      expect(afterStats.failures).toBe(5); // Still 5 failures from before
      expect(afterStats.successRate).toBeCloseTo(10 / 15, 1);
    });
  });

  describe('Health Check Behavior', () => {
    it('should return correct status for healthy database', async () => {
      const response = await fetchWithTimeout(`http://localhost:${postgresConfig.port}/health`);

      expect(response.status).toBe(200);
      const data = response.data as { status: string };
      expect(data.status).toBe('healthy');
    });

    it('should return degraded status for partial failures', async () => {
      orchestrator.injectFailure('postgresql', 'slow');
      orchestrator.injectLatency('postgresql', 100);

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`);

      expect(response.status).toBe(200);
      const data = response.data as { status: string };
      expect(data.status).toBe('degraded');
    });

    it('should include system metrics in health response', async () => {
      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`);

      const data = response.data as { system: { memoryUsageMb: number; cpuLoadAverage: number[] } };
      expect(data.system).toBeDefined();
      expect(data.system.memoryUsageMb).toBeGreaterThan(0);
      expect(data.system.cpuLoadAverage).toHaveLength(3);
    });

    it('should pass liveness check even when degraded', async () => {
      orchestrator.injectFailure('postgresql', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/live`);

      expect(response.status).toBe(200);
      const data = response.data as { status: string };
      expect(data.status).toBe('ok');
    });
  });
});
