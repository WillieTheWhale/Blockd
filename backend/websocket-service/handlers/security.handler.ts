/**
 * Security Handler
 * Handles security event reporting and broadcasting
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket, SecurityEvent } from '../types/socket.types';
import { RoomManager, RoomType } from '../lib/room-manager';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { SecurityEventType, SeverityLevel } from '@prisma/client';
import { sendSecurityAlertEmail } from '../lib/email';
import {
  terminateSessionForSecurityViolation,
  shouldAutoTerminate,
  defaultAutoTerminationConfig,
} from './session.handler';

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

          // Send email notification to interviewer (fire and forget)
          sendSecurityAlertEmail({
            sessionId: session_id,
            eventType: event_type,
            severity: severity as 'low' | 'medium' | 'high' | 'critical',
            description: description || '',
            timestamp: new Date(event.timestamp),
            metadata,
          }).catch((err) => {
            logger.error('Failed to send security alert email', err, {
              sessionId: session_id,
              eventType: event_type,
            });
          });
        }

        // Check if session should be auto-terminated based on security event
        if (shouldAutoTerminate(event_type, severity, defaultAutoTerminationConfig)) {
          logger.warn('Auto-termination triggered for security violation', {
            eventId: event.id,
            userId,
            sessionId: session_id,
            eventType: event_type,
            severity,
          });

          // Terminate the session
          const terminated = await terminateSessionForSecurityViolation(
            io,
            session_id,
            description || `Critical security violation: ${event_type}`,
            event_type,
            severity
          );

          if (terminated) {
            logger.info('Session auto-terminated due to security violation', {
              sessionId: session_id,
              eventType: event_type,
              severity,
            });
          }
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
 * Map string event type to Prisma enum
 */
function mapEventType(eventType: string): SecurityEventType {
  const mapping: Record<string, SecurityEventType> = {
    suspicious_process: 'suspicious_process',
    screen_recording_detected: 'screen_recording_detected',
    vm_detected: 'vm_detected',
    window_focus_changed: 'window_focus_changed',
    multi_monitor_detected: 'multi_monitor_detected',
    unauthorized_browser: 'unauthorized_browser',
    copy_paste_detected: 'copy_paste_detected',
    keyboard_shortcut_blocked: 'keyboard_shortcut_blocked',
  };
  return mapping[eventType] || 'suspicious_process';
}

/**
 * Map string severity to Prisma enum
 */
function mapSeverity(severity: string): SeverityLevel {
  const mapping: Record<string, SeverityLevel> = {
    low: 'low',
    medium: 'medium',
    high: 'high',
    critical: 'critical',
  };
  return mapping[severity] || 'medium';
}

/**
 * Store security event in database
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
  try {
    logger.debug('Storing security event', eventData);

    const event = await prisma.securityEvent.create({
      data: {
        sessionId: eventData.session_id,
        eventType: mapEventType(eventData.event_type),
        severity: mapSeverity(eventData.severity),
        description: eventData.description,
        metadata: eventData.metadata || {},
        timestamp: new Date(eventData.timestamp),
      },
    });

    logger.info('Security event stored', {
      eventId: event.id,
      sessionId: eventData.session_id,
      eventType: eventData.event_type,
      severity: eventData.severity,
    });

    return {
      id: event.id,
      timestamp: event.timestamp.toISOString(),
    };
  } catch (error) {
    logger.error('Failed to store security event', error, eventData);
    // Return a generated ID if database fails - don't block the broadcast
    const fallbackId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return {
      id: fallbackId,
      timestamp: eventData.timestamp || new Date().toISOString(),
    };
  }
}


/**
 * Get security event statistics for a session
 */
export async function getSessionSecurityStats(sessionId: string): Promise<{
  totalEvents: number;
  eventsBySeverity: Record<string, number>;
  eventsByType: Record<string, number>;
}> {
  try {
    logger.debug('Getting security stats for session', { sessionId });

    const events = await prisma.securityEvent.findMany({
      where: { sessionId },
      select: {
        severity: true,
        eventType: true,
      },
    });

    const eventsBySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    const eventsByType: Record<string, number> = {};

    for (const event of events) {
      // Count by severity
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;

      // Count by type
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
    }

    return {
      totalEvents: events.length,
      eventsBySeverity,
      eventsByType,
    };
  } catch (error) {
    logger.error('Failed to get security stats', error, { sessionId });
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
