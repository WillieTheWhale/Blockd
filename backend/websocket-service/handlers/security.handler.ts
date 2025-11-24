/**
 * Security Handler
 * Handles security event reporting and broadcasting
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket, SecurityEvent } from '../types/socket.types';
import { RoomManager, RoomType } from '../lib/room-manager';
import { logger } from '../lib/logger';

/**
 * Setup security handler
 */
export function setupSecurityHandler(io: Server): void {
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.data.user.user_id;
    const userRole = socket.data.user.role;

    // Handle security events from browser client
    socket.on('security:event', async (data: SecurityEvent) => {
      try {
        const { session_id, event_type, severity, description, metadata, timestamp } = data;

        logger.warn('Security event reported', {
          userId,
          sessionId: session_id,
          eventType: event_type,
          severity,
          description,
        });

        // Store security event in database
        const event = await storeSecurityEvent({
          session_id,
          user_id: userId,
          event_type,
          severity,
          description,
          metadata,
          timestamp,
        });

        // Broadcast security alert to session participants
        const sessionRoomId = RoomManager.createRoomId(RoomType.SESSION, session_id);
        io.to(sessionRoomId).emit('security:alert', {
          event_id: event.id,
          session_id,
          event_type,
          severity,
          description,
          timestamp: event.timestamp,
        });

        // High severity events trigger additional alerts
        if (severity === 'high' || severity === 'critical') {
          logger.error('High severity security event', {
            eventId: event.id,
            userId,
            sessionId: session_id,
            eventType: event_type,
            severity,
          });

          // Notify admin room
          const adminRoomId = RoomManager.createRoomId(RoomType.ADMIN, 'all');
          io.to(adminRoomId).emit('security:alert', {
            event_id: event.id,
            session_id,
            user_id: userId,
            event_type,
            severity,
            description,
            timestamp: event.timestamp,
          });

          // TODO: Send email notification to interviewer
          // await sendSecurityAlertEmail(session_id, event);
        }

        // Critical events may auto-terminate session
        if (severity === 'critical') {
          logger.error('Critical security event - consider session termination', {
            eventId: event.id,
            userId,
            sessionId: session_id,
            eventType: event_type,
          });

          // TODO: Implement auto-termination logic based on configuration
          // This should be configurable per organization
        }
      } catch (error) {
        logger.error('Error handling security event', error, {
          userId,
          sessionId: data.session_id,
          eventType: data.event_type,
        });

        socket.emit('error', {
          message: 'Failed to process security event',
          code: 'SECURITY_EVENT_ERROR',
        });
      }
    });
  });

  logger.info('Security handler configured');
}

/**
 * Store security event in database
 * This should integrate with your database
 */
async function storeSecurityEvent(eventData: {
  session_id: string;
  user_id: string;
  event_type: string;
  severity: string;
  description: string;
  metadata?: Record<string, any>;
  timestamp: string;
}): Promise<{ id: string; timestamp: string }> {
  // TODO: Implement actual database storage
  // This should insert into security_events table

  logger.debug('Storing security event', eventData);

  // Placeholder implementation
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: eventId,
    timestamp: eventData.timestamp || new Date().toISOString(),
  };
}

/**
 * Send security alert email
 * This should integrate with your email service
 */
async function sendSecurityAlertEmail(sessionId: string, event: any): Promise<void> {
  // TODO: Implement email notification
  // This should send email to interviewer and admins

  logger.debug('Sending security alert email', {
    sessionId,
    eventId: event.id,
  });

  // Placeholder - integrate with email service
}

/**
 * Get security event statistics for a session
 */
export async function getSessionSecurityStats(sessionId: string): Promise<{
  totalEvents: number;
  eventsBySeverity: Record<string, number>;
  eventsByType: Record<string, number>;
}> {
  // TODO: Implement actual statistics retrieval from database

  logger.debug('Getting security stats for session', { sessionId });

  // Placeholder implementation
  return {
    totalEvents: 0,
    eventsBySeverity: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    eventsByType: {},
  };
}

/**
 * Broadcast security alert to specific users
 */
export function broadcastSecurityAlert(
  io: Server,
  userIds: string[],
  alert: {
    session_id: string;
    event_type: string;
    severity: string;
    description: string;
  }
): void {
  for (const userId of userIds) {
    const userRoomId = RoomManager.createRoomId(RoomType.USER, userId);
    io.to(userRoomId).emit('security:alert', {
      ...alert,
      timestamp: new Date().toISOString(),
    });
  }

  logger.info('Broadcast security alert to users', {
    userCount: userIds.length,
    eventType: alert.event_type,
    severity: alert.severity,
  });
}
