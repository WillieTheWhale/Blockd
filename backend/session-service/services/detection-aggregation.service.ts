/**
 * Detection Aggregation Service
 *
 * This service aggregates detection results from all three detection services:
 * - AI Detection Service (similarity scores, perplexity, XGBoost predictions)
 * - Eye Tracking Service (gaze analysis, off-screen detection, anomalies)
 * - Response Timing Service (speech metrics, pause analysis, filler detection)
 *
 * It provides a unified interface for calculating overall session risk scores
 * and generating comprehensive detection reports.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { Logger } from '../lib/logger';
import { RiskCalculator, RiskFactors, RiskLevel, SecurityEventData } from '../lib/risk-calculator';
import {
  RiskAnalysis,
  GazeAnalysisSummary,
  TimingAnalysisSummary,
} from '../types/report.types';

const logger = new Logger('DetectionAggregationService');

// =============================================================================
// Configuration
// =============================================================================

interface DetectionServiceConfig {
  aiDetection: {
    baseUrl: string;
    timeout: number;
  };
  eyeTracking: {
    baseUrl: string;
    timeout: number;
  };
  responseTiming: {
    baseUrl: string;
    timeout: number;
  };
}

const defaultConfig: DetectionServiceConfig = {
  aiDetection: {
    baseUrl: process.env.AI_DETECTION_SERVICE_URL || 'http://ai-detection:8001',
    timeout: 30000,
  },
  eyeTracking: {
    baseUrl: process.env.EYE_TRACKING_SERVICE_URL || 'http://eye-tracking:8002',
    timeout: 10000,
  },
  responseTiming: {
    baseUrl: process.env.RESPONSE_TIMING_SERVICE_URL || 'http://response-timing:8003',
    timeout: 30000,
  },
};

// =============================================================================
// Type Definitions
// =============================================================================

/** Input for AI detection analysis */
export interface AIDetectionInput {
  questionId: string;
  questionText: string;
  answerText: string;
  audioUrl?: string;
  responseTimeMs?: number;
}

/** Response from AI detection service */
export interface AIDetectionResponse {
  analysisId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  similarityScores: Record<string, number>;
  perplexityScore: number;
  isAiGenerated: boolean;
  confidenceScore: number;
  ngramOverlap?: {
    unigram: number;
    bigram: number;
    trigram: number;
  };
  stylometricAnalysis?: {
    vocabularyRichness: number;
    avgSentenceLength: number;
    punctuationRatio: number;
  };
  flags: string[];
}

/** Input for eye tracking analysis */
export interface EyeTrackingInput {
  sessionId: string;
  startTime?: Date;
  endTime?: Date;
}

/** Response from eye tracking service */
export interface EyeTrackingResponse {
  sessionId: string;
  totalGazeEvents: number;
  offScreenEvents: number;
  offScreenPercentage: number;
  offScreenDurationSeconds: number;
  offScreenByDirection: {
    left: number;
    right: number;
    up: number;
    down: number;
  };
  patternsDetected: {
    reading: boolean;
    drift: boolean;
    shiftyEyes: boolean;
  };
  anomalies: Array<{
    type: string;
    score: number;
    timestamp: string;
    description: string;
  }>;
  riskScore: number;
  averageConfidence: number;
}

/** Input for response timing analysis */
export interface ResponseTimingInput {
  sessionId: string;
  answerId?: string;
  audioUrl?: string;
  questionAskedAt?: Date;
  answerStartedAt?: Date;
}

/** Response from response timing service */
export interface ResponseTimingResponse {
  analysisId: string;
  sessionId: string;
  transcription?: string;
  metrics: {
    latencyMs: number;
    wordsPerMinute: number;
    pauseCount: number;
    pauseDurationAvgMs: number;
    fillerWordCount: number;
    fillerWordRatio: number;
    speechDurationMs: number;
    totalDurationMs: number;
  };
  anomalies: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    score: number;
  }>;
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
}

/** Aggregated detection result for a session */
export interface AggregatedDetectionResult {
  sessionId: string;
  calculatedAt: string;

  // Overall risk
  overallRiskScore: number;
  overallRiskLevel: RiskLevel;

  // Component scores
  aiDetectionScore: number;
  gazeAnomalyScore: number;
  timingAnomalyScore: number;
  securityEventsScore: number;

  // Weights used
  weights: {
    aiDetection: number;
    securityEvents: number;
    gazeAnomaly: number;
    timingAnomaly: number;
  };

  // Detailed results from each service
  aiDetection?: AIDetectionResponse[];
  eyeTracking?: EyeTrackingResponse;
  responseTiming?: ResponseTimingResponse[];

