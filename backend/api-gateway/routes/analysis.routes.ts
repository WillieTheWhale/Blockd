/**
 * AI Analysis Routes
 * Proxies to ai-detection-service
 */

import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/rate-limit.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  analyzeQuestionRequestSchema,
  analyzeAnswerRequestSchema,
  AnalyzeQuestionRequest,
  AnalyzeAnswerRequest,
} from '../schemas/analysis.schema.js';
import { sendSuccess, sendCreated } from '../lib/response.js';
import { NotFoundError } from '../lib/errors.js';
import prisma from '../lib/prisma.js';

export default async function analysisRoutes(fastify: FastifyInstance) {
  // Analyze question
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

      // Verify session exists
      const session = await prisma.interviewSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Create question record
      const question = await prisma.question.create({
        data: {
          sessionId,
          questionText,
          difficulty: difficulty as any,
          expectedDuration,
          askedAt: new Date(),
        },
      });

      // In production, this would call the AI detection service
      // For now, return mock data
      const aiAnswers = (models || ['gpt-4']).map(model => ({
        model,
        answer: `Mock AI answer for: ${questionText}`,
        confidence: 0.85,
        perplexity: 12.5,
      }));

      const response = {
        questionId: question.id,
        questionText: question.questionText,
        difficulty: question.difficulty,
        aiAnswers,
        expectedAnswerPatterns: ['pattern1', 'pattern2'],
        keywords: ['keyword1', 'keyword2'],
      };

      return sendCreated(reply, response);
    },
  });

  // Analyze answer
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

      // Verify question exists
      const question = await prisma.question.findUnique({
        where: { id: questionId },
      });

      if (!question) {
        throw new NotFoundError('Question not found');
      }

      // In production, this would call the AI detection service
      // For now, create mock analysis
      const riskScore = Math.random() * 0.3; // Mock low risk score
      const isAiGenerated = riskScore > 0.7;

      const analysis = await prisma.answerAnalysis.create({
        data: {
          questionId,
          answerText,
          answerAudioUrl,
          transcriptionText,
          riskScore,
          isAiGenerated,
          confidenceScore: 0.85,
          similarityScores: {
            'gpt-4': 0.2,
            'claude-3-opus': 0.15,
          },
          responseTiming: {
            latencyMs: responseTime || 0,
            wordsPerMinute: 120,
            pauseCount: 3,
            fillerRatio: 0.05,
          },
          perplexityScore: 15.2,
        },
      });

      const response = {
        analysisId: analysis.id,
        questionId: analysis.questionId,
        riskScore: Number(analysis.riskScore),
        isAiGenerated: analysis.isAiGenerated || false,
        confidence: Number(analysis.confidenceScore),
        similarityScores: analysis.similarityScores as Record<string, number>,
        responseTiming: analysis.responseTiming as any,
        perplexityScore: Number(analysis.perplexityScore),
        flags: isAiGenerated ? [
          {
            type: 'high_similarity',
            severity: 'high' as const,
            description: 'Answer shows high similarity to known AI patterns',
          },
        ] : [],
        recommendations: isAiGenerated
          ? ['Review answer manually', 'Consider follow-up questions']
          : [],
      };

      return sendCreated(reply, response);
    },
  });
}
