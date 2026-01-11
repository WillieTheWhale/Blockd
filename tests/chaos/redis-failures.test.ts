/**
 * Redis Cache Failure Tests
 *
 * Tests for Redis failure scenarios:
 * - Cache unavailability
 * - Slow cache responses
 * - Cache cluster issues
 * - Graceful degradation without cache
 * - Recovery scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  ChaosOrchestrator,
  fetchWithTimeout,
  sleep,
  ServiceConfig,
} from './mock-chaos-server';

describe('Redis Cache Failure Scenarios', () => {
  let orchestrator: ChaosOrchestrator;

  const apiGatewayConfig: ServiceConfig = {
    name: 'api-gateway',
    port: 7100,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  };

  const redisConfig: ServiceConfig = {
    name: 'redis',
    port: 7101,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  };

  const sessionServiceConfig: ServiceConfig = {
    name: 'session-service',
    port: 7102,
    healthEndpoint: '/health',
    failureMode: 'healthy',
    latencyMs: 0,
    errorRate: 0,
  };

  beforeAll(async () => {
    orchestrator = new ChaosOrchestrator({
      services: [apiGatewayConfig, redisConfig, sessionServiceConfig],
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

  describe('Cache Unavailable', () => {
    it('should handle complete Redis unavailability', async () => {
      orchestrator.injectFailure('redis', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`);

      expect(response.status).toBe(503);
    });

    it('should report degraded status when Redis is down', async () => {
      orchestrator.injectFailure('redis', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`);

      expect(response.status).toBe(200);
      const data = response.data as { status: string; dependencies: Array<{ name: string; status: string }> };
      expect(data.status).toBe('degraded');

      const redisDep = data.dependencies?.find((d) => d.name === 'redis');
      // When Redis is completely unavailable, its status is 'unhealthy'
      expect(redisDep?.status).toBe('unhealthy');
    });

    it('should fail readiness when Redis is critical dependency', async () => {
      orchestrator.injectFailure('redis', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/ready`);

      expect(response.status).toBe(503);
      const data = response.data as { ready: boolean };
      expect(data.ready).toBe(false);
    });
  });

  describe('Slow Cache Responses', () => {
    it('should handle slow Redis responses', async () => {
      orchestrator.injectLatency('redis', 500);

      const response = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`);

      expect(response.status).toBe(200);
      expect(response.latencyMs).toBeGreaterThanOrEqual(500);
    });

    it('should still function with degraded cache performance', async () => {
      orchestrator.injectLatency('redis', 1000);

      // Session service should still work, just slower
      const response = await fetchWithTimeout(`http://localhost:${sessionServiceConfig.port}/health`, {}, 3000);

      expect(response.status).toBe(200);
    });

    it('should report slow Redis in health dependencies', async () => {
      orchestrator.injectLatency('redis', 500);
      orchestrator.injectFailure('redis', 'slow');

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`);

      const data = response.data as { status: string };
      expect(data.status).toBe('degraded');
    });
  });

  describe('Cache Timeout', () => {
    it('should timeout Redis operations', async () => {
      orchestrator.injectFailure('redis', 'timeout');

      const response = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`, {}, 1000);

      expect(response.status).toBe(0);
      expect(response.latencyMs).toBeGreaterThanOrEqual(900);
    });

    it('should continue operation when cache times out', async () => {
      orchestrator.injectFailure('redis', 'timeout');

      // API Gateway should still respond (liveness)
      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/live`);

      expect(response.status).toBe(200);
    });
  });

  describe('Intermittent Cache Failures', () => {
    it('should handle intermittent Redis failures', async () => {
      orchestrator.injectFailure('redis', 'intermittent');

      const results: boolean[] = [];

      for (let i = 0; i < 20; i++) {
        const response = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`);
        results.push(response.status === 200);
      }

      const successCount = results.filter((r) => r).length;
      const failureCount = results.filter((r) => !r).length;

      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
    });

    it('should track cache hit/miss rates during intermittent failures', async () => {
      orchestrator.injectFailure('redis', 'intermittent');

      for (let i = 0; i < 30; i++) {
        await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`);
      }

      const stats = orchestrator.getStats()['redis'];

      expect(stats.requests).toBe(30);
      expect(stats.successRate).toBeGreaterThan(0.3);
      expect(stats.successRate).toBeLessThan(0.7);
    });
  });

  describe('Cache Cluster Split', () => {
    it('should handle partial cache cluster availability', async () => {
      // Simulate partial failure with error rate
      orchestrator.injectFailure('redis', 'error_rate');
      orchestrator.injectErrorRate('redis', 0.33); // 1/3 nodes down

      const results: boolean[] = [];

      for (let i = 0; i < 30; i++) {
        const response = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`);
        results.push(response.status === 200);
      }

      const successRate = results.filter((r) => r).length / results.length;

      // Should have ~67% success rate
      expect(successRate).toBeGreaterThan(0.5);
      expect(successRate).toBeLessThan(0.85);
    });
  });

  describe('Graceful Degradation', () => {
    it('should continue serving requests when cache is down', async () => {
      orchestrator.injectFailure('redis', 'unavailable');

      // API Gateway should still work (degraded mode)
      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`);

      expect(response.status).toBe(200);
      const data = response.data as { status: string };
      // Still responds, but degraded
      expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
    });

    it('should maintain liveness when cache is slow', async () => {
      orchestrator.injectLatency('redis', 2000);

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/live`);

      expect(response.status).toBe(200);
    });

    it('should indicate degraded state in health check', async () => {
      orchestrator.injectFailure('redis', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`);

      const data = response.data as { status: string; dependencies: Array<{ name: string; status: string; critical: boolean }> };

      const redisDep = data.dependencies?.find((d) => d.name === 'redis');
      expect(redisDep).toBeDefined();
      expect(redisDep?.critical).toBe(true);
    });
  });

  describe('Recovery Scenarios', () => {
    it('should recover from Redis failure', async () => {
      // Fail
      orchestrator.injectFailure('redis', 'unavailable');
      const failedResponse = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`);
      expect(failedResponse.status).toBe(503);

      // Recover
      orchestrator.recoverService('redis');
      const recoveredResponse = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`);
      expect(recoveredResponse.status).toBe(200);
    });

    it('should recover from slow cache', async () => {
      // Slow
      orchestrator.injectLatency('redis', 2000);
      const slowResponse = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`, {}, 5000);
      expect(slowResponse.latencyMs).toBeGreaterThanOrEqual(2000);

      // Recover
      orchestrator.recoverService('redis');
      const fastResponse = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`);
      expect(fastResponse.latencyMs).toBeLessThan(100);
    });

    it('should restore healthy status after recovery', async () => {
      // Fail
      orchestrator.injectFailure('redis', 'unavailable');
      const degradedResponse = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`);
      expect((degradedResponse.data as { status: string }).status).toBe('degraded');

      // Recover
      orchestrator.recoverService('redis');
      const healthyResponse = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`);
      expect((healthyResponse.data as { status: string }).status).toBe('healthy');
    });

    it('should pass readiness after recovery', async () => {
      // Fail
      orchestrator.injectFailure('redis', 'unavailable');
      const notReadyResponse = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/ready`);
      expect(notReadyResponse.status).toBe(503);

      // Recover
      orchestrator.recoverService('redis');
      const readyResponse = await fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/ready`);
      expect(readyResponse.status).toBe(200);
    });
  });

  describe('Session Storage Impact', () => {
    it('should report session service health with Redis dependency', async () => {
      const response = await fetchWithTimeout(`http://localhost:${sessionServiceConfig.port}/health`);

      expect(response.status).toBe(200);
      const data = response.data as { dependencies: Array<{ name: string }> };
      expect(data.dependencies?.some((d) => d.name === 'redis')).toBe(true);
    });

    it('should indicate session service degraded when Redis fails', async () => {
      orchestrator.injectFailure('redis', 'unavailable');

      const response = await fetchWithTimeout(`http://localhost:${sessionServiceConfig.port}/health`);

      const data = response.data as { status: string };
      expect(data.status).toBe('degraded');
    });
  });

  describe('Rate Limiting Impact', () => {
    it('should function when rate limit cache is slow', async () => {
      orchestrator.injectLatency('redis', 300);

      // Multiple requests should still work
      const responses = await Promise.all([
        fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`),
        fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`),
        fetchWithTimeout(`http://localhost:${apiGatewayConfig.port}/health`),
      ]);

      responses.forEach((r) => {
        expect(r.status).toBe(200);
      });
    });
  });

  describe('Connection Pool Behavior', () => {
    it('should handle connection pool exhaustion', async () => {
      // Simulate pool exhaustion with high error rate
      orchestrator.injectFailure('redis', 'error_rate');
      orchestrator.injectErrorRate('redis', 0.8);

      const results: boolean[] = [];

      for (let i = 0; i < 20; i++) {
        const response = await fetchWithTimeout(`http://localhost:${redisConfig.port}/health`);
        results.push(response.status === 200);
      }

      // Most should fail
      const failureRate = results.filter((r) => !r).length / results.length;
      expect(failureRate).toBeGreaterThan(0.6);
    });
  });
});
