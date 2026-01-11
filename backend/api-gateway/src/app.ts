/**
 * Fastify Application Factory
 * Creates and configures the Fastify application instance
 */

import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { config, validateConfig } from './config';
import { corsOptions } from '../middleware/cors.middleware';
import { errorHandler, notFoundHandler } from '../middleware/error-handler.middleware';
import { loggerConfig, genReqId, requestTimingStart, requestTimingEnd } from '../middleware/logger.middleware';
import { csrfProtectionMiddleware } from '../middleware/csrf.middleware';

// Import metrics
import {
  register,
  collectDefaultMetrics,
  fastifyMetricsPlugin,
  httpRequestDuration,
  httpRequestsTotal,
} from '../../shared/metrics/index.js';

// Import routes
import healthRoutes from '../routes/health.routes';
import authRoutes from '../routes/auth.routes';
import sessionsRoutes from '../routes/sessions.routes';
import browserRoutes from '../routes/browser.routes';
import analysisRoutes from '../routes/analysis.routes';
import gazeRoutes from '../routes/gaze.routes';
import reportsRoutes from '../routes/reports.routes';

export interface AppOptions extends FastifyServerOptions {
  prefix?: string;
}

/**
 * Create and configure Fastify application
 */
export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  // Validate configuration
  validateConfig();

  // Initialize Prometheus metrics collection
  collectDefaultMetrics();

  // Create Fastify instance with security defaults
  const app = Fastify({
    logger: loggerConfig,
    requestIdLogLabel: 'requestId',
    requestIdHeader: 'x-request-id',
    genReqId,
    disableRequestLogging: false,
    trustProxy: true,
    // Body size limits to prevent DoS attacks
    bodyLimit: 1048576, // 1MB default for most endpoints
    maxParamLength: 200, // Limit URL parameter length
    // Connection limits
    connectionTimeout: 30000, // 30 seconds
    keepAliveTimeout: 72000, // 72 seconds (longer than ALB default)
    ...options,
  });

  // Register plugins
  await registerPlugins(app);

  // Register routes
  await registerRoutes(app, options.prefix);

  // Register error handlers
  registerErrorHandlers(app);

  return app;
}

/**
 * Register Fastify plugins
 */
async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Register Prometheus metrics plugin
  await app.register(fastifyMetricsPlugin);

  // Register CORS
  await app.register(cors, corsOptions);

  // Register Helmet for security headers
  await app.register(helmet, {
    contentSecurityPolicy: config.server.isProduction
      ? undefined
      : false,
    global: true,
  });

  // Register CSRF protection for state-changing requests
  app.addHook('onRequest', csrfProtectionMiddleware);

  // Register request timing hooks for performance monitoring
  app.addHook('onRequest', requestTimingStart);
  app.addHook('onResponse', requestTimingEnd);

  // Register WebSocket support
  await app.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
      verifyClient: (info, next) => {
        // Add WebSocket authentication here if needed
        next(true);
      },
    },
  });

  // Register Swagger documentation
  if (config.server.isDevelopment || process.env.ENABLE_SWAGGER === 'true') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Blockd API Gateway',
          description: 'Production-grade API Gateway for Blockd interview integrity platform',
          version: '1.0.0',
          contact: {
            name: 'Blockd Team',
            email: 'support@blockd.io',
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT',
          },
        },
        servers: [
          {
            url: 'http://localhost:3000',
            description: 'Development server',
          },
          {
            url: 'https://api.blockd.io',
            description: 'Production server',
          },
        ],
        tags: [
          { name: 'Health', description: 'Health check endpoints' },
          { name: 'Authentication', description: 'User authentication and authorization' },
          { name: 'Sessions', description: 'Interview session management' },
          { name: 'Browser', description: 'Browser client endpoints' },
          { name: 'Analysis', description: 'AI detection and analysis' },
          { name: 'Gaze', description: 'Eye tracking and gaze analysis' },
          { name: 'Reports', description: 'Session reports and analytics' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT access token',
            },
          },
        },
      },
    });

    await app.register(swaggerUI, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
  }
}

/**
 * Register application routes
 */
async function registerRoutes(app: FastifyInstance, prefix = '/api/v1'): Promise<void> {
  // Health check routes (no prefix)
  await app.register(healthRoutes, { prefix: '/api/v1' });

  // API routes
  await app.register(authRoutes, { prefix: `${prefix}/auth` });
  await app.register(sessionsRoutes, { prefix: `${prefix}/sessions` });
  await app.register(browserRoutes, { prefix: `${prefix}/browser` });
  await app.register(analysisRoutes, { prefix: `${prefix}/analysis` });
  await app.register(gazeRoutes, { prefix: `${prefix}/gaze` });
  await app.register(reportsRoutes, { prefix: `${prefix}/reports` });

  // Root endpoint
  app.get('/', async (_request, _reply) => {
    return {
      name: 'Blockd API Gateway',
      version: '1.0.0',
      status: 'running',
      documentation: config.server.isDevelopment ? '/docs' : undefined,
    };
  });

  // Prometheus metrics endpoint (not versioned, for scraping)
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', register.contentType);
    return register.metrics();
  });
}

/**
 * Register error handlers
 */
function registerErrorHandlers(app: FastifyInstance): void {
  // Global error handler
  app.setErrorHandler(errorHandler);

  // Not found handler
  app.setNotFoundHandler(notFoundHandler);
}

/**
 * Graceful shutdown handler
 */
export async function gracefulShutdown(app: FastifyInstance, signal: string): Promise<void> {
  app.log.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    // Stop accepting new connections
    await app.close();

    app.log.info('Fastify server closed');

    // Close database connections
    const { disconnectPrisma } = await import('../lib/prisma.js');
    await disconnectPrisma();

    app.log.info('Database connections closed');

    // Close Redis connection
    const { getRedisClient } = await import('../lib/redis-client.js');
    const redis = getRedisClient();
    await redis.disconnect();

    app.log.info('Redis connection closed');

    app.log.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

export default createApp;
