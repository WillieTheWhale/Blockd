/**
 * Session Handler
 * Handles interview session room management
 */

import { Server } from 'socket.io';
import {
  AuthenticatedSocket,
  SessionJoinData,
  SessionJoinResponse,
  SessionLeaveData,
} from '../types/socket.types';
import { RoomManager, RoomType } from '../lib/room-manager';
import { logger } from '../lib/logger';
import { SessionAccessDeniedError } from '../lib/errors';

/**
 * Setup session handler
 */
export function setupSessionHandler(io: Server, roomManager: RoomManager): void {
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.data.user.user_id;
    const userRole = socket.data.user.role;

    // Handle session join
    socket.on('session:join', async (data: SessionJoinData, callback) => {
      try {
        const { session_id } = data;

        logger.info('User joining session', {
          userId,
          sessionId: session_id,
          role: userRole,
        });

        // Verify user has access to this session
        const hasAccess = await verifySessionAccess(session_id, userId, userRole);
        if (!hasAccess) {
          const error = new SessionAccessDeniedError(session_id, userId);
          socket.emit('error', {
            message: error.message,
            code: error.code,
          });

          if (callback) {
            callback({
              success: false,
              message: 'Unauthorized access to session',
            });
          }
          return;
        }

        // Join session room
        const sessionRoomId = RoomManager.createRoomId(RoomType.SESSION, session_id);
        await roomManager.joinRoom(socket, {
          roomId: sessionRoomId,
          userId,
          role: userRole,
          metadata: { session_id },
        });

        // Notify others in the room
        socket.to(sessionRoomId).emit('participant:joined', {
          user_id: userId,
          role: userRole,
          timestamp: new Date().toISOString(),
        });

        // Get current session state
        const sessionState = await getSessionState(session_id);

        // Send session state to joining user
        socket.emit('session:state', sessionState);

        logger.info('User joined session successfully', {
          userId,
          sessionId: session_id,
          participantCount: roomManager.getRoomInfo(sessionRoomId)?.participantCount || 0,
        });

        if (callback) {
          callback({
            success: true,
            sessionState,
          });
        }
      } catch (error) {
        logger.error('Error joining session', error, {
          userId,
          sessionId: data.session_id,
        });

        socket.emit('error', {
          message: 'Failed to join session',
          code: 'SESSION_JOIN_ERROR',
        });

        if (callback) {
          callback({
            success: false,
            message: 'Failed to join session',
          });
        }
      }
    });

    // Handle session leave
    socket.on('session:leave', async (data: SessionLeaveData) => {
      try {
        const { session_id } = data;

        logger.info('User leaving session', {
          userId,
          sessionId: session_id,
        });

        const sessionRoomId = RoomManager.createRoomId(RoomType.SESSION, session_id);

        // Leave session room
        await roomManager.leaveRoom(socket, {
          roomId: sessionRoomId,
          userId,
        });

        // Notify others in the room
        socket.to(sessionRoomId).emit('participant:left', {
          user_id: userId,
          timestamp: new Date().toISOString(),
        });

        logger.info('User left session successfully', {
          userId,
          sessionId: session_id,
        });
      } catch (error) {
        logger.error('Error leaving session', error, {
          userId,
          sessionId: data.session_id,
        });

        socket.emit('error', {
          message: 'Failed to leave session',
          code: 'SESSION_LEAVE_ERROR',
        });
      }
    });

    // Auto-leave sessions on disconnect
    socket.on('disconnect', () => {
      const userRooms = roomManager.getUserRooms(userId);
      const sessionRooms = userRooms.filter((room) => room.startsWith('session:'));

      for (const sessionRoom of sessionRooms) {
        const { identifier: sessionId } = RoomManager.parseRoomId(sessionRoom);

        // Notify others
        socket.to(sessionRoom).emit('participant:left', {
          user_id: userId,
          timestamp: new Date().toISOString(),
        });

        logger.debug('User auto-left session on disconnect', {
          userId,
          sessionId,
        });
      }
    });
  });

  logger.info('Session handler configured');
}

/**
 * Verify user has access to session
 * This should integrate with your session service/database
 */
async function verifySessionAccess(
  sessionId: string,
  userId: string,
  userRole: string
): Promise<boolean> {
  // TODO: Implement actual session access verification
  // This should check:
  // 1. Session exists
  // 2. User is participant (interviewer or interviewee)
  // 3. Session is not expired or cancelled

  // For now, return true (development)
  // In production, this should query the session service or database

  logger.debug('Verifying session access', {
    sessionId,
    userId,
    userRole,
  });

  // Placeholder implementation
  return true;
}

/**
 * Get current session state
 * This should integrate with your session service/database
 */
async function getSessionState(sessionId: string): Promise<any> {
  // TODO: Implement actual session state retrieval
  // This should fetch from session service or database

  logger.debug('Getting session state', { sessionId });

  // Placeholder implementation
  return {
    session_id: sessionId,
    status: 'in_progress',
    participants: [],
    started_at: new Date().toISOString(),
  };
}

/**
 * Broadcast session event to all participants
 */
export function broadcastSessionEvent(
  io: Server,
  sessionId: string,
  event: string,
  data: any
): void {
  const sessionRoomId = RoomManager.createRoomId(RoomType.SESSION, sessionId);

  io.to(sessionRoomId).emit(event, {
    session_id: sessionId,
    ...data,
    timestamp: new Date().toISOString(),
  });

  logger.debug('Broadcast session event', {
    sessionId,
    event,
    roomId: sessionRoomId,
  });
}

/**
 * Send session start notification
 */
export function notifySessionStarted(
  io: Server,
  sessionId: string,
  interviewer: any,
  interviewee: any
): void {
  broadcastSessionEvent(io, sessionId, 'session:started', {
    started_at: new Date().toISOString(),
    interviewer,
    interviewee,
  });
}

/**
 * Send session end notification
 */
export function notifySessionEnded(
  io: Server,
  sessionId: string,
  reason?: string
): void {
  broadcastSessionEvent(io, sessionId, 'session:ended', {
    ended_at: new Date().toISOString(),
    reason,
  });
}
