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

    // Transform error to custom format
    const apiError: ApiError = {
      message: error.response?.data
        ? (error.response.data as { message?: string }).message || 'An error occurred'
        : error.message,
      status: error.response?.status || 500,
      data: error.response?.data,
    }

    return Promise.reject(apiError)
  }
)

/**
 * Refresh access token
 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const refreshToken = localStorage.getItem('blockd_refresh_token')
    if (!refreshToken) return null

    const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
      refreshToken,
    })

    const { accessToken, refreshToken: newRefreshToken } = response.data
    setTokens({ accessToken, refreshToken: newRefreshToken })

    return accessToken
  } catch {
    return null
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
