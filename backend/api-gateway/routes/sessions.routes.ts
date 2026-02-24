/**
 * Session Management Routes
 */

import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { authRateLimiter, sessionCreationRateLimiter } from '../middleware/rate-limit.middleware';
import { validateBody, validateParams, validateQuery } from '../middleware/validation.middleware';
import {
  createSessionRequestSchema,
  updateSessionRequestSchema,
  startSessionRequestSchema,
  endSessionRequestSchema,
  listSessionsQuerySchema,
  sessionEventsQuerySchema,
  sessionQuestionsQuerySchema,
  submitAnswerRequestSchema,
  questionIdParamSchema,
  cancelSessionRequestSchema,
  CreateSessionRequest,
  UpdateSessionRequest,
  StartSessionRequest,
  EndSessionRequest,
  ListSessionsQuery,
  SessionEventsQuery,
  SessionQuestionsQuery,
  SubmitAnswerRequest,
  QuestionIdParam,
  CancelSessionRequest,
} from '../schemas/session.schema';
import { idParamSchema, IdParam } from '../schemas/common.schema';
import { sendSuccess, sendCreated, sendPaginated, sendNoContent } from '../lib/response';
import { NotFoundError, BadRequestError, ForbiddenError } from '../lib/errors';
import { sanitizeMetadata } from '../lib/sanitize';
import prisma from '../lib/prisma';

