/**
 * Socket.io Instance Configuration
 * Creates and configures Socket.io server instance
 */

import { Server, ServerOptions } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socket.types';
import { Config } from './config';
import { logger } from '../lib/logger';
import { RedisAdapterManager } from '../lib/redis-adapter';

/**
 * Create HTTP server
 */
export function createHttpServer(): HTTPServer {
  const httpServer = createServer();
  logger.info('HTTP server created');
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
  io.on('error', (error) => {
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
