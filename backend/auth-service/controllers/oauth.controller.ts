/**
 * OAuth Controller
 * Blockd Auth Service
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  parseGoogleUserInfo,
  parseMicrosoftUserInfo,
  getOrCreateOAuthUser,
  generateOAuthState
} from '../services/oauth.service';
import { generateAccessToken } from '../services/jwt.service';
import { createRefreshToken } from '../services/session.service';
import { handleError } from '../lib/errors';
import { OAuthCallbackQuery } from '../types/auth.types';

/**
 * GET /auth/oauth/google
 * Initiate Google OAuth flow
 */
export async function initiateGoogleOAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // This would be handled by @fastify/oauth2 plugin
    // The plugin will redirect to Google's OAuth page

    // Store state in session/Redis for verification
    const state = generateOAuthState();

    // The actual OAuth plugin will handle the redirect
    reply.code(200).send({
      message: 'Redirecting to Google OAuth...',
      state
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * GET /auth/oauth/google/callback
 * Handle Google OAuth callback
 */
export async function handleGoogleCallback(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Get OAuth token from @fastify/oauth2 plugin
    // This is a simplified version - in production, use the plugin's token
    const query = request.query as OAuthCallbackQuery;

    if (!query.code) {
      throw new Error('OAuth code not provided');
    }

    // Exchange code for access token (handled by OAuth plugin)
    // For now, we'll simulate this
    const accessToken = 'simulated_google_access_token';

    // Get user info from Google
    const userInfo = await parseGoogleUserInfo(accessToken);

    // Get or create user
    const user = await getOrCreateOAuthUser(userInfo);

    // Generate JWT tokens
    const jwtAccessToken = generateAccessToken(user);
    const refreshToken = await createRefreshToken(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    // In production, redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL}/oauth/callback?` +
      `access_token=${jwtAccessToken}&` +
      `refresh_token=${refreshToken}&` +
      `expires_in=3600`;

    reply.redirect(redirectUrl);
  } catch (error) {
    const errorResponse = handleError(error);

    // Redirect to frontend error page
    const errorUrl = `${process.env.FRONTEND_URL}/oauth/error?` +
      `error=${encodeURIComponent(errorResponse.message)}`;

    reply.redirect(errorUrl);
  }
}

/**
 * GET /auth/oauth/microsoft
 * Initiate Microsoft OAuth flow
 */
export async function initiateMicrosoftOAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // This would be handled by @fastify/oauth2 plugin
    const state = generateOAuthState();

    reply.code(200).send({
      message: 'Redirecting to Microsoft OAuth...',
      state
    });
  } catch (error) {
    const errorResponse = handleError(error);
    reply.code(errorResponse.statusCode).send(errorResponse);
  }
}

/**
 * GET /auth/oauth/microsoft/callback
 * Handle Microsoft OAuth callback
 */
export async function handleMicrosoftCallback(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const query = request.query as OAuthCallbackQuery;

    if (!query.code) {
      throw new Error('OAuth code not provided');
    }

    // Exchange code for access token (handled by OAuth plugin)
    const accessToken = 'simulated_microsoft_access_token';

    // Get user info from Microsoft
    const userInfo = await parseMicrosoftUserInfo(accessToken);

    // Get or create user
    const user = await getOrCreateOAuthUser(userInfo);

    // Generate JWT tokens
    const jwtAccessToken = generateAccessToken(user);
    const refreshToken = await createRefreshToken(
      user.id,
      request.ip,
      request.headers['user-agent']
    );

    // Redirect to frontend with tokens
    const redirectUrl = `${process.env.FRONTEND_URL}/oauth/callback?` +
      `access_token=${jwtAccessToken}&` +
      `refresh_token=${refreshToken}&` +
      `expires_in=3600`;

    reply.redirect(redirectUrl);
  } catch (error) {
    const errorResponse = handleError(error);

    // Redirect to frontend error page
    const errorUrl = `${process.env.FRONTEND_URL}/oauth/error?` +
      `error=${encodeURIComponent(errorResponse.message)}`;

    reply.redirect(errorUrl);
  }
}
