/**
 * Logging Middleware
 * Logs socket connections, disconnections, and events
 */

import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import { logger } from '../lib/logger';

/**
 * Events to exclude from logging (too noisy)
 */
const EXCLUDED_EVENTS = new Set([
  'ping',
  'pong',
  'gaze:stream', // Too frequent, logged separately with sampling
]);

/**
 * Gaze event sampling rate (log 1 in N events)
 */
const GAZE_SAMPLE_RATE = 100;
let gazeEventCounter = 0;

/**
 * Logging middleware
 */
export function loggingMiddleware() {
  return (socket: Socket, next: (err?: ExtendedError) => void) => {
    const socketId = socket.id;
    const ip = socket.handshake.address;
    const userAgent = socket.handshake.headers['user-agent'];

    // Log connection attempt
    logger.debug('Socket connection attempt', {
      socketId,
      ip,
      userAgent,
      transport: socket.conn.transport.name,
    });

    // Setup event logging after authentication
    // Note: onevent is a private method, but we need to intercept it for logging
    // Using type assertion to access it
    const socketAny = socket as any;
    const originalOnevent = socketAny.onevent;
    socketAny.onevent = function (packet: any) {
      const [event, ...args] = packet.data || [];

      // Handle gaze events with sampling
      if (event === 'gaze:stream') {
        gazeEventCounter++;
        if (gazeEventCounter % GAZE_SAMPLE_RATE === 0) {
          logger.debug('Gaze event (sampled)', {
            socketId,
            userId: socket.data.user?.user_id,
            sampleRate: GAZE_SAMPLE_RATE,
          });
        }
      }
      // Log other events (except excluded)
      else if (!EXCLUDED_EVENTS.has(event)) {
        logger.debug('Socket event received', {
          socketId,
          userId: socket.data.user?.user_id,
          event,
          dataSize: JSON.stringify(args).length,
        });
      }

      return originalOnevent.call(this, packet);
    };

    // Log disconnection
    socket.on('disconnect', (reason) => {
      const connectedDuration = socket.data.connectedAt
        ? Date.now() - socket.data.connectedAt.getTime()
        : 0;

      logger.info('Socket disconnected', {
        socketId,
        userId: socket.data.user?.user_id,
        reason,
        connectedDuration: `${Math.round(connectedDuration / 1000)}s`,
        transport: socket.conn.transport.name,
      });
    });

    // Log errors
    socket.on('error', (error) => {
      logger.error('Socket error', error, {
        socketId,
        userId: socket.data.user?.user_id,
      });
    });

    // Log disconnecting event
    socket.on('disconnecting', (reason) => {
      const rooms = Array.from(socket.rooms).filter((room) => room !== socketId);

      if (rooms.length > 0) {
        logger.debug('Socket disconnecting from rooms', {
          socketId,
          userId: socket.data.user?.user_id,
          rooms,
          reason,
        });
      }
    });

    next();
  };
}

/**
 * Log socket connection with details
 */
export function logConnection(socket: Socket): void {
  logger.info('Socket connected successfully', {
    socketId: socket.id,
    userId: socket.data.user?.user_id,
    email: socket.data.user?.email,
    role: socket.data.user?.role,
    ip: socket.handshake.address,
    transport: socket.conn.transport.name,
  });
}

/**
 * Log room join
 */
export function logRoomJoin(socket: Socket, roomId: string): void {
  logger.info('User joined room', {
    socketId: socket.id,
    userId: socket.data.user?.user_id,
    roomId,
  });
}

/**
 * Log room leave
 */
export function logRoomLeave(socket: Socket, roomId: string, reason?: string): void {
  logger.info('User left room', {
    socketId: socket.id,
    userId: socket.data.user?.user_id,
    roomId,
    reason,
  });
}

/**
 * Log broadcast event
 */
export function logBroadcast(roomId: string, event: string, recipientCount: number): void {
  logger.debug('Event broadcast to room', {
    roomId,
    event,
    recipientCount,
  });
}

/**
 * Get logging statistics
 */
export function getLoggingStats(): {
  gazeEventsProcessed: number;
  sampleRate: number;
} {
  return {
    gazeEventsProcessed: gazeEventCounter,
    sampleRate: GAZE_SAMPLE_RATE,
  };
}
