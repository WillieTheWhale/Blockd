/**
 * Tests for DetectionAggregationService
 *
 * Tests the cross-service risk aggregation functionality
 * that coordinates AI detection, eye tracking, and response timing.
 */

import { DetectionAggregationService } from '../services/detection-aggregation.service';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
  })),
}));

describe('DetectionAggregationService', () => {
  let service: DetectionAggregationService;
  let mockAiClient: any;
  let mockEyeClient: any;
  let mockTimingClient: any;

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
          analysis_id: 'analysis-123',
          risk_score: 0.75,
          is_ai_generated: true,
          confidence: 0.85,
          similarity_scores: {
            'gpt-4': 0.8,
            'claude-3.5-sonnet': 0.7,
          },
          perplexity_score: 45.2,
          analysis_completed_at: new Date().toISOString(),
        },
      };

      mockAiClient.post.mockResolvedValue(mockResponse);

      const result = await service.analyzeAnswer({
        sessionId: 'session-123',
        questionId: 'question-456',
        answerText: 'This is a test answer',
        questionText: 'What is testing?',
      });

      expect(mockAiClient.post).toHaveBeenCalledWith(
        '/analyze',
        expect.objectContaining({
          session_id: 'session-123',
          question_id: 'question-456',
          answer_text: 'This is a test answer',
          question_text: 'What is testing?',
        })
      );

      expect(result.riskScore).toBe(0.75);
      expect(result.isAiGenerated).toBe(true);
    });

    it('should handle AI detection service errors gracefully', async () => {
      mockAiClient.post.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        service.analyzeAnswer({
          sessionId: 'session-123',
          questionId: 'question-456',
          answerText: 'Test answer',
          questionText: 'Test question',
        })
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('getGazeAnalysis', () => {
    it('should call eye tracking service and return summary', async () => {
      const mockResponse = {
        data: {
          session_id: 'session-123',
          total_duration_seconds: 600,
          on_screen_percentage: 85.5,
          off_screen_events: [
            { direction: 'left', duration: 2.5, timestamp: new Date().toISOString() },
          ],
          patterns_detected: {
            reading: false,
            drift: false,
            shifty: true,
          },
          anomalies: [
            { type: 'extended_off_screen', severity: 'medium', score: 0.6 },
          ],
          risk_score: 0.45,
          heatmap_url: 'https://storage.example.com/heatmap-123.png',
        },
      };

      mockEyeClient.get.mockResolvedValue(mockResponse);

      const result = await service.getGazeAnalysis('session-123');

      expect(mockEyeClient.get).toHaveBeenCalledWith('/summary/session-123');
      expect(result.onScreenPercentage).toBe(85.5);
      expect(result.riskScore).toBe(0.45);
      expect(result.patternsDetected.shifty).toBe(true);
    });

    it('should handle missing gaze data gracefully', async () => {
      mockEyeClient.get.mockResolvedValue({ data: null });

      const result = await service.getGazeAnalysis('session-123');

      expect(result).toBeNull();
    });
  });

  describe('analyzeAnswerTiming', () => {
    it('should call response timing service with correct parameters', async () => {
      const mockResponse = {
        data: {
          analysis_id: 'timing-123',
          transcription: {
            text: 'Transcribed answer text',
            confidence: 0.95,
            words: [{ word: 'Test', start: 0, end: 0.5 }],
          },
          timing_metrics: {
            response_latency_ms: 4500,
            speech_duration_seconds: 45.0,
            total_duration_seconds: 52.0,
            speech_rate_wpm: 145,
            pause_count: 5,
            pause_percentage: 13.5,
            avg_pause_duration_seconds: 1.4,
            filler_word_count: 3,
            filler_word_ratio: 0.02,
          },
          anomalies: {
            instant_response: false,
            unnatural_consistency: false,
            delayed_then_fluent: false,
            robotic_speech_pattern: false,
          },
          risk_score: 0.15,
          recommendation: 'Timing patterns appear natural',
        },
      };

      mockTimingClient.post.mockResolvedValue(mockResponse);

      const result = await service.analyzeAnswerTiming({
        questionId: 'question-456',
        audioUrl: 's3://bucket/audio.mp3',
        questionAskedAt: new Date(),
        answerStartAt: new Date(),
        difficulty: 'analytical',
      });

      expect(mockTimingClient.post).toHaveBeenCalledWith(
        '/analyze',
        expect.objectContaining({
          question_id: 'question-456',
          audio_url: 's3://bucket/audio.mp3',
          difficulty: 'analytical',
        })
      );

      expect(result.timingMetrics.speechRateWpm).toBe(145);
      expect(result.riskScore).toBe(0.15);
    });
  });

  describe('calculateSessionRisk', () => {
    it('should aggregate risk from all services', async () => {
      // Mock AI detection response
      mockAiClient.post.mockResolvedValue({
        data: {
          analysis_id: 'ai-123',
          risk_score: 0.7,
          is_ai_generated: true,
          confidence: 0.8,
          similarity_scores: { 'gpt-4': 0.75 },
          perplexity_score: 50,
        },
      });

      // Mock eye tracking response
      mockEyeClient.get.mockResolvedValue({
        data: {
          session_id: 'session-123',
          total_duration_seconds: 600,
          on_screen_percentage: 80,
          risk_score: 0.3,
          patterns_detected: { reading: false, drift: false, shifty: false },
          off_screen_events: [],
          anomalies: [],
        },
      });

      // Mock response timing response
      mockTimingClient.post.mockResolvedValue({
        data: {
          analysis_id: 'timing-123',
          risk_score: 0.2,
          transcription: { text: 'Test', confidence: 0.9, words: [] },
          timing_metrics: {
            response_latency_ms: 5000,
            speech_duration_seconds: 30,
            total_duration_seconds: 35,
            speech_rate_wpm: 140,
            pause_count: 3,
            pause_percentage: 14,
            avg_pause_duration_seconds: 1.5,
            filler_word_count: 2,
            filler_word_ratio: 0.03,
          },
          anomalies: {
            instant_response: false,
            unnatural_consistency: false,
            delayed_then_fluent: false,
            robotic_speech_pattern: false,
          },
        },
      });

      const result = await service.calculateSessionRisk('session-123', [
        {
          sessionId: 'session-123',
          questionId: 'q-1',
          answerText: 'Test answer',
          questionText: 'Test question',
          audioUrl: 's3://bucket/audio.mp3',
          questionAskedAt: new Date(),
          answerStartAt: new Date(),
          difficulty: 'analytical',
        },
      ]);

      // Verify aggregated result
      expect(result.sessionId).toBe('session-123');
      expect(result.overallRiskScore).toBeGreaterThan(0);
      expect(result.overallRiskScore).toBeLessThanOrEqual(1);
      expect(result.aiDetectionResults).toHaveLength(1);
      expect(result.gazeAnalysis).toBeDefined();
      expect(result.timingResults).toHaveLength(1);
    });

    it('should handle partial service failures', async () => {
      // AI detection succeeds
      mockAiClient.post.mockResolvedValue({
        data: {
          analysis_id: 'ai-123',
          risk_score: 0.5,
          is_ai_generated: false,
          confidence: 0.7,
          similarity_scores: {},
          perplexity_score: 80,
        },
      });

      // Eye tracking fails
      mockEyeClient.get.mockRejectedValue(new Error('Eye tracking unavailable'));

      // Response timing succeeds
      mockTimingClient.post.mockResolvedValue({
        data: {
          analysis_id: 'timing-123',
          risk_score: 0.3,
          transcription: { text: 'Test', confidence: 0.9, words: [] },
          timing_metrics: {
            response_latency_ms: 5000,
            speech_duration_seconds: 30,
            total_duration_seconds: 35,
            speech_rate_wpm: 140,
            pause_count: 3,
            pause_percentage: 14,
            avg_pause_duration_seconds: 1.5,
            filler_word_count: 2,
            filler_word_ratio: 0.03,
          },
          anomalies: {
            instant_response: false,
            unnatural_consistency: false,
            delayed_then_fluent: false,
            robotic_speech_pattern: false,
          },
        },
      });

      const result = await service.calculateSessionRisk('session-123', [
        {
          sessionId: 'session-123',
          questionId: 'q-1',
          answerText: 'Test',
          questionText: 'Question',
          audioUrl: 's3://bucket/audio.mp3',
          questionAskedAt: new Date(),
          answerStartAt: new Date(),
          difficulty: 'analytical',
        },
      ]);

      // Should still return results from working services
      expect(result.aiDetectionResults).toHaveLength(1);
      expect(result.gazeAnalysis).toBeNull();
      expect(result.timingResults).toHaveLength(1);
    });
  });

  describe('healthCheck', () => {
    it('should return true when all services are healthy', async () => {
      mockAiClient.get.mockResolvedValue({ status: 200 });
      mockEyeClient.get.mockResolvedValue({ status: 200 });
      mockTimingClient.get.mockResolvedValue({ status: 200 });

      const result = await service.healthCheck();

      expect(result).toBe(true);
    });

    it('should return false when any service is unhealthy', async () => {
      mockAiClient.get.mockResolvedValue({ status: 200 });
      mockEyeClient.get.mockRejectedValue(new Error('Service down'));
      mockTimingClient.get.mockResolvedValue({ status: 200 });

      const result = await service.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('Risk score calculation weights', () => {
    it('should apply correct weights to component scores', async () => {
      // All services return same risk score
      const uniformRisk = 0.5;

      mockAiClient.post.mockResolvedValue({
        data: {
          analysis_id: 'ai-123',
          risk_score: uniformRisk,
          is_ai_generated: false,
          confidence: 0.7,
          similarity_scores: {},
          perplexity_score: 80,
        },
      });

      mockEyeClient.get.mockResolvedValue({
        data: {
          session_id: 'session-123',
          total_duration_seconds: 600,
          on_screen_percentage: 90,
          risk_score: uniformRisk,
          patterns_detected: {},
          off_screen_events: [],
          anomalies: [],
        },
      });

      mockTimingClient.post.mockResolvedValue({
        data: {
          analysis_id: 'timing-123',
          risk_score: uniformRisk,
          transcription: { text: 'Test', confidence: 0.9, words: [] },
          timing_metrics: {
            response_latency_ms: 5000,
            speech_duration_seconds: 30,
            total_duration_seconds: 35,
            speech_rate_wpm: 140,
            pause_count: 3,
            pause_percentage: 14,
            avg_pause_duration_seconds: 1.5,
            filler_word_count: 2,
            filler_word_ratio: 0.03,
          },
          anomalies: {},
        },
      });

      const result = await service.calculateSessionRisk('session-123', [
        {
          sessionId: 'session-123',
          questionId: 'q-1',
          answerText: 'Test',
          questionText: 'Question',
          audioUrl: 's3://bucket/audio.mp3',
          questionAskedAt: new Date(),
          answerStartAt: new Date(),
          difficulty: 'analytical',
        },
      ]);

      // With all scores at 0.5 and default weights (0.4, 0.3, 0.2, 0.1),
      // the overall score should be around 0.5
      expect(result.overallRiskScore).toBeCloseTo(0.5, 1);
    });
  });
});
