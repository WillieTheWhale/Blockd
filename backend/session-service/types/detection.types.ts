/**
 * Detection Service Integration Types
 *
 * Provides type-safe contracts between the session-service and
 * Python detection services (AI Detection, Eye Tracking, Response Timing).
 *
 * These types handle the snake_case <-> camelCase conversion boundary
 * between Python (snake_case) and TypeScript (camelCase) services.
 */

import { RiskLevel } from '../lib/risk-calculator';

// =============================================================================
// Detection Result Wrapper
// =============================================================================

/**
 * Unified detection result that combines live and cached data.
 * Wraps any detection data with metadata about its source.
 */
export interface DetectionResult<T> {
  /** The detection data */
  data: T;
  /** Where this data came from */
  source: 'live' | 'cached' | 'fallback';
  /** When this result was generated */
  timestamp: string;
  /** Confidence in the result (0-1) */
  confidence: number;
  /** Error message if using fallback */
  error?: string;
}

/**
 * Detection service availability status
 */
export type ServiceAvailability = 'available' | 'unavailable' | 'partial' | 'degraded';

// =============================================================================
// Live Detection Input Types (camelCase for TypeScript)
// =============================================================================

/**
 * Input for analyzing a single answer
 */
export interface LiveAnswerDetectionInput {
  questionId: string;
  questionText: string;
  answerText: string;
  audioUrl?: string;
  responseTimeMs?: number;
}

/**
 * Input for session-level detection
 */
export interface LiveSessionDetectionInput {
  sessionId: string;
  answers: LiveAnswerDetectionInput[];
  securityEvents: SecurityEventInput[];
  includeGazeAnalysis?: boolean;
  includeTimingAnalysis?: boolean;
}

/**
 * Security event input for risk calculation
 */
export interface SecurityEventInput {
  severity: 'low' | 'medium' | 'high' | 'critical';
  count: number;
}

// =============================================================================
// Live Detection Output Types (camelCase, transformed from Python snake_case)
// =============================================================================

/**
 * Aggregated detection result from all services
 */
export interface LiveDetectionResult {
  sessionId: string;
  calculatedAt: string;

  // Risk scores (0-1)
  overallRiskScore: number;
  overallRiskLevel: RiskLevel;
  aiDetectionScore: number;
  gazeAnomalyScore: number;
  timingAnomalyScore: number;
  securityEventsScore: number;

  // Weights used for aggregation
  weights: DetectionWeights;

  // Service status
  serviceStatus: ServiceStatusMap;

  // Detailed results from each service
  aiDetection?: AIDetectionResult[];
  eyeTracking?: EyeTrackingResult;
  responseTiming?: ResponseTimingResult[];

  // Aggregated flags from all services
  allFlags: string[];

  // Confidence in overall assessment (0-1)
  confidence: number;

  // Processing metadata
  processingTimeMs: number;
  errors: string[];
}

/**
 * Detection weight configuration
 */
export interface DetectionWeights {
  aiDetection: number;
  securityEvents: number;
  gazeAnomaly: number;
  timingAnomaly: number;
}

/**
 * Service status map
 */
export interface ServiceStatusMap {
  aiDetection: ServiceAvailability;
  eyeTracking: ServiceAvailability;
  responseTiming: ServiceAvailability;
}

// =============================================================================
// AI Detection Types
// =============================================================================

/**
 * Result from AI Detection service
 */
export interface AIDetectionResult {
  analysisId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  similarityScores: Record<string, number>;
  perplexityScore: number;
  isAiGenerated: boolean;
  confidenceScore: number;
  ngramOverlap?: NgramOverlap;
  stylometricAnalysis?: StylometricAnalysis;
  flags: string[];
  recommendation?: string;
}

/**
 * N-gram overlap scores
 */
export interface NgramOverlap {
  unigram?: number;
  bigram?: number;
  trigram: number;
  fourgram: number;
}

/**
 * Stylometric analysis results
 */
export interface StylometricAnalysis {
  vocabularyRichness: number;
  avgSentenceLength: number;
  punctuationDensity?: number;
  punctuationRatio?: number;
  capitalizationRatio?: number;
  fillerWordRatio?: number;
}

// =============================================================================
// Eye Tracking Types
// =============================================================================

/**
 * Result from Eye Tracking service
 */
export interface EyeTrackingResult {
  sessionId: string;
  totalGazeEvents: number;
  offScreenEvents: number;
  offScreenPercentage: number;
  offScreenDurationSeconds: number;
  offScreenByDirection: DirectionCounts;
  patternsDetected: PatternsDetected;
  anomalies: GazeAnomaly[];
  riskScore: number;
  averageConfidence: number;
  totalDurationSeconds?: number;
  onScreenPercentage?: number;
  heatmapUrl?: string;
  riskFactors?: RiskFactor[];
  statistics?: GazeStatistics;
}

/**
 * Direction counts for off-screen events
 */
export interface DirectionCounts {
  left: number;
  right: number;
  up: number;
  down: number;
}

