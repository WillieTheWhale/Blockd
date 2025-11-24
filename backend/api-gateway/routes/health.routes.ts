/**
 * Health Check Routes
 */

import { FastifyInstance } from 'fastify';
import { getRedisClient } from '../../shared/cache/redis-client.js';
import prisma from '../lib/prisma.js';
import { sendSuccess } from '../lib/response.js';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Health check endpoint
  fastify.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check endpoint',
      description: 'Returns the health status of the API Gateway and its dependencies',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                timestamp: { type: 'string' },
                uptime: { type: 'number' },
                services: {
                  type: 'object',
                  properties: {
                    database: { type: 'string' },
                    redis: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const startTime = Date.now();

      // Check database connection
      let dbStatus = 'healthy';
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        dbStatus = 'unhealthy';
        request.log.error('Database health check failed:', error);
      }

      // Check Redis connection
      let redisStatus = 'healthy';
      try {
        const redis = getRedisClient();
        await redis.ping();
      } catch (error) {
        redisStatus = 'unhealthy';
        request.log.error('Redis health check failed:', error);
      }

      const responseTime = Date.now() - startTime;
      const overallStatus = dbStatus === 'healthy' && redisStatus === 'healthy'
        ? 'healthy'
        : 'unhealthy';

      const healthData = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime,
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: dbStatus,
          redis: redisStatus,
        },
        environment: process.env.NODE_ENV || 'development',
      };

      // Return 503 if unhealthy
      if (overallStatus === 'unhealthy') {
        return reply.code(503).send({
          success: false,
          data: healthData,
        });
      }

      return sendSuccess(reply, healthData);
    },
  });

  // Readiness check endpoint
  fastify.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness check endpoint',
      description: 'Returns whether the service is ready to accept traffic',
    },
    handler: async (request, reply) => {
      try {
        // Check if all critical services are available
        await prisma.$queryRaw`SELECT 1`;
        const redis = getRedisClient();
        await redis.ping();

        return sendSuccess(reply, { ready: true });
      } catch (error) {
        request.log.error('Readiness check failed:', error);
        return reply.code(503).send({
          success: false,
          error: {
            code: 'NOT_READY',
            message: 'Service is not ready',
          },
        });
      }
    },
  });

  // Liveness check endpoint
  fastify.get('/live', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness check endpoint',
      description: 'Returns whether the service is alive',
    },
    handler: async (request, reply) => {
      return sendSuccess(reply, { alive: true });
    },
  });
}
