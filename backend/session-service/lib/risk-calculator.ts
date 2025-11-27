import { SeverityLevel } from '@prisma/client';
import { RiskCalculationConfig } from '../types/report.types';

/**
 * Risk Calculator
 * Calculates overall session risk score based on multiple factors
 */

// Default configuration
const DEFAULT_CONFIG: RiskCalculationConfig = {
  weights: {
    ai_detection: 0.40, // 40% weight
    security_events: 0.30, // 30% weight
    gaze_anomaly: 0.20, // 20% weight
    timing_anomaly: 0.10, // 10% weight
  },
  thresholds: {
    low: 0.50,
    medium: 0.75,
    high: 0.90,
  },
  severity_multipliers: {
    low: 1.0,
    medium: 1.5,
    high: 2.0,
    critical: 3.0,
  },
};

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactors {
  ai_detection_score: number; // 0-1
  security_events_score: number; // 0-1
  gaze_anomaly_score: number; // 0-1
  timing_anomaly_score: number; // 0-1
}

export interface SecurityEventData {
  severity: SeverityLevel;
  count: number;
}

export class RiskCalculator {
  private config: RiskCalculationConfig;

  constructor(config?: Partial<RiskCalculationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Calculate overall risk score
   */
  calculateOverallRisk(factors: RiskFactors): number {
    const { weights } = this.config;

    // Weighted average
    const overallScore =
      factors.ai_detection_score * weights.ai_detection +
      factors.security_events_score * weights.security_events +
      factors.gaze_anomaly_score * weights.gaze_anomaly +
      factors.timing_anomaly_score * weights.timing_anomaly;

    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, overallScore));
  }

  /**
   * Determine risk level from score
   */
  getRiskLevel(score: number): RiskLevel {
    const { thresholds } = this.config;

    if (score >= thresholds.high) return 'critical';
    if (score >= thresholds.medium) return 'high';
    if (score >= thresholds.low) return 'medium';
    return 'low';
  }

  /**
   * Calculate security events score based on count and severity
   */
  calculateSecurityEventsScore(events: SecurityEventData[]): number {
    if (events.length === 0) return 0;

    const { severity_multipliers } = this.config;

    // Calculate weighted sum
    const weightedSum = events.reduce((sum, event) => {
      const multiplier = severity_multipliers[event.severity];
      return sum + event.count * multiplier;
    }, 0);

    // Normalize to 0-1 scale (assuming max of 10 critical events = 1.0)
    const maxPossibleScore = 10 * severity_multipliers.critical;
    const normalizedScore = Math.min(1, weightedSum / maxPossibleScore);

    return normalizedScore;
  }

  /**
   * Calculate AI detection score from similarity scores
   */
  calculateAIDetectionScore(similarities: { [model: string]: number }): number {
    const scores = Object.values(similarities);
    if (scores.length === 0) return 0;

    // Use the maximum similarity score across all models
    return Math.max(...scores);
  }

  /**
   * Calculate gaze anomaly score
   */
  calculateGazeAnomalyScore(
    totalGazeEvents: number,
    offScreenEvents: number,
    offScreenDurationSeconds: number,
    sessionDurationMinutes: number
  ): number {
    if (totalGazeEvents === 0 || sessionDurationMinutes === 0) return 0;

    // Factor 1: Percentage of off-screen events
    const offScreenPercentage = offScreenEvents / totalGazeEvents;

    // Factor 2: Time spent off-screen (normalized)
    const sessionDurationSeconds = sessionDurationMinutes * 60;
    const offScreenTimeRatio = offScreenDurationSeconds / sessionDurationSeconds;

    // Combine factors (equal weight)
    const anomalyScore = (offScreenPercentage + offScreenTimeRatio) / 2;

    return Math.min(1, anomalyScore);
  }

  /**
   * Calculate timing anomaly score
   */
  calculateTimingAnomalyScore(
    avgResponseLatency: number,
    avgWordsPerMinute: number,
    avgFillerRatio: number,
    unusuallyFastCount: number,
    unusuallySlowCount: number,
    totalAnswers: number
  ): number {
    if (totalAnswers === 0) return 0;

    let anomalyScore = 0;

    // Factor 1: Unusually fast responses (suggesting pre-prepared answers)
    // Expected: < 500ms is suspicious for analytical questions
    const fastResponseRatio = unusuallyFastCount / totalAnswers;
    anomalyScore += fastResponseRatio * 0.4; // 40% weight

    // Factor 2: Unusually slow responses (suggesting external assistance)
    // Expected: > 30s is suspicious
    const slowResponseRatio = unusuallySlowCount / totalAnswers;
    anomalyScore += slowResponseRatio * 0.3; // 30% weight

    // Factor 3: Filler word ratio
    // Expected: 0.05-0.15 is normal, very low suggests reading
    const fillerAnomalyScore = avgFillerRatio < 0.05 ? 0.3 : 0;
    anomalyScore += fillerAnomalyScore * 0.3; // 30% weight

    return Math.min(1, anomalyScore);
  }

  /**
   * Calculate answer-specific risk score
   */
  calculateAnswerRisk(
    aiSimilarity: number,
    responseLatency: number,
    perplexity: number
  ): number {
    // Weight factors
    const aiWeight = 0.5;
    const latencyWeight = 0.3;
    const perplexityWeight = 0.2;

    // Normalize latency (< 500ms = suspicious, > 5000ms = normal)
    const normalizedLatency = responseLatency < 500 ? 1 : Math.max(0, 1 - responseLatency / 5000);

    // Normalize perplexity (lower perplexity = more likely AI-generated)
    // Typical human perplexity: 50-150, AI: 10-40
    const normalizedPerplexity = perplexity < 40 ? 1 : Math.max(0, (150 - perplexity) / 110);

    // Calculate weighted risk
    const risk =
      aiSimilarity * aiWeight +
      normalizedLatency * latencyWeight +
      normalizedPerplexity * perplexityWeight;

    return Math.max(0, Math.min(1, risk));
  }

  /**
   * Get risk level color for visualization
   */
  getRiskColor(level: RiskLevel): string {
    const colors = {
      low: '#22c55e', // green
      medium: '#eab308', // yellow
      high: '#f97316', // orange
      critical: '#ef4444', // red
    };
    return colors[level];
  }

  /**
   * Get risk level description
   */
  getRiskDescription(level: RiskLevel): string {
    const descriptions = {
      low: 'Low risk - No significant concerns detected',
      medium: 'Medium risk - Some anomalies detected, review recommended',
      high: 'High risk - Multiple concerning indicators, manual review required',
      critical: 'Critical risk - Severe violations detected, immediate review required',
    };
    return descriptions[level];
  }
}

// Export singleton instance with default config
export const defaultRiskCalculator = new RiskCalculator();
