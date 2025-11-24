/**
 * Application-wide constants
 */

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Blockd'
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
export const APP_ENV = import.meta.env.VITE_APP_ENV || 'development'

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'blockd_access_token',
  REFRESH_TOKEN: 'blockd_refresh_token',
  USER_DATA: 'blockd_user_data',
  THEME: 'blockd_theme',
} as const

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    REGISTER: '/api/v1/auth/register',
    LOGOUT: '/api/v1/auth/logout',
    REFRESH: '/api/v1/auth/refresh',
    ME: '/api/v1/auth/me',
  },
  SESSIONS: {
    LIST: '/api/v1/sessions',
    CREATE: '/api/v1/sessions',
    GET: (id: string) => `/api/v1/sessions/${id}`,
    UPDATE: (id: string) => `/api/v1/sessions/${id}`,
    DELETE: (id: string) => `/api/v1/sessions/${id}`,
    START: (id: string) => `/api/v1/sessions/${id}/start`,
    END: (id: string) => `/api/v1/sessions/${id}/end`,
  },
  QUESTIONS: {
    LIST: (sessionId: string) => `/api/v1/sessions/${sessionId}/questions`,
    SUBMIT_ANSWER: (sessionId: string, questionId: string) =>
      `/api/v1/sessions/${sessionId}/questions/${questionId}/answer`,
  },
  REPORTS: {
    GET: (sessionId: string) => `/api/v1/reports/${sessionId}`,
    DOWNLOAD: (sessionId: string) => `/api/v1/reports/${sessionId}/download`,
  },
  USERS: {
    PROFILE: '/api/v1/users/me',
    UPDATE_PROFILE: '/api/v1/users/me',
  },
} as const

/**
 * Query keys for TanStack Query
 */
export const QUERY_KEYS = {
  AUTH: {
    ME: ['auth', 'me'] as const,
  },
  SESSIONS: {
    ALL: ['sessions'] as const,
    DETAIL: (id: string) => ['sessions', id] as const,
    LIST: (filters?: Record<string, unknown>) => ['sessions', 'list', filters] as const,
  },
  QUESTIONS: {
    LIST: (sessionId: string) => ['questions', sessionId] as const,
  },
  REPORTS: {
    GET: (sessionId: string) => ['reports', sessionId] as const,
  },
} as const

/**
 * Session status
 */
export const SESSION_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS]

/**
 * Question types
 */
export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 'multiple_choice',
  FREE_TEXT: 'free_text',
  CODING: 'coding',
  BEHAVIORAL: 'behavioral',
} as const

export type QuestionType = (typeof QUESTION_TYPES)[keyof typeof QUESTION_TYPES]

/**
 * Difficulty levels
 */
export const DIFFICULTY_LEVELS = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
} as const

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[keyof typeof DIFFICULTY_LEVELS]

/**
 * User roles
 */
export const USER_ROLES = {
  INTERVIEWER: 'interviewer',
  CANDIDATE: 'candidate',
  ADMIN: 'admin',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]
