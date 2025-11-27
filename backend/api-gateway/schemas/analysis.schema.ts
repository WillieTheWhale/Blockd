/**
 * AI Analysis Validation Schemas
 */

import { z } from 'zod';
import { uuidSchema } from './common.schema.js';

// Question difficulty enum
export const questionDifficultySchema = z.enum(['easy', 'medium', 'hard', 'expert']);

export type QuestionDifficulty = z.infer<typeof questionDifficultySchema>;

// AI model name enum
export const aiModelNameSchema = z.enum([
  'gpt-4',
  'gpt-3.5-turbo',
  'claude-3-opus',
  'claude-3-sonnet',
  'gemini-pro',
  'llama-2',
]);

export type AiModelName = z.infer<typeof aiModelNameSchema>;

// Analyze question request schema
export const analyzeQuestionRequestSchema = z.object({
  sessionId: uuidSchema,
  questionText: z.string().min(1).max(5000),
  difficulty: questionDifficultySchema.optional(),
  expectedDuration: z.number().int().min(1).max(3600).optional(), // in seconds
  models: z.array(aiModelNameSchema).optional(),
});

export type AnalyzeQuestionRequest = z.infer<typeof analyzeQuestionRequestSchema>;

// Analyze answer request schema
export const analyzeAnswerRequestSchema = z.object({
  questionId: uuidSchema,
  answerText: z.string().min(1).max(10000),
  answerAudioUrl: z.string().url().optional(),
  transcriptionText: z.string().max(10000).optional(),
  responseTime: z.number().int().min(0).optional(), // in milliseconds
});

export type AnalyzeAnswerRequest = z.infer<typeof analyzeAnswerRequestSchema>;

// Question analysis response schema
export const questionAnalysisResponseSchema = z.object({
  questionId: uuidSchema,
  questionText: z.string(),
  difficulty: questionDifficultySchema.nullable(),
  aiAnswers: z.array(z.object({
    model: aiModelNameSchema,
    answer: z.string(),
    confidence: z.number().min(0).max(1),
    perplexity: z.number().optional(),
  })),
  expectedAnswerPatterns: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

export type QuestionAnalysisResponse = z.infer<typeof questionAnalysisResponseSchema>;

// Answer analysis response schema
export const answerAnalysisResponseSchema = z.object({
  analysisId: uuidSchema,
  questionId: uuidSchema,
  riskScore: z.number().min(0).max(1),
  isAiGenerated: z.boolean(),
  confidence: z.number().min(0).max(1),
  similarityScores: z.record(z.number()),
  responseTiming: z.object({
    latencyMs: z.number(),
    wordsPerMinute: z.number().optional(),
    pauseCount: z.number().optional(),
    fillerRatio: z.number().optional(),
  }).optional(),
  perplexityScore: z.number().optional(),
  flags: z.array(z.object({
    type: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    description: z.string(),
  })).optional(),
  recommendations: z.array(z.string()).optional(),
});

export type AnswerAnalysisResponse = z.infer<typeof answerAnalysisResponseSchema>;
