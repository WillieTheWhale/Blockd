import prisma from '../src/database';
import { RiskCalculator, defaultRiskCalculator, SecurityEventData } from '../lib/risk-calculator';
import { ReportGenerator } from '../lib/report-generator';
import {
  SessionReport,
  GenerateReportDTO,
  ReportExport,
  RiskAnalysis,
  SecuritySummary,
  GazeAnalysisSummary,
  TimingAnalysisSummary,
  Recommendation,
  OverallAssessment,
  QuestionAnswerReport,
} from '../types/report.types';
import { SessionNotFoundError, ReportGenerationError } from '../lib/errors';
import notificationService from './notification.service';
import {
  DetectionAggregationService,
  detectionAggregationService,
  AIDetectionInput,
} from './detection-aggregation.service';
import { Logger } from '../lib/logger';
import { DetectionErrorHandler } from '../lib/detection-error-handler';
import {
  LiveDetectionResult,
  DetectionResult,
  LiveAnswerDetectionInput,
} from '../types/detection.types';

const logger = new Logger('ReportService');

/**
 * Report Service
 * Handles session report generation and risk scoring.
 *
 * Uses live detection services for real-time analysis with graceful
 * fallback to database-cached scores when services are unavailable.
 */

export class ReportService {
  private riskCalculator: RiskCalculator;
  private detectionService: DetectionAggregationService;

  constructor(
    riskCalculator?: RiskCalculator,
    detectionService?: DetectionAggregationService
  ) {
    this.riskCalculator = riskCalculator || defaultRiskCalculator;
    this.detectionService = detectionService || detectionAggregationService;
  }

  // Default pagination limits to prevent unbounded queries
  private static readonly MAX_QUESTIONS_PER_PAGE = 100;
  private static readonly MAX_SECURITY_EVENTS_PER_PAGE = 500;
  private static readonly MAX_ANSWERS_PER_QUESTION = 10;

  /**
   * Generate comprehensive session report
   */
  async generateReport(sessionId: string): Promise<SessionReport> {
    // Get session with related data using pagination limits
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        interviewer: true,
        interviewee: true,
        organization: true,
        questions: {
          orderBy: { questionOrder: 'asc' },
          take: ReportService.MAX_QUESTIONS_PER_PAGE,
          include: {
            answerAnalysis: {
              take: ReportService.MAX_ANSWERS_PER_QUESTION,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        securityEvents: {
          orderBy: { timestamp: 'desc' },
          take: ReportService.MAX_SECURITY_EVENTS_PER_PAGE,
        },
      },
    });

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Log if results were truncated
    const questionCount = await prisma.sessionQuestion.count({ where: { sessionId } });
    const securityEventCount = await prisma.securityEvent.count({ where: { sessionId } });

    if (questionCount > ReportService.MAX_QUESTIONS_PER_PAGE) {
      logger.warn('Questions truncated in report', {
        sessionId,
        total: questionCount,
        included: ReportService.MAX_QUESTIONS_PER_PAGE,
      });
    }

    if (securityEventCount > ReportService.MAX_SECURITY_EVENTS_PER_PAGE) {
      logger.warn('Security events truncated in report', {
        sessionId,
        total: securityEventCount,
        included: ReportService.MAX_SECURITY_EVENTS_PER_PAGE,
      });
    }

    // Calculate risk analysis
    const riskAnalysis = await this.calculateRiskAnalysis(sessionId);

    // Generate security summary
    const securitySummary = await this.generateSecuritySummary(sessionId);

    // Generate gaze analysis (if available)
    const gazeAnalysis = await this.generateGazeAnalysis(sessionId);

    // Generate timing analysis (if available)
    const timingAnalysis = await this.generateTimingAnalysis(sessionId);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      riskAnalysis,
      securitySummary,
      gazeAnalysis,
      timingAnalysis
    );

    // Generate overall assessment
    const overallAssessment = this.generateOverallAssessment(
      riskAnalysis,
      securitySummary,
      recommendations
    );

