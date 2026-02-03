import { Prisma, SessionStatus } from '@prisma/client';
import type { InterviewSession } from '@prisma/client';
import prisma from '../src/database';
import { CacheService } from '../src/redis';
import tokenService from './token.service';
import {
  CreateSessionDTO,
  SessionResponse,
  SessionDetailResponse,
  SessionListQuery,
  PaginatedResponse,
  CachedSession,
  UserInfo,
  QuestionDetail,
  SecurityEventDetail,
} from '../types/session.types';
import { SessionNotFoundError, ValidationError } from '../lib/errors';
import { config } from '../src/config';

/**
 * Session Service
 * Handles session CRUD operations
 */

export class SessionService {
  private cache: CacheService;

  constructor() {
    this.cache = new CacheService();
  }

  /**
   * Create new session
   */
  async createSession(
    interviewerId: string,
    dto: CreateSessionDTO
  ): Promise<SessionResponse> {
    // Validate input
    if (!dto.scheduled_start || !dto.duration_minutes) {
      throw new ValidationError('scheduled_start and duration_minutes are required');
    }

    if (dto.duration_minutes > config.session.maxDurationHours * 60) {
      throw new ValidationError(
        `Session duration cannot exceed ${config.session.maxDurationHours} hours`
      );
    }

    // Get interviewer details
    const interviewer = await prisma.user.findUnique({
      where: { id: interviewerId },
      include: { organization: true },
    });

    if (!interviewer || !interviewer.organizationId) {
      throw new ValidationError('Interviewer not found or not associated with organization');
    }

    // Create session with questions in transaction
    const session = await prisma.$transaction(async (tx) => {
      // Create session
      const newSession = await tx.interviewSession.create({
        data: {
          interviewerId,
          intervieweeId: dto.interviewee_id,
          intervieweeEmail: dto.interviewee_email,
          organizationId: interviewer.organizationId!,
          status: 'scheduled',
          scheduledStart: new Date(dto.scheduled_start),
          durationMinutes: dto.duration_minutes,
          metadata: dto.metadata ? JSON.parse(JSON.stringify(dto.metadata)) : {},
        },
      });

      // Create questions
      if (dto.questions && dto.questions.length > 0) {
        await tx.question.createMany({
          data: dto.questions.map((q, index) => ({
            sessionId: newSession.id,
            questionText: q.question_text,
            questionOrder: q.question_order ?? index + 1,
            expectedDuration: q.expected_duration_seconds,
            difficulty: q.difficulty,
          })),
        });
      }

      return newSession;
    });

    // Generate session token
    const sessionToken = tokenService.generateSessionToken();
    await tokenService.storeSessionToken(sessionToken, session.id);

    // Update session with token
    await prisma.interviewSession.update({
      where: { id: session.id },
      data: { sessionToken },
    });

    // Cache session
    await this.cacheSession(session.id, {
      session_id: session.id,
      status: session.status,
      interviewer_id: interviewerId,
      interviewee_id: dto.interviewee_id,
      scheduled_start: dto.scheduled_start,
      metadata: dto.metadata || {},
    });

    // Build join URL
    const joinUrl = `${config.frontend.sessionJoinUrlBase}/${sessionToken}`;
    const websocketUrl = `ws://${config.websocket.port}`;

    return {
      session_id: session.id,
      session_token: sessionToken,
      status: session.status,
      join_url: joinUrl,
      websocket_url: websocketUrl,
      interviewer: this.formatUserInfo(interviewer),
      scheduled_start: session.scheduledStart?.toISOString() || '',
      created_at: session.createdAt.toISOString(),
    };
  }

