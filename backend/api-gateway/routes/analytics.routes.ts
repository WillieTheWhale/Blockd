/**
 * Analytics Routes
 * Dashboard analytics endpoints for real-time metrics and statistics
 */

import { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { validateQuery } from '../middleware/validation.middleware';
import { sendSuccess } from '../lib/response';
import prisma from '../lib/prisma';
import { z } from 'zod';

// Query schemas
const dateRangeQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

export default async function analyticsRoutes(fastify: FastifyInstance) {
  /**
   * GET /overview
   * Dashboard overview statistics
   */
  fastify.get('/overview', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
    ],
    schema: {
      tags: ['Analytics'],
      summary: 'Get dashboard overview statistics',
      description: 'Returns total sessions, active sessions, completed today, and high risk alerts',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;
      const userRole = request.user!.role;
      const organizationId = request.user!.organizationId;

      // Build where clause based on user role
      const baseWhere: any = {};
      if (userRole !== 'admin') {
        baseWhere.interviewerId = userId;
      }
      if (organizationId) {
        baseWhere.organizationId = organizationId;
      }

      // Get today's date range (UTC)
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setUTCHours(23, 59, 59, 999);

      // Run all queries in parallel
      const [
        totalSessions,
        activeSessions,
        completedToday,
        highRiskAlerts,
        previousPeriodTotal,
        previousPeriodCompleted,
      ] = await Promise.all([
        // Total sessions
        prisma.interviewSession.count({ where: baseWhere }),

        // Active sessions
        prisma.interviewSession.count({
          where: { ...baseWhere, status: 'active' },
        }),

        // Completed today
        prisma.interviewSession.count({
          where: {
            ...baseWhere,
            status: 'ended',
            actualEnd: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
        }),

        // High risk alerts (sessions with risk score >= 0.7 or high/critical security events)
        prisma.securityEvent.count({
          where: {
            session: baseWhere,
            severity: { in: ['high', 'critical'] },
          },
        }),

        // Previous period total (for trend calculation - last 30 days vs 30 days before that)
        prisma.interviewSession.count({
          where: {
            ...baseWhere,
            createdAt: {
              gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
              lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),

        // Previous period completed (yesterday)
        prisma.interviewSession.count({
          where: {
            ...baseWhere,
            status: 'ended',
            actualEnd: {
              gte: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000),
              lt: todayStart,
            },
          },
        }),
      ]);

      // Calculate trends
      const currentPeriodTotal = await prisma.interviewSession.count({
        where: {
          ...baseWhere,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      });

      const totalTrend = previousPeriodTotal > 0
        ? Math.round(((currentPeriodTotal - previousPeriodTotal) / previousPeriodTotal) * 100)
        : currentPeriodTotal > 0 ? 100 : 0;

      const completedTrend = previousPeriodCompleted > 0
        ? Math.round(((completedToday - previousPeriodCompleted) / previousPeriodCompleted) * 100)
        : completedToday > 0 ? 100 : 0;

      return sendSuccess(reply, {
        totalSessions: {
          value: totalSessions,
          description: 'All time interviews',
          trend: totalTrend !== 0 ? { value: Math.abs(totalTrend), isPositive: totalTrend > 0 } : undefined,
        },
        activeSessions: {
          value: activeSessions,
          description: 'Currently running',
        },
        completedToday: {
          value: completedToday,
          description: 'Finished interviews',
          trend: completedTrend !== 0 ? { value: Math.abs(completedTrend), isPositive: completedTrend > 0 } : undefined,
        },
        highRiskAlerts: {
          value: highRiskAlerts,
          description: 'Requires attention',
          trend: highRiskAlerts > 0 ? { value: highRiskAlerts, isPositive: false } : undefined,
        },
      });
    },
  });

  /**
   * GET /sessions
   * Sessions over time data for charts
   */
  fastify.get<{ Querystring: DateRangeQuery }>('/sessions', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
      validateQuery(dateRangeQuerySchema),
    ],
    schema: {
      tags: ['Analytics'],
      summary: 'Get sessions over time',
      description: 'Returns session counts grouped by day for charting',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;
      const userRole = request.user!.role;
      const organizationId = request.user!.organizationId;
      const { days } = request.query;

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setUTCHours(0, 0, 0, 0);

      // Build where clause
      const where: any = {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      };
      if (userRole !== 'admin') {
        where.interviewerId = userId;
      }
      if (organizationId) {
        where.organizationId = organizationId;
      }

      // Get sessions within date range
      const sessions = await prisma.interviewSession.findMany({
        where,
        select: {
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Group sessions by date
      const sessionsByDate = new Map<string, number>();

      // Initialize all dates with 0
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        sessionsByDate.set(dateKey, 0);
      }

      // Count sessions per date
      for (const session of sessions) {
        const dateKey = session.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        sessionsByDate.set(dateKey, (sessionsByDate.get(dateKey) || 0) + 1);
      }

      // Convert to array format
      const data = Array.from(sessionsByDate.entries()).map(([date, sessions]) => ({
        date,
        sessions,
      }));

      return sendSuccess(reply, data);
    },
  });

  /**
   * GET /risk-scores
   * Risk score distribution across sessions
   */
  fastify.get('/risk-scores', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
    ],
    schema: {
      tags: ['Analytics'],
      summary: 'Get risk score distribution',
      description: 'Returns distribution of risk scores across all completed sessions',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;
      const userRole = request.user!.role;
      const organizationId = request.user!.organizationId;

      // Build where clause
      const where: any = {
        status: 'ended',
        riskScore: { not: null },
      };
      if (userRole !== 'admin') {
        where.interviewerId = userId;
      }
      if (organizationId) {
        where.organizationId = organizationId;
      }

      // Get all sessions with risk scores
      const sessions = await prisma.interviewSession.findMany({
        where,
        select: { riskScore: true },
      });

      // Define risk bands
      const bands = [
        { range: '0-20%', min: 0, max: 0.2, count: 0, color: 'hsl(160, 84%, 39%)' },
        { range: '20-40%', min: 0.2, max: 0.4, count: 0, color: 'hsl(160, 84%, 45%)' },
        { range: '40-60%', min: 0.4, max: 0.6, count: 0, color: 'hsl(38, 92%, 50%)' },
        { range: '60-80%', min: 0.6, max: 0.8, count: 0, color: 'hsl(0, 84%, 55%)' },
        { range: '80-100%', min: 0.8, max: 1.0, count: 0, color: 'hsl(0, 84%, 45%)' },
      ];

      // Count sessions in each band
      for (const session of sessions) {
        const score = Number(session.riskScore);
        for (const band of bands) {
          if (score >= band.min && score < band.max) {
            band.count++;
            break;
          }
          // Handle score === 1.0
          if (score === 1.0 && band.max === 1.0) {
            band.count++;
            break;
          }
        }
      }

      return sendSuccess(reply, bands.map(({ range, count, color }) => ({ range, count, color })));
    },
  });

  /**
   * GET /activity
   * Recent activity feed
   */
  fastify.get('/activity', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
    ],
    schema: {
      tags: ['Analytics'],
      summary: 'Get recent activity',
      description: 'Returns recent events from sessions, security alerts, and status changes',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;
      const userRole = request.user!.role;
      const organizationId = request.user!.organizationId;

      // Build where clause for sessions
      const sessionWhere: any = {};
      if (userRole !== 'admin') {
        sessionWhere.interviewerId = userId;
      }
      if (organizationId) {
        sessionWhere.organizationId = organizationId;
      }

      // Get recent sessions with status changes
      const recentSessions = await prisma.interviewSession.findMany({
        where: sessionWhere,
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          interviewee: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });

      // Get recent security events
      const recentSecurityEvents = await prisma.securityEvent.findMany({
        where: {
          session: sessionWhere,
        },
        orderBy: { timestamp: 'desc' },
        take: 5,
        include: {
          session: {
            include: {
              interviewee: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      });

      // Combine and format activities
      const activities: any[] = [];

      // Format session events
      for (const session of recentSessions) {
        const candidateName = session.interviewee
          ? `${session.interviewee.firstName || ''} ${session.interviewee.lastName || ''}`.trim()
          : session.intervieweeEmail || 'Unknown';

        let type: string;
        let title: string;
        let status: 'success' | 'warning' | 'error' | 'info';

        switch (session.status) {
          case 'active':
            type = 'session_started';
            title = 'Interview Started';
            status = 'info';
            break;
          case 'ended':
            type = 'session_ended';
            title = 'Interview Completed';
            status = 'success';
            break;
          case 'cancelled':
            type = 'session_cancelled';
            title = 'Session Cancelled';
            status = 'error';
            break;
          default:
            type = 'candidate_joined';
            title = 'Session Scheduled';
            status = 'info';
        }

        activities.push({
          id: session.id,
          type,
          title,
          description: candidateName,
          timestamp: formatRelativeTime(session.updatedAt),
          status,
          createdAt: session.updatedAt,
        });
      }

      // Format security events
      for (const event of recentSecurityEvents) {
        const candidateName = event.session.interviewee
          ? `${event.session.interviewee.firstName || ''} ${event.session.interviewee.lastName || ''}`.trim()
          : 'Unknown';

        activities.push({
          id: event.id,
          type: 'alert',
          title: event.severity === 'critical' ? 'Critical Security Alert' : 'Security Alert',
          description: event.description || formatEventType(event.eventType),
          timestamp: formatRelativeTime(event.timestamp),
          status: event.severity === 'critical' ? 'error' : 'warning',
          createdAt: event.timestamp,
        });
      }

      // Sort by timestamp and take top 10
      activities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const topActivities = activities.slice(0, 10).map(({ createdAt, ...rest }) => rest);

      return sendSuccess(reply, topActivities);
    },
  });

  /**
   * GET /detection-methods
   * Detection method breakdown
   */
  fastify.get('/detection-methods', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
    ],
    schema: {
      tags: ['Analytics'],
      summary: 'Get detection method breakdown',
      description: 'Returns breakdown of detection methods and their frequencies',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;
      const userRole = request.user!.role;
      const organizationId = request.user!.organizationId;

      // Build where clause
      const sessionWhere: any = {};
      if (userRole !== 'admin') {
        sessionWhere.interviewerId = userId;
      }
      if (organizationId) {
        sessionWhere.organizationId = organizationId;
      }

      // Get security event counts by type
      const eventCounts = await prisma.securityEvent.groupBy({
        by: ['eventType'],
        where: {
          session: sessionWhere,
        },
        _count: { eventType: true },
        orderBy: { _count: { eventType: 'desc' } },
      });

      const detectionMethods = eventCounts.map((ec) => ({
        method: formatEventType(ec.eventType),
        count: ec._count.eventType,
        type: ec.eventType,
      }));

      return sendSuccess(reply, detectionMethods);
    },
  });

  /**
   * GET /weekly-trends
   * Weekly session trends
   */
  fastify.get('/weekly-trends', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
    ],
    schema: {
      tags: ['Analytics'],
      summary: 'Get weekly trends',
      description: 'Returns session trends grouped by week',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;
      const userRole = request.user!.role;
      const organizationId = request.user!.organizationId;

      // Get last 12 weeks of data
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 84); // 12 weeks

      // Build where clause
      const where: any = {
        createdAt: { gte: startDate },
      };
      if (userRole !== 'admin') {
        where.interviewerId = userId;
      }
      if (organizationId) {
        where.organizationId = organizationId;
      }

      const sessions = await prisma.interviewSession.findMany({
        where,
        select: {
          createdAt: true,
          status: true,
          riskScore: true,
        },
      });

      // Group by week
      const weeklyData = new Map<string, { total: number; completed: number; highRisk: number }>();

      for (const session of sessions) {
        const weekStart = getWeekStart(session.createdAt);
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyData.has(weekKey)) {
          weeklyData.set(weekKey, { total: 0, completed: 0, highRisk: 0 });
        }

        const data = weeklyData.get(weekKey)!;
        data.total++;
        if (session.status === 'ended') data.completed++;
        if (session.riskScore && Number(session.riskScore) >= 0.7) data.highRisk++;
      }

      // Sort by week and format
      const trends = Array.from(weeklyData.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([weekStart, data]) => ({
          week: new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          ...data,
        }));

      return sendSuccess(reply, trends);
    },
  });

  /**
   * GET /candidate-sources
   * Breakdown of candidate invitation sources
   */
  fastify.get('/candidate-sources', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
    ],
    schema: {
      tags: ['Analytics'],
      summary: 'Get candidate sources',
      description: 'Returns breakdown of how candidates were invited/sourced',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const userId = request.user!.userId;
      const userRole = request.user!.role;
      const organizationId = request.user!.organizationId;

      // Build where clause
      const where: any = {};
      if (userRole !== 'admin') {
        where.interviewerId = userId;
      }
      if (organizationId) {
        where.organizationId = organizationId;
      }

      // Count sessions with email invites vs. registered users
      const [emailInvites, registeredUsers] = await Promise.all([
        prisma.interviewSession.count({
          where: {
            ...where,
            intervieweeEmail: { not: null },
            intervieweeId: null,
          },
        }),
        prisma.interviewSession.count({
          where: {
            ...where,
            intervieweeId: { not: null },
          },
        }),
      ]);

      return sendSuccess(reply, [
        { source: 'Email Invite', count: emailInvites },
        { source: 'Registered User', count: registeredUsers },
      ]);
    },
  });
}

// Helper functions
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatEventType(type: string): string {
  const typeMap: Record<string, string> = {
    suspicious_process: 'Suspicious Process Detected',
    screen_recording_detected: 'Screen Recording Detected',
    vm_detected: 'Virtual Machine Detected',
    window_focus_changed: 'Window Focus Changed',
    multi_monitor_detected: 'Multiple Monitors Detected',
    unauthorized_browser: 'Unauthorized Browser',
    copy_paste_detected: 'Copy/Paste Detected',
    keyboard_shortcut_blocked: 'Keyboard Shortcut Blocked',
  };
  return typeMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