  // Aggregated flags
  allFlags: string[];

  // Confidence in the overall assessment
  confidence: number;

  // Service availability status
  serviceStatus: {
    aiDetection: 'available' | 'unavailable' | 'partial';
    eyeTracking: 'available' | 'unavailable' | 'partial';
    responseTiming: 'available' | 'unavailable' | 'partial';
  };

  // Processing metadata
  processingTimeMs: number;
  errors: string[];
}

/** Answer-level detection result */
export interface AnswerDetectionResult {
  answerId: string;
  questionId: string;

  // AI detection
  aiSimilarityScores: Record<string, number>;
  maxAiSimilarity: number;
  perplexityScore: number;
  isAiGenerated: boolean;
  aiConfidence: number;

  // Timing
  responseLatencyMs: number;
  wordsPerMinute: number;
  pauseCount: number;
  fillerWordRatio: number;

  // Combined risk
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
}

// =============================================================================
// Detection Aggregation Service
// =============================================================================

export class DetectionAggregationService {
  private config: DetectionServiceConfig;
  private riskCalculator: RiskCalculator;

  // HTTP clients for each service
  private aiDetectionClient: AxiosInstance;
  private eyeTrackingClient: AxiosInstance;
  private responseTimingClient: AxiosInstance;

  constructor(
    config: Partial<DetectionServiceConfig> = {},
    riskCalculator?: RiskCalculator
  ) {
    this.config = { ...defaultConfig, ...config };
    this.riskCalculator = riskCalculator || new RiskCalculator();

    // Initialize HTTP clients
    this.aiDetectionClient = axios.create({
      baseURL: this.config.aiDetection.baseUrl,
      timeout: this.config.aiDetection.timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    this.eyeTrackingClient = axios.create({
      baseURL: this.config.eyeTracking.baseUrl,
      timeout: this.config.eyeTracking.timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    this.responseTimingClient = axios.create({
      baseURL: this.config.responseTiming.baseUrl,
      timeout: this.config.responseTiming.timeout,
      headers: { 'Content-Type': 'application/json' },
    });

    logger.info('DetectionAggregationService initialized', {
      aiDetectionUrl: this.config.aiDetection.baseUrl,
      eyeTrackingUrl: this.config.eyeTracking.baseUrl,
      responseTimingUrl: this.config.responseTiming.baseUrl,
    });
  }

  // ===========================================================================
  // Main Aggregation Methods
  // ===========================================================================

  /**
   * Calculate comprehensive risk for an entire session.
   *
   * Aggregates results from all detection services and calculates
   * an overall risk score using weighted averaging.
   */
  async calculateSessionRisk(
    sessionId: string,
    answers: AIDetectionInput[],
    securityEvents: SecurityEventData[] = [],
    options: {
      includeGazeAnalysis?: boolean;
      includeTimingAnalysis?: boolean;
    } = {}
  ): Promise<AggregatedDetectionResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    const result: AggregatedDetectionResult = {
      sessionId,
      calculatedAt: new Date().toISOString(),
      overallRiskScore: 0,
      overallRiskLevel: 'low',
      aiDetectionScore: 0,
      gazeAnomalyScore: 0,
      timingAnomalyScore: 0,
      securityEventsScore: 0,
      weights: {
        aiDetection: 0.4,
        securityEvents: 0.3,
        gazeAnomaly: 0.2,
        timingAnomaly: 0.1,
      },
      allFlags: [],
      confidence: 0,
      serviceStatus: {
        aiDetection: 'unavailable',
        eyeTracking: 'unavailable',
        responseTiming: 'unavailable',
      },
      processingTimeMs: 0,
      errors: [],
    };

    try {
      // Run all detection services in parallel
      const [aiResults, gazeResult, timingResults] = await Promise.all([
        // AI Detection for all answers
        this.analyzeAllAnswers(answers).catch((err) => {
          errors.push(`AI Detection: ${err.message}`);
          return [] as AIDetectionResponse[];
        }),

        // Eye tracking analysis (if enabled)
        options.includeGazeAnalysis !== false
          ? this.getGazeAnalysis(sessionId).catch((err) => {
              errors.push(`Eye Tracking: ${err.message}`);
              return null;
            })
          : Promise.resolve(null),

        // Response timing analysis (if enabled)
        options.includeTimingAnalysis !== false
          ? this.analyzeAllTiming(sessionId, answers).catch((err) => {
              errors.push(`Response Timing: ${err.message}`);
              return [] as ResponseTimingResponse[];
            })
          : Promise.resolve([]),
      ]);

      // Update service status
      result.serviceStatus.aiDetection = aiResults.length > 0 ? 'available' : 'unavailable';
      result.serviceStatus.eyeTracking = gazeResult ? 'available' : 'unavailable';
      result.serviceStatus.responseTiming = timingResults.length > 0 ? 'available' : 'unavailable';

      // Store detailed results
      result.aiDetection = aiResults;
      result.eyeTracking = gazeResult || undefined;
      result.responseTiming = timingResults;

      // Calculate component scores
      result.aiDetectionScore = this.calculateAggregateAIScore(aiResults);
      result.securityEventsScore = this.riskCalculator.calculateSecurityEventsScore(securityEvents);
      result.gazeAnomalyScore = gazeResult?.riskScore || 0;
      result.timingAnomalyScore = this.calculateAggregateTimingScore(timingResults);

      // Calculate overall risk
      const riskFactors: RiskFactors = {
        ai_detection_score: result.aiDetectionScore,
        security_events_score: result.securityEventsScore,
        gaze_anomaly_score: result.gazeAnomalyScore,
        timing_anomaly_score: result.timingAnomalyScore,
      };

      result.overallRiskScore = this.riskCalculator.calculateOverallRisk(riskFactors);
      result.overallRiskLevel = this.riskCalculator.getRiskLevel(result.overallRiskScore);

      // Aggregate flags
      result.allFlags = this.aggregateFlags(aiResults, gazeResult, timingResults);

      // Calculate confidence (based on service availability and data quality)
      result.confidence = this.calculateConfidence(result);

      result.errors = errors;
      result.processingTimeMs = Date.now() - startTime;

      logger.info('Session risk calculated', {
        sessionId,
        overallRiskScore: result.overallRiskScore,
        overallRiskLevel: result.overallRiskLevel,
        processingTimeMs: result.processingTimeMs,
        servicesAvailable: Object.entries(result.serviceStatus)
          .filter(([, status]) => status === 'available')
          .map(([name]) => name),
      });

      return result;
    } catch (error) {
      logger.error('Failed to calculate session risk', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      result.errors = [...errors, `Overall: ${error instanceof Error ? error.message : 'Unknown error'}`];
      result.processingTimeMs = Date.now() - startTime;

      return result;
    }
  }

  /**
   * Analyze a single answer for AI generation.
   */
  async analyzeAnswer(input: AIDetectionInput): Promise<AIDetectionResponse> {
    try {
      const response = await this.aiDetectionClient.post<AIDetectionResponse>(
        '/api/v1/analysis/answer',
        {
          question_id: input.questionId,
          question_text: input.questionText,
          answer_text: input.answerText,
          audio_url: input.audioUrl,
          response_time_ms: input.responseTimeMs,
        }
      );

      return response.data;
    } catch (error) {
      logger.error('AI detection analysis failed', {
        questionId: input.questionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleServiceError(error, 'AI Detection');
    }
  }

  /**
   * Analyze all answers in parallel.
   */
  async analyzeAllAnswers(inputs: AIDetectionInput[]): Promise<AIDetectionResponse[]> {
    if (inputs.length === 0) return [];

    const results = await Promise.allSettled(
      inputs.map((input) => this.analyzeAnswer(input))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<AIDetectionResponse> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /**
   * Get gaze analysis for a session.
   */
  async getGazeAnalysis(sessionId: string): Promise<EyeTrackingResponse> {
    try {
      const response = await this.eyeTrackingClient.get<EyeTrackingResponse>(
        `/api/v1/gaze/summary/${sessionId}`
      );

      return response.data;
    } catch (error) {
      logger.error('Eye tracking analysis failed', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleServiceError(error, 'Eye Tracking');
    }
  }

  /**
   * Analyze timing for a single answer.
   */
  async analyzeAnswerTiming(input: ResponseTimingInput): Promise<ResponseTimingResponse> {
    try {
      const response = await this.responseTimingClient.post<ResponseTimingResponse>(
        '/api/v1/timing/analyze',
        {
          session_id: input.sessionId,
          answer_id: input.answerId,
          audio_url: input.audioUrl,
          question_asked_at: input.questionAskedAt?.toISOString(),
          answer_started_at: input.answerStartedAt?.toISOString(),
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Response timing analysis failed', {
        sessionId: input.sessionId,
        answerId: input.answerId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw this.handleServiceError(error, 'Response Timing');
    }
  }

  /**
   * Analyze timing for all answers.
   */
  async analyzeAllTiming(
    sessionId: string,
    answers: AIDetectionInput[]
  ): Promise<ResponseTimingResponse[]> {
    // Try to get batch analysis first
    try {
      const response = await this.responseTimingClient.get<ResponseTimingResponse[]>(
        `/api/v1/timing/session/${sessionId}`
      );
      return response.data;
    } catch {
      // Fallback to individual analysis
      const results = await Promise.allSettled(
        answers
          .filter((a) => a.audioUrl)
          .map((a) =>
            this.analyzeAnswerTiming({
              sessionId,
              answerId: a.questionId,
              audioUrl: a.audioUrl,
            })
          )
      );

      return results
        .filter((r): r is PromiseFulfilledResult<ResponseTimingResponse> => r.status === 'fulfilled')
        .map((r) => r.value);
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Calculate aggregate AI detection score from multiple answers.
   */
  private calculateAggregateAIScore(results: AIDetectionResponse[]): number {
    if (results.length === 0) return 0;

    // Use the maximum risk score across all answers
    const maxRiskScore = Math.max(...results.map((r) => r.riskScore));

    // Also consider the average
    const avgRiskScore = results.reduce((sum, r) => sum + r.riskScore, 0) / results.length;

    // Weighted combination (max is more important)
    return maxRiskScore * 0.7 + avgRiskScore * 0.3;
  }

  /**
   * Calculate aggregate timing score from multiple answers.
   */
  private calculateAggregateTimingScore(results: ResponseTimingResponse[]): number {
    if (results.length === 0) return 0;

    // Use the maximum risk score
    const maxRiskScore = Math.max(...results.map((r) => r.riskScore));

    // Count anomalies
    const totalAnomalies = results.reduce((sum, r) => sum + r.anomalies.length, 0);
    const anomalyFactor = Math.min(1, totalAnomalies / 10); // Cap at 10 anomalies

    // Combine max score with anomaly factor
    return maxRiskScore * 0.8 + anomalyFactor * 0.2;
  }

  /**
   * Aggregate flags from all detection services.
   */
  private aggregateFlags(
    aiResults: AIDetectionResponse[],
    gazeResult: EyeTrackingResponse | null,
    timingResults: ResponseTimingResponse[]
  ): string[] {
    const flags = new Set<string>();

    // AI detection flags
    for (const result of aiResults) {
      result.flags.forEach((f) => flags.add(`AI: ${f}`));
    }

    // Gaze flags
    if (gazeResult) {
      if (gazeResult.patternsDetected.reading) {
        flags.add('GAZE: Reading pattern detected');
      }
      if (gazeResult.patternsDetected.drift) {
        flags.add('GAZE: Attention drift detected');
      }
      if (gazeResult.patternsDetected.shiftyEyes) {
        flags.add('GAZE: Shifty eyes pattern detected');
      }
      gazeResult.anomalies.forEach((a) => flags.add(`GAZE: ${a.description}`));
    }

    // Timing flags
    for (const result of timingResults) {
      result.flags.forEach((f) => flags.add(`TIMING: ${f}`));
    }

    return Array.from(flags);
  }

  /**
   * Calculate confidence in the overall assessment.
   */
  private calculateConfidence(result: AggregatedDetectionResult): number {
    let confidence = 0;
    let totalWeight = 0;

    // Weight by service availability
    if (result.serviceStatus.aiDetection === 'available') {
      confidence += 0.4;
      totalWeight += 0.4;
    }

    if (result.serviceStatus.eyeTracking === 'available') {
      confidence += 0.2;
      totalWeight += 0.2;
    }

    if (result.serviceStatus.responseTiming === 'available') {
      confidence += 0.1;
      totalWeight += 0.1;
    }

    // Always count security events
    confidence += 0.3;
    totalWeight += 0.3;

    // Normalize
    if (totalWeight === 0) return 0;

    // Penalize for errors
    const errorPenalty = Math.min(0.3, result.errors.length * 0.1);

    return Math.max(0, (confidence / totalWeight) - errorPenalty);
  }

  /**
   * Handle service errors uniformly.
   */
  private handleServiceError(error: unknown, serviceName: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        return new Error(
          `${serviceName} service returned ${axiosError.response.status}: ${JSON.stringify(axiosError.response.data)}`
        );
      } else if (axiosError.request) {
        return new Error(`${serviceName} service unavailable: No response received`);
      }
    }

    return error instanceof Error
      ? error
      : new Error(`${serviceName} service error: ${String(error)}`);
  }

  // ===========================================================================
  // Conversion Methods
  // ===========================================================================

  /**
   * Convert eye tracking response to gaze analysis summary.
   */
  toGazeAnalysisSummary(response: EyeTrackingResponse): GazeAnalysisSummary {
    return {
      total_gaze_events: response.totalGazeEvents,
      off_screen_events: response.offScreenEvents,
      off_screen_percentage: response.offScreenPercentage,
      off_screen_duration_seconds: response.offScreenDurationSeconds,
      off_screen_by_direction: response.offScreenByDirection,
      anomaly_score: response.riskScore,
      suspicious_patterns: [
        ...(response.patternsDetected.reading ? ['Reading pattern detected'] : []),
        ...(response.patternsDetected.drift ? ['Attention drift detected'] : []),
        ...(response.patternsDetected.shiftyEyes ? ['Shifty eyes detected'] : []),
        ...response.anomalies.map((a) => a.description),
      ],
    };
  }

  /**
   * Convert timing responses to timing analysis summary.
   */
  toTimingAnalysisSummary(responses: ResponseTimingResponse[]): TimingAnalysisSummary {
    if (responses.length === 0) {
      return {
        total_answers: 0,
        avg_response_latency_ms: 0,
        avg_words_per_minute: 0,
        avg_pause_count: 0,
        avg_filler_ratio: 0,
        anomaly_score: 0,
        unusually_fast_responses: 0,
        unusually_slow_responses: 0,
        suspicious_patterns: [],
      };
    }

    const totalAnswers = responses.length;
    const avgLatency = responses.reduce((sum, r) => sum + r.metrics.latencyMs, 0) / totalAnswers;
    const avgWpm = responses.reduce((sum, r) => sum + r.metrics.wordsPerMinute, 0) / totalAnswers;
    const avgPauses = responses.reduce((sum, r) => sum + r.metrics.pauseCount, 0) / totalAnswers;
    const avgFillers = responses.reduce((sum, r) => sum + r.metrics.fillerWordRatio, 0) / totalAnswers;

    // Count fast/slow responses
    const fastResponses = responses.filter((r) => r.metrics.latencyMs < 500).length;
    const slowResponses = responses.filter((r) => r.metrics.latencyMs > 30000).length;

    // Collect all suspicious patterns
    const patterns = new Set<string>();
    for (const r of responses) {
      r.flags.forEach((f) => patterns.add(f));
    }

    return {
      total_answers: totalAnswers,
      avg_response_latency_ms: avgLatency,
      avg_words_per_minute: avgWpm,
      avg_pause_count: avgPauses,
      avg_filler_ratio: avgFillers,
      anomaly_score: this.calculateAggregateTimingScore(responses),
      unusually_fast_responses: fastResponses,
      unusually_slow_responses: slowResponses,
      suspicious_patterns: Array.from(patterns),
    };
  }

  /**
   * Convert aggregated result to risk analysis for reports.
   */
  toRiskAnalysis(
    result: AggregatedDetectionResult,
    flaggedAnswers: string[] = []
  ): RiskAnalysis {
    return {
      overall_risk_score: result.overallRiskScore,
      risk_level: result.overallRiskLevel,
      ai_detection_score: result.aiDetectionScore,
      security_events_score: result.securityEventsScore,
      gaze_anomaly_score: result.gazeAnomalyScore,
      timing_anomaly_score: result.timingAnomalyScore,
      weights: {
        ai_detection: result.weights.aiDetection,
        security_events: result.weights.securityEvents,
        gaze_anomaly: result.weights.gazeAnomaly,
        timing_anomaly: result.weights.timingAnomaly,
      },
      flagged_answers: flaggedAnswers,
      flagged_behaviors: result.allFlags,
    };
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  /**
   * Check health of all detection services.
   */
  async checkServicesHealth(): Promise<{
    aiDetection: { healthy: boolean; latencyMs?: number; error?: string };
    eyeTracking: { healthy: boolean; latencyMs?: number; error?: string };
    responseTiming: { healthy: boolean; latencyMs?: number; error?: string };
  }> {
    const checkService = async (
      client: AxiosInstance,
      name: string
    ): Promise<{ healthy: boolean; latencyMs?: number; error?: string }> => {
      const start = Date.now();
      try {
        await client.get('/health');
        return { healthy: true, latencyMs: Date.now() - start };
      } catch (error) {
        return {
          healthy: false,
          latencyMs: Date.now() - start,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    };

    const [aiDetection, eyeTracking, responseTiming] = await Promise.all([
      checkService(this.aiDetectionClient, 'AI Detection'),
      checkService(this.eyeTrackingClient, 'Eye Tracking'),
      checkService(this.responseTimingClient, 'Response Timing'),
    ]);

    return { aiDetection, eyeTracking, responseTiming };
  }
}

// Export singleton instance
export const detectionAggregationService = new DetectionAggregationService();
