/**
 * Socket.io Instance Configuration
 * Creates and configures Socket.io server instance
 */

import { Server, ServerOptions } from 'socket.io';
import { createServer, Server as HTTPServer, IncomingMessage, ServerResponse } from 'http';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socket.types';
import { Config } from './config';
import { logger } from '../lib/logger';
import { RedisAdapterManager } from '../lib/redis-adapter';
import {
  performHealthCheck,
  performLivenessCheck,
  performReadinessCheck,
  createHealthCheckContext,
  HealthCheckContext,
} from '../lib/health-check';

// Global health check context (set after server initialization)
let healthCheckContext: HealthCheckContext | null = null;

/**
 * Set the health check context (called after Redis adapter is initialized)
 */
export function setHealthCheckContext(io: Server, redisAdapter?: RedisAdapterManager): void {
  healthCheckContext = createHealthCheckContext(io, redisAdapter);
  logger.info('Health check context initialized');
}

/**
 * Handle HTTP requests for health endpoints
 */
async function handleHealthRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || '';

  // Only handle GET requests to health endpoints
  if (req.method !== 'GET') {
    return false;
  }

  // Handle health endpoints
  if (url === '/health' || url === '/health/') {
    return handleFullHealthCheck(req, res);
  }

  if (url === '/health/live' || url === '/live') {
    return handleLivenessCheck(req, res);
  }

  if (url === '/health/ready' || url === '/ready') {
    return handleReadinessCheck(req, res);
  }

  return false;
}

/**
 * Handle full health check request
 */
async function handleFullHealthCheck(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  try {
    if (!healthCheckContext) {
      sendJsonResponse(res, 503, {
        status: 'unhealthy',
        error: 'Health check context not initialized',
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    const result = await performHealthCheck(healthCheckContext, {
      includeDependencies: true,
      includeSystemMetrics: true,
    });

    const statusCode = result.status === 'unhealthy' ? 503 : 200;
    sendJsonResponse(res, statusCode, result);
    return true;
  } catch (error) {
    logger.error('Health check error', error);
    sendJsonResponse(res, 500, {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
    return true;
  }
}

/**
 * Handle liveness check request
 */
async function handleLivenessCheck(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const result = performLivenessCheck();
  sendJsonResponse(res, 200, result);
  return true;
}

/**
 * Handle readiness check request
 */
async function handleReadinessCheck(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  try {
    if (!healthCheckContext) {
      sendJsonResponse(res, 503, {
        ready: false,
        error: 'Health check context not initialized',
        timestamp: new Date().toISOString(),
      });
      return true;
    }

    const result = await performReadinessCheck(healthCheckContext);
    const statusCode = result.ready ? 200 : 503;
    sendJsonResponse(res, statusCode, result);
    return true;
  } catch (error) {
    logger.error('Readiness check error', error);
    sendJsonResponse(res, 503, {
      ready: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
    return true;
  }
}

/**
 * Send JSON response
 */
function sendJsonResponse(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(JSON.stringify(data));
}

/**
 * Create HTTP server with health endpoint handling
 */
export function createHttpServer(): HTTPServer {
  const httpServer = createServer(async (req, res) => {
    // Try to handle health endpoints first
    const handled = await handleHealthRequest(req, res);

    // If not a health endpoint, let Socket.io handle it
    // Socket.io attaches to the 'upgrade' event, so regular HTTP requests
    // that aren't health checks will fall through here
    if (!handled) {
      // Return 404 for unknown HTTP endpoints
      // (Socket.io handles WebSocket upgrades separately)
      if (!req.url?.startsWith('/socket.io')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    }
  });

  logger.info('HTTP server created with health endpoints');
  return httpServer;
}

/**
 * Create Socket.io server
 */
export function createSocketServer(
  httpServer: HTTPServer,
  config: Config
): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
  const socketOptions: Partial<ServerOptions> = {
    cors: {
      origin: config.allowedOrigins,
      credentials: config.credentials,
      methods: ['GET', 'POST'],
    },
    transports: config.transports,
    pingInterval: config.pingInterval,
    pingTimeout: config.pingTimeout,
    maxHttpBufferSize: config.maxHttpBufferSize,
    allowEIO3: false, // Disable Engine.IO v3 compatibility
    serveClient: false, // Don't serve client files
    connectTimeout: 45000,
  };

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    socketOptions
  );

  logger.info('Socket.io server created', {
    cors: config.allowedOrigins,
    transports: config.transports,
    pingInterval: config.pingInterval,
    pingTimeout: config.pingTimeout,
  });

  return io;
}

/**
 * Setup Redis adapter for horizontal scaling
 */
export async function setupRedisAdapter(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  config: Config
): Promise<RedisAdapterManager> {
  const redisAdapter = new RedisAdapterManager({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    keyPrefix: config.redis.keyPrefix,
  });

  try {
    await redisAdapter.initialize(io);
    logger.info('Redis adapter initialized successfully');
    return redisAdapter;
  } catch (error) {
    logger.error('Failed to initialize Redis adapter', error);
    throw error;
  }
}

/**
 * Setup Socket.io event monitoring
 */
export function setupEventMonitoring(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
): void {
  // Monitor new connections
  io.engine.on('connection_error', (err) => {
    logger.error('Connection error', err);
  });

  // Monitor server errors
  // Note: Using type assertion since 'error' is not in the typed event names
  (io as any).on('error', (error: Error) => {
    logger.error('Socket.io server error', error);
  });

  // Log server-level metrics periodically
  setInterval(() => {
    const sockets = io.sockets.sockets;
    const socketCount = sockets.size;

    if (socketCount > 0) {
      logger.debug('Socket.io metrics', {
        connectedSockets: socketCount,
        rooms: io.sockets.adapter.rooms.size,
      });
    }
  }, 60000); // Every minute
}

/**
 * Graceful shutdown
 */
export async function gracefulShutdown(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  httpServer: HTTPServer,
  redisAdapter?: RedisAdapterManager
): Promise<void> {
  logger.info('Starting graceful shutdown...');

  // Stop accepting new connections
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Disconnect all sockets
  const sockets = await io.fetchSockets();
  logger.info(`Disconnecting ${sockets.length} connected sockets...`);

  for (const socket of sockets) {
    socket.disconnect(true);
  }

  // Close Socket.io server
  await new Promise<void>((resolve) => {
    io.close(() => {
      logger.info('Socket.io server closed');
      resolve();
    });
  });

  // Disconnect Redis adapter
  if (redisAdapter) {
    await redisAdapter.disconnect();
    logger.info('Redis adapter disconnected');
  }

  logger.info('Graceful shutdown completed');
}
