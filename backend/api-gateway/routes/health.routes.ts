/**
 * Health Check Routes
 * Enhanced with comprehensive dependency checks and metrics
 */

import { FastifyInstance } from 'fastify';
import { sendSuccess } from '../lib/response';
import {
  performHealthCheck,
  performReadinessCheck,
  performLivenessCheck,
  performQuickHealthCheck,
} from '../lib/health-check';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Comprehensive health check endpoint
  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Comprehensive health check',
      description: 'Returns detailed health status including all dependencies, circuit breakers, and system metrics',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['healthy', 'unhealthy', 'degraded'] },
                timestamp: { type: 'string' },
                version: { type: 'string' },
                environment: { type: 'string' },
                dependencies: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      status: { type: 'string' },
                      critical: { type: 'boolean' },
                      responseTimeMs: { type: 'number' },
                      message: { type: 'string' },
                    },
                  },
                },
                circuitBreakers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      state: { type: 'string' },
                      failures: { type: 'number' },
                      successes: { type: 'number' },
                    },
                  },
                },
                system: {
                  type: 'object',
                  properties: {
                    memoryUsageMb: { type: 'number' },
                    memoryPercentage: { type: 'number' },
                    cpuLoadAverage: { type: 'array', items: { type: 'number' } },
                    uptime: { type: 'number' },
                    nodeVersion: { type: 'string' },
                  },
                },
                checks: {
                  type: 'object',
                  properties: {
                    critical: {
                      type: 'object',
                      properties: {
                        passed: { type: 'number' },
                        failed: { type: 'number' },
                      },
                    },
                    optional: {
                      type: 'object',
                      properties: {
                        passed: { type: 'number' },
                        failed: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['unhealthy'] },
                timestamp: { type: 'string' },
                version: { type: 'string' },
                environment: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const healthResult = await performHealthCheck({
        includeDependencies: true,
        includeCircuitBreakers: true,
        includeSystemMetrics: true,
      });

      // Log health check result
      if (healthResult.status !== 'healthy') {
        request.log.warn({ healthResult }, 'Health check returned non-healthy status');
      }

      // Return appropriate status code
      const isHealthy = healthResult.status === 'healthy' || healthResult.status === 'degraded';

      return reply.code(isHealthy ? 200 : 503).send({
        success: healthResult.status !== 'unhealthy',
        data: healthResult,
      });
    },
  });

  // Quick health check for load balancer (minimal overhead)
  fastify.get('/health/quick', {
    schema: {
      tags: ['Health'],
      summary: 'Quick health check',
      description: 'Fast health check with minimal overhead for load balancer polling',
    },
    handler: async (request, reply) => {
      const result = await performQuickHealthCheck();

      return reply
        .code(result.status === 'healthy' ? 200 : 503)
        .send(result);
    },
  });

  // Readiness check endpoint (for Kubernetes)
  fastify.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness check',
      description: 'Returns whether the service is ready to accept traffic (critical dependencies only)',
    },
    handler: async (request, reply) => {
      const result = await performReadinessCheck();

      if (!result.ready) {
        request.log.warn({ result }, 'Readiness check failed');
        return reply.code(503).send({
          success: false,
          error: {
            code: 'NOT_READY',
            message: 'Service is not ready to accept traffic',
          },
          checks: result.checks,
          timestamp: result.timestamp,
        });
      }

      return sendSuccess(reply, result);
    },
  });

  // Liveness check endpoint (for Kubernetes)
  fastify.get('/live', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness check',
      description: 'Returns whether the service process is alive',
    },
    handler: async (request, reply) => {
      const result = await performLivenessCheck();
      return sendSuccess(reply, result);
    },
  });

  // Detailed dependency status
  fastify.get('/health/dependencies', {
    schema: {
      tags: ['Health'],
      summary: 'Dependency health details',
      description: 'Returns detailed health status of all dependencies',
    },
    handler: async (request, reply) => {
      const healthResult = await performHealthCheck({
        includeDependencies: true,
        includeCircuitBreakers: true,
        includeSystemMetrics: false,
      });

      return sendSuccess(reply, {
        timestamp: healthResult.timestamp,
        dependencies: healthResult.dependencies,
        circuitBreakers: healthResult.circuitBreakers,
        checks: healthResult.checks,
      });
    },
  });
}
