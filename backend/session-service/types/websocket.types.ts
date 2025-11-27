import { SessionStatus, SecurityEventType, SeverityLevel } from '@prisma/client';
import { QuestionDetail, UserInfo, SecurityEventDetail } from './session.types';

// WebSocket event types
export type WebSocketEventType =
  // Session lifecycle events
  | 'session.created'
  | 'session.started'
  | 'session.ended'
  | 'session.cancelled'
  | 'session.updated'
  // Participant events
  | 'participant.joined'
  | 'participant.left'
  | 'participant.reconnected'
  // Question events
  | 'question.asked'
  | 'answer.submitted'
  | 'answer.analyzed'
  // Security events
  | 'security.alert'
  | 'security.warning'
  // Gaze tracking events
  | 'gaze.update'
  | 'gaze.off_screen'
  // System events
  | 'ping'
  | 'pong'
  | 'error';

// WebSocket message structure
export interface WebSocketMessage<T = unknown> {
  event: WebSocketEventType;
  timestamp: string;
  session_id?: string;
  data: T;
}

// Client-to-server events
export interface JoinSessionPayload {
  session_id: string;
  user_id: string;
  token: string;
}

export interface LeaveSessionPayload {
  session_id: string;
  user_id: string;
}

export interface SubmitAnswerPayload {
  session_id: string;
  question_id: string;
  answer_text: string;
  user_id: string;
}

export interface HeartbeatPayload {
  session_id: string;
  user_id: string;
  timestamp: string;
}

// Server-to-client events
export interface SessionCreatedEvent {
  session_id: string;
  status: SessionStatus;
  interviewer: UserInfo;
  interviewee?: UserInfo;
  scheduled_start: string;
}

export interface SessionStartedEvent {
  session_id: string;
  status: 'active';
  started_at: string;
  participants: Array<{
    user_id: string;
    role: 'interviewer' | 'interviewee';
    connected: boolean;
  }>;
}

export interface SessionEndedEvent {
  session_id: string;
  status: 'ended';
  ended_at: string;
  duration_seconds: number;
  reason?: string;
}

export interface SessionCancelledEvent {
  session_id: string;
  status: 'cancelled';
  cancelled_at: string;
  cancelled_by: string;
  reason?: string;
}

export interface ParticipantJoinedEvent {
  session_id: string;
  user_id: string;
  role: 'interviewer' | 'interviewee';
  full_name: string;
  joined_at: string;
}

export interface ParticipantLeftEvent {
  session_id: string;
  user_id: string;
  role: 'interviewer' | 'interviewee';
  left_at: string;
}

export interface QuestionAskedEvent {
  session_id: string;
  question: QuestionDetail;
  asked_at: string;
  asked_by: string;
}

export interface AnswerSubmittedEvent {
  session_id: string;
  question_id: string;
  answer_id: string;
  submitted_by: string;
  submitted_at: string;
}

export interface AnswerAnalyzedEvent {
  session_id: string;
  question_id: string;
  answer_id: string;
  risk_score: number;
  is_ai_generated: boolean;
  confidence_score: number;
}

export interface SecurityAlertEvent {
  session_id: string;
  event: SecurityEventDetail;
  requires_action: boolean;
}

export interface GazeUpdateEvent {
  session_id: string;
  user_id: string;
  gaze_x: number;
  gaze_y: number;
  is_off_screen: boolean;
  off_screen_direction?: string;
  timestamp: string;
}

export interface GazeOffScreenEvent {
  session_id: string;
  user_id: string;
  direction: string;
  duration_ms: number;
  timestamp: string;
}

export interface ErrorEvent {
  error_code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Socket authentication
export interface SocketAuthPayload {
  token: string;
  user_id: string;
  session_id?: string;
}

export interface AuthenticatedSocket {
  id: string;
  user_id: string;
  session_id?: string;
  role?: 'interviewer' | 'interviewee';
  authenticated: boolean;
}

// Room management
export interface SessionRoom {
  session_id: string;
  participants: Set<string>; // socket IDs
  created_at: Date;
}

// WebSocket server configuration
export interface WebSocketConfig {
  port: number;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  pingInterval: number;
  pingTimeout: number;
  maxConnections?: number;
  transports?: ('websocket' | 'polling')[];
}

// Connection metadata
export interface ConnectionMetadata {
  socket_id: string;
  user_id: string;
  session_id?: string;
  role?: 'interviewer' | 'interviewee';
  connected_at: Date;
  last_heartbeat: Date;
  ip_address?: string;
  user_agent?: string;
}

// Broadcast options
export interface BroadcastOptions {
  session_id: string;
  exclude_sender?: boolean;
  sender_socket_id?: string;
  to_role?: 'interviewer' | 'interviewee';
}
