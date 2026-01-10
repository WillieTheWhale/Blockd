/**
 * OAuth 2.0 with PKCE utilities
 * Implements Authorization Code Flow with Proof Key for Code Exchange (RFC 7636)
 *
 * Security Features:
 * - PKCE: Prevents authorization code interception attacks
 * - State parameter: Prevents CSRF attacks
 * - sessionStorage: Temporary state storage (auto-clears on tab close)
 * - State expiration: 10-minute TTL prevents replay attacks
 */

import { OAUTH_CONFIG, STORAGE_KEYS } from './constants'

export type OAuthProvider = 'google' | 'microsoft'

export interface OAuthState {
  state: string
  codeVerifier: string
  provider: OAuthProvider
  redirectPath?: string
  createdAt: number
}

/**
 * Generate cryptographically secure random string
 * Uses Web Crypto API for secure random number generation
 */
function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  return Array.from(randomValues)
    .map((v) => charset[v % charset.length])
    .join('')
}

/**
 * Generate SHA-256 hash of string using Web Crypto API
 */
async function sha256(str: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  return await crypto.subtle.digest('SHA-256', data)
}

/**
 * Base64 URL encode (RFC 4648 Section 5)
 * Converts to base64 and replaces + with -, / with _, removes padding
 */
function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Generate PKCE code verifier and challenge
 * - Code verifier: 128-character random string (RFC 7636 recommends 43-128)
 * - Code challenge: BASE64URL(SHA256(code_verifier))
 */
export async function generatePKCE(): Promise<{
  codeVerifier: string
  codeChallenge: string
}> {
  // Code verifier: 128 characters for maximum security
  const codeVerifier = generateRandomString(128)

  // Code challenge: SHA-256 hash of verifier, base64url-encoded
  const hashed = await sha256(codeVerifier)
  const codeChallenge = base64UrlEncode(hashed)

  return { codeVerifier, codeChallenge }
}

/**
 * Store OAuth state in sessionStorage
 * sessionStorage is used because:
 * - Automatically cleared when tab closes
 * - Not shared between tabs (prevents cross-tab attacks)
 * - More secure than localStorage for temporary auth state
 */
export function storeOAuthState(state: OAuthState): void {
  sessionStorage.setItem(STORAGE_KEYS.OAUTH_STATE, JSON.stringify(state))
}

/**
 * Retrieve OAuth state from sessionStorage
 * Validates expiration (10-minute TTL)
 */
export function getOAuthState(): OAuthState | null {
  const stored = sessionStorage.getItem(STORAGE_KEYS.OAUTH_STATE)
  if (!stored) return null

  try {
    const state = JSON.parse(stored) as OAuthState

    // Expire state after 10 minutes (prevents replay attacks)
    const TEN_MINUTES = 10 * 60 * 1000
    if (Date.now() - state.createdAt > TEN_MINUTES) {
      clearOAuthState()
      return null
    }

    return state
  } catch {
    return null
  }
}

/**
 * Clear OAuth state from sessionStorage
 * Called after successful callback or on error
 */
export function clearOAuthState(): void {
  sessionStorage.removeItem(STORAGE_KEYS.OAUTH_STATE)
}

/**
 * Build OAuth authorization URL with all required parameters
 * Includes PKCE code_challenge and state for security
 */
export function buildOAuthUrl(
  provider: OAuthProvider,
  state: string,
  codeChallenge: string
): string {
  const config = provider === 'google' ? OAUTH_CONFIG.GOOGLE : OAUTH_CONFIG.MICROSOFT

  if (!config.CLIENT_ID) {
    throw new Error(`OAuth client ID not configured for ${provider}`)
  }

  const params = new URLSearchParams({
    client_id: config.CLIENT_ID,
    redirect_uri: OAUTH_CONFIG.REDIRECT_URI,
    response_type: 'code',
    scope: config.SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    // Prompt user to select account (useful for multi-account users)
    prompt: 'select_account',
  })

  return `${config.AUTHORIZATION_URL}?${params.toString()}`
}

/**
 * Initiate OAuth flow
 * Generates PKCE parameters, stores state, and redirects to provider
 */
export async function initiateOAuthFlow(
  provider: OAuthProvider,
  redirectPath?: string
): Promise<void> {
  // Generate PKCE parameters
  const { codeVerifier, codeChallenge } = await generatePKCE()

  // Generate state parameter for CSRF protection
  const state = generateRandomString(32)

  // Store state in sessionStorage
  const oauthState: OAuthState = {
    state,
    codeVerifier,
    provider,
    redirectPath,
    createdAt: Date.now(),
  }
  storeOAuthState(oauthState)

  // Build authorization URL and redirect
  const authUrl = buildOAuthUrl(provider, state, codeChallenge)
  window.location.href = authUrl
}

/**
 * Validate OAuth callback parameters
 * Checks state parameter matches stored state (CSRF protection)
 */
export function validateOAuthCallback(
  urlState: string
): { valid: true; storedState: OAuthState } | { valid: false; error: string } {
  const storedState = getOAuthState()

  if (!storedState) {
    return {
      valid: false,
      error: 'OAuth state not found. Please try signing in again.',
    }
  }

  // Validate state parameter (CSRF protection)
  if (urlState !== storedState.state) {
    clearOAuthState()
    return {
      valid: false,
      error: 'Invalid state parameter. Possible security issue detected.',
    }
  }

  return { valid: true, storedState }
}
