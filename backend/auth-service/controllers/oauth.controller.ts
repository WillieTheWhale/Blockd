/**
 * OAuth Controller
 * Handles OAuth 2.0 authorization flow with PKCE
 * Blockd Auth Service
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  getOrCreateOAuthUser,
  linkOAuthAccount,
} from '../services/oauth.service';
import {
  processOAuthCallback,
  type OAuthUserInfo,
} from '../services/oauth-provider.service';
import { generateAccessToken, getAccessTokenTTL } from '../services/jwt.service';
import { createRefreshToken } from '../services/session.service';
import { getAndDeleteOAuthState } from '../lib/redis';
import { handleError, ValidationError, AuthError } from '../lib/errors';

/**
 * Request body for OAuth callback from frontend
 */
interface OAuthCallbackBody {
  code: string;
  codeVerifier: string;
  provider: 'google' | 'microsoft';
  redirectUri?: string;
}

/**
 * Query params for legacy OAuth callback (redirect-based)
 */
interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

/**
 * POST /auth/oauth/callback
 * Handle OAuth callback from frontend (PKCE flow)
 *
 * This is the primary OAuth endpoint. The frontend:
 * 1. Initiates OAuth flow with PKCE challenge
 * 2. Receives authorization code from provider redirect
 * 3. Sends code + verifier to this endpoint
 * 4. Receives JWT tokens
 */
