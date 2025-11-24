import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import questionService from '../services/question.service';
import { formatErrorResponse } from '../lib/errors';

// Validation schemas
const askQuestionSchema = z.object({
  asked_by: z.string().uuid(),
});

const submitAnswerSchema = z.object({
  question_id: z.string().uuid(),
  answer_text: z.string().min(1),
  answer_audio_url: z.string().url().optional(),
  submitted_by: z.string().uuid(),
});

/**
 * Question Controller
 * HTTP endpoints for question and answer management
 */

export class QuestionController {
  /**
   * POST /questions/:id/ask
   * Mark question as asked
   */
  async askQuestion(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const dto = askQuestionSchema.parse(request.body);

      await questionService.askQuestion(id, dto);

      return reply.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid request data',
          details: error.errors,
        });
      }

      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * POST /answers
   * Submit answer to question
   */
  async submitAnswer(request: FastifyRequest, reply: FastifyReply) {
    try {
      const dto = submitAnswerSchema.parse(request.body);

      const answerId = await questionService.submitAnswer(dto);

      return reply.status(201).send({ answer_id: answerId });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid request data',
          details: error.errors,
        });
      }

      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions/:sessionId/questions
   * Get questions for session
   */
  async getSessionQuestions(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { sessionId } = request.params as { sessionId: string };

      const questions = await questionService.getSessionQuestions(sessionId);

      return reply.status(200).send(questions);
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /questions/:id
   * Get question by ID
   */
  async getQuestion(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };

      const question = await questionService.getQuestionById(id);

      return reply.status(200).send(question);
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }

  /**
   * GET /sessions/:sessionId/questions/next
   * Get next unanswered question
   */
  async getNextQuestion(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { sessionId } = request.params as { sessionId: string };

      const question = await questionService.getNextQuestion(sessionId);

      if (!question) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'No unanswered questions found',
        });
      }

      return reply.status(200).send(question);
    } catch (error) {
      const errorResponse = formatErrorResponse(error as Error);
      return reply.status(errorResponse.statusCode).send(errorResponse);
    }
  }
}

export default new QuestionController();
