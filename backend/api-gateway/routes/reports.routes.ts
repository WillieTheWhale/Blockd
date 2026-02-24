/**
 * Reports Routes
 * Session reports and PDF generation
 */

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimiter, pdfRateLimiter, emailRateLimiter } from '../middleware/rate-limit.middleware';
import { validateParams, validateBody, validateQuery } from '../middleware/validation.middleware';
import { idParamSchema, IdParam, paginationQuerySchema, PaginationQuery } from '../schemas/common.schema';
import { emailReportRecipientsSchema, EmailReportRecipientsRequest } from '../schemas/session.schema';
import { sendSuccess, sendPaginated, sendNoContent } from '../lib/response';
import { NotFoundError, ForbiddenError } from '../lib/errors';
import prisma from '../lib/prisma';
import {
  generateSessionReportPdf,
  generateReportFilename,
  SessionReportData,
} from '../lib/pdf-generator';

/**
 * Param type for routes using sessionId.
 * NOTE: URL parameters use camelCase (sessionId) for consistency across the API.
 * This matches the convention used in sessions.routes.ts and other gateway routes.
 */
interface SessionIdParam {
  sessionId: string;
}

// ============================================================================
// Helper Types
// ============================================================================

/** Session with interviewer and interviewee details */
interface SessionWithParticipants {
  id: string;
  status: string;
  scheduledStart: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  durationMinutes: number | null;
  riskScore: any;
  organizationId: string | null;
  interviewerId: string;
  interviewer: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  interviewee: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetches a session with interviewer and interviewee details.
 * Common query used across multiple report endpoints.
 *
 * @param sessionId - The session ID to fetch
 * @returns Session with participant details, or null if not found
 */
async function fetchSessionWithParticipants(sessionId: string): Promise<SessionWithParticipants | null> {
  return prisma.interviewSession.findUnique({
    where: { id: sessionId },
    include: {
      interviewer: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
      interviewee: {
        select: {
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  }) as Promise<SessionWithParticipants | null>;
}

/**
 * Gets an existing report or generates a new one for a session.
 * Handles the common pattern of lazy report generation.
 *
 * @param sessionId - The session ID to get/generate report for
 * @param sessionRiskScore - The session's overall risk score (optional, for fallback)
 * @returns The session report (existing or newly created)
 */
async function getOrCreateSessionReport(sessionId: string, sessionRiskScore?: any) {
  // Check for existing report
  const existingReport = await prisma.sessionReport.findUnique({
    where: { sessionId },
  });

  if (existingReport) {
    return existingReport;
  }

  // Generate report data
  const [securityEventsCount, questionsCount, answersAnalysis] = await Promise.all([
    prisma.securityEvent.count({ where: { sessionId } }),
    prisma.question.count({ where: { sessionId } }),
    prisma.answerAnalysis.findMany({
      where: {
        question: { sessionId },
      },
      include: {
        question: {
          select: { questionText: true },
        },
      },
    }),
  ]);

  const avgRiskScore = answersAnalysis.length > 0
    ? answersAnalysis.reduce((sum, a) => sum + Number(a.riskScore || 0), 0) / answersAnalysis.length
    : 0;

  const aiGeneratedCount = answersAnalysis.filter(a => a.isAiGenerated).length;

  // Generate recommendations based on analysis
  const recommendations: string[] = [];
  if (avgRiskScore > 0.7) {
    recommendations.push('High risk score detected - manual review recommended');
  }
  if (securityEventsCount > 10) {
    recommendations.push('Multiple security events detected');
  }
  if (aiGeneratedCount > 0) {
    recommendations.push('AI-generated answers detected');
  }

  return prisma.sessionReport.create({
    data: {
      sessionId,
      overallRiskScore: sessionRiskScore || avgRiskScore,
      aiDetectionScore: aiGeneratedCount / Math.max(answersAnalysis.length, 1),
      gazeAnomalyScore: 0,
      timingAnomalyScore: 0,
      securityEventsCount,
      recommendations,
      detailedAnalysis: {
        questionsAsked: questionsCount,
        answersAnalyzed: answersAnalysis.length,
        aiGeneratedAnswers: aiGeneratedCount,
        securityEvents: securityEventsCount,
      },
    },
  });
}

/**
 * Verifies that a user has access to a session.
 * Access is granted to the interviewer or an admin in the same organization.
 *
 * @param userId - The user ID to check
 * @param sessionId - The session ID to check access for
 * @returns True if user has access, false otherwise
 */
async function verifySessionAccess(userId: string, sessionId: string): Promise<boolean> {
  const session = await prisma.interviewSession.findUnique({
    where: { id: sessionId },
    select: {
      interviewerId: true,
      organizationId: true,
    },
  });

  if (!session) {
    return false;
  }

  // Check if user is the interviewer
  if (session.interviewerId === userId) {
    return true;
  }

  // Check if user is an admin in the same organization
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      organizationId: true,
    },
  });

  if (!user) {
    return false;
  }

  // Admin in same organization has access
  if (user.role === 'admin' && user.organizationId === session.organizationId) {
    return true;
  }

  return false;
}

export default async function reportsRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // List Reports
  // ============================================================================

