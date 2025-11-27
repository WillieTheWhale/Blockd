import { STORAGE_KEYS } from './constants'

/**
 * Token management utilities
 */

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/**
 * Get access token from local storage
 */
export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
}

/**
 * Get refresh token from local storage
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)
}

/**
 * Store tokens in local storage
 */
export function setTokens(tokens: TokenPair): void {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.accessToken)
  localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.refreshToken)
}

/**
 * Clear tokens from local storage
 */
export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
  localStorage.removeItem(STORAGE_KEYS.USER_DATA)
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

/**
 * Decode JWT token (simple base64 decode, not validation)
 */
export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1]
    if (!base64Url) return null

    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token)
  if (!decoded || typeof decoded.exp !== 'number') return true

  const expirationTime = decoded.exp * 1000 // Convert to milliseconds
  return Date.now() >= expirationTime
}

/**
 * Get token expiration time
 */
export function getTokenExpiration(token: string): number | null {
  const decoded = decodeToken(token)
  if (!decoded || typeof decoded.exp !== 'number') return null
  return decoded.exp * 1000 // Convert to milliseconds
}
