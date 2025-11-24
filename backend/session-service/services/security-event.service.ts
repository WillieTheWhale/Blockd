import { SecurityEventType, SeverityLevel } from '@prisma/client';
import prisma from '../src/database';
import { MessageQueueService } from '../src/messageQueue';
import { CreateSecurityEventDTO, SecurityEventResponse } from '../types/session.types';
import { SessionNotFoundError } from '../lib/errors';

/**
 * Security Event Service
 * Handles security event logging and analysis
 */

export class SecurityEventService {
  private messageQueue: MessageQueueService;

  constructor() {
    this.messageQueue = new MessageQueueService();
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    sessionId: string,
    dto: CreateSecurityEventDTO
  ): Promise<SecurityEventResponse> {
    // Verify session exists
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Create security event
    const event = await prisma.securityEvent.create({
      data: {
        sessionId,
        eventType: dto.event_type,
        severity: dto.severity,
        description: dto.description,
        metadata: dto.metadata || {},
      },
    });

    // Publish to message queue for alerts
    await this.messageQueue.publishSecurityEvent(
      sessionId,
      dto.event_type,
      dto.severity,
      dto.metadata
    );

    // Update session risk score if critical
    if (dto.severity === 'critical' || dto.severity === 'high') {
      await this.updateSessionRiskScore(sessionId);
    }

    return {
      event_id: event.id,
      acknowledged: true,
      timestamp: event.timestamp.toISOString(),
    };
  }

  /**
   * Get security events for session
   */
  async getSessionSecurityEvents(sessionId: string) {
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return await prisma.securityEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get security events by severity
   */
  async getEventsBySeverity(sessionId: string, severity: SeverityLevel) {
    return await prisma.securityEvent.findMany({
      where: {
        sessionId,
        severity,
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get security events by type
   */
  async getEventsByType(sessionId: string, eventType: SecurityEventType) {
    return await prisma.securityEvent.findMany({
      where: {
        sessionId,
        eventType,
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  /**
   * Get security event statistics
   */
  async getSecurityStatistics(sessionId: string) {
    const events = await this.getSessionSecurityEvents(sessionId);

    const stats = {
      total: events.length,
      by_severity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
      by_type: {} as Record<string, number>,
      latest_critical: null as any,
    };

    events.forEach((event) => {
      stats.by_severity[event.severity]++;

      if (!stats.by_type[event.eventType]) {
        stats.by_type[event.eventType] = 0;
      }
      stats.by_type[event.eventType]++;

      if (event.severity === 'critical' && !stats.latest_critical) {
        stats.latest_critical = event;
      }
    });

    return stats;
  }

  /**
   * Update session risk score based on security events
   */
  private async updateSessionRiskScore(sessionId: string): Promise<void> {
    const events = await this.getSessionSecurityEvents(sessionId);

    // Simple risk calculation based on event count and severity
    const severityWeights = {
      low: 0.1,
      medium: 0.3,
      high: 0.6,
      critical: 1.0,
    };

    const totalRisk = events.reduce((sum, event) => {
      return sum + severityWeights[event.severity];
    }, 0);

    // Normalize to 0-1 scale (max 10 critical events = 1.0)
    const riskScore = Math.min(1.0, totalRisk / 10);

    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: { riskScore },
    });
  }

  /**
   * Check if session has critical events
   */
  async hasCriticalEvents(sessionId: string): Promise<boolean> {
    const criticalEvents = await this.getEventsBySeverity(sessionId, 'critical');
    return criticalEvents.length > 0;
  }

  /**
   * Get event count by severity
   */
  async getEventCountBySeverity(sessionId: string): Promise<Record<SeverityLevel, number>> {
    const events = await this.getSessionSecurityEvents(sessionId);

    const counts: Record<SeverityLevel, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    events.forEach((event) => {
      counts[event.severity]++;
    });

    return counts;
  }
}

export default new SecurityEventService();
