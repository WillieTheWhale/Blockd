import { buildApp } from './app';
import { config } from './config';
import { connectMessageQueue, disconnectMessageQueue } from './messageQueue';
import { disconnectDatabase } from './database';
import { disconnectRedis } from './redis';
import { getWebSocketServer } from '../websocket/socket-server';

/**
 * Main Server
 * Starts HTTP API server and WebSocket server
 */

async function startServer() {
  try {
    console.log('Starting Blockd Session Service...');
    console.log(`Environment: ${config.nodeEnv}`);

    // Connect to external services
    console.log('Connecting to RabbitMQ...');
    await connectMessageQueue();

    // Build Fastify app
    console.log('Building Fastify application...');
    const app = await buildApp();

    // Start HTTP server
    console.log(`Starting HTTP server on ${config.host}:${config.port}...`);
    await app.listen({
      host: config.host,
      port: config.port,
    });

    console.log(`HTTP server listening on http://${config.host}:${config.port}`);

    // Start WebSocket server
    console.log('Starting WebSocket server...');
    const wsServer = getWebSocketServer();
    await wsServer.start();

    console.log('Session Service started successfully!');
    console.log('='.repeat(50));
    console.log(`HTTP API: http://${config.host}:${config.port}`);
    console.log(`WebSocket: ws://localhost:${config.websocket.port}`);
    console.log('='.repeat(50));

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);

      try {
        // Stop WebSocket server
        console.log('Stopping WebSocket server...');
        await wsServer.stop();

        // Stop HTTP server
        console.log('Stopping HTTP server...');
        await app.close();

        // Disconnect from external services
        console.log('Disconnecting from RabbitMQ...');
        await disconnectMessageQueue();

        console.log('Disconnecting from Redis...');
        await disconnectRedis();

        console.log('Disconnecting from database...');
        await disconnectDatabase();

        console.log('Shutdown complete. Goodbye!');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
