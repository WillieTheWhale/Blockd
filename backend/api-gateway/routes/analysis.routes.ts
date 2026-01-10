/**
 * AI Analysis Routes
 * Proxies requests to ai-detection-service
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { validateBody } from '../middleware/validation.middleware';
import {
  analyzeQuestionRequestSchema,
  analyzeAnswerRequestSchema,
  AnalyzeQuestionRequest,
  AnalyzeAnswerRequest,
} from '../schemas/analysis.schema';
import { sendSuccess, sendCreated } from '../lib/response';
import { NotFoundError, BadRequestError, InternalServerError } from '../lib/errors';
import {
  aiDetectionServiceClient,
  sessionServiceClient,
  ServiceClientError,
  extractAuthToken,
  ServiceTypes,
} from '../lib/service-client';

/**
 * Helper to forward authentication context
 */
function getForwardHeaders(request: FastifyRequest): {
  authToken?: string;
  userId?: string;
  organizationId?: string;
} {
  return {
    authToken: extractAuthToken(request.headers.authorization),
    userId: request.user?.userId,
    organizationId: request.user?.organizationId,
  };
}

/**
 * Convert service client errors to appropriate HTTP errors
 */
function handleServiceError(error: unknown): never {
  if (error instanceof ServiceClientError) {
    switch (error.statusCode) {
      case 404:
        throw new NotFoundError(error.message);
      case 400:
        throw new BadRequestError(error.message);
      default:
        throw new InternalServerError(error.message);
    }
  }
  throw error;
}

export default async function analysisRoutes(fastify: FastifyInstance) {
  // Analyze question - generates AI answers for comparison
  fastify.post<{ Body: AnalyzeQuestionRequest }>('/question', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateBody(analyzeQuestionRequestSchema),
    ],
    schema: {
      tags: ['Analysis'],
      summary: 'Analyze interview question',
      description: 'Generates AI answers and analysis for an interview question',
      body: analyzeQuestionRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { sessionId, questionText, difficulty, expectedDuration, models } = request.body;

      try {
        // First verify session exists via session-service
        await sessionServiceClient.forward<ServiceTypes.Session>(
          'GET',
          `/sessions/${sessionId}`,
          {
            ...getForwardHeaders(request),
          }
        );

        // Call AI detection service to analyze the question
        const analysis = await aiDetectionServiceClient.forward<{
          questionId: string;
          questionText: string;
          difficulty: string;
          aiAnswers: ServiceTypes.AIAnswer[];
          expectedAnswerPatterns: string[];
          keywords: string[];
        }>(
          'POST',
          '/analyze/question',
          {
            body: {
              sessionId,
              questionText,
              difficulty,
              expectedDuration,
              models: models || ['gpt-4', 'claude-3-opus', 'gemini-1.5-pro'],
            },
            ...getForwardHeaders(request),
          }
        );

        return sendCreated(reply, analysis);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Analyze answer - compares user answer against AI-generated answers
  fastify.post<{ Body: AnalyzeAnswerRequest }>('/answer', {
    preHandler: [
      authenticate,
      authRateLimiter,
      validateBody(analyzeAnswerRequestSchema),
    ],
    schema: {
      tags: ['Analysis'],
      summary: 'Analyze interview answer',
      description: 'Analyzes an interview answer for AI detection',
      body: analyzeAnswerRequestSchema,
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { questionId, answerText, answerAudioUrl, transcriptionText, responseTime } = request.body;

      try {
        // Call AI detection service to analyze the answer
        const analysis = await aiDetectionServiceClient.forward<ServiceTypes.AnswerAnalysis>(
          'POST',
          '/analyze/answer',
          {
            body: {
              questionId,
              answerText,
              answerAudioUrl,
              transcriptionText,
              responseTime,
            },
            ...getForwardHeaders(request),
          }
        );

        return sendCreated(reply, analysis);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get analysis history for a session
  fastify.get<{ Params: { sessionId: string } }>('/session/:sessionId', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Analysis'],
      summary: 'Get session analysis history',
      description: 'Retrieves all analysis results for a session',
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

      try {
        const analyses = await aiDetectionServiceClient.forward<ServiceTypes.AnswerAnalysis[]>(
          'GET',
          `/analyze/session/${sessionId}`,
          {
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, analyses);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });

  // Get single analysis by ID
  fastify.get<{ Params: { analysisId: string } }>('/:analysisId', {
    preHandler: [
      authenticate,
      authRateLimiter,
    ],
    schema: {
      tags: ['Analysis'],
      summary: 'Get analysis by ID',
      description: 'Retrieves a specific analysis result',
      params: {
        type: 'object',
        properties: {
          analysisId: { type: 'string', format: 'uuid' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { analysisId } = request.params;

      try {
        const analysis = await aiDetectionServiceClient.forward<ServiceTypes.AnswerAnalysis>(
          'GET',
          `/analyze/${analysisId}`,
          {
            ...getForwardHeaders(request),
          }
        );

        return sendSuccess(reply, analysis);
      } catch (error) {
        handleServiceError(error);
      }
    },
  });
}