export default async function sessionsRoutes(fastify: FastifyInstance) {
  // Create session
  fastify.post<{ Body: CreateSessionRequest }>('/', {
    preHandler: [
      authenticate,
      sessionCreationRateLimiter, // Stricter rate limit for resource creation
      requireRole('interviewer', 'admin'),
      validateBody(createSessionRequestSchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Create a new interview session',
      description: 'Creates a new interview session',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { intervieweeEmail, intervieweeId, scheduledStart, meetingLink, metadata } = request.body;
      const interviewerId = request.user!.userId;
      const organizationId = request.user!.organizationId;

      if (!organizationId) {
        throw new BadRequestError('User must belong to an organization');
      }

      // Create session with sanitized metadata to prevent prototype pollution
      const session = await prisma.interviewSession.create({
        data: {
          interviewerId,
          intervieweeId,
          intervieweeEmail,
          organizationId,
          scheduledStart,
          meetingLink,
          status: 'scheduled',
          metadata: sanitizeMetadata(metadata || {}) as Prisma.InputJsonValue,
        },
      });

      return sendCreated(reply, session);
    },
  });

  // Get session by ID
  fastify.get<{ Params: IdParam }>('/:id', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Get session by ID',
      description: 'Retrieves a specific interview session',
      
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      const session = await prisma.interviewSession.findUnique({
        where: { id },
        include: {
          interviewer: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          interviewee: {
            select: {
              id: true,
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

      // Check access permissions
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      if (userRole !== 'admin' &&
          session.interviewerId !== userId &&
          session.intervieweeId !== userId) {
        throw new ForbiddenError('Access denied to this session');
      }

      return sendSuccess(reply, session);
    },
  });

  // List sessions
  fastify.get<{ Querystring: ListSessionsQuery }>('/', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateQuery(listSessionsQuerySchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'List sessions',
      description: 'Lists interview sessions with pagination',
      
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { page, pageSize, status, interviewerId, intervieweeId, startDate, endDate } = request.query;
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      const where: any = {};

      // Non-admin users can only see their own sessions
      if (userRole !== 'admin') {
        where.OR = [
          { interviewerId: userId },
          { intervieweeId: userId },
        ];
      }

      if (status) {
        where.status = status;
      }

      if (interviewerId) {
        where.interviewerId = interviewerId;
      }

      if (intervieweeId) {
        where.intervieweeId = intervieweeId;
      }

      if (startDate || endDate) {
        where.scheduledStart = {};
        if (startDate) {
          where.scheduledStart.gte = startDate;
        }
        if (endDate) {
          where.scheduledStart.lte = endDate;
        }
      }

      const [sessions, totalItems] = await Promise.all([
        prisma.interviewSession.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.interviewSession.count({ where }),
      ]);

      return sendPaginated(reply, sessions, page, pageSize, totalItems);
    },
  });

  // Start session
  fastify.post<{ Params: IdParam; Body: StartSessionRequest }>('/:id/start', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
      validateBody(startSessionRequestSchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Start a session',
      description: 'Starts an interview session',
      
      
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      const session = await prisma.interviewSession.findUnique({
        where: { id },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      if (session.status !== 'scheduled') {
        throw new BadRequestError(`Session cannot be started. Current status: ${session.status}`);
      }

      // Update session status
      const updatedSession = await prisma.interviewSession.update({
        where: { id },
        data: {
          status: 'active',
          actualStart: new Date(),
        },
      });

      return sendSuccess(reply, updatedSession);
    },
  });

  // End session
  fastify.post<{ Params: IdParam; Body: EndSessionRequest }>('/:id/end', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
      validateBody(endSessionRequestSchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'End a session',
      description: 'Ends an interview session',
      
      
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;

      const session = await prisma.interviewSession.findUnique({
        where: { id },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      if (session.status !== 'active') {
        throw new BadRequestError(`Session cannot be ended. Current status: ${session.status}`);
      }

      // Update session status
      const updatedSession = await prisma.interviewSession.update({
        where: { id },
        data: {
          status: 'ended',
          actualEnd: new Date(),
        },
      });

      return sendSuccess(reply, updatedSession);
    },
  });

  // Get session events
  fastify.get<{ Params: IdParam; Querystring: SessionEventsQuery }>('/:id/events', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
      validateQuery(sessionEventsQuerySchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Get session events',
      description: 'Retrieves security events for a session',


      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { page, pageSize, eventType, severity } = request.query;

      // Verify session exists and user has access
      const session = await prisma.interviewSession.findUnique({
        where: { id },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      const where: any = { sessionId: id };

      if (eventType) {
        where.eventType = eventType;
      }

      if (severity) {
        where.severity = severity;
      }

      const [events, totalItems] = await Promise.all([
        prisma.securityEvent.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { timestamp: 'desc' },
        }),
        prisma.securityEvent.count({ where }),
      ]);

      return sendPaginated(reply, events, page, pageSize, totalItems);
    },
  });

  // =============================================================================
  // NEW ENDPOINTS
  // =============================================================================

  // Update session (PUT /api/v1/sessions/:id)
  fastify.put<{ Params: IdParam; Body: UpdateSessionRequest }>('/:id', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
      validateParams(idParamSchema),
      validateBody(updateSessionRequestSchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Update a session',
      description: 'Updates an interview session. Only the interviewer or admin can update.',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { status, scheduledStart, metadata } = request.body;
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      // Find the session
      const session = await prisma.interviewSession.findUnique({
        where: { id },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Check authorization: must be interviewer who owns the session or admin
      if (userRole !== 'admin' && session.interviewerId !== userId) {
        throw new ForbiddenError('Only the session owner or admin can update this session');
      }

      // Validate status transitions
      if (status) {
        const validTransitions: Record<string, string[]> = {
          scheduled: ['active', 'cancelled'],
          active: ['ended', 'cancelled'],
          ended: [], // No transitions allowed from ended
          cancelled: [], // No transitions allowed from cancelled
        };

        const currentStatus = session.status;
        if (!validTransitions[currentStatus]?.includes(status)) {
          throw new BadRequestError(
            `Invalid status transition from '${currentStatus}' to '${status}'`
          );
        }
      }

      // Build update data
      const updateData: any = {};

      if (status !== undefined) {
        updateData.status = status;
        // Set actualStart/actualEnd based on status change
        if (status === 'active' && !session.actualStart) {
          updateData.actualStart = new Date();
        } else if (status === 'ended' || status === 'cancelled') {
          updateData.actualEnd = new Date();
          // Calculate duration if session was active
          if (session.actualStart) {
            const durationMs = new Date().getTime() - new Date(session.actualStart).getTime();
            updateData.durationMinutes = Math.round(durationMs / 60000);
          }
        }
      }

      if (scheduledStart !== undefined) {
        // Only allow changing scheduledStart if session hasn't started
        if (session.status !== 'scheduled') {
          throw new BadRequestError('Cannot change scheduled start time after session has started');
        }
        updateData.scheduledStart = scheduledStart;
      }

      if (metadata !== undefined) {
        // Merge with existing metadata
        updateData.metadata = {
          ...(session.metadata as Record<string, unknown>),
          ...sanitizeMetadata(metadata),
        };
      }

      // Perform update
      const updatedSession = await prisma.interviewSession.update({
        where: { id },
        data: updateData,
        include: {
          interviewer: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          interviewee: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return sendSuccess(reply, updatedSession);
    },
  });

  // Delete/Cancel session (DELETE /api/v1/sessions/:id)
  fastify.delete<{ Params: IdParam; Body: CancelSessionRequest }>('/:id', {
    preHandler: [
      authenticate,
      authRateLimiter,
      requireRole('interviewer', 'admin'),
      validateParams(idParamSchema),
      validateBody(cancelSessionRequestSchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Delete/cancel a session',
      description: 'Cancels or deletes an interview session. Only the interviewer or admin can delete.',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { reason } = request.body || {};
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      // Find the session
      const session = await prisma.interviewSession.findUnique({
        where: { id },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Check authorization: must be interviewer who owns the session or admin
      if (userRole !== 'admin' && session.interviewerId !== userId) {
        throw new ForbiddenError('Only the session owner or admin can delete this session');
      }

      // Determine action based on session status
      if (session.status === 'scheduled') {
        // For scheduled sessions, we can actually delete them
        await prisma.interviewSession.delete({
          where: { id },
        });
      } else if (session.status === 'active') {
        // For active sessions, cancel them instead of deleting
        await prisma.interviewSession.update({
          where: { id },
          data: {
            status: 'cancelled',
            actualEnd: new Date(),
            metadata: {
              ...(session.metadata as Record<string, unknown>),
              cancellationReason: reason || 'Session cancelled by user',
              cancelledAt: new Date().toISOString(),
              cancelledBy: userId,
            },
          },
        });
      } else {
        // For ended or already cancelled sessions, return error
        throw new BadRequestError(
          `Cannot delete a session with status '${session.status}'. Only scheduled or active sessions can be deleted/cancelled.`
        );
      }

      return sendNoContent(reply);
    },
  });

  // Get questions for session (GET /api/v1/sessions/:id/questions)
  fastify.get<{ Params: IdParam; Querystring: SessionQuestionsQuery }>('/:id/questions', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(idParamSchema),
      validateQuery(sessionQuestionsQuerySchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Get questions for a session',
      description: 'Retrieves all questions for a specific interview session',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { page, pageSize, difficulty, answered } = request.query;
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      // Find the session
      const session = await prisma.interviewSession.findUnique({
        where: { id },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Check access permissions
      if (userRole !== 'admin' &&
          session.interviewerId !== userId &&
          session.intervieweeId !== userId) {
        throw new ForbiddenError('Access denied to this session');
      }

      // Build query
      const where: any = { sessionId: id };

      if (difficulty) {
        where.difficulty = difficulty;
      }

      // Get questions with their answer analysis
      const [questions, totalItems] = await Promise.all([
        prisma.question.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { questionOrder: 'asc' },
          include: {
            answerAnalysis: {
              orderBy: { createdAt: 'desc' },
              take: 1, // Get only the latest answer
            },
          },
        }),
        prisma.question.count({ where }),
      ]);

      // Filter by answered status if specified
      let filteredQuestions = questions;
      if (answered !== undefined) {
        filteredQuestions = questions.filter((q) => {
          const hasAnswer = q.answerAnalysis.length > 0;
          return answered ? hasAnswer : !hasAnswer;
        });
      }

      // Transform response to include answer status
      const responseData = filteredQuestions.map((q) => ({
        id: q.id,
        sessionId: q.sessionId,
        questionText: q.questionText,
        questionOrder: q.questionOrder,
        expectedDuration: q.expectedDuration,
        difficulty: q.difficulty,
        askedAt: q.askedAt,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
        hasAnswer: q.answerAnalysis.length > 0,
        latestAnswer: q.answerAnalysis.length > 0 ? {
          id: q.answerAnalysis[0].id,
          answerText: q.answerAnalysis[0].answerText,
          riskScore: q.answerAnalysis[0].riskScore,
          isAiGenerated: q.answerAnalysis[0].isAiGenerated,
          confidenceScore: q.answerAnalysis[0].confidenceScore,
          analyzedAt: q.answerAnalysis[0].analyzedAt,
        } : null,
      }));

      return sendPaginated(
        reply,
        responseData,
        page,
        pageSize,
        answered !== undefined ? filteredQuestions.length : totalItems
      );
    },
  });

  // Submit answer to question (POST /api/v1/sessions/:id/questions/:qid/answer)
  fastify.post<{ Params: QuestionIdParam; Body: SubmitAnswerRequest }>('/:id/questions/:qid/answer', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateParams(questionIdParamSchema),
      validateBody(submitAnswerRequestSchema),
    ],
    schema: {
      tags: ['Sessions'],
      summary: 'Submit answer to a question',
      description: 'Submits an answer to a specific question in an interview session',
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { id: sessionId, qid: questionId } = request.params;
      const { answerText, answerAudioUrl, transcriptionText, responseTiming, metadata } = request.body;
      const userId = request.user!.userId;
      const userRole = request.user!.role;

      // Find the session
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Check if session is active - answers can only be submitted to active sessions
      if (session.status !== 'active') {
        throw new BadRequestError(
          `Cannot submit answer to a session with status '${session.status}'. Session must be active.`
        );
      }

      // Check access permissions: interviewee can answer, interviewer/admin can also submit on behalf
      if (userRole !== 'admin' &&
          session.interviewerId !== userId &&
          session.intervieweeId !== userId) {
        throw new ForbiddenError('Access denied to this session');
      }

      // Find the question
      const question = await prisma.question.findFirst({
        where: {
          id: questionId,
          sessionId: sessionId,
        },
      });

      if (!question) {
        throw new NotFoundError('Question not found in this session');
      }

      // Create the answer analysis record
      const answerAnalysis = await prisma.answerAnalysis.create({
        data: {
          questionId: questionId,
          answerText: answerText,
          answerAudioUrl: answerAudioUrl,
          transcriptionText: transcriptionText,
          responseTiming: sanitizeMetadata(responseTiming || {}) as Prisma.InputJsonValue,
          metadata: sanitizeMetadata(metadata || {}) as Prisma.InputJsonValue,
          // These fields will be populated by the analysis service later
          riskScore: null,
          similarityScores: {},
          perplexityScore: null,
          isAiGenerated: null,
          confidenceScore: null,
        },
        include: {
          question: {
            select: {
              id: true,
              questionText: true,
              questionOrder: true,
              difficulty: true,
            },
          },
        },
      });

      // Update the question's askedAt timestamp if not already set
      if (!question.askedAt) {
        await prisma.question.update({
          where: { id: questionId },
          data: { askedAt: new Date() },
        });
      }

      return sendCreated(reply, {
        id: answerAnalysis.id,
        questionId: answerAnalysis.questionId,
        answerText: answerAnalysis.answerText,
        answerAudioUrl: answerAnalysis.answerAudioUrl,
        transcriptionText: answerAnalysis.transcriptionText,
        responseTiming: answerAnalysis.responseTiming,
        metadata: answerAnalysis.metadata,
        analyzedAt: answerAnalysis.analyzedAt,
        createdAt: answerAnalysis.createdAt,
        question: answerAnalysis.question,
        // Analysis fields will be null until processed
        riskScore: answerAnalysis.riskScore,
        isAiGenerated: answerAnalysis.isAiGenerated,
        confidenceScore: answerAnalysis.confidenceScore,
      });
    },
  });
}