export async function handleOAuthCallback(
  request: FastifyRequest<{ Body: OAuthCallbackBody }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { code, codeVerifier, provider, redirectUri } = request.body;

    // Validate required fields
    if (!code || typeof code !== 'string') {
      throw new ValidationError('Authorization code is required');
    }
    if (!codeVerifier || typeof codeVerifier !== 'string') {
      throw new ValidationError('Code verifier is required for PKCE');
    }
    if (!provider || !['google', 'microsoft'].includes(provider)) {
      throw new ValidationError('Valid provider (google or microsoft) is required');
    }

    // Validate code verifier length (RFC 7636: 43-128 characters)
    if (codeVerifier.length < 43 || codeVerifier.length > 128) {
      throw new ValidationError('Invalid code verifier length');
    }

    // Exchange code for tokens and get user info from provider
    const { tokens: providerTokens, userInfo } = await processOAuthCallback(
      provider,
      code,
      codeVerifier,
      redirectUri
    );

    // Get or create user in our system
    const user = await getOrCreateOAuthUser(userInfo);

    // Link OAuth account to user (for account linking feature)
    await linkOAuthAccount(user.id, provider, userInfo.providerId);

    // Generate our JWT tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = await createRefreshToken(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    reply.code(200).send({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name || `${userInfo.givenName || ''} ${userInfo.familyName || ''}`.trim(),
        role: user.role,
      },
      accessToken,
      refreshToken,
      expiresIn: getAccessTokenTTL(),
    });
  } catch (error) {
    request.log.error({ error }, 'OAuth callback failed');
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * POST /auth/oauth/initiate
 * Initialize OAuth flow and store state in Redis
 *
 * For server-side state management (optional alternative to frontend-only PKCE)
 */
export async function initiateOAuth(
  request: FastifyRequest<{ Body: { provider: 'google' | 'microsoft'; codeChallenge: string; redirectUri?: string } }>,
  reply: FastifyReply
): Promise<void> {
  try {
    const { provider, codeChallenge, redirectUri } = request.body;

    if (!provider || !['google', 'microsoft'].includes(provider)) {
      throw new ValidationError('Valid provider (google or microsoft) is required');
    }
    if (!codeChallenge || typeof codeChallenge !== 'string') {
      throw new ValidationError('Code challenge is required for PKCE');
    }

    // Import and use storeOAuthState from redis
    const { storeOAuthState } = await import('../lib/redis');
    const { generateState } = await import('../lib/pkce');

    // Generate state parameter for CSRF protection
    const state = generateState();

    // Store state with code challenge (note: we don't store verifier, only challenge)
    // The verifier stays on the client
    await storeOAuthState(state, {
      codeVerifier: '', // Empty - verifier is kept by client
      provider,
      redirectUri,
      createdAt: Date.now(),
    });

    reply.code(200).send({
      state,
      message: 'OAuth state initialized. Redirect user to provider authorization URL with this state.',
    });
  } catch (error) {
    request.log.error({ error }, 'OAuth initiate failed');
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * GET /auth/oauth/google
 * Initiate Google OAuth flow (legacy redirect-based)
 *
 * @deprecated Use POST /auth/oauth/callback with PKCE instead
 */
export async function initiateGoogleOAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/auth/oauth/google/callback';

    if (!clientId) {
      throw new AuthError('Google OAuth not configured', 500, 'OAUTH_NOT_CONFIGURED');
    }

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    reply.redirect(authUrl);
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * GET /auth/oauth/google/callback
 * Handle Google OAuth callback (legacy redirect-based)
 *
 * @deprecated Use POST /auth/oauth/callback with PKCE instead
 */
export async function handleGoogleCallback(
  request: FastifyRequest<{ Querystring: OAuthCallbackQuery }>,
  reply: FastifyReply
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  try {
    const { code, error, error_description } = request.query;

    if (error) {
      throw new ValidationError(error_description || `OAuth error: ${error}`);
    }

    if (!code) {
      throw new ValidationError('Authorization code not provided');
    }

    // Redirect to frontend with code (frontend will complete the flow)
    const redirectUrl = `${frontendUrl}/auth/callback?code=${encodeURIComponent(code)}&provider=google`;
    reply.redirect(redirectUrl);
  } catch (error) {
    const errorResponse = handleError(error);
    const errorUrl = `${frontendUrl}/auth/callback?error=${encodeURIComponent(errorResponse.message)}`;
    reply.redirect(errorUrl);
  }
}

/**
 * GET /auth/oauth/microsoft
 * Initiate Microsoft OAuth flow (legacy redirect-based)
 *
 * @deprecated Use POST /auth/oauth/callback with PKCE instead
 */
export async function initiateMicrosoftOAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const redirectUri = process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3001/auth/oauth/microsoft/callback';

    if (!clientId) {
      throw new AuthError('Microsoft OAuth not configured', 500, 'OAUTH_NOT_CONFIGURED');
    }

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile offline_access',
      response_mode: 'query',
    });

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

    reply.redirect(authUrl);
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * GET /auth/oauth/microsoft/callback
 * Handle Microsoft OAuth callback (legacy redirect-based)
 *
 * @deprecated Use POST /auth/oauth/callback with PKCE instead
 */
export async function handleMicrosoftCallback(
  request: FastifyRequest<{ Querystring: OAuthCallbackQuery }>,
  reply: FastifyReply
): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  try {
    const { code, error, error_description } = request.query;

    if (error) {
      throw new ValidationError(error_description || `OAuth error: ${error}`);
    }

    if (!code) {
      throw new ValidationError('Authorization code not provided');
    }

    // Redirect to frontend with code (frontend will complete the flow)
    const redirectUrl = `${frontendUrl}/auth/callback?code=${encodeURIComponent(code)}&provider=microsoft`;
    reply.redirect(redirectUrl);
  } catch (error) {
    const errorResponse = handleError(error);
    const errorUrl = `${frontendUrl}/auth/callback?error=${encodeURIComponent(errorResponse.message)}`;
    reply.redirect(errorUrl);
  }
}

/**
 * GET /auth/oauth/providers
 * Get configured OAuth providers (for frontend to know what's available)
 */
export async function getOAuthProviders(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const providers: { provider: string; enabled: boolean; clientId?: string }[] = [];

  // Check Google
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  providers.push({
    provider: 'google',
    enabled: !!googleClientId,
    clientId: googleClientId || undefined,
  });

  // Check Microsoft
  const microsoftClientId = process.env.MICROSOFT_CLIENT_ID;
  providers.push({
    provider: 'microsoft',
    enabled: !!microsoftClientId,
    clientId: microsoftClientId || undefined,
  });

  reply.code(200).send({ providers });
}
