/**
 * OAuth Provider Service
 * Handles communication with OAuth providers (Google, Microsoft)
 * Blockd Auth Service
 */

import { ValidationError, AuthError } from '../lib/errors';

/**
 * Token response from OAuth provider (raw API response)
 */
interface RawTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * Google user info response
 */
interface GoogleUserInfoResponse {
  id: string;
  email: string;
  verified_email: boolean;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

/**
 * Microsoft user info response
 */
interface MicrosoftUserInfoResponse {
  id: string;
  mail?: string;
  userPrincipalName: string;
  givenName?: string;
  surname?: string;
}

/**
 * OAuth provider configuration
 */
interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  redirectUri: string;
}

/**
 * Token response from OAuth provider
 */
export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
}

/**
 * User info from OAuth provider
 */
export interface OAuthUserInfo {
  email: string;
  emailVerified: boolean;
  providerId: string;
  givenName?: string;
  familyName?: string;
  picture?: string;
  provider: 'google' | 'microsoft';
}

/**
 * Get Google OAuth configuration
 */
function getGoogleConfig(): OAuthProviderConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/callback';

  if (!clientId || !clientSecret) {
    throw new AuthError('Google OAuth not configured', 500, 'OAUTH_NOT_CONFIGURED');
  }

  return {
    clientId,
    clientSecret,
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://www.googleapis.com/oauth2/v2/userinfo',
    redirectUri,
  };
}

/**
 * Get Microsoft OAuth configuration
 */
function getMicrosoftConfig(): OAuthProviderConfig {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3001/api/v1/auth/oauth/callback';

  if (!clientId || !clientSecret) {
    throw new AuthError('Microsoft OAuth not configured', 500, 'OAUTH_NOT_CONFIGURED');
  }

  return {
    clientId,
    clientSecret,
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoEndpoint: 'https://graph.microsoft.com/v1.0/me',
    redirectUri,
  };
}

/**
 * Exchange authorization code for tokens with Google
 */
export async function exchangeGoogleCode(
  code: string,
  codeVerifier: string
): Promise<ProviderTokens> {
  const config = getGoogleConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    console.error('Google token exchange failed:', error);
    throw new ValidationError('Failed to exchange authorization code with Google');
  }

  const data = await response.json() as RawTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/**
 * Exchange authorization code for tokens with Microsoft
 */
export async function exchangeMicrosoftCode(
  code: string,
  codeVerifier: string
): Promise<ProviderTokens> {
  const config = getMicrosoftConfig();

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
  });

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    console.error('Microsoft token exchange failed:', error);
    throw new ValidationError('Failed to exchange authorization code with Microsoft');
  }

  const data = await response.json() as RawTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

/**
 * Fetch user info from Google
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<OAuthUserInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ValidationError('Failed to fetch user info from Google');
  }

  const data = await response.json() as GoogleUserInfoResponse;

  // Validate email is verified (critical for security)
  if (!data.verified_email) {
    throw new ValidationError('Google account email is not verified');
  }

  return {
    email: data.email,
    emailVerified: data.verified_email,
    providerId: data.id,
    givenName: data.given_name,
    familyName: data.family_name,
    picture: data.picture,
    provider: 'google',
  };
}

/**
 * Fetch user info from Microsoft
 */
export async function fetchMicrosoftUserInfo(accessToken: string): Promise<OAuthUserInfo> {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new ValidationError('Failed to fetch user info from Microsoft');
  }

  const data = await response.json() as MicrosoftUserInfoResponse;

  // Microsoft uses mail or userPrincipalName for email
  const email = data.mail || data.userPrincipalName;
  if (!email) {
    throw new ValidationError('No email found in Microsoft account');
  }

  return {
    email,
    emailVerified: true, // Microsoft accounts are verified
    providerId: data.id,
    givenName: data.givenName,
    familyName: data.surname,
    provider: 'microsoft',
  };
}

/**
 * Exchange code and fetch user info in one call
 */
export async function processOAuthCallback(
  provider: 'google' | 'microsoft',
  code: string,
  codeVerifier: string
): Promise<{ tokens: ProviderTokens; userInfo: OAuthUserInfo }> {
  let tokens: ProviderTokens;
  let userInfo: OAuthUserInfo;

  if (provider === 'google') {
    tokens = await exchangeGoogleCode(code, codeVerifier);
    userInfo = await fetchGoogleUserInfo(tokens.accessToken);
  } else if (provider === 'microsoft') {
    tokens = await exchangeMicrosoftCode(code, codeVerifier);
    userInfo = await fetchMicrosoftUserInfo(tokens.accessToken);
  } else {
    throw new ValidationError(`Unsupported OAuth provider: ${provider}`);
  }

  return { tokens, userInfo };
}
