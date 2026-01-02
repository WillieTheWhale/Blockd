/**
 * OAuth Service
 * Handles OAuth 2.0 provider integration
 * Blockd Auth Service
 */

import { OAuthUserInfo } from '../types/auth.types';
import { UserProfile } from '../types/user.types';
import { createUser, getUserByEmail } from './user.service';
import { generateSecureString } from '../lib/crypto';

/**
 * Google OAuth configuration
 */
export const googleOAuthConfig = {
  name: 'google',
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID || '',
      secret: process.env.GOOGLE_CLIENT_SECRET || ''
    },
    auth: {
      authorizeHost: 'https://accounts.google.com',
      authorizePath: '/o/oauth2/v2/auth',
      tokenHost: 'https://oauth2.googleapis.com',
      tokenPath: '/token'
    }
  },
  scope: ['openid', 'email', 'profile'],
  startRedirectPath: '/auth/oauth/google',
  callbackUri: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/auth/oauth/google/callback'
};

/**
 * Microsoft OAuth configuration
 */
export const microsoftOAuthConfig = {
  name: 'microsoft',
  credentials: {
    client: {
      id: process.env.MICROSOFT_CLIENT_ID || '',
      secret: process.env.MICROSOFT_CLIENT_SECRET || ''
    },
    auth: {
      authorizeHost: 'https://login.microsoftonline.com',
      authorizePath: '/common/oauth2/v2.0/authorize',
      tokenHost: 'https://login.microsoftonline.com',
      tokenPath: '/common/oauth2/v2.0/token'
    }
  },
  scope: ['openid', 'email', 'profile'],
  startRedirectPath: '/auth/oauth/microsoft',
  callbackUri: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3001/auth/oauth/microsoft/callback'
};

/**
 * Parse Google user info from OAuth token
 */
export async function parseGoogleUserInfo(accessToken: string): Promise<OAuthUserInfo> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Google user info');
    }

    const data = await response.json();

    return {
      email: data.email,
      given_name: data.given_name,
      family_name: data.family_name,
      picture: data.picture,
      provider: 'google'
    };
  } catch (error) {
    throw new Error('Failed to parse Google user info');
  }
}

/**
 * Parse Microsoft user info from OAuth token
 */
export async function parseMicrosoftUserInfo(accessToken: string): Promise<OAuthUserInfo> {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch Microsoft user info');
    }

    const data = await response.json();

    return {
      email: data.mail || data.userPrincipalName,
      given_name: data.givenName,
      family_name: data.surname,
      provider: 'microsoft'
    };
  } catch (error) {
    throw new Error('Failed to parse Microsoft user info');
  }
}

/**
 * Get or create user from OAuth info
 */
export async function getOrCreateOAuthUser(oauthInfo: OAuthUserInfo): Promise<UserProfile> {
  // Check if user already exists
  let user = await getUserByEmail(oauthInfo.email);

  if (user) {
    // User exists, return it
    return user;
  }

  // Create new user with OAuth info
  // Generate a random password (won't be used since OAuth login)
  const randomPassword = generateSecureString(32);

  user = await createUser({
    email: oauthInfo.email,
    password_hash: randomPassword, // Will be hashed by createUser
    role: 'interviewee', // Default role for OAuth users
    first_name: oauthInfo.given_name,
    last_name: oauthInfo.family_name
  });

  // Mark email as verified (OAuth providers verify emails)
  // This would be done in the user service

  return user;
}

/**
 * Link OAuth account to existing user
 */
export async function linkOAuthAccount(
  userId: string,
  provider: 'google' | 'microsoft',
  providerId: string
): Promise<void> {
  // In a production system, you'd store OAuth provider links in a separate table
  // For now, we'll use a simple implementation

  // This would create a record in an oauth_accounts table like:
  // {
  //   user_id: userId,
  //   provider: provider,
  //   provider_id: providerId,
  //   created_at: new Date()
  // }

  console.log(`Linking ${provider} account ${providerId} to user ${userId}`);
}

/**
 * Check if OAuth account is linked to user
 */
export async function isOAuthAccountLinked(
  userId: string,
  provider: 'google' | 'microsoft'
): Promise<boolean> {
  // In production, check the oauth_accounts table
  // For now, return false
  return false;
}

/**
 * Unlink OAuth account from user
 */
export async function unlinkOAuthAccount(
  userId: string,
  provider: 'google' | 'microsoft'
): Promise<void> {
  // In production, delete from oauth_accounts table
  console.log(`Unlinking ${provider} account from user ${userId}`);
}

/**
 * Get linked OAuth providers for user
 */
export async function getLinkedOAuthProviders(userId: string): Promise<string[]> {
  // In production, query oauth_accounts table
  // For now, return empty array
  return [];
}

/**
 * Validate OAuth state parameter
 */
export function validateOAuthState(state: string, expectedState: string): boolean {
  return state === expectedState;
}

/**
 * Generate OAuth state parameter
 */
export function generateOAuthState(): string {
  return generateSecureString(32);
}
