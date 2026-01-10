/**
 * PKCE (Proof Key for Code Exchange) Utilities
 * Implements RFC 7636 for secure OAuth 2.0 authorization code flow
 * Blockd Auth Service
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically random code verifier
 * RFC 7636: Must be 43-128 characters, using [A-Z] [a-z] [0-9] - . _ ~
 */
export function generateCodeVerifier(length: number = 128): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.randomBytes(length);
  const result: string[] = [];

  for (let i = 0; i < length; i++) {
    result.push(charset[bytes[i] % charset.length]);
  }

  return result.join('');
}

/**
 * Generate code challenge from verifier using S256 method
 * RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier))
 */
export function generateCodeChallenge(codeVerifier: string): string {
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Verify that a code verifier matches a code challenge
 * Used to verify PKCE during token exchange
 */
export function verifyCodeChallenge(codeVerifier: string, codeChallenge: string): boolean {
  const expectedChallenge = generateCodeChallenge(codeVerifier);

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedChallenge, 'utf8'),
      Buffer.from(codeChallenge, 'utf8')
    );
  } catch {
    // Buffers of different lengths will throw
    return false;
  }
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Base64 URL encode (RFC 4648 Section 5)
 * Converts buffer to base64 and replaces + with -, / with _, removes padding
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * PKCE pair for initiating OAuth flow
 */
export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generate a complete PKCE pair
 */
export function generatePKCEPair(): PKCEPair {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}
