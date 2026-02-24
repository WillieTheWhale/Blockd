/**
 * Connection Handler
 * Handles socket connections and disconnections
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket } from '../types/socket.types';
import { RoomManager, RoomType } from '../lib/room-manager';
import { RoomStatistics } from '../types/room.types';
import { MessageBuffer } from '../lib/message-buffer';
import { logger } from '../lib/logger';
import { logConnection } from '../middleware/logging.middleware';
import { clearRateLimit } from '../middleware/rate-limit.middleware';

/**
 * Setup connection handler
 */
export function setupConnectionHandler(
  io: Server,
  roomManager: RoomManager,
  messageBuffer: MessageBuffer
): void {
  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.data.user.user_id;
    const userRole = socket.data.user.role;

    try {
      // Log successful connection
      logConnection(socket);

      // Join user's personal room for direct messaging
      const userRoomId = RoomManager.createRoomId(RoomType.USER, userId);
      await roomManager.joinRoom(socket, {
        roomId: userRoomId,
        userId,
        role: userRole,
      });

      // Join organization room if user belongs to one
      if (socket.data.user.organization_id) {
        const orgRoomId = RoomManager.createRoomId(
          RoomType.ORGANIZATION,
          socket.data.user.organization_id
        );
        await roomManager.joinRoom(socket, {
          roomId: orgRoomId,
          userId,
          role: userRole,
        });
      }

      // Join admin room if user is admin
      if (userRole === 'admin') {
        await roomManager.joinRoom(socket, {
          roomId: RoomManager.createRoomId(RoomType.ADMIN, 'all'),
          userId,
          role: userRole,
        });
      }

      // Flush buffered messages to reconnected user
      const bufferedMessages = await messageBuffer.flush(userId, socket);
      if (bufferedMessages.length > 0) {
        logger.info('Flushed buffered messages', {
          userId,
          count: bufferedMessages.length,
        });
      }

      // Emit connection success
      socket.emit('connected', {
        message: 'Connected successfully',
        userId,
        timestamp: new Date().toISOString(),
      });

      // Handle disconnection
      setupDisconnectionHandler(socket, roomManager, messageBuffer);

      // Handle errors
      setupErrorHandler(socket);
    } catch (error) {
      logger.error('Error in connection handler', error, {
        userId,
        socketId: socket.id,
      });

      socket.emit('error', {
        message: 'Connection error occurred',
        code: 'CONNECTION_ERROR',
      });

      socket.disconnect(true);
    }
  });

  logger.info('Connection handler configured');
}

/**
 * Setup disconnection handler
 */
function setupDisconnectionHandler(
  socket: AuthenticatedSocket,
  roomManager: RoomManager,
  messageBuffer: MessageBuffer
): void {
  socket.on('disconnect', (reason) => {
    const userId = socket.data.user.user_id;

    try {
      // Clean up socket from all rooms
      roomManager.cleanupSocket(socket.id);

      // Clear rate limiter
      clearRateLimit(socket.id);

      logger.info('User disconnected', {
        userId,
        socketId: socket.id,
        reason,
      });
    } catch (error) {
      logger.error('Error in disconnection handler', error, {
        userId,
        socketId: socket.id,
      });
    }
  });

  socket.on('disconnecting', (reason) => {
    const userId = socket.data.user.user_id;
    const rooms = Array.from(socket.rooms).filter((room) => room !== socket.id);

    if (rooms.length > 0) {
      logger.debug('User disconnecting from rooms', {
        userId,
        socketId: socket.id,
        rooms,
        reason,
      });
    }
  });
}

/**
 * Setup error handler
 */
function setupErrorHandler(socket: AuthenticatedSocket): void {
  socket.on('error', (error) => {
    const userId = socket.data.user.user_id;

    logger.error('Socket error occurred', error, {
      userId,
      socketId: socket.id,
    });

    // Emit error to client
    socket.emit('error', {
      message: 'An error occurred',
      code: 'SOCKET_ERROR',
    });
  });

  // Handle connection errors
  socket.conn.on('error', (error) => {
    const userId = socket.data.user.user_id;

    logger.error('Connection error occurred', error, {
      userId,
      socketId: socket.id,
    });
  });

  // Handle packet errors
  socket.conn.on('packet', (packet) => {
    // Validate packet size
    if (packet.data && JSON.stringify(packet.data).length > 1e6) {
      logger.warn('Large packet received', {
        userId: socket.data.user.user_id,
        socketId: socket.id,
        size: JSON.stringify(packet.data).length,
      });
    }
  });
}

/**
 * Get connection statistics
 */
export function getConnectionStats(io: Server, roomManager: RoomManager): {
  totalConnections: number;
  connectionsByRole: Record<string, number>;
  roomStatistics: RoomStatistics;
} {
  const sockets = io.sockets.sockets;
  const connectionsByRole: Record<string, number> = {
    interviewer: 0,
    interviewee: 0,
    admin: 0,
  };

  for (const socket of sockets.values()) {
    const role = (socket as AuthenticatedSocket).data.user?.role;
    if (role && role in connectionsByRole) {
      connectionsByRole[role]++;
    }
  }

  return {
    totalConnections: sockets.size,
    connectionsByRole,
    roomStatistics: roomManager.getStatistics(),
  };
}