    // Create report record in database
    const reportRecord = await prisma.sessionReport.create({
      data: {
        sessionId,
        overallRiskScore: riskAnalysis.overall_risk_score,
        aiDetectionScore: riskAnalysis.ai_detection_score,
        gazeAnomalyScore: riskAnalysis.gaze_anomaly_score,
        timingAnomalyScore: riskAnalysis.timing_anomaly_score,
        securityEventsCount: securitySummary.total_events,
        recommendations: JSON.parse(JSON.stringify(recommendations)),
        detailedAnalysis: JSON.parse(JSON.stringify({
          risk_analysis: riskAnalysis,
          security_summary: securitySummary,
          gaze_analysis: gazeAnalysis,
          timing_analysis: timingAnalysis,
        })),
      },
    });

    // Build report
    const report: SessionReport = {
      report_id: reportRecord.id,
      session_id: sessionId,
      generated_at: reportRecord.generatedAt.toISOString(),
      session_metadata: {
        session_id: session.id,
        status: session.status,
        scheduled_start: session.scheduledStart?.toISOString() || null,
        actual_start: session.actualStart?.toISOString() || null,
        actual_end: session.actualEnd?.toISOString() || null,
        duration_minutes: session.durationMinutes,
        organization: {
          id: session.organization.id,
          name: session.organization.name,
        },
      },
      interviewer: {
        user_id: session.interviewer.id,
        full_name: `${session.interviewer.firstName} ${session.interviewer.lastName}`,
        email: session.interviewer.email,
        role: session.interviewer.role,
      },
      interviewee: session.interviewee
        ? {
            user_id: session.interviewee.id,
            full_name: `${session.interviewee.firstName} ${session.interviewee.lastName}`,
            email: session.interviewee.email,
            role: session.interviewee.role,
          }
        : {
            user_id: '',
            full_name: 'Unknown',
            email: session.intervieweeEmail || '',
            role: 'interviewee',
          },
      questions_and_answers: this.formatQuestionsAndAnswers(session.questions),
      risk_analysis: riskAnalysis,
      security_summary: securitySummary,
      gaze_analysis: gazeAnalysis,
      timing_analysis: timingAnalysis,
      recommendations,
      overall_assessment: overallAssessment,
    };

    // Send notification to interviewer
    await notificationService.sendReportEmail(session.interviewer.email, report);

