import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../src/config';
import { WebSocketError } from '../lib/errors';
import { SocketAuthPayload } from '../types/websocket.types';

/**
 * WebSocket Authentication Middleware
 * Verifies JWT tokens and attaches user info to socket
 */

export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    // Get token from handshake auth or query
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      return next(new WebSocketError('Authentication token required'));
    }

    // Verify JWT
    const decoded = jwt.verify(token, config.jwt.secret) as SocketAuthPayload;

    if (!decoded.user_id) {
      return next(new WebSocketError('Invalid token payload'));
    }

    // Attach user info to socket
    (socket as any).userId = decoded.user_id;
    (socket as any).sessionId = socket.handshake.query?.session_id as string;
    (socket as any).authenticated = true;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new WebSocketError('Invalid or expired token'));
    }

    next(error as Error);
  }
}

/**
 * Extract user ID from socket
 */
export function getUserId(socket: Socket): string {
  const userId = (socket as any).userId;

  if (!userId) {
    throw new WebSocketError('Socket not authenticated');
  }

  return userId;
}

/**
 * Extract session ID from socket
 */
export function getSessionId(socket: Socket): string | undefined {
  return (socket as any).sessionId;
}

/**
 * Check if socket is authenticated
 */
export function isAuthenticated(socket: Socket): boolean {
  return (socket as any).authenticated === true;
}
