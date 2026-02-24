/**
 * WebSocket Server
 * Main entry point for Blockd WebSocket service
 */

import { loadConfig } from './config';
import {
  createHttpServer,
  createSocketServer,
  setupRedisAdapter,
  setupEventMonitoring,
  gracefulShutdown,
  setHealthCheckContext,
} from './socket';
import { logger } from '../lib/logger';
import { RoomManager } from '../lib/room-manager';
import { MessageBuffer } from '../lib/message-buffer';
import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimitMiddleware, shutdownRateLimiter } from '../middleware/rate-limit.middleware';
import { loggingMiddleware } from '../middleware/logging.middleware';
import { setupConnectionHandler } from '../handlers/connection.handler';
import { setupSessionHandler } from '../handlers/session.handler';
import { setupSecurityHandler } from '../handlers/security.handler';
import { setupGazeHandler, shutdownGazeHandler } from '../handlers/gaze.handler';
import { setupChatHandler } from '../handlers/chat.handler';
import { setupHeartbeatHandler, shutdownHeartbeatHandler } from '../handlers/heartbeat.handler';

/**
 * Main application class
 */
class WebSocketServer {
  private config = loadConfig();
  private httpServer = createHttpServer();
  private io = createSocketServer(this.httpServer, this.config);
  private redisAdapter?: any;
  private roomManager = new RoomManager(this.io);
  private messageBuffer = new MessageBuffer({
    maxSize: this.config.messageBuffer.maxSize,
    maxAgeMs: this.config.messageBuffer.maxAgeMs,
  });

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      logger.info('Starting Blockd WebSocket service...', {
        nodeEnv: this.config.nodeEnv,
        port: this.config.port,
      });

      // Setup Redis adapter for scaling
      this.redisAdapter = await setupRedisAdapter(this.io, this.config);

      // Setup health check context (after Redis adapter is ready)
      setHealthCheckContext(this.io, this.redisAdapter);

      // Setup monitoring
      setupEventMonitoring(this.io);

      // Setup middleware (order matters!)
      this.setupMiddleware();

      // Setup event handlers
      this.setupHandlers();

      // Start HTTP server
      await this.listen();

      // Setup graceful shutdown
      this.setupShutdown();

      logger.info('WebSocket service started successfully', {
        port: this.config.port,
        allowedOrigins: this.config.allowedOrigins,
      });
    } catch (error) {
      logger.error('Failed to start WebSocket service', error);
      process.exit(1);
    }
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Logging middleware (first to log all events)
    this.io.use(loggingMiddleware());

    // Authentication middleware (verify JWT)
    this.io.use(authMiddleware());

    // Rate limiting middleware (prevent abuse)
    this.io.use(rateLimitMiddleware({
      maxEventsPerMinute: this.config.rateLimit.maxEventsPerMinute,
      checkInterval: this.config.rateLimit.checkInterval,
    }));

    logger.info('Middleware configured');
  }

  /**
   * Setup event handlers
   */
  private setupHandlers(): void {
    // Initialize message buffer with Socket.io server for socket lookup
    this.messageBuffer.setServer(this.io);

    // Connection/disconnection handler
    setupConnectionHandler(this.io, this.roomManager, this.messageBuffer);

    // Session handler
    setupSessionHandler(this.io, this.roomManager);

    // Security handler
    setupSecurityHandler(this.io);

    // Gaze handler
    setupGazeHandler(this.io, this.config.gaze.throttleHz);

    // Chat handler
    setupChatHandler(this.io);

    // Heartbeat handler
    setupHeartbeatHandler(this.io, this.config.pingInterval);

    logger.info('Event handlers configured');
  }

  /**
   * Start listening on port
   */
  private async listen(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, this.config.host, () => {
        logger.info(`Server listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        // Shutdown all handlers and cleanup intervals
        shutdownHeartbeatHandler();
        shutdownGazeHandler();
        shutdownRateLimiter();

        // Destroy message buffer (clears its cleanup interval)
        this.messageBuffer.destroy();

        // Graceful shutdown of Socket.io and Redis
        await gracefulShutdown(this.io, this.httpServer, this.redisAdapter);
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', reason);
      shutdown('unhandledRejection');
    });
  }
}

/**
 * Start the server
 */
if (require.main === module) {
  const server = new WebSocketServer();
  server.start().catch((error) => {
    logger.error('Fatal error starting server', error);
    process.exit(1);
  });
}

export default WebSocketServer;