    return report;
  }

  /**
   * Export report in specified format
   */
  async exportReport(dto: GenerateReportDTO): Promise<ReportExport> {
    const report = await this.generateReport(dto.session_id);

    if (dto.format === 'pdf') {
      return await ReportGenerator.generatePDF(report);
    }

    return ReportGenerator.generateJSON(report);
  }

  /**
   * Calculate comprehensive risk analysis using LIVE detection services.
   * Falls back to cached database data when services are unavailable.
   */
  private async calculateRiskAnalysis(sessionId: string): Promise<RiskAnalysis> {
    // Fetch session data from database with pagination limits
    const session = await prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          orderBy: { questionOrder: 'asc' },
          take: ReportService.MAX_QUESTIONS_PER_PAGE,
          include: {
            answerAnalysis: {
              take: ReportService.MAX_ANSWERS_PER_QUESTION,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        securityEvents: {
          take: ReportService.MAX_SECURITY_EVENTS_PER_PAGE,
          orderBy: { timestamp: 'desc' },
        },
      },
    });

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // Prepare inputs for live detection
    const answerInputs: AIDetectionInput[] = session.questions
      .filter((q) => q.answerAnalysis && q.answerAnalysis.length > 0)
      .map((q) => {
        const answer = q.answerAnalysis[0];
        return {
          questionId: q.id,
          questionText: q.questionText,
          answerText: answer.answerText || '',
          audioUrl: answer.answerAudioUrl || undefined,
          responseTimeMs: answer.responseTiming
            ? Number((answer.responseTiming as Record<string, unknown>).response_latency_ms || 0)
            : undefined,
        };
      });

    const securityEventInputs: SecurityEventData[] = session.securityEvents.map((e) => ({
      severity: e.severity as 'low' | 'medium' | 'high' | 'critical',
      count: 1,
    }));

    // TRY LIVE DETECTION FIRST (always!)
    try {
      logger.info('Attempting live detection analysis', {
        sessionId,
        answerCount: answerInputs.length,
        securityEventCount: securityEventInputs.length,
      });

      const aggregatedResult = await this.detectionService.calculateSessionRisk(
        sessionId,
        answerInputs,
        securityEventInputs,
        {
          includeGazeAnalysis: true,
          includeTimingAnalysis: true,
        }
      );

      // Check if any services responded
      const servicesAvailable = Object.entries(aggregatedResult.serviceStatus)
        .filter(([, status]) => status === 'available')
        .map(([name]) => name);

      if (servicesAvailable.length > 0) {
        logger.info('Using LIVE detection results', {
          sessionId,
          overallRiskScore: aggregatedResult.overallRiskScore,
          servicesAvailable,
          confidence: aggregatedResult.confidence,
        });

        // Extract flagged answers from AI detection results
        const flaggedAnswers =
          aggregatedResult.aiDetection
            ?.filter((r) => r.riskScore > 0.75)
            .map((r) => r.analysisId) || [];

        return this.detectionService.toRiskAnalysis(aggregatedResult, flaggedAnswers);
      }

      // If no services available, fall through to database fallback
      logger.warn('All detection services unavailable, falling back to database', {
        sessionId,
        errors: aggregatedResult.errors,
      });
    } catch (error) {
      logger.error('Live detection failed, falling back to database', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // FALLBACK: Use existing database-based calculation
    logger.info('Using database fallback for risk calculation', { sessionId });
    return this.calculateRiskFromDatabase(session);
  }

  /**
   * Fallback: Calculate risk from database (when live detection unavailable)
   * This preserves the original implementation as a fallback.
   */
  private async calculateRiskFromDatabase(session: {
    id: string;
    durationMinutes: number | null;
    questions: Array<{
      questionOrder: number | null;
      difficulty: string | null;
      answerAnalysis: Array<{
        id: string;
        riskScore: unknown;
        responseTiming: unknown;
      }>;
    }>;
    securityEvents: Array<{ severity: string }>;
  }): Promise<RiskAnalysis> {
    // Flatten answers with question context for processing
    const answersWithContext = session.questions
      .flatMap((q) =>
        q.answerAnalysis.map((a) => ({
          ...a,
          question: { difficulty: q.difficulty, questionOrder: q.questionOrder },
        }))
      )
      .filter((a): a is NonNullable<typeof a> => a !== null);

    // Calculate AI detection score from cached data
    const aiScores = answersWithContext
      .filter((a) => a.riskScore !== null)
      .map((a) => parseFloat(String(a.riskScore)));
    const aiDetectionScore = aiScores.length > 0 ? Math.max(...aiScores) : 0;

    // Calculate security events score
    const securityEventData: SecurityEventData[] = session.securityEvents.map((e) => ({
      severity: e.severity as 'low' | 'medium' | 'high' | 'critical',
      count: 1,
    }));
    const securityEventsScore =
      this.riskCalculator.calculateSecurityEventsScore(securityEventData);

    // Calculate gaze anomaly score from database
    const gazeEventsCount = await prisma.gazeEvent.count({
      where: { sessionId: session.id },
    });
    const offScreenCount = await prisma.gazeEvent.count({
      where: { sessionId: session.id, isOffScreen: true },
    });
    const gazeAnomalyScore = this.riskCalculator.calculateGazeAnomalyScore(
      gazeEventsCount,
      offScreenCount,
      0,
      session.durationMinutes || 0
    );

    // Calculate timing anomaly score from database
    const timingAnomalyScore = this.calculateTimingAnomalyScoreFromAnswers(
      answersWithContext.map((a) => ({
        responseTiming: a.responseTiming,
        question: a.question,
      }))
    );

    // Calculate overall risk
    const overallRiskScore = this.riskCalculator.calculateOverallRisk({
      ai_detection_score: aiDetectionScore,
      security_events_score: securityEventsScore,
      gaze_anomaly_score: gazeAnomalyScore,
      timing_anomaly_score: timingAnomalyScore,
    });

    const riskLevel = this.riskCalculator.getRiskLevel(overallRiskScore);

    // Flagged answers (risk > 0.75)
    const flaggedAnswers = answersWithContext
      .filter((a) => a.riskScore && parseFloat(String(a.riskScore)) > 0.75)
      .map((a) => a.id);

    // Flagged behaviors from timing anomalies
    const flaggedBehaviors = this.extractFlaggedBehaviors(
      answersWithContext.map((a) => ({
        responseTiming: a.responseTiming,
        question: a.question,
      }))
    );

    return {
      overall_risk_score: overallRiskScore,
      risk_level: riskLevel,
      ai_detection_score: aiDetectionScore,
      security_events_score: securityEventsScore,
      gaze_anomaly_score: gazeAnomalyScore,
      timing_anomaly_score: timingAnomalyScore,
      weights: {
        ai_detection: 0.4,
        security_events: 0.3,
        gaze_anomaly: 0.2,
        timing_anomaly: 0.1,
      },
      flagged_answers: flaggedAnswers,
      flagged_behaviors: flaggedBehaviors,
    };
  }

  /**
   * Calculate timing anomaly score from answer analysis data
   */
  private calculateTimingAnomalyScoreFromAnswers(answers: Array<{
    responseTiming: unknown;
    question: { difficulty: string | null } | null;
  }>): number {
    if (answers.length === 0) return 0;

    let totalLatency = 0;
    let totalWpm = 0;
    let totalFillerRatio = 0;
    let validCount = 0;
    let unusuallyFast = 0;
    let unusuallySlow = 0;

    for (const answer of answers) {
      const timing = answer.responseTiming as Record<string, unknown> | null;
      if (!timing) continue;

      validCount++;

      const latency = Number(
        timing.response_latency_ms ?? timing.latency_ms ?? timing.responseLatencyMs ?? 0
      );
      const wpm = Number(
        timing.words_per_minute ?? timing.wpm ?? timing.speech_rate_wpm ?? 0
      );
      const fillerRatio = Number(
        timing.filler_ratio ?? timing.fillerRatio ?? timing.filler_word_ratio ?? 0
      );

      totalLatency += latency;
      totalWpm += wpm;
      totalFillerRatio += fillerRatio;

      // Check for fast/slow responses based on difficulty
      const expectedLatency = this.getExpectedLatency(answer.question?.difficulty ?? 'medium');
      if (latency > 0 && latency < expectedLatency * 0.25) {
        unusuallyFast++;
      }
      if (latency > 60000) {
        unusuallySlow++;
      }
    }

    if (validCount === 0) return 0;

    const avgLatency = totalLatency / validCount;
    const avgWpm = totalWpm / validCount;
    const avgFillerRatio = totalFillerRatio / validCount;

    return this.riskCalculator.calculateTimingAnomalyScore(
      avgLatency,
      avgWpm,
      avgFillerRatio,
      unusuallyFast,
      unusuallySlow,
      answers.length
    );
  }

  /**
   * Extract flagged behaviors from answer timing data
   */
  private extractFlaggedBehaviors(answers: Array<{
    responseTiming: unknown;
    question: { questionOrder?: number | null; difficulty?: string | null } | null;
  }>): string[] {
    const behaviors: string[] = [];

    for (const answer of answers) {
      const timing = answer.responseTiming as Record<string, unknown> | null;
      if (!timing) continue;

      const anomalies = timing.anomalies as Record<string, boolean> | undefined;
      const questionNum = answer.question?.questionOrder ?? 0;

      if (anomalies) {
        if (anomalies.instant_response) {
          behaviors.push(`Q${questionNum}: Instant response (possible pre-prepared answer)`);
        }
        if (anomalies.robotic_speech_pattern) {
          behaviors.push(`Q${questionNum}: Robotic speech pattern detected`);
        }
        if (anomalies.delayed_then_fluent) {
          behaviors.push(`Q${questionNum}: Long pause followed by fluent answer`);
        }
        if (anomalies.no_filler_words) {
          behaviors.push(`Q${questionNum}: Unusual absence of natural hesitation`);
        }
      }
    }

    return [...new Set(behaviors)]; // Remove duplicates
  }

  /**
   * Generate security summary
   */
  private async generateSecuritySummary(sessionId: string): Promise<SecuritySummary> {
    const events = await prisma.securityEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'desc' },
    });

    const eventsBySeverity = {
      low: events.filter((e) => e.severity === 'low').length,
      medium: events.filter((e) => e.severity === 'medium').length,
      high: events.filter((e) => e.severity === 'high').length,
      critical: events.filter((e) => e.severity === 'critical').length,
    };

    const eventsByType: Record<string, number> = {};
    events.forEach((e) => {
      eventsByType[e.eventType] = (eventsByType[e.eventType] || 0) + 1;
    });

    const criticalEvents = events
      .filter((e) => e.severity === 'critical')
      .map((e) => ({
        event_id: e.id,
        event_type: e.eventType,
        severity: e.severity,
        description: e.description,
        metadata: e.metadata as Record<string, unknown>,
        timestamp: e.timestamp.toISOString(),
      }));

    return {
      total_events: events.length,
      events_by_severity: eventsBySeverity,
      events_by_type: eventsByType,
      timeline: events.map((e) => ({
        event_id: e.id,
        event_type: e.eventType,
        severity: e.severity,
        description: e.description,
        metadata: e.metadata as Record<string, unknown>,
        timestamp: e.timestamp.toISOString(),
      })),
      critical_events: criticalEvents,
    };
  }

  /**
   * Generate gaze analysis summary.
   * Tries live eye tracking service first, falls back to database.
   */
  private async generateGazeAnalysis(sessionId: string): Promise<GazeAnalysisSummary | undefined> {
    // Try live eye tracking service first
    try {
      const liveResult = await this.detectionService.getGazeAnalysis(sessionId);
      logger.info('Using live gaze analysis', { sessionId });
      return this.detectionService.toGazeAnalysisSummary(liveResult);
    } catch (error) {
      logger.warn('Live gaze analysis failed, using database', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Fallback to database
    const gazeEvents = await prisma.gazeEvent.findMany({
      where: { sessionId },
    });

    if (gazeEvents.length === 0) return undefined;

    const offScreenEvents = gazeEvents.filter((e) => e.isOffScreen);
    const offScreenPercentage = (offScreenEvents.length / gazeEvents.length) * 100;

    const offScreenByDirection = {
      left: offScreenEvents.filter((e) => e.offScreenDirection === 'left').length,
      right: offScreenEvents.filter((e) => e.offScreenDirection === 'right').length,
      up: offScreenEvents.filter((e) => e.offScreenDirection === 'up').length,
      down: offScreenEvents.filter((e) => e.offScreenDirection === 'down').length,
    };

    return {
      total_gaze_events: gazeEvents.length,
      off_screen_events: offScreenEvents.length,
      off_screen_percentage: offScreenPercentage,
      off_screen_duration_seconds: 0, // Would calculate from timestamps
      off_screen_by_direction: offScreenByDirection,
      anomaly_score: offScreenPercentage > 20 ? 0.8 : offScreenPercentage / 25,
      suspicious_patterns: [],
    };
  }

  /**
   * Generate timing analysis summary
   * Tries live response timing service first, falls back to database
   */
  private async generateTimingAnalysis(
    sessionId: string
  ): Promise<TimingAnalysisSummary | undefined> {
    // Try live detection service first
    try {
      const liveResults = await this.detectionService.analyzeAllTiming(sessionId, []);
      if (liveResults && liveResults.length > 0) {
        return this.detectionService.toTimingAnalysisSummary(liveResults);
      }
    } catch (error) {
      logger.warn('Live timing service unavailable, falling back to database', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Fallback to database
    const answers = await prisma.answerAnalysis.findMany({
      where: {
        question: {
          sessionId,
        },
      },
      include: {
        question: true,
      },
    });

    if (answers.length === 0) return undefined;

    // Parse and aggregate timing data from response_timing JSONB field
    let totalLatency = 0;
    let totalWpm = 0;
    let totalPauseCount = 0;
    let totalFillerRatio = 0;
    let validTimingCount = 0;
    let unusuallyFast = 0;
    let unusuallySlow = 0;
    const suspiciousPatterns: string[] = [];

    for (const answer of answers) {
      const timing = answer.responseTiming as Record<string, unknown> | null;
      if (!timing) continue;

      validTimingCount++;

      // Extract timing metrics (handle different field naming conventions)
      const latency = Number(
        timing.response_latency_ms ?? timing.latency_ms ?? timing.responseLatencyMs ?? 0
      );
      const wpm = Number(
        timing.words_per_minute ?? timing.wpm ?? timing.speech_rate_wpm ?? 0
      );
      const pauseCount = Number(
        timing.pause_count ?? timing.pauseCount ?? 0
      );
      const fillerRatio = Number(
        timing.filler_ratio ?? timing.fillerRatio ?? timing.filler_word_ratio ?? 0
      );

      totalLatency += latency;
      totalWpm += wpm;
      totalPauseCount += pauseCount;
      totalFillerRatio += fillerRatio;

      // Detect unusually fast responses (< 2 seconds for complex questions)
      const difficulty = answer.question?.difficulty;
      const expectedLatency = this.getExpectedLatency(difficulty ?? 'medium');
      if (latency > 0 && latency < expectedLatency * 0.25) {
        unusuallyFast++;
      }

      // Detect unusually slow responses (> 60 seconds)
      if (latency > 60000) {
        unusuallySlow++;
      }

      // Check for suspicious patterns in anomalies field
      const anomalies = timing.anomalies as Record<string, boolean> | undefined;
      if (anomalies) {
        if (anomalies.instant_response) {
          suspiciousPatterns.push(`Instant response detected for question ${answer.question?.questionOrder ?? 'unknown'}`);
        }
        if (anomalies.unnatural_consistency) {
          suspiciousPatterns.push('Unnatural speech consistency detected');
        }
        if (anomalies.robotic_speech_pattern) {
          suspiciousPatterns.push('Robotic speech pattern detected');
        }
        if (anomalies.delayed_then_fluent) {
          suspiciousPatterns.push('Delayed then fluent pattern detected (possible pre-prepared answer)');
        }
      }
    }

    // Calculate averages
    const avgLatency = validTimingCount > 0 ? totalLatency / validTimingCount : 0;
    const avgWpm = validTimingCount > 0 ? totalWpm / validTimingCount : 0;
    const avgPauseCount = validTimingCount > 0 ? totalPauseCount / validTimingCount : 0;
    const avgFillerRatio = validTimingCount > 0 ? totalFillerRatio / validTimingCount : 0;

    // Calculate timing anomaly score
    const anomalyScore = this.riskCalculator.calculateTimingAnomalyScore(
      avgLatency,
      avgWpm,
      avgFillerRatio,
      unusuallyFast,
      unusuallySlow,
      answers.length
    );

    return {
      total_answers: answers.length,
      avg_response_latency_ms: Math.round(avgLatency),
      avg_words_per_minute: Math.round(avgWpm),
      avg_pause_count: Math.round(avgPauseCount * 10) / 10,
      avg_filler_ratio: Math.round(avgFillerRatio * 1000) / 1000,
      anomaly_score: Math.round(anomalyScore * 100) / 100,
      unusually_fast_responses: unusuallyFast,
      unusually_slow_responses: unusuallySlow,
      suspicious_patterns: [...new Set(suspiciousPatterns)], // Remove duplicates
    };
  }

  /**
   * Get expected response latency by question difficulty
   */
  private getExpectedLatency(difficulty: string): number {
    const latencyMap: Record<string, number> = {
      easy: 5000,      // 5 seconds
      medium: 10000,   // 10 seconds
      hard: 20000,     // 20 seconds
      expert: 30000,   // 30 seconds
    };
    return latencyMap[difficulty] ?? 10000;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    riskAnalysis: RiskAnalysis,
    securitySummary: SecuritySummary,
    gazeAnalysis?: GazeAnalysisSummary,
    timingAnalysis?: TimingAnalysisSummary
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // High risk recommendations
    if (riskAnalysis.risk_level === 'high' || riskAnalysis.risk_level === 'critical') {
      recommendations.push({
        type: 'action',
        category: 'integrity',
        title: 'Manual Review Required',
        description:
          'High risk score detected. Immediate manual review of session recordings and answers is recommended.',
        severity: 'critical',
        action_required: true,
      });
    }

    // Security event recommendations
    if (securitySummary.events_by_severity.critical > 0) {
      recommendations.push({
        type: 'warning',
        category: 'security',
        title: 'Critical Security Events Detected',
        description: `${securitySummary.events_by_severity.critical} critical security events were logged during the session.`,
        severity: 'critical',
        action_required: true,
      });
    }

    // AI detection recommendations
    if (riskAnalysis.ai_detection_score > 0.75) {
      recommendations.push({
        type: 'warning',
        category: 'integrity',
        title: 'Possible AI-Generated Answers',
        description: 'High similarity to AI-generated content detected in one or more answers.',
        severity: 'high',
        action_required: true,
      });
    }

    return recommendations;
  }

  /**
   * Generate overall assessment
   */
  private generateOverallAssessment(
    riskAnalysis: RiskAnalysis,
    securitySummary: SecuritySummary,
    recommendations: Recommendation[]
  ): OverallAssessment {
    const criticalRecommendations = recommendations.filter((r) => r.severity === 'critical');
    const highRecommendations = recommendations.filter((r) => r.severity === 'high');

    let verdict: 'pass' | 'review_required' | 'fail';
    let confidence: number;

    if (riskAnalysis.risk_level === 'critical' || criticalRecommendations.length > 0) {
      verdict = 'fail';
      confidence = 0.9;
    } else if (riskAnalysis.risk_level === 'high' || highRecommendations.length > 0) {
      verdict = 'review_required';
      confidence = 0.75;
    } else {
      verdict = 'pass';
      confidence = 0.85;
    }

    return {
      verdict,
      confidence,
      summary: this.generateSummaryText(verdict, riskAnalysis),
      key_findings: [],
      red_flags: [],
    };
  }

  /**
   * Format questions and answers for report
   */
  private formatQuestionsAndAnswers(questions: any[]): QuestionAnswerReport[] {
    return questions.map((q) => {
      const answer = q.answerAnalysis && q.answerAnalysis.length > 0 ? q.answerAnalysis[0] : null;

      return {
        question_id: q.id,
        question_text: q.questionText,
        difficulty: q.difficulty,
        expected_duration_seconds: q.expectedDuration,
        asked_at: q.askedAt?.toISOString() || null,
        answer: answer
          ? {
              answer_id: answer.id,
              answer_text: answer.answerText,
              audio_url: answer.answerAudioUrl,
              risk_score: answer.riskScore ? parseFloat(answer.riskScore.toString()) : null,
              is_ai_generated: answer.isAiGenerated,
              confidence_score: answer.confidenceScore
                ? parseFloat(answer.confidenceScore.toString())
                : null,
              ai_similarity_scores: answer.similarityScores as Record<string, number>,
              response_timing: answer.responseTiming as any,
              perplexity_score: answer.perplexityScore
                ? parseFloat(answer.perplexityScore.toString())
                : null,
            }
          : undefined,
      };
    });
  }

  /**
   * Generate summary text
   */
  private generateSummaryText(verdict: string, riskAnalysis: RiskAnalysis): string {
    const riskPercentage = (riskAnalysis.overall_risk_score * 100).toFixed(1);

    if (verdict === 'fail') {
      return `Session failed integrity checks with a risk score of ${riskPercentage}%. Multiple concerning indicators detected.`;
    } else if (verdict === 'review_required') {
      return `Session requires manual review with a risk score of ${riskPercentage}%. Some anomalies detected.`;
    } else {
      return `Session passed integrity checks with a risk score of ${riskPercentage}%. No significant concerns detected.`;
    }
  }
}

export default new ReportService();
