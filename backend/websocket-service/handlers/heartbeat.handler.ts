/**
 * Heartbeat Handler
 * Handles ping/pong heartbeat mechanism for connection monitoring
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket, PongData } from '../types/socket.types';
import { logger } from '../lib/logger';

/**
 * Heartbeat state tracking
 */
interface HeartbeatState {
  lastPing: number;
  lastPong: number;
  latency: number;
  missedPongs: number;
}

const heartbeatStates = new Map<string, HeartbeatState>();

/**
 * Heartbeat configuration
 */
const MAX_MISSED_PONGS = 3;
const LATENCY_WARNING_THRESHOLD = 500; // ms

/**
 * Setup heartbeat handler
 */
export function setupHeartbeatHandler(io: Server, pingInterval: number = 25000): void {
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.data.user.user_id;
    const socketId = socket.id;

    // Initialize heartbeat state
    heartbeatStates.set(socketId, {
      lastPing: Date.now(),
      lastPong: Date.now(),
      latency: 0,
      missedPongs: 0,
    });

    // Start heartbeat interval
    const heartbeatInterval = setInterval(() => {
      sendPing(socket);
    }, pingInterval);

    // Handle pong responses
    socket.on('pong', (data: PongData) => {
      handlePong(socket, data);
    });

    // Cleanup on disconnect
    socket.on('disconnect', () => {
      clearInterval(heartbeatInterval);
      heartbeatStates.delete(socketId);

      logger.debug('Heartbeat stopped', {
        userId,
        socketId,
      });
    });

    logger.debug('Heartbeat started', {
      userId,
      socketId,
      pingInterval,
    });
  });

  // Monitor for stale connections
  const monitorInterval = setInterval(() => {
    monitorConnections(io);
  }, pingInterval);

  // Cleanup on server shutdown
  process.on('SIGTERM', () => {
    clearInterval(monitorInterval);
  });

  logger.info('Heartbeat handler configured', { pingInterval });
}

/**
 * Send ping to client
 */
function sendPing(socket: AuthenticatedSocket): void {
  const state = heartbeatStates.get(socket.id);
  if (!state) return;

  const now = Date.now();
  state.lastPing = now;

  // Check for missed pongs
  const timeSinceLastPong = now - state.lastPong;
  if (timeSinceLastPong > 60000) { // 60 seconds
    state.missedPongs++;

    logger.warn('Missed pong', {
      userId: socket.data.user.user_id,
      socketId: socket.id,
      missedPongs: state.missedPongs,
      timeSinceLastPong: `${Math.round(timeSinceLastPong / 1000)}s`,
    });

    // Disconnect after too many missed pongs
    if (state.missedPongs >= MAX_MISSED_PONGS) {
      logger.error('Connection terminated due to missed pongs', {
        userId: socket.data.user.user_id,
        socketId: socket.id,
        missedPongs: state.missedPongs,
      });

      socket.disconnect(true);
      return;
    }
  }

  // Send ping
  socket.emit('ping', { timestamp: now });
}

/**
 * Handle pong response
 */
function handlePong(socket: AuthenticatedSocket, data: PongData): void {
  const state = heartbeatStates.get(socket.id);
  if (!state) return;

  const now = Date.now();
  const latency = now - data.timestamp;

  // Update state
  state.lastPong = now;
  state.latency = latency;
  state.missedPongs = 0;

  // Update socket data
  socket.data.latency = latency;

  // Log high latency
  if (latency > LATENCY_WARNING_THRESHOLD) {
    logger.warn('High latency detected', {
      userId: socket.data.user.user_id,
      socketId: socket.id,
      latency: `${latency}ms`,
    });
  }

  logger.debug('Pong received', {
    userId: socket.data.user.user_id,
    socketId: socket.id,
    latency: `${latency}ms`,
  });
}

/**
 * Monitor all connections for issues
 */
function monitorConnections(io: Server): void {
  const now = Date.now();
  let totalLatency = 0;
  let latencyCount = 0;
  let highLatencyCount = 0;
  let staleCount = 0;

  for (const [socketId, state] of heartbeatStates.entries()) {
    // Check for stale connections
    const timeSinceLastPong = now - state.lastPong;
    if (timeSinceLastPong > 120000) { // 2 minutes
      staleCount++;
      logger.warn('Stale connection detected', {
        socketId,
        timeSinceLastPong: `${Math.round(timeSinceLastPong / 1000)}s`,
      });
    }

    // Collect latency statistics
    if (state.latency > 0) {
      totalLatency += state.latency;
      latencyCount++;

      if (state.latency > LATENCY_WARNING_THRESHOLD) {
        highLatencyCount++;
      }
    }
  }

  const averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;

  // Log statistics
  if (heartbeatStates.size > 0) {
    logger.debug('Connection health statistics', {
      totalConnections: heartbeatStates.size,
      averageLatency: `${Math.round(averageLatency)}ms`,
      highLatencyConnections: highLatencyCount,
      staleConnections: staleCount,
    });
  }
}

/**
 * Get heartbeat statistics
 */
export function getHeartbeatStats(): {
  totalConnections: number;
  averageLatency: number;
  maxLatency: number;
  minLatency: number;
  highLatencyCount: number;
  missedPongsCount: number;
} {
  let totalLatency = 0;
  let maxLatency = 0;
  let minLatency = Infinity;
  let highLatencyCount = 0;
  let missedPongsCount = 0;

  for (const state of heartbeatStates.values()) {
    if (state.latency > 0) {
      totalLatency += state.latency;
      maxLatency = Math.max(maxLatency, state.latency);
      minLatency = Math.min(minLatency, state.latency);

      if (state.latency > LATENCY_WARNING_THRESHOLD) {
        highLatencyCount++;
      }
    }

    if (state.missedPongs > 0) {
      missedPongsCount++;
    }
  }

  const count = heartbeatStates.size;

  return {
    totalConnections: count,
    averageLatency: count > 0 ? totalLatency / count : 0,
    maxLatency: maxLatency === 0 ? 0 : maxLatency,
    minLatency: minLatency === Infinity ? 0 : minLatency,
    highLatencyCount,
    missedPongsCount,
  };
}

/**
 * Get connection quality for a socket
 */
export function getConnectionQuality(socketId: string): {
  latency: number;
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  missedPongs: number;
} {
  const state = heartbeatStates.get(socketId);

  if (!state) {
    return {
      latency: 0,
      quality: 'poor',
      missedPongs: 0,
    };
  }

  let quality: 'excellent' | 'good' | 'fair' | 'poor';

  if (state.latency < 50) {
    quality = 'excellent';
  } else if (state.latency < 150) {
    quality = 'good';
  } else if (state.latency < 300) {
    quality = 'fair';
  } else {
    quality = 'poor';
  }

  return {
    latency: state.latency,
    quality,
    missedPongs: state.missedPongs,
  };
}
