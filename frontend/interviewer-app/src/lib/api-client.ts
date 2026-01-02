import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { API_URL } from './constants'
import { getAccessToken, setTokens, clearTokens, isTokenExpired } from './auth'

/**
 * Custom error type for API errors
 */
export interface ApiError {
  message: string
  status: number
  data?: unknown
}

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
    return Promise.reject(error)
  }
)

/**
 * Response interceptor to handle errors
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Handle 401 Unauthorized errors
    if (error.response?.status === 401 && !originalRequest._retry) {
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
        return Promise.reject(error)
      }
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
      status: error.response?.status || 500,
      // Don't expose raw response data in production to prevent info leaks
      data: process.env.NODE_ENV === 'development' ? error.response?.data : undefined,
    }

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
    const refreshToken = localStorage.getItem('blockd_refresh_token')
    if (!refreshToken) {
      onTokenRefreshed(null)
      return null
    }

    const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
      refreshToken,
    })

    const { accessToken, refreshToken: newRefreshToken } = response.data
    setTokens({ accessToken, refreshToken: newRefreshToken })

    onTokenRefreshed(accessToken)
    return accessToken
  } catch {
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

export default apiClient
