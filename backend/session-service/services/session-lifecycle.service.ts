import prisma from '../src/database';
import { SessionStateMachine } from '../lib/state-machine';
import { MessageQueueService } from '../src/messageQueue';
import {
  StartSessionDTO,
  EndSessionDTO,
  CancelSessionDTO,
  ActiveSessionResponse,
  EndedSessionResponse,
} from '../types/session.types';
import { SessionNotFoundError, InvalidSessionStateError } from '../lib/errors';
import sessionService from './session.service';
import reportService from './report.service';

/**
 * Session Lifecycle Service
 * Handles session state transitions (start, end, cancel)
 */

export class SessionLifecycleService {
  private messageQueue: MessageQueueService;

  constructor() {
    this.messageQueue = new MessageQueueService();
  }

  /**
   * Start session
   */
  async startSession(sessionId: string, dto: StartSessionDTO): Promise<ActiveSessionResponse> {
    // Get session
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          orderBy: { questionOrder: 'asc' },
        },
      },
    });

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Validate state transition
    if (!SessionStateMachine.canStart(session.status)) {
      throw new InvalidSessionStateError(session.status, 'start');
    }

    // Transition to active state
    const newState = SessionStateMachine.transition(session.status, 'start');

    // Update session
    const updatedSession = await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: newState,
        actualStart: new Date(),
      },
    });

    // Start video recording
    await this.messageQueue.publishVideoEvent('start', sessionId, {
      interviewer_id: session.interviewerId,
      interviewee_id: session.intervieweeId,
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: dto.started_by,
        action: 'session.start',
        resourceType: 'interview_session',
        resourceId: sessionId,
        metadata: {
          previous_status: session.status,
          new_status: newState,
        },
      },
    });

    return {
      session_id: sessionId,
      status: 'active',
      started_at: updatedSession.actualStart!.toISOString(),
      websocket_url: `ws://${process.env.WEBSOCKET_PORT || 3003}`,
      participants: [],
      current_question: session.questions[0] ? {
        question_id: session.questions[0].id,
        question_text: session.questions[0].questionText,
        question_order: session.questions[0].questionOrder,
        expected_duration: session.questions[0].expectedDuration,
        difficulty: session.questions[0].difficulty,
        asked_at: null,
      } : undefined,
    };
  }

  /**
   * End session
   */
  async endSession(sessionId: string, dto: EndSessionDTO): Promise<EndedSessionResponse> {
    // Get session
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Validate state transition
    if (!SessionStateMachine.canEnd(session.status)) {
      throw new InvalidSessionStateError(session.status, 'end');
    }

    // Transition to ended state
    const newState = SessionStateMachine.transition(session.status, 'end');

    // Update session
    const endTime = new Date();
    const durationSeconds = session.actualStart
      ? Math.floor((endTime.getTime() - session.actualStart.getTime()) / 1000)
      : 0;

    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: newState,
        actualEnd: endTime,
      },
    });

    // Stop video recording
    await this.messageQueue.publishVideoEvent('stop', sessionId, {
      duration_seconds: durationSeconds,
    });

    // Generate session report
    const report = await reportService.generateReport(sessionId);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: dto.ended_by,
        action: 'session.end',
        resourceType: 'interview_session',
        resourceId: sessionId,
        metadata: {
          previous_status: session.status,
          new_status: newState,
          duration_seconds: durationSeconds,
          reason: dto.reason,
        },
      },
    });

    return {
      session_id: sessionId,
      status: 'ended',
      ended_at: endTime.toISOString(),
      duration_seconds: durationSeconds,
      report_id: report.report_id,
    };
  }

  /**
   * Cancel session
   */
  async cancelSession(sessionId: string, dto: CancelSessionDTO): Promise<void> {
    // Get session
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Validate state transition
    if (!SessionStateMachine.canCancel(session.status)) {
      throw new InvalidSessionStateError(session.status, 'cancel');
    }

    // Transition to cancelled state
    const newState = SessionStateMachine.transition(session.status, 'cancel');

    // Update session
    await prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: newState,
        metadata: {
          ...((session.metadata as object) || {}),
          cancelled_at: new Date().toISOString(),
          cancelled_by: dto.cancelled_by,
          cancellation_reason: dto.reason,
        },
      },
    });

    // If session was active, stop recording
    if (session.status === 'active') {
      await this.messageQueue.publishVideoEvent('stop', sessionId, {
        reason: 'cancelled',
      });
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: dto.cancelled_by,
        action: 'session.cancel',
        resourceType: 'interview_session',
        resourceId: sessionId,
        metadata: {
          previous_status: session.status,
          new_status: newState,
          reason: dto.reason,
        },
      },
    });
  }

  /**
   * Check if session can be started
   */
  async canStartSession(sessionId: string): Promise<boolean> {
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (!session) {
      return false;
    }

    return SessionStateMachine.canStart(session.status);
  }

  /**
   * Check if session can be ended
   */
  async canEndSession(sessionId: string): Promise<boolean> {
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (!session) {
      return false;
    }

    return SessionStateMachine.canEnd(session.status);
  }

  /**
   * Check if session is active
   */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (!session) {
      return false;
    }

    return SessionStateMachine.isActive(session.status);
  }
}

export default new SessionLifecycleService();
