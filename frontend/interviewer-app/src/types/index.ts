/**
 * Global TypeScript type definitions
 */

// Re-export types from constants
export type { SessionStatus, QuestionType, DifficultyLevel, UserRole } from '@/lib/constants'

// Import types for local use
import type { SessionStatus, QuestionType, DifficultyLevel, UserRole } from '@/lib/constants'

/**
 * User types
 */
export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  avatar?: string
  createdAt: string
  updatedAt: string
}

export interface LoginCredentials {
  email: string
  password: string
  mfaCode?: string
  rememberMe?: boolean
}

export interface RegisterData {
  email: string
  password: string
  name: string
  role: UserRole
  organization?: string
  newOrganization?: string
}

export interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
}

export interface ProfileUpdateFormData {
  name: string
  email: string
  avatar?: string
}

/**
 * Session types
 */
export interface Session {
  id: string
  title: string
  description?: string
  status: SessionStatus
  candidateId: string
  candidateName: string
  candidateEmail: string
  interviewerId: string
  interviewerName: string
  scheduledAt: string
  startedAt?: string
  endedAt?: string
  duration?: number
  position?: string
  department?: string
  createdAt: string
  updatedAt: string
}

export interface CreateSessionData {
  title: string
  description?: string
  candidateName: string
  candidateEmail: string
  scheduledAt: string
  position?: string
  department?: string
}

export interface CreateSessionFormData {
  title: string
  description?: string
  candidateName: string
  candidateEmail: string
  scheduledAt: string
  duration: number
  position?: string
  department?: string
  questions: {
    content: string
    type: QuestionType
    difficulty: DifficultyLevel
    options?: string[]
    correctAnswer?: string
  }[]
  settings: {
    enableRecording: boolean
    enableAiDetection: boolean
    enableEyeTracking: boolean
    sendEmailInvitation: boolean
  }
}

export interface UpdateSessionData {
  title?: string
  description?: string
  scheduledAt?: string
  position?: string
  department?: string
}

/**
 * Question types
 */
export interface Question {
  id: string
  sessionId: string
  type: QuestionType
  difficulty: DifficultyLevel
  content: string
  options?: string[]
  correctAnswer?: string
  metadata?: Record<string, unknown>
  order: number
  createdAt: string
}

export interface Answer {
  id: string
  questionId: string
  sessionId: string
  content: string
  isCorrect?: boolean
  score?: number
  feedback?: string
  createdAt: string
}

export interface SubmitAnswerData {
  content: string
  timeSpent?: number
}

/**
 * Report types
 */
export interface Report {
  id: string
  sessionId: string
  overallScore: number
  totalQuestions: number
  correctAnswers: number
  averageTimePerQuestion: number
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  detailedAnalysis: DetailedAnalysis[]
  generatedAt: string
}

export interface DetailedAnalysis {
  questionId: string
  question: string
  answer: string
  score: number
  feedback: string
  category: string
}

/**
 * WebSocket message types
 */
export interface WebSocketMessage {
  type: 'session_started' | 'session_ended' | 'question_sent' | 'answer_received' | 'error'
  payload: unknown
  timestamp: string
}

/**
 * Real-time event types
 */
export type SecurityEventSeverity = 'low' | 'medium' | 'high' | 'critical'
export type SecurityEventType =
  | 'tab_switch'
  | 'window_blur'
  | 'copy_paste'
  | 'multiple_faces'
  | 'no_face'
  | 'unauthorized_device'
  | 'network_disconnect'
  | 'suspicious_activity'

export interface SecurityEvent {
  id: string
  sessionId: string
  type: SecurityEventType
  severity: SecurityEventSeverity
  description: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface GazePoint {
  x: number
  y: number
  timestamp: number
  confidence?: number
}

export interface GazeData {
  sessionId: string
  points: GazePoint[]
  timestamp: string
}

export interface ChatMessage {
  id: string
  sessionId: string
  senderId: string
  senderName: string
  content: string
  type: 'user' | 'system'
  timestamp: string
  delivered?: boolean
  read?: boolean
}

export interface AIDetectionResult {
  id: string
  sessionId: string
  questionId: string
  answerId: string
  riskScore: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  similarityScores: {
    gpt4: number
    claude: number
    gemini: number
  }
  flags: Array<{
    type: string
    description: string
    severity: SecurityEventSeverity
  }>
  perplexityScore: number
  ngramOverlap: number
  recommendation: string
  detailedAnalysis?: string
  createdAt: string
}

export interface VideoStreamStats {
  bandwidth: number
  latency: number
  packetsLost: number
  frameRate: number
  resolution: {
    width: number
    height: number
  }
}

export interface WebRTCConfig {
  iceServers: Array<{
    urls: string | string[]
    username?: string
    credential?: string
  }>
  codecPreferences?: {
    video?: string
    audio?: string
  }
}

/**
 * Pagination types
 */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PaginationParams {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/**
 * API Response types
 */
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export interface ApiErrorResponse {
  success: false
  error: string
  message: string
  statusCode: number
}
