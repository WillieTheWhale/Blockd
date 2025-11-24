import { SessionStatus, QuestionDifficulty } from '@prisma/client';
import { SecurityEventDetail, QuestionDetail } from './session.types';

// Report generation types
export interface GenerateReportDTO {
  session_id: string;
  format?: 'json' | 'pdf';
  include_gaze_data?: boolean;
  include_telemetry?: boolean;
}

export interface SessionReport {
  report_id: string;
  session_id: string;
  generated_at: string;

  // Session metadata
  session_metadata: SessionMetadata;

  // Participants
  interviewer: ParticipantDetails;
  interviewee: ParticipantDetails;

  // Interview content
  questions_and_answers: QuestionAnswerReport[];

  // Analysis results
  risk_analysis: RiskAnalysis;

  // Security
  security_summary: SecuritySummary;

  // Behavioral analysis
  gaze_analysis?: GazeAnalysisSummary;
  timing_analysis?: TimingAnalysisSummary;

  // Recommendations
  recommendations: Recommendation[];

  // Overall assessment
  overall_assessment: OverallAssessment;
}

export interface SessionMetadata {
  session_id: string;
  status: SessionStatus;
  scheduled_start: string | null;
  actual_start: string | null;
  actual_end: string | null;
  duration_minutes: number | null;
  organization: {
    id: string;
    name: string;
  };
}

export interface ParticipantDetails {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
}

export interface QuestionAnswerReport {
  question_id: string;
  question_text: string;
  difficulty: QuestionDifficulty | null;
  expected_duration_seconds: number | null;
  asked_at: string | null;

  answer?: {
    answer_id: string;
    answer_text: string;
    transcription?: string;
    audio_url?: string;

    // Analysis
    risk_score: number | null;
    is_ai_generated: boolean | null;
    confidence_score: number | null;

    // AI similarity
    ai_similarity_scores: {
      [model: string]: number;
    };

    // Timing
    response_timing: {
      latency_ms?: number;
      words_per_minute?: number;
      pause_count?: number;
      filler_word_ratio?: number;
    };

    // Perplexity
    perplexity_score: number | null;
  };
}

export interface RiskAnalysis {
  overall_risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';

  // Component scores
  ai_detection_score: number;
  security_events_score: number;
  gaze_anomaly_score: number;
  timing_anomaly_score: number;

  // Weights used
  weights: {
    ai_detection: number;
    security_events: number;
    gaze_anomaly: number;
    timing_anomaly: number;
  };

  // Flagged items
  flagged_answers: string[]; // answer_ids
  flagged_behaviors: string[];
}

export interface SecuritySummary {
  total_events: number;
  events_by_severity: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  events_by_type: {
    [eventType: string]: number;
  };
  timeline: SecurityEventDetail[];
  critical_events: SecurityEventDetail[];
}

export interface GazeAnalysisSummary {
  total_gaze_events: number;
  off_screen_events: number;
  off_screen_percentage: number;
  off_screen_duration_seconds: number;

  // Directions
  off_screen_by_direction: {
    left: number;
    right: number;
    up: number;
    down: number;
  };

  // Anomalies
  anomaly_score: number;
  suspicious_patterns: string[];
}

export interface TimingAnalysisSummary {
  total_answers: number;
  avg_response_latency_ms: number;
  avg_words_per_minute: number;
  avg_pause_count: number;
  avg_filler_ratio: number;

  // Anomalies
  anomaly_score: number;
  unusually_fast_responses: number;
  unusually_slow_responses: number;
  suspicious_patterns: string[];
}

export interface Recommendation {
  type: 'action' | 'warning' | 'info';
  category: 'security' | 'integrity' | 'quality' | 'technical';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action_required: boolean;
}

export interface OverallAssessment {
  verdict: 'pass' | 'review_required' | 'fail';
  confidence: number; // 0-1
  summary: string;
  key_findings: string[];
  red_flags: string[];
}

// PDF Report configuration
export interface PDFReportOptions {
  include_cover_page: boolean;
  include_table_of_contents: boolean;
  include_charts: boolean;
  include_detailed_timeline: boolean;
  company_logo_url?: string;
  footer_text?: string;
}

// Risk calculation configuration
export interface RiskCalculationConfig {
  weights: {
    ai_detection: number;
    security_events: number;
    gaze_anomaly: number;
    timing_anomaly: number;
  };
  thresholds: {
    low: number;
    medium: number;
    high: number;
  };
  severity_multipliers: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

// Report export formats
export interface ReportExport {
  format: 'json' | 'pdf';
  content: Buffer | string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  generated_at: string;
}
