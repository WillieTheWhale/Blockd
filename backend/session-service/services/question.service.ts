import prisma from '../src/database';
import { MessageQueueService } from '../src/messageQueue';
import { AskQuestionDTO, SubmitAnswerDTO } from '../types/session.types';
import { QuestionNotFoundError, DuplicateAnswerError, SessionNotFoundError } from '../lib/errors';

/**
 * Question Service
 * Handles question and answer management
 */

export class QuestionService {
  private messageQueue: MessageQueueService;

  constructor() {
    this.messageQueue = new MessageQueueService();
  }

  /**
   * Mark question as asked
   */
  async askQuestion(questionId: string, dto: AskQuestionDTO): Promise<void> {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new QuestionNotFoundError(questionId);
    }

    // Update question
    await prisma.question.update({
      where: { id: questionId },
      data: {
        askedAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: dto.asked_by,
        action: 'question.ask',
        resourceType: 'question',
        resourceId: questionId,
        metadata: {
          session_id: question.sessionId,
          question_text: question.questionText,
        },
      },
    });
  }

  /**
   * Submit answer to question
   */
  async submitAnswer(dto: SubmitAnswerDTO): Promise<string> {
    // Check if question exists
    const question = await prisma.question.findUnique({
      where: { id: dto.question_id },
      include: {
        answerAnalysis: true,
      },
    });

    if (!question) {
      throw new QuestionNotFoundError(dto.question_id);
    }

    // Check for duplicate answer
    if (question.answerAnalysis && question.answerAnalysis.length > 0) {
      throw new DuplicateAnswerError(dto.question_id);
    }

    // Create answer analysis record
    const answer = await prisma.answerAnalysis.create({
      data: {
        questionId: dto.question_id,
        answerText: dto.answer_text,
        answerAudioUrl: dto.answer_audio_url,
        metadata: {
          submitted_by: dto.submitted_by,
          submitted_at: new Date().toISOString(),
        },
      },
    });

    // Trigger AI detection analysis
    await this.messageQueue.publishAIDetectionEvent(
      answer.id,
      dto.question_id,
      dto.answer_text
    );

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: dto.submitted_by,
        action: 'answer.submit',
        resourceType: 'answer_analysis',
        resourceId: answer.id,
        metadata: {
          question_id: dto.question_id,
          session_id: question.sessionId,
        },
      },
    });

    return answer.id;
  }

  /**
   * Get questions for session
   */
  async getSessionQuestions(sessionId: string) {
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return await prisma.question.findMany({
      where: { sessionId },
      orderBy: { questionOrder: 'asc' },
      include: {
        answerAnalysis: true,
      },
    });
  }

  /**
   * Get question by ID
   */
  async getQuestionById(questionId: string) {
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        answerAnalysis: true,
        session: true,
      },
    });

    if (!question) {
      throw new QuestionNotFoundError(questionId);
    }

    return question;
  }

  /**
   * Get next unanswered question
   */
  async getNextQuestion(sessionId: string) {
    return await prisma.question.findFirst({
      where: {
        sessionId,
        answerAnalysis: {
          none: {},
        },
      },
      orderBy: { questionOrder: 'asc' },
    });
  }

  /**
   * Update answer analysis (from AI detection service)
   */
  async updateAnswerAnalysis(
    answerId: string,
    data: {
      riskScore?: number;
      similarityScores?: object;
      perplexityScore?: number;
      isAiGenerated?: boolean;
      confidenceScore?: number;
    }
  ): Promise<void> {
    await prisma.answerAnalysis.update({
      where: { id: answerId },
      data: {
        riskScore: data.riskScore,
        similarityScores: data.similarityScores,
        perplexityScore: data.perplexityScore,
        isAiGenerated: data.isAiGenerated,
        confidenceScore: data.confidenceScore,
      },
    });
  }
}

export default new QuestionService();
