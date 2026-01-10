/// <reference types="jest" />

import { RiskCalculator } from '../lib/risk-calculator';

describe('RiskCalculator', () => {
  let calculator: RiskCalculator;

  beforeEach(() => {
    calculator = new RiskCalculator();
  });

  describe('calculateOverallRisk', () => {
    it('should calculate correct weighted average', () => {
      const risk = calculator.calculateOverallRisk({
        ai_detection_score: 0.8,
        security_events_score: 0.6,
        gaze_anomaly_score: 0.4,
        timing_anomaly_score: 0.2,
      });

      // Expected: 0.8*0.4 + 0.6*0.3 + 0.4*0.2 + 0.2*0.1 = 0.32 + 0.18 + 0.08 + 0.02 = 0.6
      expect(risk).toBeCloseTo(0.6, 2);
    });

    it('should cap risk score at 1.0', () => {
      const risk = calculator.calculateOverallRisk({
        ai_detection_score: 1.5,
        security_events_score: 1.5,
        gaze_anomaly_score: 1.5,
        timing_anomaly_score: 1.5,
      });

      expect(risk).toBe(1.0);
    });

    it('should floor risk score at 0.0', () => {
      const risk = calculator.calculateOverallRisk({
        ai_detection_score: -0.5,
        security_events_score: -0.5,
        gaze_anomaly_score: -0.5,
        timing_anomaly_score: -0.5,
      });

      expect(risk).toBe(0.0);
    });
  });

  describe('getRiskLevel', () => {
    it('should return low for scores < 0.50', () => {
      expect(calculator.getRiskLevel(0.3)).toBe('low');
      expect(calculator.getRiskLevel(0.49)).toBe('low');
    });

    it('should return medium for scores >= 0.50 and < 0.75', () => {
      expect(calculator.getRiskLevel(0.5)).toBe('medium');
      expect(calculator.getRiskLevel(0.65)).toBe('medium');
    });

    it('should return high for scores >= 0.75 and < 0.90', () => {
      expect(calculator.getRiskLevel(0.75)).toBe('high');
      expect(calculator.getRiskLevel(0.85)).toBe('high');
    });

    it('should return critical for scores >= 0.90', () => {
      expect(calculator.getRiskLevel(0.9)).toBe('critical');
      expect(calculator.getRiskLevel(1.0)).toBe('critical');
    });
  });

  describe('calculateSecurityEventsScore', () => {
    it('should return 0 for no events', () => {
      const score = calculator.calculateSecurityEventsScore([]);
      expect(score).toBe(0);
    });

    it('should calculate score based on severity weights', () => {
      const score = calculator.calculateSecurityEventsScore([
        { severity: 'low', count: 2 },
        { severity: 'medium', count: 1 },
        { severity: 'high', count: 1 },
      ]);

      // Should be non-zero and less than 1
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('should cap score at 1.0 for many events', () => {
      const score = calculator.calculateSecurityEventsScore([
        { severity: 'critical', count: 20 },
      ]);

      expect(score).toBe(1.0);
    });
  });

  describe('calculateGazeAnomalyScore', () => {
    it('should return 0 for no gaze events', () => {
      const score = calculator.calculateGazeAnomalyScore(0, 0, 0, 60);
      expect(score).toBe(0);
    });

    it('should calculate anomaly score based on off-screen events', () => {
      const score = calculator.calculateGazeAnomalyScore(
        100, // total events
        30,  // off-screen events
        60,  // 60 seconds off-screen
        10   // 10 minute session
      );

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('should cap score at 1.0', () => {
      const score = calculator.calculateGazeAnomalyScore(
        100,
        100,  // 100% off-screen
        1000,
        10
      );

      expect(score).toBe(1.0);
    });
  });

  describe('calculateAnswerRisk', () => {
    it('should calculate risk based on all factors', () => {
      const risk = calculator.calculateAnswerRisk(
        0.8,   // AI similarity
        300,   // response latency (fast)
        20     // perplexity (low = AI-like)
      );

      expect(risk).toBeGreaterThan(0.5);
      expect(risk).toBeLessThanOrEqual(1.0);
    });

    it('should return low risk for normal human responses', () => {
      const risk = calculator.calculateAnswerRisk(
        0.2,   // Low AI similarity
        3000,  // Normal response time
        100    // Normal human perplexity
      );

      expect(risk).toBeLessThan(0.5);
    });
  });

  describe('getRiskDescription', () => {
    it('should return appropriate descriptions for each level', () => {
      expect(calculator.getRiskDescription('low')).toContain('Low risk');
      expect(calculator.getRiskDescription('medium')).toContain('Medium risk');
      expect(calculator.getRiskDescription('high')).toContain('High risk');
      expect(calculator.getRiskDescription('critical')).toContain('Critical risk');
    });
  });
});
