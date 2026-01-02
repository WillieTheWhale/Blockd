/**
 * Reports Routes
 */

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { validateParams } from '../middleware/validation.middleware';
import { idParamSchema, IdParam } from '../schemas/common.schema';
import { sendSuccess } from '../lib/response';
import { NotFoundError } from '../lib/errors';
import prisma from '../lib/prisma';

export default async function reportsRoutes(fastify: FastifyInstance) {
  // Get session report
  fastify.get<{ Params: IdParam }>('/:session_id', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema.extend({ session_id: idParamSchema.shape.id })),
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Get session report',
      description: 'Retrieves the analysis report for a session',
      params: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const sessionId = (request.params as any).session_id;

      // Verify session exists
      const session = await prisma.interviewSession.findUnique({
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
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Get or generate report
      let report = await prisma.sessionReport.findUnique({
        where: { sessionId },
      });

      if (!report) {
        // Generate report if it doesn't exist
        const [securityEventsCount, questionsCount, answersAnalysis] = await Promise.all([
          prisma.securityEvent.count({ where: { sessionId } }),
          prisma.question.count({ where: { sessionId } }),
          prisma.answerAnalysis.findMany({
            where: {
              question: {
                sessionId,
              },
            },
          }),
        ]);

        const avgRiskScore = answersAnalysis.length > 0
          ? answersAnalysis.reduce((sum, a) => sum + Number(a.riskScore || 0), 0) / answersAnalysis.length
          : 0;

        const aiGeneratedCount = answersAnalysis.filter(a => a.isAiGenerated).length;

        report = await prisma.sessionReport.create({
          data: {
            sessionId,
            overallRiskScore: session.riskScore || avgRiskScore,
            aiDetectionScore: aiGeneratedCount / Math.max(answersAnalysis.length, 1),
            gazeAnomalyScore: 0, // Would be calculated from gaze events
            timingAnomalyScore: 0, // Would be calculated from timing data
            securityEventsCount,
            recommendations: [
              ...(avgRiskScore > 0.7 ? ['High risk score detected - manual review recommended'] : []),
              ...(securityEventsCount > 10 ? ['Multiple security events detected'] : []),
              ...(aiGeneratedCount > 0 ? ['AI-generated answers detected'] : []),
            ],
            detailedAnalysis: {
              questionsAsked: questionsCount,
              answersAnalyzed: answersAnalysis.length,
              aiGeneratedAnswers: aiGeneratedCount,
              securityEvents: securityEventsCount,
            },
          },
        });
      }

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
  fastify.get<{ Params: IdParam }>('/:session_id/pdf', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema.extend({ session_id: idParamSchema.shape.id })),
    ],
    schema: {
      tags: ['Reports'],
      summary: 'Download session report as PDF',
      description: 'Downloads the session report as a PDF file',
      params: {
        type: 'object',
        properties: {
          session_id: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const sessionId = (request.params as any).session_id;

      // Verify session exists
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // In production, this would generate a PDF using a library like puppeteer or pdfkit
      // For now, return a placeholder response
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="session-report-${sessionId}.pdf"`);

      return reply.send(Buffer.from('PDF content would be generated here'));
    },
  });
}
