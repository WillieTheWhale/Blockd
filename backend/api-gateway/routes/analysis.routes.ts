/**
 * AI Analysis Routes
 * Proxies to ai-detection-service with circuit breaker and caching
 */

import { FastifyInstance } from 'fastify';
import { QuestionDifficulty } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rate-limit.middleware';
import { validateBody } from '../middleware/validation.middleware';
import {
  analyzeQuestionRequestSchema,
  analyzeAnswerRequestSchema,
  AnalyzeQuestionRequest,
  AnalyzeAnswerRequest,
} from '../schemas/analysis.schema';
import { sendSuccess, sendCreated } from '../lib/response';
import { NotFoundError, ServiceUnavailableError } from '../lib/errors';
import prisma from '../lib/prisma';
import { getAiDetectionServiceClient } from '../lib/http-client';
import { apiCache } from '../lib/cache';
import { addSpanEvent, setSpanAttribute } from '../lib/tracing';
import { withRetry, createLoggedRetry } from '../lib/db-retry';

export default async function analysisRoutes(fastify: FastifyInstance) {
  // Analyze question
  fastify.post<{ Body: AnalyzeQuestionRequest }>('/question', {
    preHandler: [
      authenticate,
      requireRole(['admin', 'interviewer']),
      authRateLimiter,
      validateBody(analyzeQuestionRequestSchema),
    ],
    schema: {
      tags: ['Analysis'],
      summary: 'Analyze interview question',
      description: 'Generates AI answers and analysis for an interview question',
      
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { sessionId, questionText, difficulty, expectedDuration, models } = request.body;
      const requestedModels = models || ['gpt-4', 'claude-3-opus', 'gemini-1.5-pro'];

      // Add tracing
      if (request.span) {
        setSpanAttribute(request.span, 'analysis.type', 'question');
        setSpanAttribute(request.span, 'analysis.models_count', requestedModels.length);
      }

      // Verify session exists (with retry for transient failures)
      const session = await withRetry(
        () => prisma.interviewSession.findUnique({
          where: { id: sessionId },
        }),
        {
          maxRetries: 3,
          onRetry: (attempt, error) => {
            request.log.warn({ attempt, error, sessionId }, 'Retrying session lookup');
          },
        }
      );

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      // Create question record (with retry for transient failures)
      const question = await withRetry(
        () => prisma.question.create({
          data: {
            sessionId,
            questionText,
            difficulty: difficulty as QuestionDifficulty | undefined,
            expectedDuration,
            askedAt: new Date(),
          },
        }),
        {
          maxRetries: 3,
          onRetry: (attempt, error) => {
            request.log.warn({ attempt, error, sessionId }, 'Retrying question creation');
          },
        }
      );

      // Get AI answers - check cache first, then call service
      const aiAnswers: Array<{
        model: string;
        answer: string;
        confidence: number;
        perplexity: number;
        cached: boolean;
      }> = [];

      for (const model of requestedModels) {
        // Check cache first
        const cached = await apiCache.aiAnswer.get(questionText, model);
        if (cached) {
          if (request.span) {
            addSpanEvent(request.span, 'cache_hit', { model });
          }
          aiAnswers.push({
            model,
            answer: cached.answer,
            confidence: 0.95,
            perplexity: cached.perplexity || 12.5,
            cached: true,
          });
          continue;
        }

        // Call AI detection service
        try {
          const aiClient = getAiDetectionServiceClient();
          const response = await aiClient.post<{
            answer: string;
            confidence: number;
            perplexity: number;
            embedding?: number[];
          }>('/api/v1/generate', {
            questionText,
            model,
            difficulty,
          }, {
            traceContext: request.traceContext,
          });

          if (response.statusCode === 200 && response.data) {
            // Cache the response
            await apiCache.aiAnswer.set(
              questionText,
              model,
              response.data.answer,
              response.data.embedding
            );

            aiAnswers.push({
              model,
              answer: response.data.answer,
              confidence: response.data.confidence,
              perplexity: response.data.perplexity,
              cached: false,
            });

            if (request.span) {
              addSpanEvent(request.span, 'ai_response', { model, status: 'success' });
            }
          }
        } catch (error) {
          request.log.warn({ model, error }, 'Failed to get AI answer, using fallback');
          if (request.span) {
            addSpanEvent(request.span, 'ai_response', { model, status: 'fallback' });
          }
          // Fallback: return placeholder indicating service unavailable
          aiAnswers.push({
            model,
            answer: `[AI service unavailable for ${model}]`,
            confidence: 0,
            perplexity: 0,
            cached: false,
          });
        }
      }

      // Extract keywords from the question (simple extraction)
      const keywords = extractKeywords(questionText);

      const responseData = {
        questionId: question.id,
        questionText: question.questionText,
        difficulty: question.difficulty,
        aiAnswers,
        expectedAnswerPatterns: generateExpectedPatterns(questionText, difficulty),
        keywords,
      };

      return sendCreated(reply, responseData);
    },
  });

  // Analyze answer
  fastify.post<{ Body: AnalyzeAnswerRequest }>('/answer', {
    preHandler: [
      authenticate,
      requireRole(['admin', 'interviewer']),
      authRateLimiter,
      validateBody(analyzeAnswerRequestSchema),
    ],
    schema: {
      tags: ['Analysis'],
      summary: 'Analyze interview answer',
      description: 'Analyzes an interview answer for AI detection',
      
      security: [{ bearerAuth: [] }],
    },
    handler: async (request, reply) => {
      const { questionId, answerText, answerAudioUrl, transcriptionText, responseTime } = request.body;

      // Add tracing
      if (request.span) {
        setSpanAttribute(request.span, 'analysis.type', 'answer');
        setSpanAttribute(request.span, 'analysis.question_id', questionId);
      }

      // Verify question exists and get session info
      const question = await prisma.question.findUnique({
        where: { id: questionId },
        include: { session: true },
      });

      if (!question) {
        throw new NotFoundError('Question not found');
      }

      // Call AI detection service for answer analysis
      let analysisResult: {
        riskScore: number;
        isAiGenerated: boolean;
        confidence: number;
        similarityScores: Record<string, number>;
        perplexityScore: number;
        flags: Array<{ type: string; severity: string; description: string }>;
      };

      try {
        const aiClient = getAiDetectionServiceClient();
        const response = await aiClient.post<{
          riskScore: number;
          isAiGenerated: boolean;
          confidence: number;
          similarityScores: Record<string, number>;
          perplexityScore: number;
          flags: Array<{ type: string; severity: string; description: string }>;
        }>('/api/v1/analyze', {
          questionId,
          questionText: question.questionText,
          answerText,
          transcriptionText,
          responseTimeMs: responseTime,
        }, {
          traceContext: request.traceContext,
        });

        if (response.statusCode === 200 && response.data) {
          analysisResult = response.data;
          if (request.span) {
            addSpanEvent(request.span, 'ai_analysis', { status: 'success' });
          }
        } else {
          throw new Error('Invalid response from AI service');
        }
      } catch (error) {
        request.log.warn({ error }, 'AI detection service unavailable, using fallback analysis');
        if (request.span) {
          addSpanEvent(request.span, 'ai_analysis', { status: 'fallback' });
        }

        // Fallback: basic heuristic analysis
        analysisResult = performFallbackAnalysis(answerText, question.questionText, responseTime);
      }

      // Calculate response timing metrics
      const wordCount = answerText.split(/\s+/).length;
      const responseTimeSeconds = (responseTime || 5000) / 1000;
      const wordsPerMinute = Math.round((wordCount / responseTimeSeconds) * 60);

      const responseTiming = {
        latencyMs: responseTime || 0,
        wordsPerMinute,
        pauseCount: estimatePauseCount(answerText),
        fillerRatio: calculateFillerRatio(answerText),
      };

      // Store analysis in database
      const analysis = await prisma.answerAnalysis.create({
        data: {
          questionId,
          answerText,
          answerAudioUrl,
          transcriptionText,
          riskScore: analysisResult.riskScore,
          isAiGenerated: analysisResult.isAiGenerated,
          confidenceScore: analysisResult.confidence,
          similarityScores: analysisResult.similarityScores,
          responseTiming,
          perplexityScore: analysisResult.perplexityScore,
        },
      });

      // Update session risk score
      await updateSessionRiskScore(question.sessionId);

      const responseData = {
        analysisId: analysis.id,
        questionId: analysis.questionId,
        riskScore: Number(analysis.riskScore),
        isAiGenerated: analysis.isAiGenerated || false,
        confidence: Number(analysis.confidenceScore),
        similarityScores: analysis.similarityScores as Record<string, number>,
        responseTiming: analysis.responseTiming as typeof responseTiming,
        perplexityScore: Number(analysis.perplexityScore),
        flags: analysisResult.flags,
        recommendations: generateRecommendations(analysisResult),
      };

      return sendCreated(reply, responseData);
    },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Common English stop words to exclude from keyword extraction.
 * These are high-frequency words that typically don't carry significant meaning
 * for search or analysis purposes (articles, prepositions, pronouns, etc.).
 * Based on NLTK's English stop words list with additions for interview contexts.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
  'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
  'because', 'until', 'while', 'what', 'which', 'who', 'whom', 'this',
  'that', 'these', 'those', 'am', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its',
  'our', 'their', 'myself', 'yourself', 'himself', 'herself', 'itself',
]);

/**
 * Common filler words that appear in natural speech but rarely in AI-generated text.
 * Used for calculating filler ratios to detect AI content.
 */
const FILLER_WORDS = ['um', 'uh', 'er', 'ah', 'like', 'you know', 'basically', 'actually', 'literally', 'honestly'];

/**
 * Extracts significant keywords from question text for answer analysis.
 * Filters out common stop words and returns the most frequent terms.
 *
 * @param text - The question text to extract keywords from
 * @returns Array of top 10 keywords sorted by frequency
 *
 * @example
 * extractKeywords("What is the difference between TCP and UDP?")
 * // Returns: ["difference", "tcp", "udp"]
 */
function extractKeywords(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));

  // Count word frequency
  const wordCount = new Map<string, number>();
  for (const word of words) {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  }

  // Sort by frequency and return top keywords
  return Array.from(wordCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

/**
 * Generates expected answer patterns based on question type and difficulty.
 * These patterns help identify the type of response expected (e.g., explanation,
 * comparison, steps) for better answer evaluation.
 *
 * @param questionText - The interview question text to analyze
 * @param difficulty - Optional difficulty level ('easy', 'medium', 'hard', 'expert')
 * @returns Array of expected answer pattern types
 *
 * @example
 * generateExpectedPatterns("Compare REST and GraphQL", "medium")
 * // Returns: ["comparison", "contrast", "similarities"]
 */
function generateExpectedPatterns(questionText: string, difficulty?: string): string[] {
  const patterns: string[] = [];
  const lowerQuestion = questionText.toLowerCase();

  if (lowerQuestion.includes('explain') || lowerQuestion.includes('describe')) {
    patterns.push('definition', 'example', 'elaboration');
  }
  if (lowerQuestion.includes('compare') || lowerQuestion.includes('difference')) {
    patterns.push('comparison', 'contrast', 'similarities');
  }
  if (lowerQuestion.includes('how') || lowerQuestion.includes('implement')) {
    patterns.push('steps', 'process', 'methodology');
  }
  if (lowerQuestion.includes('why') || lowerQuestion.includes('reason')) {
    patterns.push('justification', 'reasoning', 'cause-effect');
  }

  if (difficulty === 'hard' || difficulty === 'expert') {
    patterns.push('edge-cases', 'trade-offs', 'optimization');
  }

  return patterns.length > 0 ? patterns : ['general-answer'];
}

/**
 * Performs heuristic-based answer analysis when the AI detection service is unavailable.
 * Uses basic text metrics and patterns to estimate AI generation risk.
 * This is a degraded mode with lower confidence than full AI analysis.
 *
 * @param answerText - The interview answer text to analyze
 * @param questionText - The original question for context
 * @param responseTimeMs - Optional response time in milliseconds
 * @returns Analysis result with risk score, flags, and confidence indicators
 *
 * @remarks
 * The fallback analysis examines:
 * - Answer length (AI tends to produce longer answers)
 * - Response time vs complexity (fast + complex = suspicious)
 * - Sentence structure uniformity (AI has consistent patterns)
 * - Filler word ratio (human speech has more fillers)
 */
function performFallbackAnalysis(
  answerText: string,
  questionText: string,
  responseTimeMs?: number
): {
  riskScore: number;
  isAiGenerated: boolean;
  confidence: number;
  similarityScores: Record<string, number>;
  perplexityScore: number;
  flags: Array<{ type: string; severity: string; description: string }>;
} {
  const flags: Array<{ type: string; severity: string; description: string }> = [];
  let riskScore = 0.2; // Base risk score

  const wordCount = answerText.split(/\s+/).length;
  const sentenceCount = answerText.split(/[.!?]+/).filter(s => s.trim()).length;
  const avgWordsPerSentence = wordCount / Math.max(sentenceCount, 1);

  // Check for suspiciously long answers
  if (wordCount > 500) {
    riskScore += 0.15;
    flags.push({
      type: 'long_answer',
      severity: 'medium',
      description: 'Answer is unusually long for interview context',
    });
  }

  // Check for very fast response with long answer
  if (responseTimeMs && responseTimeMs < 10000 && wordCount > 200) {
    riskScore += 0.2;
    flags.push({
      type: 'fast_complex_response',
      severity: 'high',
      description: 'Complex answer provided very quickly',
    });
  }

  // Check for overly uniform sentence structure (AI characteristic)
  if (avgWordsPerSentence > 20 && avgWordsPerSentence < 25) {
    riskScore += 0.1;
  }

  // Check for lack of filler words (AI characteristic)
  const fillerRatio = calculateFillerRatio(answerText);
  if (fillerRatio < 0.01 && wordCount > 100) {
    riskScore += 0.1;
    flags.push({
      type: 'no_fillers',
      severity: 'low',
      description: 'Answer lacks natural speech patterns',
    });
  }

  riskScore = Math.min(riskScore, 1.0);

  return {
    riskScore,
    isAiGenerated: riskScore > 0.7,
    confidence: 0.6, // Lower confidence for fallback analysis
    similarityScores: {},
    perplexityScore: 0, // Cannot calculate without model
    flags,
  };
}

/**
 * Estimates the number of pauses in speech based on text patterns.
 * Looks for ellipses, dashes, and verbal pause indicators that may
 * appear in transcribed speech.
 *
 * @param text - The text (typically transcribed speech) to analyze
 * @returns Estimated count of pause occurrences
 *
 * @remarks
 * Pause patterns detected: "...", em-dashes, en-dashes, "um", "uh", "er", "hmm"
 * Higher pause counts indicate more natural human speech patterns.
 */
function estimatePauseCount(text: string): number {
  const pausePatterns = /\.\.\.|—|–|\bum\b|\buh\b|\ber\b|\bhmm\b/gi;
  const matches = text.match(pausePatterns);
  return matches ? matches.length : 0;
}

/**
 * Calculates the ratio of filler words to total words in text.
 * Filler words are common in natural human speech but rare in AI-generated content,
 * making this a useful heuristic for AI detection.
 *
 * @param text - The text to analyze for filler word frequency
 * @returns Ratio of filler words to total words (0.0 to 1.0)
 *
 * @example
 * calculateFillerRatio("I think, um, the answer is, like, basically correct")
 * // Returns approximately 0.22 (2 fillers / 9 words)
 *
 * @remarks
 * A typical human speaker has a filler ratio of 0.02-0.05.
 * AI-generated text typically has a filler ratio below 0.01.
 */
function calculateFillerRatio(text: string): number {
  const words = text.toLowerCase().split(/\s+/);

  let fillerCount = 0;
  for (const word of words) {
    if (FILLER_WORDS.includes(word)) {
      fillerCount++;
    }
  }

  return words.length > 0 ? fillerCount / words.length : 0;
}

/**
 * Updates the overall session risk score based on all answer analyses.
 * Uses a weighted combination of maximum and average scores to balance
 * single high-risk answers against overall patterns.
 *
 * @param sessionId - The interview session ID to update
 * @returns Promise that resolves when the update is complete
 *
 * @remarks
 * Formula: combinedScore = (maxScore * 0.6) + (avgScore * 0.4)
 * This weights individual high-risk answers more heavily while still
 * considering the overall pattern of responses.
 */
async function updateSessionRiskScore(sessionId: string): Promise<void> {
  const analyses = await prisma.answerAnalysis.findMany({
    where: {
      question: { sessionId },
    },
    select: { riskScore: true },
  });

  if (analyses.length === 0) return;

  // Calculate weighted average with more weight on higher scores
  const scores = analyses.map(a => Number(a.riskScore) || 0);
  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  // Combined score: 60% max score, 40% average
  const combinedScore = (maxScore * 0.6) + (avgScore * 0.4);

  await prisma.interviewSession.update({
    where: { id: sessionId },
    data: { riskScore: Math.min(combinedScore, 1.0) },
  });
}

/**
 * Generates actionable recommendations based on answer analysis results.
 * Provides guidance for interviewers on how to respond to various risk levels
 * and detected issues.
 *
 * @param analysis - The analysis result containing risk score, AI detection flag, and flags
 * @returns Array of recommendation strings for the interviewer
 *
 * @example
 * generateRecommendations({ riskScore: 0.8, isAiGenerated: true, flags: [] })
 * // Returns: [
 * //   "Review answer manually for AI-generated content",
 * //   "Consider asking follow-up questions to verify understanding",
 * //   "High risk score detected - recommend manual review"
 * // ]
 */
function generateRecommendations(analysis: {
  riskScore: number;
  isAiGenerated: boolean;
  flags: Array<{ type: string; severity: string; description: string }>;
}): string[] {
  const recommendations: string[] = [];

  if (analysis.isAiGenerated) {
    recommendations.push('Review answer manually for AI-generated content');
    recommendations.push('Consider asking follow-up questions to verify understanding');
  }

  if (analysis.riskScore > 0.7) {
    recommendations.push('High risk score detected - recommend manual review');
  } else if (analysis.riskScore > 0.5) {
    recommendations.push('Moderate risk score - monitor subsequent answers');
  }

  const highSeverityFlags = analysis.flags.filter(f => f.severity === 'high');
  if (highSeverityFlags.length > 0) {
    recommendations.push('Address high-severity flags before proceeding');
  }

  if (analysis.flags.some(f => f.type === 'fast_complex_response')) {
    recommendations.push('Verify candidate understanding with clarifying questions');
  }

  return recommendations;
}
