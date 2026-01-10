/**
 * Main Server Entry Point
 * Starts the Fastify API Gateway server
 */

import { createApp, gracefulShutdown } from './app';
import { config } from './config';

/**
 * Start the server
 */
async function start(): Promise<void> {
  try {
    // Create Fastify app
    const app = await createApp();

    // Start listening
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    // Log server information
    app.log.info('='.repeat(80));
    app.log.info('🚀 Blockd API Gateway Started');
    app.log.info('='.repeat(80));
    app.log.info(`Environment: ${config.server.nodeEnv}`);
    app.log.info(`Server: http://${config.server.host}:${config.server.port}`);
    app.log.info(`Health Check: http://${config.server.host}:${config.server.port}/api/v1/health`);

    if (config.server.isDevelopment || process.env.ENABLE_SWAGGER === 'true') {
      app.log.info(`Documentation: http://${config.server.host}:${config.server.port}/docs`);
    }

    app.log.info('='.repeat(80));

    // Log configuration
    app.log.info('Configuration:');
    app.log.info(`  - Database: ${config.database.url.replace(/:[^:]*@/, ':****@')}`);
    app.log.info(`  - Redis: ${config.redis.host}:${config.redis.port}`);
    app.log.info(`  - CORS Origins: ${Array.isArray(config.cors.origin) ? config.cors.origin.join(', ') : config.cors.origin}`);
    app.log.info(`  - Rate Limit (Public): ${config.rateLimit.public.max} req/${config.rateLimit.public.timeWindow}s`);
    app.log.info(`  - Rate Limit (Auth): ${config.rateLimit.authenticated.max} req/${config.rateLimit.authenticated.timeWindow}s`);
    app.log.info('='.repeat(80));

    // Register shutdown handlers
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGUSR2'];

    for (const signal of signals) {
      process.on(signal, () => gracefulShutdown(app, signal));
    }

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      app.log.error({ err: error }, 'Uncaught Exception');
      gracefulShutdown(app, 'uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      app.log.error({ reason, promise: String(promise) }, 'Unhandled Rejection');
      gracefulShutdown(app, 'unhandledRejection');
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
start();
