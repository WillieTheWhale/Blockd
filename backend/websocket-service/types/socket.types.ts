/**
 * WebSocket Socket Types
 * Type definitions for Socket.io events and socket data
 */

import { Socket as IOSocket } from 'socket.io';

/**
 * User data attached to socket connection
 */
export interface SocketUserData {
  user_id: string;
  email: string;
  role: 'interviewer' | 'interviewee' | 'admin';
  organization_id?: string;
  latency?: number;
}

/**
 * Socket Data (attached to each socket)
 */
export interface SocketData {
  user: SocketUserData;
  sessionId?: string;
  connectedAt: Date;
  lastActivity: Date;
  latency?: number;
}

/**
 * Extended Socket type with custom user data
 * Uses SocketData which contains the user object and session metadata
 */
export interface AuthenticatedSocket extends IOSocket {
  data: SocketData;
}

/**
 * Client to Server Events
 */
export interface ClientToServerEvents {
  // Session management
  'session:join': (data: SessionJoinData, callback?: (response: SessionJoinResponse) => void) => void;
  'session:leave': (data: SessionLeaveData) => void;

  // Heartbeat
  'pong': (data: PongData) => void;

  // Gaze tracking
  'gaze:stream': (data: GazeData) => void;

  // Security events
  'security:event': (data: SecurityEvent) => void;

  // Answer submission
  'answer:submit': (data: AnswerSubmitData, callback?: (response: AnswerSubmitResponse) => void) => void;

  // Chat messages
  'chat:message': (data: ChatMessageData) => void;
}

/**
 * Server to Client Events
 */
export interface ServerToClientEvents {
  // Heartbeat
  'ping': (data: PingData) => void;

  // Session events
  'session:state': (data: SessionStateData) => void;
  'session:started': (data: SessionStartedData) => void;
  'session:ended': (data: SessionEndedData) => void;

  // Participant events
  'participant:joined': (data: ParticipantJoinedData) => void;
  'participant:left': (data: ParticipantLeftData) => void;

  // Security events
  'security:alert': (data: SecurityAlertData) => void;

  // Gaze updates
  'gaze:update': (data: GazeUpdateData) => void;

  // Question events
  'question:asked': (data: QuestionAskedData) => void;

  // Answer events
  'answer:received': (data: AnswerReceivedData) => void;

  // Chat events
  'chat:message': (data: ChatMessageData) => void;

  // Error events
  'error': (data: ErrorData) => void;
}

/**
 * Inter-server Events (for Socket.io cluster)
 */
export interface InterServerEvents {
  'session:broadcast': (sessionId: string, event: string, data: any) => void;
  'user:broadcast': (userId: string, event: string, data: any) => void;
}

// Event data types

export interface SessionJoinData {
  session_id: string;
}

export interface SessionJoinResponse {
  success: boolean;
  message?: string;
  sessionState?: SessionStateData;
}

export interface SessionLeaveData {
  session_id: string;
}

export interface PingData {
  timestamp: number;
}

export interface PongData {
  timestamp: number;
}

export interface GazeData {
  session_id: string;
  gaze_x: number;
  gaze_y: number;
  is_off_screen: boolean;
  off_screen_direction?: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  confidence: number;
  timestamp: string;
}

export interface GazeUpdateData extends GazeData {
  user_id?: string;
}

export interface SecurityEvent {
  session_id: string;
  event_type: 'tab_switch' | 'window_blur' | 'copy_paste' | 'devtools_open' | 'fullscreen_exit' | 'multiple_monitors' | 'suspicious_activity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface SecurityAlertData {
  event_id: string;
  session_id: string;
  event_type: string;
  severity: string;
  description: string;
  timestamp: string;
}

export interface AnswerSubmitData {
  session_id: string;
  question_id: string;
  answer_text: string;
  time_taken_seconds: number;
}

export interface AnswerSubmitResponse {
  success: boolean;
  answer_id?: string;
  message?: string;
}

export interface ChatMessageData {
  message_id?: string;
  session_id: string;
  message: string;
  sender_id?: string;
  sender_role?: string;
  timestamp?: string;
}

export interface SessionStateData {
  session_id: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  participants: ParticipantData[];
  current_question?: QuestionData;
  started_at?: string;
  ends_at?: string;
}

export interface SessionStartedData {
  session_id: string;
  started_at: string;
  interviewer: ParticipantData;
  interviewee: ParticipantData;
}

export interface SessionEndedData {
  session_id: string;
  ended_at: string;
  reason?: string;
}

export interface ParticipantData {
  user_id: string;
  email: string;
  role: string;
  full_name?: string;
}

export interface ParticipantJoinedData {
  user_id: string;
  role: string;
  timestamp: string;
}

export interface ParticipantLeftData {
  user_id: string;
  timestamp: string;
}

export interface QuestionData {
  question_id: string;
  question_text: string;
  difficulty?: string;
  category?: string;
}

export interface QuestionAskedData {
  session_id: string;
  question: QuestionData;
  asked_at: string;
}

export interface AnswerReceivedData {
  session_id: string;
  answer_id: string;
  question_id: string;
  interviewee_id: string;
  timestamp: string;
}

export interface ErrorData {
  message: string;
  code?: string;
  details?: any;
}
