/**
 * Chat Handler
 * Handles interview chat messages
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket, ChatMessageData } from '../types/socket.types';
import { RoomManager, RoomType } from '../lib/room-manager';
import { logger } from '../lib/logger';
import { ValidationError } from '../lib/errors';

/**
 * Chat message validation
 */
const MAX_MESSAGE_LENGTH = 2000;
const MIN_MESSAGE_LENGTH = 1;

/**
 * Setup chat handler
 */
export function setupChatHandler(io: Server): void {
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.data.user.user_id;
    const userRole = socket.data.user.role;
    const userEmail = socket.data.user.email;

    // Handle chat messages
    socket.on('chat:message', async (data: ChatMessageData) => {
      try {
        const { session_id, message } = data;

        // Validate message
        if (!validateChatMessage(message)) {
          socket.emit('error', {
            message: `Message must be between ${MIN_MESSAGE_LENGTH} and ${MAX_MESSAGE_LENGTH} characters`,
            code: 'INVALID_MESSAGE',
          });
          return;
        }

        // Check user is in session
        const sessionRoomId = RoomManager.createRoomId(RoomType.SESSION, session_id);
        if (!socket.rooms.has(sessionRoomId)) {
          socket.emit('error', {
            message: 'You must join the session before sending messages',
            code: 'NOT_IN_SESSION',
          });
          return;
        }

        // Prepare message with sender info
        const chatMessage: ChatMessageData = {
          session_id,
          message: sanitizeMessage(message),
          sender_id: userId,
          sender_role: userRole,
          timestamp: new Date().toISOString(),
        };

        // Store message in database
        const storedMessage = await storeChatMessage(chatMessage);

        // Broadcast to session room (including sender for confirmation)
        io.to(sessionRoomId).emit('chat:message', {
          ...chatMessage,
          message_id: storedMessage.id,
        });

        logger.info('Chat message sent', {
          userId,
          sessionId: session_id,
          messageId: storedMessage.id,
          messageLength: message.length,
        });
      } catch (error) {
        logger.error('Error handling chat message', error, {
          userId,
          sessionId: data.session_id,
        });

        socket.emit('error', {
          message: 'Failed to send message',
          code: 'CHAT_MESSAGE_ERROR',
        });
      }
    });
  });

  logger.info('Chat handler configured');
}

/**
 * Validate chat message
 */
function validateChatMessage(message: string): boolean {
  if (!message || typeof message !== 'string') {
    return false;
  }

  const trimmed = message.trim();
  return trimmed.length >= MIN_MESSAGE_LENGTH && trimmed.length <= MAX_MESSAGE_LENGTH;
}

/**
 * Sanitize message (remove potentially harmful content)
 */
function sanitizeMessage(message: string): string {
  // Trim whitespace
  let sanitized = message.trim();

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');

  return sanitized;
}

/**
 * Store chat message in database
 * This should integrate with your database
 */
async function storeChatMessage(message: ChatMessageData): Promise<{ id: string; timestamp: string }> {
  // TODO: Implement actual database storage
  // This should insert into chat_messages table

  logger.debug('Storing chat message', {
    sessionId: message.session_id,
    senderId: message.sender_id,
  });

  // Placeholder implementation
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    id: messageId,
    timestamp: message.timestamp || new Date().toISOString(),
  };
}

/**
 * Get chat history for a session
 */
export async function getSessionChatHistory(
  sessionId: string,
  limit: number = 50,
  offset: number = 0
): Promise<ChatMessageData[]> {
  // TODO: Implement actual chat history retrieval from database

  logger.debug('Getting chat history for session', {
    sessionId,
    limit,
    offset,
  });

  // Placeholder implementation
  return [];
}

/**
 * Delete chat message (admin only)
 */
export async function deleteChatMessage(
  messageId: string,
  deletedBy: string
): Promise<boolean> {
  // TODO: Implement message deletion (soft delete)

  logger.info('Chat message deleted', {
    messageId,
    deletedBy,
  });

  return true;
}

/**
 * Send system message to session
 */
export function sendSystemMessage(
  io: Server,
  sessionId: string,
  message: string
): void {
  const sessionRoomId = RoomManager.createRoomId(RoomType.SESSION, sessionId);

  const systemMessage: ChatMessageData = {
    session_id: sessionId,
    message,
    sender_id: 'system',
    sender_role: 'admin',
    timestamp: new Date().toISOString(),
  };

  io.to(sessionRoomId).emit('chat:message', systemMessage);

  logger.info('System message sent', {
    sessionId,
    message,
  });
}

/**
 * Broadcast announcement to all sessions
 */
export function broadcastAnnouncement(
  io: Server,
  message: string,
  targetRole?: 'interviewer' | 'interviewee'
): void {
  const announcement = {
    message,
    sender_id: 'system',
    sender_role: 'admin',
    timestamp: new Date().toISOString(),
    is_announcement: true,
  };

  if (targetRole) {
    // Broadcast to users with specific role
    const sockets = io.sockets.sockets;
    for (const socket of sockets.values()) {
      const role = (socket as AuthenticatedSocket).data.user?.role;
      if (role === targetRole) {
        socket.emit('chat:message', announcement);
      }
    }
  } else {
    // Broadcast to all connected users
    io.emit('chat:message', announcement);
  }

  logger.info('Announcement broadcast', {
    message,
    targetRole: targetRole || 'all',
  });
}
