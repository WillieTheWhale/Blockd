/**
 * Application-wide constants
 */

/**
 * Runtime environment validation
 * Validates required environment variables at startup
 */
function validateEnv(): void {
  const env = import.meta.env.VITE_APP_ENV || 'development'

  // In production, warn if critical env vars are missing
  if (env === 'production') {
    const requiredVars = ['VITE_API_URL', 'VITE_WS_URL'] as const
    const missing = requiredVars.filter(key => !import.meta.env[key])

    if (missing.length > 0) {
      console.warn(
        `[Blockd] Missing required environment variables: ${missing.join(', ')}. ` +
        'Using default values. This may cause issues in production.'
      )
    }
  }
}

// Run validation on module load
validateEnv()

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Blockd'
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'
export const APP_ENV = import.meta.env.VITE_APP_ENV || 'development'

/**
 * Environment helper for conditional logic
 */
export const IS_PRODUCTION = APP_ENV === 'production'
export const IS_DEVELOPMENT = APP_ENV === 'development'

/**
 * OAuth 2.0 configuration
 * Uses Authorization Code Flow with PKCE for maximum security
 */
export const OAUTH_CONFIG = {
  GOOGLE: {
    CLIENT_ID: (import.meta.env['VITE_GOOGLE_CLIENT_ID'] as string) || '',
    AUTHORIZATION_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
    SCOPES: ['openid', 'email', 'profile'],
  },
  MICROSOFT: {
    CLIENT_ID: (import.meta.env['VITE_MICROSOFT_CLIENT_ID'] as string) || '',
    AUTHORIZATION_URL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    SCOPES: ['openid', 'email', 'profile'],
  },
  // Redirect URI is constructed dynamically to support different environments
  REDIRECT_URI: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '',
} as const

/**
 * Local storage keys
 */
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'blockd_access_token',
  REFRESH_TOKEN: 'blockd_refresh_token',
  USER_DATA: 'blockd_user_data',
  THEME: 'blockd_theme',
  OAUTH_STATE: 'blockd_oauth_state',
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
    OAUTH_CALLBACK: '/api/v1/auth/oauth/callback',
    OAUTH_PROVIDERS: '/api/v1/auth/oauth/providers',
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
    LIST: '/api/v1/reports',
    GET: (sessionId: string) => `/api/v1/reports/${sessionId}`,
    DOWNLOAD: (sessionId: string) => `/api/v1/reports/${sessionId}/pdf`,
    // TODO: DELETE endpoint not yet implemented in backend
    // DELETE: (sessionId: string) => `/api/v1/reports/${sessionId}`,
  },
  ANALYTICS: {
    OVERVIEW: '/api/v1/analytics/overview',
    SESSIONS: '/api/v1/analytics/sessions',
    DETECTION_METHODS: '/api/v1/analytics/detection-methods',
    WEEKLY_TRENDS: '/api/v1/analytics/weekly-trends',
    CANDIDATE_SOURCES: '/api/v1/analytics/candidate-sources',
    RISK_SCORES: '/api/v1/analytics/risk-scores',
    ACTIVITY: '/api/v1/analytics/activity',
  },
  AI_DETECTION: {
    GET: (sessionId: string) => `/api/v1/sessions/${sessionId}/ai-detection`,
    LIST: (sessionId: string) => `/api/v1/sessions/${sessionId}/ai-detection/results`,
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
    ALL: ['reports'] as const,
    LIST: (filters?: Record<string, unknown>) => ['reports', 'list', filters] as const,
    GET: (sessionId: string) => ['reports', sessionId] as const,
  },
  ANALYTICS: {
    ALL: ['analytics'] as const,
    OVERVIEW: ['analytics', 'overview'] as const,
    SESSIONS: ['analytics', 'sessions'] as const,
    DETECTION_METHODS: ['analytics', 'detection-methods'] as const,
    WEEKLY_TRENDS: ['analytics', 'weekly-trends'] as const,
    CANDIDATE_SOURCES: ['analytics', 'candidate-sources'] as const,
    RISK_SCORES: ['analytics', 'risk-scores'] as const,
  },
  AI_DETECTION: {
    GET: (sessionId: string) => ['ai-detection', sessionId] as const,
    LIST: (sessionId: string) => ['ai-detection', sessionId, 'list'] as const,
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
  INTERVIEWEE: 'interviewee',
  ADMIN: 'admin',
} as const

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES]

/**
 * Landing page constants
 */
export { COLORS } from '@/theme/colors'

export const ANIMATION = {
  duration: {
    instant: 0,
    fast: 150,
    normal: 300,
    slow: 500,
    slower: 800,
    slowest: 1200,
  },
  easing: {
    out: [0.25, 0.46, 0.45, 0.94] as const,
    spring: [0.34, 1.56, 0.64, 1] as const,
    smooth: [0.4, 0, 0.2, 1] as const,
  },
  stagger: {
    fast: 0.05,
    normal: 0.1,
    slow: 0.15,
  },
} as const

export const BREAKPOINTS = {
  mobile: 639,
  tablet: 1023,
  desktop: 1279,
  large: 1535,
} as const

export const SITE_CONFIG = {
  name: 'Blockd',
  tagline: 'Interview integrity, verified.',
  description: 'Ensure candidates are evaluated on their actual abilities with Blockd\'s AI-powered interview security platform.',
  url: 'https://blockd.site',
} as const

export const NAV_LINKS = [
  { label: 'Product', href: '#architecture' },
  { label: 'Pricing', href: '#scale' },
  { label: 'Documentation', href: 'https://docs.blockd.site' },
] as const

export const FOOTER_LINKS = {
  product: [
    { label: 'Features', href: '#architecture' },
    { label: 'Pricing', href: '#scale' },
    { label: 'Security', href: '#security' },
    { label: 'Enterprise', href: 'mailto:enterprise@blockd.site' },
  ],
  resources: [
    { label: 'Documentation', href: 'https://docs.blockd.site' },
    { label: 'API Reference', href: 'https://docs.blockd.site/api' },
    { label: 'Blog', href: 'https://blog.blockd.site' },
    { label: 'Status', href: 'https://status.blockd.site' },
  ],
  company: [
    { label: 'About', href: '#hero' },
    { label: 'Careers', href: 'mailto:careers@blockd.site' },
    { label: 'Contact', href: 'mailto:contact@blockd.site' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ],
} as const

export const SOCIAL_LINKS = [
  { label: 'Twitter', href: 'https://twitter.com/blockd_site', icon: 'twitter' },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/blockd', icon: 'linkedin' },
  { label: 'GitHub', href: 'https://github.com/blockd-site', icon: 'github' },
] as const
