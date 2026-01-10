/**
 * OAuth Service
 * Handles OAuth 2.0 provider integration
 * Blockd Auth Service
 */

import { PrismaClient } from '@prisma/client';
import { OAuthUserInfo as AuthOAuthUserInfo } from '../types/auth.types';
import { OAuthUserInfo as ProviderOAuthUserInfo } from './oauth-provider.service';
import { UserProfile } from '../types/user.types';
import { createUser, getUserByEmail, markEmailVerified } from './user.service';
import { generateSecureString } from '../lib/crypto';

const prisma = new PrismaClient();

// OAuth provider type (matches Prisma schema enum)
// After running `npx prisma generate`, this can be imported from @prisma/client
type OAuthProviderType = 'google' | 'microsoft';

// Union type to accept both OAuthUserInfo formats
type OAuthUserInfo = AuthOAuthUserInfo | ProviderOAuthUserInfo;

// Type guard to check if it's the new format
function isProviderOAuthUserInfo(info: OAuthUserInfo): info is ProviderOAuthUserInfo {
  return 'givenName' in info || 'familyName' in info || 'providerId' in info;
}

// Response types for legacy functions
interface GoogleUserInfoResponse {
  email: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

interface MicrosoftUserInfoResponse {
  mail?: string;
  userPrincipalName: string;
  givenName?: string;
  surname?: string;
}

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

    const data = await response.json() as GoogleUserInfoResponse;

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

    const data = await response.json() as MicrosoftUserInfoResponse;

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
 * Handles both legacy OAuthUserInfo and new ProviderOAuthUserInfo formats
 */
export async function getOrCreateOAuthUser(oauthInfo: OAuthUserInfo): Promise<UserProfile> {
  // Check if user already exists
  let user = await getUserByEmail(oauthInfo.email);

  if (user) {
    // User exists - mark email as verified if not already (OAuth providers verify emails)
    if (!user.email_verified) {
      await markEmailVerified(user.id);
      user.email_verified = true;
    }
    return user;
  }

  // Create new user with OAuth info
  // Generate a random password (won't be used since OAuth login)
  const randomPassword = generateSecureString(32);

  // Handle both formats - new format uses givenName/familyName, old uses given_name/family_name
  let firstName: string | undefined;
  let lastName: string | undefined;

  if (isProviderOAuthUserInfo(oauthInfo)) {
    firstName = oauthInfo.givenName;
    lastName = oauthInfo.familyName;
  } else {
    firstName = oauthInfo.given_name;
    lastName = oauthInfo.family_name;
  }

  user = await createUser({
    email: oauthInfo.email,
    password_hash: randomPassword, // Will be hashed by createUser
    role: 'interviewee', // Default role for OAuth users
    first_name: firstName,
    last_name: lastName
  });

  // Mark email as verified (OAuth providers verify emails)
  await markEmailVerified(user.id);
  user.email_verified = true;

  return user;
}

/**
 * Link OAuth account to existing user
 * Creates or updates the oauth_accounts record
 *
 * NOTE: After running `npx prisma generate` and `npx prisma db push`,
 * uncomment the Prisma code below. For now, this just logs the action.
 */
export async function linkOAuthAccount(
  userId: string,
  provider: 'google' | 'microsoft',
  providerId: string,
  _accessToken?: string,
  _refreshToken?: string,
  _tokenExpiresAt?: Date
): Promise<void> {
  // TODO: After running `npx prisma generate`, replace with:
  // await prisma.oAuthAccount.upsert({
  //   where: { userId_provider: { userId, provider } },
  //   update: { providerId, accessToken, refreshToken, tokenExpiresAt, updatedAt: new Date() },
  //   create: { userId, provider, providerId, accessToken, refreshToken, tokenExpiresAt },
  // });
  console.log(`OAuth: Linking ${provider} account (${providerId}) to user ${userId}`);
}

/**
 * Check if OAuth account is linked to user
 */
export async function isOAuthAccountLinked(
  userId: string,
  provider: 'google' | 'microsoft'
): Promise<boolean> {
  // TODO: After running `npx prisma generate`, replace with:
  // const account = await prisma.oAuthAccount.findUnique({
  //   where: { userId_provider: { userId, provider } },
  // });
  // return !!account;
  console.log(`OAuth: Checking if ${provider} is linked to user ${userId}`);
  return false;
}

/**
 * Unlink OAuth account from user
 */
export async function unlinkOAuthAccount(
  userId: string,
  provider: 'google' | 'microsoft'
): Promise<void> {
  // TODO: After running `npx prisma generate`, replace with:
  // await prisma.oAuthAccount.deleteMany({ where: { userId, provider } });
  console.log(`OAuth: Unlinking ${provider} from user ${userId}`);
}

/**
 * Get linked OAuth providers for user
 */
export async function getLinkedOAuthProviders(userId: string): Promise<string[]> {
  // TODO: After running `npx prisma generate`, replace with:
  // const accounts = await prisma.oAuthAccount.findMany({
  //   where: { userId },
  //   select: { provider: true },
  // });
  // return accounts.map((a) => a.provider);
  console.log(`OAuth: Getting linked providers for user ${userId}`);
  return [];
}

/**
 * Get OAuth account by provider and provider ID
 */
export async function getOAuthAccountByProviderId(
  provider: 'google' | 'microsoft',
  providerId: string
): Promise<{ userId: string } | null> {
  // TODO: After running `npx prisma generate`, replace with:
  // const account = await prisma.oAuthAccount.findUnique({
  //   where: { provider_providerId: { provider, providerId } },
  //   select: { userId: true },
  // });
  // return account;
  console.log(`OAuth: Looking up ${provider} account ${providerId}`);
  return null;
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