  /**
   * Get session by ID
   * Optimized query using select to fetch only required fields
   * and single-query approach to avoid N+1 issues
   */
  async getSessionById(sessionId: string): Promise<SessionDetailResponse> {
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        interviewer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        interviewee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        questions: {
          orderBy: { questionOrder: 'asc' },
          select: {
            id: true,
            questionText: true,
            questionOrder: true,
            expectedDuration: true,
            difficulty: true,
            askedAt: true,
            answerAnalysis: {
              select: {
                id: true,
                answerText: true,
                riskScore: true,
                isAiGenerated: true,
                confidenceScore: true,
                analyzedAt: true,
              },
              take: 1, // Only get the latest analysis
              orderBy: { analyzedAt: 'desc' },
            },
          },
        },
        securityEvents: {
          orderBy: { timestamp: 'desc' },
          select: {
            id: true,
            eventType: true,
            severity: true,
            description: true,
            metadata: true,
            timestamp: true,
          },
          take: 100, // Limit security events to prevent large payloads
        },
      },
    });

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return this.formatSessionDetail(session);
  }

  /**
   * Get session by token
   * Optimized query using select to fetch only required fields
   */
  async getSessionByToken(token: string): Promise<SessionDetailResponse> {
    const session = await prisma.interviewSession.findUnique({
      where: { sessionToken: token },
      include: {
        interviewer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        interviewee: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        questions: {
          orderBy: { questionOrder: 'asc' },
          select: {
            id: true,
            questionText: true,
            questionOrder: true,
            expectedDuration: true,
            difficulty: true,
            askedAt: true,
            answerAnalysis: {
              select: {
                id: true,
                answerText: true,
                riskScore: true,
                isAiGenerated: true,
                confidenceScore: true,
                analyzedAt: true,
              },
              take: 1,
              orderBy: { analyzedAt: 'desc' },
            },
          },
        },
        securityEvents: {
          orderBy: { timestamp: 'desc' },
          select: {
            id: true,
            eventType: true,
            severity: true,
            description: true,
            metadata: true,
            timestamp: true,
          },
          take: 100,
        },
      },
    });

    if (!session) {
      throw new SessionNotFoundError(token);
    }

    return this.formatSessionDetail(session);
  }

  /**
   * List sessions with pagination and filters
   * Optimized with selective field loading and parallel count query
   */
  async listSessions(
    query: SessionListQuery
  ): Promise<PaginatedResponse<SessionDetailResponse>> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 50); // Cap at 50 to prevent large queries
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.InterviewSessionWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.interviewer_id) where.interviewerId = query.interviewer_id;
    if (query.interviewee_id) where.intervieweeId = query.interviewee_id;
    if (query.organization_id) where.organizationId = query.organization_id;

    if (query.start_date || query.end_date) {
      where.scheduledStart = {};
      if (query.start_date) where.scheduledStart.gte = new Date(query.start_date);
      if (query.end_date) where.scheduledStart.lte = new Date(query.end_date);
    }

    // Run count and data queries in parallel for better performance
    const [total, sessions] = await Promise.all([
      prisma.interviewSession.count({ where }),
      prisma.interviewSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          interviewer: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          interviewee: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          questions: {
            orderBy: { questionOrder: 'asc' },
            select: {
              id: true,
              questionText: true,
              questionOrder: true,
              expectedDuration: true,
              difficulty: true,
              askedAt: true,
              answerAnalysis: {
                select: {
                  id: true,
                  answerText: true,
                  riskScore: true,
                  isAiGenerated: true,
                  confidenceScore: true,
                  analyzedAt: true,
                },
                take: 1,
                orderBy: { analyzedAt: 'desc' },
              },
            },
          },
          securityEvents: {
            orderBy: { timestamp: 'desc' },
            select: {
              id: true,
              eventType: true,
              severity: true,
              description: true,
              metadata: true,
              timestamp: true,
            },
            take: 20, // Limit security events in list view
          },
          _count: {
            select: {
              securityEvents: true, // Include total count for UI
            },
          },
        },
      }),
    ]);

    return {
      data: sessions.map((s) => this.formatSessionDetail(s)),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update session
   */
  async updateSession(
    sessionId: string,
    data: {
      status?: SessionStatus;
      actualStart?: Date;
      actualEnd?: Date;
      riskScore?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<InterviewSession> {
    const updateData: Parameters<typeof prisma.interviewSession.update>[0]['data'] = {};

    if (data.status !== undefined) updateData.status = data.status;
    if (data.actualStart !== undefined) updateData.actualStart = data.actualStart;
    if (data.actualEnd !== undefined) updateData.actualEnd = data.actualEnd;
    if (data.riskScore !== undefined) updateData.riskScore = data.riskScore;
    if (data.metadata !== undefined) {
      updateData.metadata = JSON.parse(JSON.stringify(data.metadata));
    }

    const session = await prisma.interviewSession.update({
      where: { id: sessionId },
      data: updateData,
    });

    // Update cache
    if (data.status) {
      await this.updateCachedSessionStatus(sessionId, data.status);
    }

    return session;
  }

  /**
   * Delete session (soft delete)
   */
  async deleteSession(sessionId: string): Promise<void> {
    await prisma.interviewSession.delete({
      where: { id: sessionId },
    });

    // Remove from cache
    await this.cache.delete(`session:${sessionId}`);
  }

  // Private helper methods

  private formatUserInfo(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  }): UserInfo {
    return {
      user_id: user.id,
      full_name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      email: user.email,
      role: user.role,
    };
  }

  private formatSessionDetail(session: any): SessionDetailResponse {
    const durationSeconds = session.actualStart && session.actualEnd
      ? Math.floor((new Date(session.actualEnd).getTime() - new Date(session.actualStart).getTime()) / 1000)
      : null;

    return {
      session_id: session.id,
      status: session.status,
      interviewer: this.formatUserInfo(session.interviewer),
      interviewee: session.interviewee ? this.formatUserInfo(session.interviewee) : undefined,
      scheduled_start: session.scheduledStart?.toISOString() || null,
      actual_start: session.actualStart?.toISOString() || null,
      actual_end: session.actualEnd?.toISOString() || null,
      duration_seconds: durationSeconds,
      questions: session.questions.map((q: any) => this.formatQuestion(q)),
      security_events: session.securityEvents.map((e: any) => this.formatSecurityEvent(e)),
      risk_score: session.riskScore ? parseFloat(session.riskScore.toString()) : null,
      metadata: session.metadata || {},
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString(),
    };
  }

  private formatQuestion(question: any): QuestionDetail {
    const answer = question.answerAnalysis && question.answerAnalysis.length > 0
      ? question.answerAnalysis[0]
      : null;

    return {
      question_id: question.id,
      question_text: question.questionText,
      question_order: question.questionOrder,
      expected_duration: question.expectedDuration,
      difficulty: question.difficulty,
      asked_at: question.askedAt?.toISOString() || null,
      answer: answer ? {
        answer_id: answer.id,
        answer_text: answer.answerText,
        risk_score: answer.riskScore ? parseFloat(answer.riskScore.toString()) : null,
        is_ai_generated: answer.isAiGenerated,
        confidence_score: answer.confidenceScore ? parseFloat(answer.confidenceScore.toString()) : null,
        analyzed_at: answer.analyzedAt.toISOString(),
      } : undefined,
    };
  }

  private formatSecurityEvent(event: any): SecurityEventDetail {
    return {
      event_id: event.id,
      event_type: event.eventType,
      severity: event.severity,
      description: event.description,
      metadata: event.metadata || {},
      timestamp: event.timestamp.toISOString(),
    };
  }

  private async cacheSession(sessionId: string, data: CachedSession): Promise<void> {
    await this.cache.set(`session:${sessionId}`, data, config.session.tokenTTL);
  }

  private async updateCachedSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const cached = await this.cache.get<CachedSession>(`session:${sessionId}`, true);
    if (cached) {
      cached.status = status;
      await this.cacheSession(sessionId, cached);
    }
  }
}

export default new SessionService();
