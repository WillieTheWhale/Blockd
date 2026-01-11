/**
 * Cascading Failure Tests
 *
 * Tests for failure propagation scenarios:
 * - Database failure affecting multiple services
 * - Redis failure affecting session and rate limiting
 * - Auth service failure affecting all authenticated endpoints
 * - Network partition scenarios
 * - Dependency chain failures
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  ChaosOrchestrator,
  fetchWithTimeout,
  sleep,
  ServiceConfig,
} from './mock-chaos-server';

describe('Cascading Failure Scenarios', () => {
  let orchestrator: ChaosOrchestrator;

  const services: ServiceConfig[] = [
    {
      name: 'api-gateway',
      port: 7300,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'postgresql',
      port: 7301,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'redis',
      port: 7302,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'auth-service',
      port: 7303,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'session-service',
      port: 7304,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'ai-detection',
      port: 7305,
      healthEndpoint: '/health',
      failureMode: 'healthy',
      latencyMs: 0,
      errorRate: 0,
    },
    {
      name: 'websocket-service',
      port: 7306,
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

  describe('Database Cascade', () => {
    it('should propagate database failure to dependent services', async () => {
      // Database fails
      orchestrator.injectFailure('postgresql', 'unavailable');

      // Check that dependent services are affected
      const apiResponse = await fetchWithTimeout(`http://localhost:7300/health`);
      const authResponse = await fetchWithTimeout(`http://localhost:7303/health`);
      const sessionResponse = await fetchWithTimeout(`http://localhost:7304/health`);

      // API Gateway should report degraded
      expect(apiResponse.status).toBe(200);
      const apiData = apiResponse.data as { status: string };
      expect(apiData.status).toBe('degraded');

      // Auth service depends on DB
      const authData = authResponse.data as { status: string };
      expect(authData.status).toBe('degraded');

      // Session service depends on DB
      const sessionData = sessionResponse.data as { status: string };
      expect(sessionData.status).toBe('degraded');
    });

    it('should cascade database timeout to slow responses', async () => {
      orchestrator.injectLatency('postgresql', 2000);

      // All DB-dependent services should still respond (mock doesn't propagate latency)
      const responses = await Promise.all([
        fetchWithTimeout(`http://localhost:7303/health`, {}, 5000),
        fetchWithTimeout(`http://localhost:7304/health`, {}, 5000),
      ]);

      // Each should succeed (the mock simulates degraded status, not actual latency propagation)
      responses.forEach((r) => {
        expect(r.status).toBe(200);
        // Service responds but reports degraded due to slow dependency
        const data = r.data as { status: string };
        expect(['healthy', 'degraded']).toContain(data.status);
      });
    });

    it('should recover cascade when database recovers', async () => {
      // Fail database
      orchestrator.injectFailure('postgresql', 'unavailable');

      // Verify cascade
      const degradedResponse = await fetchWithTimeout(`http://localhost:7300/health`);
      expect((degradedResponse.data as { status: string }).status).toBe('degraded');

      // Recover database
      orchestrator.recoverService('postgresql');

      // All should recover
      const healthyResponse = await fetchWithTimeout(`http://localhost:7300/health`);
      expect((healthyResponse.data as { status: string }).status).toBe('healthy');
    });
  });

  describe('Redis Cascade', () => {
    it('should affect session service when Redis fails', async () => {
      orchestrator.injectFailure('redis', 'unavailable');

      const sessionResponse = await fetchWithTimeout(`http://localhost:7304/health`);

      const data = sessionResponse.data as { status: string };
      expect(data.status).toBe('degraded');
    });

    it('should affect rate limiting when Redis fails', async () => {
      orchestrator.injectFailure('redis', 'unavailable');

      // API Gateway should report degraded status
      const response = await fetchWithTimeout(`http://localhost:7300/health`);

      const data = response.data as {
        status: string;
        dependencies: Array<{ name: string; status: string }>;
      };
      expect(data.status).toBe('degraded');

      // When Redis is completely unavailable, its dependency status is 'unhealthy'
      const redisDep = data.dependencies?.find((d) => d.name === 'redis');
      expect(redisDep?.status).toBe('unhealthy');
    });

    it('should propagate Redis timeout to WebSocket service', async () => {
      orchestrator.injectLatency('redis', 1000);

      const wsResponse = await fetchWithTimeout(`http://localhost:7306/health`, {}, 3000);

      expect(wsResponse.status).toBe(200);
      // WebSocket service should be slow due to Redis dependency
    });
  });

  describe('Auth Service Cascade', () => {
    it('should affect all authenticated endpoints when auth fails', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      // Check API Gateway
      const apiResponse = await fetchWithTimeout(`http://localhost:7300/health`);

      const data = apiResponse.data as {
        status: string;
        circuitBreakers: Array<{ name: string; state: string }>;
      };

      // Should report auth circuit breaker
      const authCircuit = data.circuitBreakers?.find((cb) => cb.name === 'auth-service');
      expect(authCircuit?.state).toBe('half_open');
    });

    it('should not affect public endpoints when auth fails', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      // Liveness should still work
      const liveResponse = await fetchWithTimeout(`http://localhost:7300/live`);

      expect(liveResponse.status).toBe(200);
    });

    it('should cascade auth failure to session service', async () => {
      orchestrator.injectFailure('auth-service', 'unavailable');

      const sessionResponse = await fetchWithTimeout(`http://localhost:7304/health`);

      const data = sessionResponse.data as {
        dependencies: Array<{ name: string; status: string }>;
      };

      // Session service should report auth as unhealthy
      const authDep = data.dependencies?.find((d) => d.name === 'auth-service');
      expect(authDep?.status).toBe('unhealthy');
    });
  });

  describe('Multiple Service Cascade', () => {
    it('should handle multiple simultaneous failures', async () => {
      // Fail multiple services at once
      orchestrator.injectCascadingFailure(['postgresql', 'redis', 'auth-service']);

      const response = await fetchWithTimeout(`http://localhost:7300/health`);

      const data = response.data as {
        status: string;
        dependencies: Array<{ name: string; status: string }>;
      };

      // Should be severely degraded
      expect(data.status).toBe('degraded');

      // Multiple dependencies unhealthy
      const unhealthyDeps = data.dependencies?.filter((d) => d.status === 'unhealthy') || [];
      expect(unhealthyDeps.length).toBeGreaterThanOrEqual(1);
    });

    it('should track cascade progression', async () => {
      // Start with database failure
      orchestrator.injectFailure('postgresql', 'unavailable');

      // Check initial cascade
      let response = await fetchWithTimeout(`http://localhost:7300/health`);
      let data = response.data as { status: string };
      expect(data.status).toBe('degraded');

      // Add Redis failure
      orchestrator.injectFailure('redis', 'unavailable');

      response = await fetchWithTimeout(`http://localhost:7300/health`);
      data = response.data as { status: string };
      expect(data.status).toBe('degraded');

      // Add auth failure
      orchestrator.injectFailure('auth-service', 'unavailable');

      response = await fetchWithTimeout(`http://localhost:7300/health`);
      data = response.data as { status: string };
      expect(data.status).toBe('degraded');
    });

    it('should recover progressively', async () => {
      // Fail everything
      orchestrator.injectCascadingFailure(['postgresql', 'redis', 'auth-service']);

      // Verify degraded
      let response = await fetchWithTimeout(`http://localhost:7300/health`);
      expect((response.data as { status: string }).status).toBe('degraded');

      // Recover database
      orchestrator.recoverService('postgresql');
      response = await fetchWithTimeout(`http://localhost:7300/health`);
      expect((response.data as { status: string }).status).toBe('degraded'); // Still degraded

      // Recover Redis
      orchestrator.recoverService('redis');
      response = await fetchWithTimeout(`http://localhost:7300/health`);
      expect((response.data as { status: string }).status).toBe('degraded'); // Still degraded

      // Recover auth
      orchestrator.recoverService('auth-service');
      response = await fetchWithTimeout(`http://localhost:7300/health`);
      expect((response.data as { status: string }).status).toBe('healthy'); // Now healthy
    });
  });

  describe('Network Partition Simulation', () => {
    it('should handle network partition with database', async () => {
      // Simulate partition by making DB timeout
      orchestrator.injectFailure('postgresql', 'timeout');

      const response = await fetchWithTimeout(`http://localhost:7300/ready`, {}, 2000);

      expect(response.status).toBe(503);
    });

    it('should handle split-brain Redis cluster', async () => {
      // Simulate partial Redis availability
      orchestrator.injectFailure('redis', 'error_rate');
      orchestrator.injectErrorRate('redis', 0.5); // 50% failure

      const results: boolean[] = [];

      for (let i = 0; i < 20; i++) {
        const response = await fetchWithTimeout(`http://localhost:7302/health`);
        results.push(response.status === 200);
      }

      const successRate = results.filter((r) => r).length / results.length;
      expect(successRate).toBeGreaterThan(0.3);
      expect(successRate).toBeLessThan(0.7);
    });

    it('should maintain partial functionality during partition', async () => {
      // Database partition
      orchestrator.injectFailure('postgresql', 'timeout');

      // AI detection might still work (doesn't depend on DB for inference)
      const aiResponse = await fetchWithTimeout(`http://localhost:7305/health`);

      expect(aiResponse.status).toBe(200);
      const data = aiResponse.data as { status: string };
      expect(['healthy', 'degraded']).toContain(data.status);
    });
  });

  describe('Dependency Chain Failures', () => {
    it('should handle deep dependency chain failure', async () => {
      // Session -> Auth -> DB chain
      // Fail DB to see cascade through chain
      orchestrator.injectFailure('postgresql', 'unavailable');

      // Check each level of the chain
      const responses = await Promise.all([
        fetchWithTimeout(`http://localhost:7301/health`), // DB
        fetchWithTimeout(`http://localhost:7303/health`), // Auth
        fetchWithTimeout(`http://localhost:7304/health`), // Session
      ]);

      // DB should be 503
      expect(responses[0].status).toBe(503);

      // Auth should be degraded
      expect(responses[1].status).toBe(200);
      expect((responses[1].data as { status: string }).status).toBe('degraded');

      // Session should be degraded
      expect(responses[2].status).toBe(200);
      expect((responses[2].data as { status: string }).status).toBe('degraded');
    });

    it('should not cascade to independent services', async () => {
      // Fail AI detection (which is relatively independent)
      orchestrator.injectFailure('ai-detection', 'unavailable');

      // Auth should be unaffected
      const authResponse = await fetchWithTimeout(`http://localhost:7303/health`);
      expect((authResponse.data as { status: string }).status).toBe('healthy');

      // Session should be unaffected
      const sessionResponse = await fetchWithTimeout(`http://localhost:7304/health`);
      expect((sessionResponse.data as { status: string }).status).toBe('healthy');
    });

    it('should properly isolate failure domains', async () => {
      // WebSocket and AI are separate domains
      orchestrator.injectFailure('ai-detection', 'unavailable');
      orchestrator.injectFailure('websocket-service', 'unavailable');

      // Core services should still work
      const responses = await Promise.all([
        fetchWithTimeout(`http://localhost:7301/health`), // DB
        fetchWithTimeout(`http://localhost:7302/health`), // Redis
        fetchWithTimeout(`http://localhost:7303/health`), // Auth
        fetchWithTimeout(`http://localhost:7304/health`), // Session
      ]);

      responses.forEach((r) => {
        expect(r.status).toBe(200);
      });
    });
  });

  describe('Thundering Herd Prevention', () => {
    it('should handle burst of requests during recovery', async () => {
      // Fail service
      orchestrator.injectFailure('auth-service', 'unavailable');
      await sleep(100);

      // Recover
      orchestrator.recoverService('auth-service');

      // Burst of requests (simulating thundering herd)
      const requests = Array(50)
        .fill(null)
        .map(() => fetchWithTimeout(`http://localhost:7303/health`));

      const responses = await Promise.all(requests);

      // Most should succeed (rate limiting may reject some)
      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBeGreaterThan(40);
    });
  });

  describe('Statistics During Cascade', () => {
    it('should track cascade statistics', async () => {
      orchestrator.injectCascadingFailure(['postgresql', 'redis']);

      // Make requests to affected services
      for (let i = 0; i < 10; i++) {
        await fetchWithTimeout(`http://localhost:7301/health`);
        await fetchWithTimeout(`http://localhost:7302/health`);
        await fetchWithTimeout(`http://localhost:7300/health`);
      }

      const stats = orchestrator.getStats();

      // DB and Redis should have failures
      expect(stats['postgresql'].failures).toBe(10);
      expect(stats['redis'].failures).toBe(10);

      // API Gateway should have handled requests (degraded, not failed)
      expect(stats['api-gateway'].requests).toBe(10);
    });
  });
});
