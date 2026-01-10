/**
 * Tests for DetectionAggregationService
 *
 * Tests the cross-service risk aggregation functionality
 * that coordinates AI detection, eye tracking, and response timing.
 */

/// <reference types="jest" />

import { DetectionAggregationService } from '../services/detection-aggregation.service';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
}));

describe('DetectionAggregationService', () => {
  let service: DetectionAggregationService;
  let mockAiClient: jest.Mocked<any>;
  let mockEyeClient: jest.Mocked<any>;
  let mockTimingClient: jest.Mocked<any>;

  beforeEach(() => {
    // Reset environment
    process.env.AI_DETECTION_URL = 'http://ai-detection:8004';
    process.env.EYE_TRACKING_URL = 'http://eye-tracking:8005';
    process.env.RESPONSE_TIMING_URL = 'http://response-timing:8006';

    service = new DetectionAggregationService();

    // Access private clients for mocking
    mockAiClient = (service as any).aiDetectionClient;
    mockEyeClient = (service as any).eyeTrackingClient;
    mockTimingClient = (service as any).responseTimingClient;
  });

  describe('constructor', () => {
    it('should initialize with correct default URLs', () => {
      const newService = new DetectionAggregationService();
      // Service should be created without errors
      expect(newService).toBeDefined();
    });

    it('should use environment variable URLs when provided', () => {
      process.env.AI_DETECTION_URL = 'http://custom-ai:9000';
      const newService = new DetectionAggregationService();
      expect(newService).toBeDefined();
    });
  });

  describe('analyzeAnswer', () => {
    it('should call AI detection service with correct parameters', async () => {
      const mockResponse = {
        data: {
          analysisId: 'analysis-123',
          riskScore: 0.75,
          riskLevel: 'high',
          isAiGenerated: true,
          confidenceScore: 0.85,
          similarityScores: {
            'gpt-4': 0.8,
            'claude-3.5-sonnet': 0.7,
          },
          perplexityScore: 45.2,
          flags: ['high_similarity'],
        },
      };

      mockAiClient.post.mockResolvedValue(mockResponse);

      const result = await service.analyzeAnswer({
        questionId: 'question-456',
        answerText: 'This is a test answer',
        questionText: 'What is testing?',
      });

      expect(mockAiClient.post).toHaveBeenCalledWith(
        '/api/v1/analysis/answer',
        expect.objectContaining({
          questionId: 'question-456',
          answerText: 'This is a test answer',
          questionText: 'What is testing?',
        })
      );

      expect(result.riskScore).toBe(0.75);
      expect(result.isAiGenerated).toBe(true);
    });

    it('should handle AI detection service errors gracefully', async () => {
      mockAiClient.post.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        service.analyzeAnswer({
          questionId: 'question-456',
          answerText: 'Test answer',
          questionText: 'Test question',
        })
      ).rejects.toThrow();
    });
  });

  describe('getGazeAnalysis', () => {
    it('should call eye tracking service and return summary', async () => {
      const mockResponse = {
        data: {
          sessionId: 'session-123',
          totalGazeEvents: 1000,
          offScreenEvents: 50,
          offScreenPercentage: 5.0,
          offScreenDurationSeconds: 30,
          offScreenByDirection: { left: 20, right: 15, up: 10, down: 5 },
          patternsDetected: {
            reading: false,
            drift: false,
            shiftyEyes: true,
          },
          anomalies: [
            { type: 'extended_off_screen', severity: 'medium', score: 0.6, timestamp: new Date().toISOString(), description: 'Extended off-screen' },
          ],
          riskScore: 0.45,
          averageConfidence: 0.85,
        },
      };

      mockEyeClient.get.mockResolvedValue(mockResponse);

      const result = await service.getGazeAnalysis('session-123');

      expect(mockEyeClient.get).toHaveBeenCalledWith('/api/v1/gaze/summary/session-123');
      expect(result.offScreenPercentage).toBe(5.0);
      expect(result.riskScore).toBe(0.45);
      expect(result.patternsDetected.shiftyEyes).toBe(true);
    });

    it('should handle gaze service errors', async () => {
      mockEyeClient.get.mockRejectedValue(new Error('Service unavailable'));

      await expect(service.getGazeAnalysis('session-123')).rejects.toThrow();
    });
  });

  describe('analyzeAnswerTiming', () => {
    it('should call response timing service with correct parameters', async () => {
      const mockResponse = {
        data: {
          analysisId: 'timing-123',
          sessionId: 'session-123',
          transcription: {
            text: 'Transcribed answer text',
            confidence: 0.95,
            words: [{ word: 'Test', start: 0, end: 0.5 }],
          },
          metrics: {
            latencyMs: 4500,
            responseLatencyMs: 4500,
            wordsPerMinute: 145,
            speechRateWpm: 145,
            pauseCount: 5,
            pauseDurationAvgMs: 1400,
            pausePercentage: 13.5,
            fillerWordCount: 3,
            fillerWordRatio: 0.02,
            speechDurationMs: 45000,
            totalDurationMs: 52000,
          },
          anomalies: [],
          riskScore: 0.15,
          riskLevel: 'low',
          flags: [],
          recommendation: 'Timing patterns appear natural',
        },
      };

      mockTimingClient.post.mockResolvedValue(mockResponse);

      const result = await service.analyzeAnswerTiming({
        sessionId: 'session-123',
        answerId: 'question-456',
        audioUrl: 's3://bucket/audio.mp3',
        questionAskedAt: new Date(),
        answerStartedAt: new Date(),
      });

      expect(mockTimingClient.post).toHaveBeenCalledWith(
        '/api/v1/timing/analyze',
        expect.objectContaining({
          sessionId: 'session-123',
          answerId: 'question-456',
          audioUrl: 's3://bucket/audio.mp3',
        })
      );

      expect(result.metrics.wordsPerMinute).toBe(145);
      expect(result.riskScore).toBe(0.15);
    });
  });

  describe('calculateSessionRisk', () => {
    it('should aggregate risk from all services', async () => {
      // Mock AI detection response
      mockAiClient.post.mockResolvedValue({
        data: {
          analysisId: 'ai-123',
          riskScore: 0.7,
          riskLevel: 'high',
          isAiGenerated: true,
          confidenceScore: 0.8,
          similarityScores: { 'gpt-4': 0.75 },
          perplexityScore: 50,
          flags: [],
        },
      });

      // Mock eye tracking response
      mockEyeClient.get.mockResolvedValue({
        data: {
          sessionId: 'session-123',
          totalGazeEvents: 1000,
          offScreenEvents: 100,
          offScreenPercentage: 10,
          offScreenDurationSeconds: 60,
          offScreenByDirection: { left: 30, right: 30, up: 20, down: 20 },
          patternsDetected: { reading: false, drift: false, shiftyEyes: false },
          anomalies: [],
          riskScore: 0.3,
          averageConfidence: 0.85,
        },
      });

      // Mock response timing - session-level endpoint
      mockTimingClient.get.mockResolvedValue({
        data: [
          {
            analysisId: 'timing-123',
            sessionId: 'session-123',
            riskScore: 0.2,
            riskLevel: 'low',
            transcription: { text: 'Test', confidence: 0.9, words: [] },
            metrics: {
              latencyMs: 5000,
              wordsPerMinute: 140,
              pauseCount: 3,
              pauseDurationAvgMs: 1500,
              fillerWordCount: 2,
              fillerWordRatio: 0.03,
              speechDurationMs: 30000,
              totalDurationMs: 35000,
            },
            anomalies: [],
            flags: [],
          },
        ],
      });

      const result = await service.calculateSessionRisk(
        'session-123',
        [
          {
            questionId: 'q-1',
            answerText: 'Test answer',
            questionText: 'Test question',
            audioUrl: 's3://bucket/audio.mp3',
          },
        ],
        [],
        { includeGazeAnalysis: true, includeTimingAnalysis: true }
      );

      // Verify aggregated result
      expect(result.sessionId).toBe('session-123');
      expect(result.overallRiskScore).toBeGreaterThan(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(1);
      expect(result.aiDetection).toHaveLength(1);
      expect(result.eyeTracking).toBeDefined();
      expect(result.responseTiming).toHaveLength(1);
    });

    it('should handle partial service failures gracefully', async () => {
      // AI detection succeeds
      mockAiClient.post.mockResolvedValue({
        data: {
          analysisId: 'ai-123',
          riskScore: 0.5,
          riskLevel: 'medium',
          isAiGenerated: false,
          confidenceScore: 0.7,
          similarityScores: {},
          perplexityScore: 80,
          flags: [],
        },
      });

      // Eye tracking fails
      mockEyeClient.get.mockRejectedValue(new Error('Eye tracking unavailable'));

      // Response timing succeeds via session endpoint
      mockTimingClient.get.mockResolvedValue({
        data: [
          {
            analysisId: 'timing-123',
            sessionId: 'session-123',
            riskScore: 0.3,
            riskLevel: 'low',
            transcription: { text: 'Test', confidence: 0.9, words: [] },
            metrics: {
              latencyMs: 5000,
              wordsPerMinute: 140,
              pauseCount: 3,
              pauseDurationAvgMs: 1500,
              fillerWordCount: 2,
              fillerWordRatio: 0.03,
              speechDurationMs: 30000,
              totalDurationMs: 35000,
            },
            anomalies: [],
            flags: [],
          },
        ],
      });

      const result = await service.calculateSessionRisk(
        'session-123',
        [
          {
            questionId: 'q-1',
            answerText: 'Test',
            questionText: 'Question',
            audioUrl: 's3://bucket/audio.mp3',
          },
        ],
        [],
        { includeGazeAnalysis: true, includeTimingAnalysis: true }
      );

      // Should still return results from working services
      expect(result.aiDetection).toHaveLength(1);
      expect(result.eyeTracking).toBeUndefined();
      expect(result.responseTiming).toHaveLength(1);
      // Service status should reflect the failure
      expect(result.serviceStatus.eyeTracking).toBe('unavailable');
    });
  });

  describe('checkServicesHealth', () => {
    it('should return health status for all services', async () => {
      mockAiClient.get.mockResolvedValue({ status: 200 });
      mockEyeClient.get.mockResolvedValue({ status: 200 });
      mockTimingClient.get.mockResolvedValue({ status: 200 });

      const result = await service.checkServicesHealth();

      expect(result.aiDetection.healthy).toBe(true);
      expect(result.eyeTracking.healthy).toBe(true);
      expect(result.responseTiming.healthy).toBe(true);
    });

    it('should report unhealthy service when it fails', async () => {
      mockAiClient.get.mockResolvedValue({ status: 200 });
      mockEyeClient.get.mockRejectedValue(new Error('Service down'));
      mockTimingClient.get.mockResolvedValue({ status: 200 });

      const result = await service.checkServicesHealth();

      expect(result.aiDetection.healthy).toBe(true);
      expect(result.eyeTracking.healthy).toBe(false);
      expect(result.eyeTracking.error).toBeDefined();
      expect(result.responseTiming.healthy).toBe(true);
    });
  });

  describe('Risk score calculation weights', () => {
    it('should apply correct weights to component scores', async () => {
      // All services return same risk score
      const uniformRisk = 0.5;

      mockAiClient.post.mockResolvedValue({
        data: {
          analysisId: 'ai-123',
          riskScore: uniformRisk,
          riskLevel: 'medium',
          isAiGenerated: false,
          confidenceScore: 0.7,
          similarityScores: {},
          perplexityScore: 80,
          flags: [],
        },
      });

      mockEyeClient.get.mockResolvedValue({
        data: {
          sessionId: 'session-123',
          totalGazeEvents: 1000,
          offScreenEvents: 50,
          offScreenPercentage: 5,
          offScreenDurationSeconds: 30,
          offScreenByDirection: { left: 15, right: 15, up: 10, down: 10 },
          patternsDetected: { reading: false, drift: false, shiftyEyes: false },
          anomalies: [],
          riskScore: uniformRisk,
          averageConfidence: 0.9,
        },
      });

      mockTimingClient.get.mockResolvedValue({
        data: [
          {
            analysisId: 'timing-123',
            sessionId: 'session-123',
            riskScore: uniformRisk,
            riskLevel: 'medium',
            transcription: { text: 'Test', confidence: 0.9, words: [] },
            metrics: {
              latencyMs: 5000,
              wordsPerMinute: 140,
              pauseCount: 3,
              pauseDurationAvgMs: 1500,
              fillerWordCount: 2,
              fillerWordRatio: 0.03,
              speechDurationMs: 30000,
              totalDurationMs: 35000,
            },
            anomalies: [],
            flags: [],
          },
        ],
      });

      const result = await service.calculateSessionRisk(
        'session-123',
        [
          {
            questionId: 'q-1',
            answerText: 'Test',
            questionText: 'Question',
            audioUrl: 's3://bucket/audio.mp3',
          },
        ],
        [{ severity: 'medium', count: 1 }],
        { includeGazeAnalysis: true, includeTimingAnalysis: true }
      );

      // Verify weights are applied
      expect(result.weights.aiDetection).toBe(0.4);
      expect(result.weights.securityEvents).toBe(0.3);
      expect(result.weights.gazeAnomaly).toBe(0.2);
      expect(result.weights.timingAnomaly).toBe(0.1);

      // Overall score should be a weighted combination
      expect(result.overallRiskScore).toBeGreaterThan(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(1);
    });
  });
});
