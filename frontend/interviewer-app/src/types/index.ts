/**
 * Global TypeScript type definitions
 */

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
}

export interface RegisterData {
  email: string
  password: string
  name: string
  role: UserRole
}

export interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
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