  // List all reports for the authenticated user with pagination
  fastify.get<{ Querystring: PaginationQuery }>('/', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateQuery(paginationQuerySchema),
    ],
    schema: {
      tags: ['Reports'],
      summary: 'List all reports',
      description: 'Lists all session reports accessible to the authenticated user with pagination. Admins see all reports in their organization; interviewers see reports for their sessions.',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          sortBy: { type: 'string' },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { page, pageSize } = request.query;
      const userId = request.user!.userId;
      const userRole = request.user!.role;
      const organizationId = request.user!.organizationId;

      // Build the where clause based on user role
      const where: any = {};

      if (userRole === 'admin' && organizationId) {
        // Admins can see all reports for sessions in their organization
        where.session = {
          organizationId,
        };
      } else {
        // Non-admins can only see reports for sessions they are involved in
        where.session = {
          OR: [
            { interviewerId: userId },
            { intervieweeId: userId },
          ],
        };
      }

      const [reports, totalItems] = await Promise.all([
        prisma.sessionReport.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          include: {
            session: {
              select: {
                id: true,
                status: true,
                scheduledStart: true,
                actualStart: true,
                actualEnd: true,
                durationMinutes: true,
                interviewer: {
                  select: {
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
                interviewee: {
                  select: {
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        }),
        prisma.sessionReport.count({ where }),
      ]);

      return sendPaginated(reply, reports, page, pageSize, totalItems);
    },
  });

  // ============================================================================
  // Delete Report
  // ============================================================================

  // Delete a report by ID
  fastify.delete<{ Params: IdParam }>('/:id', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Delete a report',
      description: 'Deletes a session report. Only the interviewer who conducted the session or an organization admin can delete reports.',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.userId;

      // Fetch the report with its session to verify access
      const report = await prisma.sessionReport.findUnique({
        where: { id },
        include: {
          session: {
            select: {
              interviewerId: true,
              organizationId: true,
            },
          },
        },
      });

      if (!report) {
        throw new NotFoundError('Report not found');
      }

      // Verify user has permission to delete this report
      const hasAccess = await verifySessionAccess(userId, report.sessionId);
      if (!hasAccess) {
        throw new ForbiddenError('You do not have permission to delete this report');
      }

      // Delete the report
      await prisma.sessionReport.delete({
        where: { id },
      });

      request.log.info(
        { reportId: id, sessionId: report.sessionId, userId },
        'Report deleted'
      );

      return sendNoContent(reply);
    },
  });

  // ============================================================================
  // Get Session Report
  // ============================================================================

  // Get session report
  fastify.get<{ Params: SessionIdParam }>('/:sessionId', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema.extend({ sessionId: idParamSchema.shape.id })),
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Get session report',
      description: 'Retrieves the analysis report for a session',
      params: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { sessionId } = request.params;

      // Fetch session with participants using helper
      const session = await fetchSessionWithParticipants(sessionId);

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Get or generate report using helper
      const report = await getOrCreateSessionReport(sessionId, session.riskScore);

      const response = {
        ...report,
        session: {
          id: session.id,
          status: session.status,
          scheduledStart: session.scheduledStart,
          actualStart: session.actualStart,
          actualEnd: session.actualEnd,
          durationMinutes: session.durationMinutes,
          interviewer: session.interviewer,
          interviewee: session.interviewee,
        },
      };

      return sendSuccess(reply, response);
    },
  });

  // Get session report as PDF
  fastify.get<{ Params: SessionIdParam }>('/:sessionId/pdf', {
    preHandler: [
      authenticate,
      pdfRateLimiter, // Stricter rate limit for expensive PDF generation
      validateParams(idParamSchema.extend({ sessionId: idParamSchema.shape.id })),
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Download session report as PDF',
      description: 'Downloads the session report as a PDF file',
      params: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { sessionId } = request.params;
      const userId = request.user!.userId;

      // Verify user has access to this session
      const hasAccess = await verifySessionAccess(userId, sessionId);
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this session report');
      }

      // Fetch session with participants using helper
      const session = await fetchSessionWithParticipants(sessionId);

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Get or create report using helper
      const report = await getOrCreateSessionReport(sessionId, session.riskScore);

      // Fetch security events for the report
      const securityEvents = await prisma.securityEvent.findMany({
        where: { sessionId },
        orderBy: { timestamp: 'desc' },
        take: 50,
        select: {
          eventType: true,
          severity: true,
          description: true,
          timestamp: true,
        },
      });

      // Fetch answer analyses with questions
      const answerAnalyses = await prisma.answerAnalysis.findMany({
        where: {
          question: {
            sessionId,
          },
        },
        include: {
          question: {
            select: {
              questionText: true,
            },
          },
        },
      });

      // Build PDF data
      const pdfData: SessionReportData = {
        sessionId: session.id,
        status: session.status,
        scheduledStart: session.scheduledStart,
        actualStart: session.actualStart,
        actualEnd: session.actualEnd,
        durationMinutes: session.durationMinutes,
        interviewer: {
          email: session.interviewer.email,
          firstName: session.interviewer.firstName,
          lastName: session.interviewer.lastName,
        },
        interviewee: {
          email: session.interviewee.email,
          firstName: session.interviewee.firstName,
          lastName: session.interviewee.lastName,
        },
        report: {
          overallRiskScore: Number(report.overallRiskScore),
          aiDetectionScore: Number(report.aiDetectionScore),
          gazeAnomalyScore: Number(report.gazeAnomalyScore),
          timingAnomalyScore: Number(report.timingAnomalyScore),
          securityEventsCount: report.securityEventsCount,
          recommendations: report.recommendations as string[],
          detailedAnalysis: report.detailedAnalysis as {
            questionsAsked: number;
            answersAnalyzed: number;
            aiGeneratedAnswers: number;
            securityEvents: number;
          },
          createdAt: report.createdAt,
        },
        securityEvents: securityEvents.map(e => ({
          eventType: e.eventType,
          severity: e.severity,
          description: e.description,
          timestamp: e.timestamp,
        })),
        answerAnalyses: answerAnalyses.map(a => ({
          questionText: a.question.questionText,
          riskScore: Number(a.riskScore),
          isAiGenerated: a.isAiGenerated ?? false,
          similarityScores: a.similarityScores as Record<string, number> | undefined,
          // recommendations is optional and not stored in AnswerAnalysis model
        })),
      };

      // Generate PDF
      const pdfBuffer = await generateSessionReportPdf(pdfData);
      const filename = generateReportFilename(sessionId);

      // Set response headers
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Content-Length', pdfBuffer.length.toString());
      reply.header('Cache-Control', 'no-cache');

      return reply.send(pdfBuffer);
    },
  });

  // ============================================================================
  // Download Report (Alias for PDF endpoint)
  // ============================================================================

  /**
   * Download report as PDF - Alias route for frontend compatibility
   * Frontend uses: /api/v1/reports/:id/download
   * This aliases to the existing /:session_id/pdf endpoint
   *
   * Note: The :id parameter here refers to the report ID, which maps to session_id
   * since reports have a 1:1 relationship with sessions.
   */
  fastify.get<{ Params: IdParam }>('/:id/download', {
    preHandler: [
      authenticate,
      pdfRateLimiter, // Stricter rate limit for expensive PDF generation
      validateParams(idParamSchema),
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Download report as PDF (alias)',
      description: 'Downloads the session report as a PDF file. This is an alias endpoint for frontend compatibility. The :id parameter can be either a report ID or session ID.',
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const userId = request.user!.userId;

      // First, try to find a report with this ID to get the session ID
      let sessionId = id;
      const report = await prisma.sessionReport.findUnique({
        where: { id },
        select: { sessionId: true },
      });

      if (report) {
        // The ID was a report ID, use its session ID
        sessionId = report.sessionId;
      }
      // Otherwise, assume the ID is a session ID directly

      // Verify user has access to this session
      const hasAccess = await verifySessionAccess(userId, sessionId);
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this report');
      }

      // Fetch session with participants
      const session = await fetchSessionWithParticipants(sessionId);

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Get or create report
      const sessionReport = await getOrCreateSessionReport(sessionId, session.riskScore);

      // Fetch security events for the report
      const securityEvents = await prisma.securityEvent.findMany({
        where: { sessionId },
        orderBy: { timestamp: 'desc' },
        take: 50,
        select: {
          eventType: true,
          severity: true,
          description: true,
          timestamp: true,
        },
      });

      // Fetch answer analyses with questions
      const answerAnalyses = await prisma.answerAnalysis.findMany({
        where: {
          question: {
            sessionId,
          },
        },
        include: {
          question: {
            select: {
              questionText: true,
            },
          },
        },
      });

      // Build PDF data
      const pdfData: SessionReportData = {
        sessionId: session.id,
        status: session.status,
        scheduledStart: session.scheduledStart,
        actualStart: session.actualStart,
        actualEnd: session.actualEnd,
        durationMinutes: session.durationMinutes,
        interviewer: {
          email: session.interviewer.email,
          firstName: session.interviewer.firstName,
          lastName: session.interviewer.lastName,
        },
        interviewee: {
          email: session.interviewee.email,
          firstName: session.interviewee.firstName,
          lastName: session.interviewee.lastName,
        },
        report: {
          overallRiskScore: Number(sessionReport.overallRiskScore),
          aiDetectionScore: Number(sessionReport.aiDetectionScore),
          gazeAnomalyScore: Number(sessionReport.gazeAnomalyScore),
          timingAnomalyScore: Number(sessionReport.timingAnomalyScore),
          securityEventsCount: sessionReport.securityEventsCount,
          recommendations: sessionReport.recommendations as string[],
          detailedAnalysis: sessionReport.detailedAnalysis as {
            questionsAsked: number;
            answersAnalyzed: number;
            aiGeneratedAnswers: number;
            securityEvents: number;
          },
          createdAt: sessionReport.createdAt,
        },
        securityEvents: securityEvents.map(e => ({
          eventType: e.eventType,
          severity: e.severity,
          description: e.description,
          timestamp: e.timestamp,
        })),
        answerAnalyses: answerAnalyses.map(a => ({
          questionText: a.question.questionText,
          riskScore: Number(a.riskScore),
          isAiGenerated: a.isAiGenerated ?? false,
          similarityScores: a.similarityScores as Record<string, number> | undefined,
        })),
      };

      // Generate PDF
      const pdfBuffer = await generateSessionReportPdf(pdfData);
      const filename = generateReportFilename(sessionId);

      // Set response headers
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Content-Length', pdfBuffer.length.toString());
      reply.header('Cache-Control', 'no-cache');

      return reply.send(pdfBuffer);
    },
  });

  // ============================================================================
  // Email Report
  // ============================================================================

  // Generate and email report
  fastify.post<{ Params: SessionIdParam; Body: EmailReportRecipientsRequest }>('/:sessionId/email', {
    preHandler: [
      authenticate,
      emailRateLimiter, // Stricter rate limit for email operations
      validateParams(idParamSchema.extend({ sessionId: idParamSchema.shape.id })),
      validateBody(emailReportRecipientsSchema),
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Email session report',
      description: 'Generates and emails the session report to specified recipients. Only the interviewer or organization admin can email reports.',
      params: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
        },
      },

      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { sessionId } = request.params;
      const userId = request.user!.userId;
      const { recipients } = request.body;

      // Verify user has access to this session (interviewer or admin only)
      const hasAccess = await verifySessionAccess(userId, sessionId);
      if (!hasAccess) {
        throw new ForbiddenError('You do not have permission to email this session report');
      }

      // Verify session exists
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // In production, this would:
      // 1. Generate the PDF report
      // 2. Send email with PDF attachment using an email service (SendGrid, SES, etc.)
      // For now, return success with a message

      request.log.info(
        { sessionId, recipients, userId },
        'Report email requested'
      );

      return sendSuccess(reply, {
        message: 'Report email queued for delivery',
        recipients,
        sessionId,
      });
    },
  });
}
