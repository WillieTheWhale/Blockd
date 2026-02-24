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

// Connection limits configuration
const CONNECTION_LIMITS = {
  maxConnectionsPerIp: 10,
  maxGlobalConnections: 10000,
  cleanupIntervalMs: 60000, // Clean up stale IP entries every minute
};

// Track connections per IP address
const connectionsByIp: Map<string, Set<string>> = new Map();
let totalConnections = 0;

// Track interval IDs for graceful cleanup
const intervalIds: Set<NodeJS.Timeout> = new Set();

/**
 * Get client IP from socket handshake
 */
function getClientIp(socket: { handshake: { address: string; headers: Record<string, string | string[] | undefined> } }): string {
  // Check for forwarded IP (behind proxy/load balancer)
  const forwardedFor = socket.handshake.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ip = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0].trim();
    return ip;
  }
  return socket.handshake.address;
}

/**
 * Check if connection should be allowed based on limits
 */
function checkConnectionLimits(ip: string): { allowed: boolean; reason?: string } {
  // Check global connection limit
  if (totalConnections >= CONNECTION_LIMITS.maxGlobalConnections) {
    return { allowed: false, reason: 'Server at maximum capacity' };
  }

  // Check per-IP connection limit
  const ipConnections = connectionsByIp.get(ip);
  if (ipConnections && ipConnections.size >= CONNECTION_LIMITS.maxConnectionsPerIp) {
    return { allowed: false, reason: 'Too many connections from this IP' };
  }

  return { allowed: true };
}

/**
 * Track new connection
 */
function trackConnection(ip: string, socketId: string): void {
  if (!connectionsByIp.has(ip)) {
    connectionsByIp.set(ip, new Set());
  }
  connectionsByIp.get(ip)!.add(socketId);
  totalConnections++;
}

/**
 * Remove connection tracking
 */
function untrackConnection(ip: string, socketId: string): void {
  const ipConnections = connectionsByIp.get(ip);
  if (ipConnections) {
    ipConnections.delete(socketId);
    if (ipConnections.size === 0) {
      connectionsByIp.delete(ip);
    }
  }
  totalConnections = Math.max(0, totalConnections - 1);
}

/**
 * Get connection statistics
 */
export function getConnectionStats(): {
  totalConnections: number;
  uniqueIps: number;
  maxConnectionsPerIp: number;
  maxGlobalConnections: number;
} {
  return {
    totalConnections,
    uniqueIps: connectionsByIp.size,
    maxConnectionsPerIp: CONNECTION_LIMITS.maxConnectionsPerIp,
    maxGlobalConnections: CONNECTION_LIMITS.maxGlobalConnections,
  };
}

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
    // Connection state recovery allows clients to reconnect and receive missed events
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    },
    // Connection limit validation happens in allowRequest
    allowRequest: (req, callback) => {
      const ip = req.headers['x-forwarded-for']
        ? (Array.isArray(req.headers['x-forwarded-for'])
            ? req.headers['x-forwarded-for'][0]
            : req.headers['x-forwarded-for'].split(',')[0].trim())
        : req.socket?.remoteAddress || 'unknown';

      const limitCheck = checkConnectionLimits(ip);
      if (!limitCheck.allowed) {
        logger.warn('Connection rejected due to limits', {
          ip,
          reason: limitCheck.reason,
          totalConnections,
          connectionsFromIp: connectionsByIp.get(ip)?.size || 0,
        });
        callback(limitCheck.reason || 'Connection limit exceeded', false);
        return;
      }
      callback(null, true);
    },
  };

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    socketOptions
  );

  // Track connections and disconnections
  io.on('connection', (socket) => {
    const ip = getClientIp(socket);
    trackConnection(ip, socket.id);

    logger.debug('Connection tracked', {
      socketId: socket.id,
      ip,
      totalConnections,
      connectionsFromIp: connectionsByIp.get(ip)?.size || 0,
    });

    socket.on('disconnect', () => {
      untrackConnection(ip, socket.id);
      logger.debug('Connection untracked', {
        socketId: socket.id,
        ip,
        totalConnections,
      });
    });
  });

  logger.info('Socket.io server created', {
    cors: config.allowedOrigins,
    transports: config.transports,
    pingInterval: config.pingInterval,
    pingTimeout: config.pingTimeout,
    maxConnectionsPerIp: CONNECTION_LIMITS.maxConnectionsPerIp,
    maxGlobalConnections: CONNECTION_LIMITS.maxGlobalConnections,
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
  const metricsInterval = setInterval(() => {
    const sockets = io.sockets.sockets;
    const socketCount = sockets.size;

    if (socketCount > 0) {
      logger.debug('Socket.io metrics', {
        connectedSockets: socketCount,
        rooms: io.sockets.adapter.rooms.size,
      });
    }
  }, 60000); // Every minute

  // Store interval ID for cleanup
  intervalIds.add(metricsInterval);
}

/**
 * Clear all tracked intervals
 */
export function clearAllIntervals(): void {
  for (const intervalId of intervalIds) {
    clearInterval(intervalId);
  }
  intervalIds.clear();
  logger.info('Cleared all tracked intervals');
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

  // Clear all tracked intervals first
  clearAllIntervals();

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
