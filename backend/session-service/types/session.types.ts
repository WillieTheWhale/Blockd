import { SessionStatus, QuestionDifficulty, SeverityLevel, SecurityEventType } from '@prisma/client';

// Session-related types
export interface CreateSessionDTO {
  interviewee_id?: string;
  interviewee_email?: string;
  scheduled_start: string; // ISO8601
  duration_minutes: number;
  questions: CreateQuestionDTO[];
  metadata?: Record<string, unknown>;
}

export interface CreateQuestionDTO {
  question_text: string;
  expected_duration_seconds?: number;
  difficulty?: QuestionDifficulty;
  question_order?: number;
}

export interface SessionResponse {
  session_id: string;
  session_token: string;
  status: SessionStatus;
  join_url: string;
  websocket_url: string;
  interviewer: UserInfo;
  interviewee?: UserInfo;
  scheduled_start: string;
  created_at: string;
}

export interface SessionDetailResponse {
  session_id: string;
  status: SessionStatus;
  interviewer: UserInfo;
  interviewee?: UserInfo;
  scheduled_start: string | null;
  actual_start: string | null;
  actual_end: string | null;
  duration_seconds: number | null;
  questions: QuestionDetail[];
  security_events: SecurityEventDetail[];
  risk_score: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserInfo {
  user_id: string;
  full_name: string;
  email: string;
  role?: string;
}

export interface QuestionDetail {
  question_id: string;
  question_text: string;
  question_order: number | null;
  expected_duration: number | null;
  difficulty: QuestionDifficulty | null;
  asked_at: string | null;
  answer?: AnswerDetail;
}

export interface AnswerDetail {
  answer_id: string;
  answer_text: string;
  risk_score: number | null;
  is_ai_generated: boolean | null;
  confidence_score: number | null;
  analyzed_at: string;
}

export interface SecurityEventDetail {
  event_id: string;
  event_type: SecurityEventType;
  severity: SeverityLevel;
  description: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface SessionListQuery {
  page?: number;
  limit?: number;
  status?: SessionStatus;
  interviewer_id?: string;
  interviewee_id?: string;
  organization_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface StartSessionDTO {
  started_by: string; // user_id
}

export interface EndSessionDTO {
  ended_by: string; // user_id
  reason?: string;
}

export interface CancelSessionDTO {
  cancelled_by: string; // user_id
  reason?: string;
}

export interface ParticipantInfo {
  user_id: string;
  role: 'interviewer' | 'interviewee';
  connected: boolean;
  joined_at?: string;
}

export interface ActiveSessionResponse {
  session_id: string;
  status: 'active';
  started_at: string;
  websocket_url: string;
  participants: ParticipantInfo[];
  current_question?: QuestionDetail;
}

export interface EndedSessionResponse {
  session_id: string;
  status: 'ended';
  ended_at: string;
  duration_seconds: number;
  report_id: string;
}

// Session state machine types
export type SessionState = SessionStatus;

export interface SessionTransition {
  from: SessionState;
  to: SessionState;
  event: SessionEvent;
}

export type SessionEvent = 'schedule' | 'start' | 'end' | 'cancel';

export interface StateTransitionResult {
  success: boolean;
  previousState: SessionState;
  newState: SessionState;
  timestamp: Date;
  error?: string;
}

// Session participant types
export interface SessionParticipant {
  session_id: string;
  user_id: string;
  role: 'interviewer' | 'interviewee';
  socket_id?: string;
  connected: boolean;
  joined_at: Date;
  left_at?: Date;
}

// Session cache types (Redis)
export interface CachedSession {
  session_id: string;
  status: SessionStatus;
  interviewer_id: string;
  interviewee_id?: string;
  scheduled_start: string;
  actual_start?: string;
  metadata: Record<string, unknown>;
}

export interface CachedParticipants {
  [userId: string]: SessionParticipant;
}

// Security event types
export interface CreateSecurityEventDTO {
  event_type: SecurityEventType;
  severity: SeverityLevel;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface SecurityEventResponse {
  event_id: string;
  acknowledged: boolean;
  timestamp: string;
}

// Question management
export interface AskQuestionDTO {
  asked_by: string; // user_id - question_id comes from URL params
}

export interface SubmitAnswerDTO {
  question_id: string;
  answer_text: string;
  answer_audio_url?: string;
  submitted_by: string; // user_id
}

// Session statistics
export interface SessionStatistics {
  total_sessions: number;
  active_sessions: number;
  completed_sessions: number;
  cancelled_sessions: number;
  avg_duration_minutes: number;
  avg_risk_score: number;
  high_risk_sessions: number;
}