/**
 * Detected gaze patterns
 */
export interface PatternsDetected {
  reading: boolean;
  drift: boolean;
  shiftyEyes: boolean;
  attentionDrift?: boolean;
}

/**
 * Gaze anomaly
 */
export interface GazeAnomaly {
  type: string;
  score: number;
  timestamp: string;
  description: string;
  severity?: string;
}

/**
 * Risk factor from eye tracking
 */
export interface RiskFactor {
  factor: string;
  severity: string;
  description: string;
  weight: number;
}

/**
 * Gaze statistics
 */
export interface GazeStatistics {
  totalGazePoints: number;
  onScreenPoints: number;
  offScreenPoints: number;
  numOffScreenEvents: number;
  numAnomalies: number;
}

// =============================================================================
// Response Timing Types
// =============================================================================

/**
 * Result from Response Timing service
 */
export interface ResponseTimingResult {
  analysisId: string;
  sessionId: string;
  transcription?: TranscriptionResult;
  metrics: TimingMetrics;
  anomalies: TimingAnomaly[];
  riskScore: number;
  riskLevel: RiskLevel;
  flags: string[];
  recommendation?: string;
}

/**
 * Transcription result
 */
export interface TranscriptionResult {
  text: string;
  confidence: number;
  words?: WordTimestamp[];
}

/**
 * Word timestamp from transcription
 */
export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

/**
 * Timing metrics
 */
export interface TimingMetrics {
  latencyMs: number;
  responseLatencyMs?: number;
  wordsPerMinute: number;
  speechRateWpm?: number;
  pauseCount: number;
  pauseDurationAvgMs: number;
  avgPauseDurationSeconds?: number;
  pausePercentage?: number;
  fillerWordCount: number;
  fillerWordRatio: number;
  speechDurationMs: number;
  speechDurationSeconds?: number;
  totalDurationMs: number;
  totalDurationSeconds?: number;
}

/**
 * Timing anomaly
 */
export interface TimingAnomaly {
  type: TimingAnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  score: number;
}

/**
 * Timing anomaly types
 */
export type TimingAnomalyType =
  | 'instant_response'
  | 'unnatural_consistency'
  | 'delayed_then_fluent'
  | 'robotic_speech_pattern';

/**
 * Boolean flags for timing anomalies (from Python service)
 */
export interface TimingAnomalyFlags {
  instantResponse: boolean;
  unnaturalConsistency: boolean;
  delayedThenFluent: boolean;
  roboticSpeechPattern: boolean;
}

// =============================================================================
// Detection Error Types
// =============================================================================

/**
 * Base error for detection service failures
 */
export class DetectionServiceError extends Error {
  constructor(
    message: string,
    public service: 'ai-detection' | 'eye-tracking' | 'response-timing' | 'aggregation',
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'DetectionServiceError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      service: this.service,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Error when detection service times out
 */
export class DetectionTimeoutError extends DetectionServiceError {
  constructor(
    service: 'ai-detection' | 'eye-tracking' | 'response-timing' | 'aggregation',
    timeoutMs: number
  ) {
    super(`Detection service timeout after ${timeoutMs}ms`, service, 408);
    this.name = 'DetectionTimeoutError';
  }
}

/**
 * Error when detection service is unavailable
 */
export class DetectionUnavailableError extends DetectionServiceError {
  constructor(
    service: 'ai-detection' | 'eye-tracking' | 'response-timing' | 'aggregation',
    reason?: string
  ) {
    super(`Detection service unavailable${reason ? `: ${reason}` : ''}`, service, 503);
    this.name = 'DetectionUnavailableError';
  }
}

/**
 * Error when detection response is invalid
 */
export class DetectionValidationError extends DetectionServiceError {
  constructor(
    service: 'ai-detection' | 'eye-tracking' | 'response-timing' | 'aggregation',
    details: string
  ) {
    super(`Invalid detection response: ${details}`, service, 422);
    this.name = 'DetectionValidationError';
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for LiveDetectionResult
 */
export function isLiveDetectionResult(obj: unknown): obj is LiveDetectionResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'sessionId' in obj &&
    'overallRiskScore' in obj &&
    'serviceStatus' in obj
  );
}

/**
 * Type guard for AIDetectionResult
 */
export function isAIDetectionResult(obj: unknown): obj is AIDetectionResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'analysisId' in obj &&
    'riskScore' in obj &&
    'similarityScores' in obj
  );
}

/**
 * Type guard for EyeTrackingResult
 */
export function isEyeTrackingResult(obj: unknown): obj is EyeTrackingResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'sessionId' in obj &&
    'offScreenPercentage' in obj &&
    'patternsDetected' in obj
  );
}

/**
 * Type guard for ResponseTimingResult
 */
export function isResponseTimingResult(obj: unknown): obj is ResponseTimingResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'analysisId' in obj &&
    'metrics' in obj &&
    'riskScore' in obj
  );
}
