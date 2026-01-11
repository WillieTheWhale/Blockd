import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_URL } from './constants'
import { getAccessToken, getRefreshToken, setTokens, clearTokens, isTokenExpired } from './auth'
import { logger } from './logger'

// Create scoped logger
const apiLogger = logger.create({ component: 'api-client' })

/**
 * Custom error type for API errors
 */
export interface ApiError {
  message: string
  status: number
  code?: string
  data?: unknown
}

/**
 * Error codes for specific handling
 */
export const API_ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
} as const

/**
 * Token refresh state management
 * Prevents multiple simultaneous refresh requests (race condition)
 */
let isRefreshing = false
let refreshSubscribers: Array<(token: string | null) => void> = []

function subscribeTokenRefresh(callback: (token: string | null) => void): void {
  refreshSubscribers.push(callback)
}

function onTokenRefreshed(token: string | null): void {
  refreshSubscribers.forEach((callback) => callback(token))
  refreshSubscribers = []
}

/**
 * Global error event emitter for cross-component error handling
 * Components can subscribe to these events to handle global errors
 */
type GlobalErrorHandler = (error: ApiError) => void
const globalErrorHandlers: GlobalErrorHandler[] = []

export function onGlobalError(handler: GlobalErrorHandler): () => void {
  globalErrorHandlers.push(handler)
  return () => {
    const index = globalErrorHandlers.indexOf(handler)
    if (index > -1) {
      globalErrorHandlers.splice(index, 1)
    }
  }
}

function emitGlobalError(error: ApiError): void {
  globalErrorHandlers.forEach((handler) => handler(error))
}

/**
 * Create axios instance with default configuration
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Request interceptor to add authentication token
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken()

    if (token) {
      // Check if token is expired
      if (isTokenExpired(token)) {
        // If already refreshing, wait for the refresh to complete
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh((newToken) => {
              if (newToken && config.headers) {
                config.headers.Authorization = `Bearer ${newToken}`
                resolve(config)
              } else {
                reject(new Error('Session expired'))
              }
            })
          })
        }

        try {
          // Try to refresh the token
          const refreshed = await refreshAccessToken()
          if (refreshed && config.headers) {
            config.headers.Authorization = `Bearer ${refreshed}`
          }
        } catch {
          // If refresh fails, clear tokens and redirect to login
          clearTokens()
          window.location.href = '/login'
          return Promise.reject(new Error('Session expired'))
        }
      } else if (config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }

    return config
  },
  (error) => {
    apiLogger.error('Request interceptor error', error)
    return Promise.reject(error)
  }
)

/**
 * Response interceptor to handle errors globally
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const status = error.response?.status

    // Handle network errors (no response)
    if (!error.response) {
      const apiError: ApiError = {
        message: 'Network error. Please check your connection.',
        status: 0,
        code: API_ERROR_CODES.NETWORK_ERROR,
      }
      apiLogger.error('Network error', error)
      emitGlobalError(apiError)
      return Promise.reject(apiError)
    }

    // Handle 401 Unauthorized errors
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const newToken = await refreshAccessToken()
        if (newToken && originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return apiClient(originalRequest)
        }
      } catch {
        clearTokens()
        window.location.href = '/login'
        const apiError: ApiError = {
          message: 'Your session has expired. Please log in again.',
          status: 401,
          code: API_ERROR_CODES.SESSION_EXPIRED,
        }
        return Promise.reject(apiError)
      }
    }

    // Handle 403 Forbidden
    if (status === 403) {
      const apiError: ApiError = {
        message: 'You do not have permission to perform this action.',
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
      }
      apiLogger.warn('Forbidden access attempt', {
        url: originalRequest.url,
        method: originalRequest.method,
      })
      emitGlobalError(apiError)
      return Promise.reject(apiError)
    }

    // Handle 429 Rate Limited
    if (status === 429) {
      const retryAfter = error.response.headers['retry-after']
      const apiError: ApiError = {
        message: `Too many requests. Please wait ${retryAfter ? `${retryAfter} seconds` : 'a moment'} before trying again.`,
        status: 429,
        code: API_ERROR_CODES.RATE_LIMITED,
        data: { retryAfter },
      }
      apiLogger.warn('Rate limited', { retryAfter })
      emitGlobalError(apiError)
      return Promise.reject(apiError)
    }

    // Handle 500+ Server Errors
    if (status && status >= 500) {
      const apiError: ApiError = {
        message: 'A server error occurred. Please try again later.',
        status,
        code: API_ERROR_CODES.SERVER_ERROR,
      }
      apiLogger.error('Server error', error, { status })
      emitGlobalError(apiError)
      return Promise.reject(apiError)
    }

    // Transform error to custom format with safe message extraction
    const extractErrorMessage = (): string => {
      const responseData = error.response?.data
      if (responseData && typeof responseData === 'object' && 'message' in responseData) {
        const msg = (responseData as { message: unknown }).message
        // Sanitize message - only return string type, prevent object injection
        return typeof msg === 'string' ? msg : 'An error occurred'
      }
      return error.message || 'An error occurred'
    }

    const apiError: ApiError = {
      message: extractErrorMessage(),
      status: status || 500,
      // Don't expose raw response data in production to prevent info leaks
      data: import.meta.env.DEV ? error.response?.data : undefined,
    }

    apiLogger.debug('API error', { status, message: apiError.message })
    return Promise.reject(apiError)
  }
)

/**
 * Refresh access token with mutex to prevent race conditions
 */
async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing) {
    // Return a promise that resolves when the refresh completes
    return new Promise((resolve) => {
      subscribeTokenRefresh(resolve)
    })
  }

  isRefreshing = true

  try {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      onTokenRefreshed(null)
      return null
    }

    const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
      refreshToken,
    })

    const { accessToken, refreshToken: newRefreshToken } = response.data
    setTokens({ accessToken, refreshToken: newRefreshToken })

    apiLogger.debug('Token refreshed successfully')
    onTokenRefreshed(accessToken)
    return accessToken
  } catch (error) {
    apiLogger.error('Token refresh failed', error)
    onTokenRefreshed(null)
    return null
  } finally {
    isRefreshing = false
  }
}

/**
 * Generic API request function
 */
export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  url: string,
  data?: unknown,
  config?: Record<string, unknown>
): Promise<T> {
  const response = await apiClient.request<T>({
    method,
    url,
    data,
    ...config,
  })
  return response.data
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'status' in error &&
    typeof (error as ApiError).message === 'string' &&
    typeof (error as ApiError).status === 'number'
  )
}

/**
 * Helper to extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}

export default apiClient
