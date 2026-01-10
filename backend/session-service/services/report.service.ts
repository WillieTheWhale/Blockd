import { PrismaClient, Prisma } from '@prisma/client';
import prisma from '../src/database';
import { RiskCalculator, defaultRiskCalculator } from '../lib/risk-calculator';
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

/**
 * Transaction isolation levels for report generation
 */
const REPORT_TRANSACTION_OPTIONS: {
  isolationLevel: Prisma.TransactionIsolationLevel;
  timeout: number;
} = {
  // REPEATABLE READ ensures all reads see the same snapshot
  // This prevents phantom reads during the report generation
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  // Extended timeout for complex report generation (2 minutes)
  timeout: 120000,
};

/**
 * Type for transaction client
 */
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Report Service
 * Handles session report generation and risk scoring
 * All operations use transaction isolation for data consistency
 */
export class ReportService {
  private riskCalculator: RiskCalculator;

  constructor() {
    this.riskCalculator = defaultRiskCalculator;
  }

  /**
   * Generate comprehensive session report
   * Uses REPEATABLE READ isolation to ensure consistent data snapshot
   */
  async generateReport(sessionId: string): Promise<SessionReport> {
    // Wrap entire report generation in a transaction for consistency
    return await prisma.$transaction(
      async (tx: TransactionClient) => {
        // Get session with all related data
        const session = await tx.interviewSession.findUnique({
          where: { id: sessionId },
          include: {
            interviewer: true,
            interviewee: true,
            organization: true,
            questions: {
              orderBy: { questionOrder: 'asc' },
              include: {
                answerAnalysis: true,
              },
            },
            securityEvents: {
              orderBy: { timestamp: 'desc' },
            },
          },
        });

        if (!session) {
          throw new SessionNotFoundError(sessionId);
        }

        // Validate session is in a state that can have a report generated
        if (session.status !== 'ended') {
          throw new ReportGenerationError(
            `Cannot generate report for session in '${session.status}' status. Session must be ended.`
          );
        }

        // Calculate risk analysis within transaction
        const riskAnalysis = await this.calculateRiskAnalysis(tx, sessionId, session);

        // Generate security summary within transaction
        const securitySummary = this.generateSecuritySummary(session.securityEvents);

        // Generate gaze analysis within transaction
        const gazeAnalysis = await this.generateGazeAnalysis(tx, sessionId);

        // Generate timing analysis from already-fetched data
        const timingAnalysis = this.generateTimingAnalysisFromAnswers(session.questions);

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

        // Update session risk score
        await tx.interviewSession.update({
          where: { id: sessionId },
          data: { riskScore: riskAnalysis.overall_risk_score },
        });

        // Create report record in database (within same transaction)
        const reportRecord = await tx.sessionReport.create({
          data: {
            sessionId,
            overallRiskScore: riskAnalysis.overall_risk_score,
            aiDetectionScore: riskAnalysis.ai_detection_score,
            gazeAnomalyScore: riskAnalysis.gaze_anomaly_score,
            timingAnomalyScore: riskAnalysis.timing_anomaly_score,
            securityEventsCount: securitySummary.total_events,
            recommendations: JSON.parse(JSON.stringify(recommendations)),
            detailedAnalysis: JSON.parse(
              JSON.stringify({
                risk_analysis: riskAnalysis,
                security_summary: securitySummary,
                gaze_analysis: gazeAnalysis,
                timing_analysis: timingAnalysis,
              })
            ),
          },
        });

        // Build report object (no DB access needed here)
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

        return report;
      },
      REPORT_TRANSACTION_OPTIONS
    ).then(async (report) => {
      // Send notification outside of transaction (non-critical)
      try {
        await notificationService.sendReportEmail(report.interviewer.email, report);
      } catch (error) {
        // Log but don't fail - notification is not critical to report generation
        console.error('[ReportService] Failed to send report notification:', error);
      }
      return report;
    });
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
   * Get existing report without regenerating
   */
  async getExistingReport(sessionId: string): Promise<SessionReport | null> {
    const reportRecord = await prisma.sessionReport.findFirst({
      where: { sessionId },
      orderBy: { generatedAt: 'desc' },
      include: {
        session: {
          include: {
            interviewer: true,
            interviewee: true,
            organization: true,
            questions: {
              orderBy: { questionOrder: 'asc' },
              include: {
                answerAnalysis: true,
              },
            },
            securityEvents: {
              orderBy: { timestamp: 'desc' },
            },
          },
        },
      },
    });

    if (!reportRecord) {
      return null;
    }

    const session = reportRecord.session;
    const detailedAnalysis = reportRecord.detailedAnalysis as Record<string, unknown>;

    return {
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
      risk_analysis: detailedAnalysis.risk_analysis as RiskAnalysis,
      security_summary: detailedAnalysis.security_summary as SecuritySummary,
      gaze_analysis: detailedAnalysis.gaze_analysis as GazeAnalysisSummary | undefined,
      timing_analysis: detailedAnalysis.timing_analysis as TimingAnalysisSummary | undefined,
      recommendations: reportRecord.recommendations as unknown as Recommendation[],
      overall_assessment: this.generateOverallAssessment(
        detailedAnalysis.risk_analysis as RiskAnalysis,
        detailedAnalysis.security_summary as SecuritySummary,
        reportRecord.recommendations as unknown as Recommendation[]
      ),
    };
  }

  /**
   * Calculate comprehensive risk analysis (within transaction)
   */
  private async calculateRiskAnalysis(
    tx: TransactionClient,
    sessionId: string,
    session: {
      durationMinutes: number | null;
      questions: Array<{
        answerAnalysis: Array<{
          id: string;
          riskScore: Prisma.Decimal | null;
          responseTiming: unknown;
        }>;
      }>;
    }
  ): Promise<RiskAnalysis> {
    // Extract answers from already-fetched session data
    const answers = session.questions.flatMap((q) =>
      q.answerAnalysis.map((a) => ({
        ...a,
        question: { difficulty: null as string | null },
      }))
    );

    // Calculate AI detection score
    const aiScores = answers
      .filter((a) => a.riskScore !== null)
      .map((a) => parseFloat(a.riskScore!.toString()));
    const aiDetectionScore = aiScores.length > 0 ? Math.max(...aiScores) : 0;

    // Get security events count from already-fetched session data
    const securityEvents = await tx.securityEvent.findMany({
      where: { sessionId },
    });

    const securityEventsScore = this.riskCalculator.calculateSecurityEventsScore(
      securityEvents.map((e) => ({ severity: e.severity, count: 1 }))
    );

    // Get gaze data within transaction
    const [gazeEventsCount, offScreenCount] = await Promise.all([
      tx.gazeEvent.count({ where: { sessionId } }),
      tx.gazeEvent.count({ where: { sessionId, isOffScreen: true } }),
    ]);

    const gazeAnomalyScore = this.riskCalculator.calculateGazeAnomalyScore(
      gazeEventsCount,
      offScreenCount,
      0, // Would need to calculate actual off-screen duration from timestamps
      session.durationMinutes || 0
    );

    // Calculate timing anomaly score from actual response timing data
    const timingAnomalyScore = this.calculateTimingAnomalyScoreFromAnswers(
      answers.map((a) => ({
        responseTiming: a.responseTiming,
        question: { difficulty: null },
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
    const flaggedAnswers = answers
      .filter((a) => a.riskScore && parseFloat(a.riskScore.toString()) > 0.75)
      .map((a) => a.id);

    // Flagged behaviors from timing anomalies
    const flaggedBehaviors = this.extractFlaggedBehaviors(
      answers.map((a) => ({
        responseTiming: a.responseTiming,
        question: { questionOrder: null },
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
  private calculateTimingAnomalyScoreFromAnswers(
    answers: Array<{
      responseTiming: unknown;
      question: { difficulty: string | null } | null;
    }>
  ): number {
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
      const wpm = Number(timing.words_per_minute ?? timing.wpm ?? timing.speech_rate_wpm ?? 0);
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
  private extractFlaggedBehaviors(
    answers: Array<{
      responseTiming: unknown;
      question: { questionOrder: number | null } | null;
    }>
  ): string[] {
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
   * Generate security summary from already-fetched events
   */
  private generateSecuritySummary(
    events: Array<{
      id: string;
      eventType: string;
      severity: string;
      description: string | null;
      metadata: unknown;
      timestamp: Date;
    }>
  ): SecuritySummary {
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
   * Generate gaze analysis summary (within transaction)
   */
  private async generateGazeAnalysis(
    tx: TransactionClient,
    sessionId: string
  ): Promise<GazeAnalysisSummary | undefined> {
    const gazeEvents = await tx.gazeEvent.findMany({
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
   * Generate timing analysis from already-fetched question data
   */
  private generateTimingAnalysisFromAnswers(
    questions: Array<{
      answerAnalysis: Array<{
        responseTiming: unknown;
      }>;
      questionOrder: number | null;
      difficulty: string | null;
    }>
  ): TimingAnalysisSummary | undefined {
    const answers = questions.flatMap((q) =>
      q.answerAnalysis.map((a) => ({
        responseTiming: a.responseTiming,
        question: { questionOrder: q.questionOrder, difficulty: q.difficulty },
      }))
    );

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
      const wpm = Number(timing.words_per_minute ?? timing.wpm ?? timing.speech_rate_wpm ?? 0);
      const pauseCount = Number(timing.pause_count ?? timing.pauseCount ?? 0);
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
          suspiciousPatterns.push(
            `Instant response detected for question ${answer.question?.questionOrder ?? 'unknown'}`
          );
        }
        if (anomalies.unnatural_consistency) {
          suspiciousPatterns.push('Unnatural speech consistency detected');
        }
        if (anomalies.robotic_speech_pattern) {
          suspiciousPatterns.push('Robotic speech pattern detected');
        }
        if (anomalies.delayed_then_fluent) {
          suspiciousPatterns.push(
            'Delayed then fluent pattern detected (possible pre-prepared answer)'
          );
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
      easy: 5000, // 5 seconds
      medium: 10000, // 10 seconds
      hard: 20000, // 20 seconds
      expert: 30000, // 30 seconds
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

    // Gaze analysis recommendations
    if (gazeAnalysis && gazeAnalysis.off_screen_percentage > 30) {
      recommendations.push({
        type: 'warning',
        category: 'behavior',
        title: 'Excessive Off-Screen Gaze',
        description: `${gazeAnalysis.off_screen_percentage.toFixed(1)}% of gaze events were off-screen, which may indicate reference material usage.`,
        severity: 'medium',
        action_required: false,
      });
    }

    // Timing analysis recommendations
    if (timingAnalysis && timingAnalysis.unusually_fast_responses > 2) {
      recommendations.push({
        type: 'warning',
        category: 'behavior',
        title: 'Unusually Fast Responses',
        description: `${timingAnalysis.unusually_fast_responses} responses were unusually fast for question complexity, suggesting pre-prepared answers.`,
        severity: 'medium',
        action_required: false,
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

    // Generate key findings
    const keyFindings: string[] = [];
    if (riskAnalysis.ai_detection_score > 0.5) {
      keyFindings.push(`AI detection score: ${(riskAnalysis.ai_detection_score * 100).toFixed(0)}%`);
    }
    if (securitySummary.total_events > 0) {
      keyFindings.push(`${securitySummary.total_events} security events recorded`);
    }
    if (riskAnalysis.flagged_answers.length > 0) {
      keyFindings.push(`${riskAnalysis.flagged_answers.length} answer(s) flagged for review`);
    }

    // Generate red flags
    const redFlags: string[] = [];
    if (riskAnalysis.ai_detection_score > 0.85) {
      redFlags.push('Very high AI similarity detected');
    }
    if (securitySummary.events_by_severity.critical > 0) {
      redFlags.push(`${securitySummary.events_by_severity.critical} critical security event(s)`);
    }
    riskAnalysis.flagged_behaviors.forEach((behavior) => {
      if (behavior.includes('Instant response') || behavior.includes('Robotic')) {
        redFlags.push(behavior);
      }
    });

    return {
      verdict,
      confidence,
      summary: this.generateSummaryText(verdict, riskAnalysis),
      key_findings: keyFindings,
      red_flags: redFlags,
    };
  }

  /**
   * Format questions and answers for report
   */
  private formatQuestionsAndAnswers(
    questions: Array<{
      id: string;
      questionText: string;
      difficulty: string | null;
      expectedDuration: number | null;
      askedAt: Date | null;
      answerAnalysis: Array<{
        id: string;
        answerText: string | null;
        answerAudioUrl: string | null;
        riskScore: Prisma.Decimal | null;
        isAiGenerated: boolean | null;
        confidenceScore: Prisma.Decimal | null;
        similarityScores: unknown;
        responseTiming: unknown;
        perplexityScore: Prisma.Decimal | null;
      }>;
    }>
  ): QuestionAnswerReport[] {
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
              response_timing: answer.responseTiming as Record<string, unknown>,
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
