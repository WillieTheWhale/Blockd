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
import prisma from '../lib/prisma';

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
 */
async function verifySessionAccess(
  sessionId: string,
  userId: string,
  userRole: string
): Promise<boolean> {
  try {
    logger.debug('Verifying session access', {
      sessionId,
      userId,
      userRole,
    });

    // Query session from database
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        interviewerId: true,
        intervieweeId: true,
        status: true,
      },
    });

    // Session doesn't exist
    if (!session) {
      logger.warn('Session not found', { sessionId });
      return false;
    }

    // Session is cancelled or ended
    if (session.status === 'cancelled' || session.status === 'ended') {
      logger.warn('Session is not active', { sessionId, status: session.status });
      return false;
    }

    // Admins have access to all sessions
    if (userRole === 'admin') {
      return true;
    }

    // Check if user is a participant
    const isInterviewer = session.interviewerId === userId;
    const isInterviewee = session.intervieweeId === userId;

    if (!isInterviewer && !isInterviewee) {
      logger.warn('User is not a participant in session', {
        sessionId,
        userId,
        interviewerId: session.interviewerId,
        intervieweeId: session.intervieweeId,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error verifying session access', error, { sessionId, userId });
    return false;
  }
}

/**
 * Get current session state from database
 */
async function getSessionState(sessionId: string): Promise<any> {
  try {
    logger.debug('Getting session state', { sessionId });

    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        interviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        interviewee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        questions: {
          orderBy: { questionOrder: 'asc' },
          select: {
            id: true,
            questionText: true,
            questionOrder: true,
            difficulty: true,
            askedAt: true,
          },
        },
        _count: {
          select: {
            securityEvents: true,
            gazeEvents: true,
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    // Build participants array
    const participants = [];
    if (session.interviewer) {
      participants.push({
        user_id: session.interviewer.id,
        role: session.interviewer.role,
        name: `${session.interviewer.firstName || ''} ${session.interviewer.lastName || ''}`.trim(),
      });
    }
    if (session.interviewee) {
      participants.push({
        user_id: session.interviewee.id,
        role: session.interviewee.role,
        name: `${session.interviewee.firstName || ''} ${session.interviewee.lastName || ''}`.trim(),
      });
    }

    return {
      session_id: session.id,
      status: session.status,
      scheduled_start: session.scheduledStart?.toISOString() || null,
      actual_start: session.actualStart?.toISOString() || null,
      actual_end: session.actualEnd?.toISOString() || null,
      duration_minutes: session.durationMinutes,
      participants,
      questions: session.questions.map((q) => ({
        id: q.id,
        text: q.questionText,
        order: q.questionOrder,
        difficulty: q.difficulty,
        asked_at: q.askedAt?.toISOString() || null,
      })),
      stats: {
        security_events_count: session._count.securityEvents,
        gaze_events_count: session._count.gazeEvents,
      },
      risk_score: session.riskScore ? parseFloat(session.riskScore.toString()) : null,
      metadata: session.metadata,
    };
  } catch (error) {
    logger.error('Error getting session state', error, { sessionId });
    return {
      session_id: sessionId,
      status: 'unknown',
      participants: [],
      error: 'Failed to fetch session state',
    };
  }
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

/**
 * Auto-terminate session due to security violation
 * This terminates the session in the database and notifies all participants
 */
export async function terminateSessionForSecurityViolation(
  io: Server,
  sessionId: string,
  reason: string,
  eventType: string,
  severity: string
): Promise<boolean> {
  try {
    logger.warn('Auto-terminating session due to security violation', {
      sessionId,
      reason,
      eventType,
      severity,
    });

    // Update session status in database
    const updatedSession = await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: 'ended',
        actualEnd: new Date(),
        metadata: {
          terminationReason: 'security_violation',
          terminatedAt: new Date().toISOString(),
          violationType: eventType,
          violationSeverity: severity,
          violationDescription: reason,
        },
      },
    });

    if (!updatedSession) {
      logger.error('Failed to update session status', { sessionId });
      return false;
    }

    // Calculate duration if session was active
    if (updatedSession.actualStart) {
      const durationMs = new Date().getTime() - updatedSession.actualStart.getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      await prisma.interviewSession.update({
        where: { id: sessionId },
        data: { durationMinutes },
      });
    }

    // Notify all participants about the termination
    notifySessionEnded(io, sessionId, `Session terminated: ${reason}`);

    // Send a specific termination event with more details
    broadcastSessionEvent(io, sessionId, 'session:terminated', {
      reason: 'security_violation',
      description: reason,
      event_type: eventType,
      severity,
    });

    logger.info('Session terminated successfully', {
      sessionId,
      reason,
    });

    return true;
  } catch (error) {
    logger.error('Error terminating session', error, {
      sessionId,
      reason,
    });
    return false;
  }
}

/**
 * Configuration for auto-termination
 */
export interface AutoTerminationConfig {
  enabled: boolean;
  terminateOnCritical: boolean;
  criticalEventThreshold: number; // Number of critical events before termination
  eventTypesToTerminate: string[]; // Specific event types that trigger immediate termination
}

/**
 * Default auto-termination configuration
 */
export const defaultAutoTerminationConfig: AutoTerminationConfig = {
  enabled: true,
  terminateOnCritical: true,
  criticalEventThreshold: 1, // Terminate on first critical event
  eventTypesToTerminate: [
    'vm_detected',
    'screen_recording_detected',
    'unauthorized_browser',
  ],
};

/**
 * Check if session should be auto-terminated based on security event
 */
export function shouldAutoTerminate(
  eventType: string,
  severity: string,
  config: AutoTerminationConfig = defaultAutoTerminationConfig
): boolean {
  if (!config.enabled) {
    return false;
  }

  // Immediate termination for specific event types
  if (config.eventTypesToTerminate.includes(eventType)) {
    return true;
  }

  // Terminate on critical events if enabled
  if (config.terminateOnCritical && severity === 'critical') {
    return true;
  }

  return false;
}
