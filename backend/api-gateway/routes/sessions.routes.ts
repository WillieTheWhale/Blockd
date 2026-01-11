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
  startSessionRequestSchema,
  endSessionRequestSchema,
  listSessionsQuerySchema,
  sessionEventsQuerySchema,
  CreateSessionRequest,
  StartSessionRequest,
  EndSessionRequest,
  ListSessionsQuery,
  SessionEventsQuery,
} from '../schemas/session.schema';
import { idParamSchema, IdParam } from '../schemas/common.schema';
import { sendSuccess, sendCreated, sendPaginated } from '../lib/response';
import { NotFoundError, BadRequestError, ForbiddenError } from '../lib/errors';
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
      body: createSessionRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { intervieweeEmail, intervieweeId, scheduledStart, metadata } = request.body;
      const interviewerId = request.user!.userId;
      const organizationId = request.user!.organizationId;

      if (!organizationId) {
        throw new BadRequestError('User must belong to an organization');
      }

      // Create session
      const session = await prisma.interviewSession.create({
        data: {
          interviewerId,
          intervieweeId,
          intervieweeEmail,
          organizationId,
          scheduledStart,
          status: 'scheduled',
          metadata: (metadata || {}) as Prisma.InputJsonValue,
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
      params: idParamSchema,
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
      querystring: listSessionsQuerySchema,
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
      params: idParamSchema,
      body: startSessionRequestSchema,
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
      params: idParamSchema,
      body: endSessionRequestSchema,
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
      params: idParamSchema,
      querystring: sessionEventsQuerySchema,
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
}
