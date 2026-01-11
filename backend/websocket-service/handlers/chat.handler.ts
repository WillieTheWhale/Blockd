/**
 * Chat Handler
 * Handles interview chat messages with database persistence
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket, ChatMessageData } from '../types/socket.types';
import { RoomManager, RoomType } from '../lib/room-manager';
import { logger } from '../lib/logger';
import { ValidationError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

/**
 * Chat message validation
 */
const MAX_MESSAGE_LENGTH = 2000;
const MIN_MESSAGE_LENGTH = 1;

/**
 * Stored chat message response
 */
interface StoredChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderRole: UserRole;
  message: string;
  createdAt: Date;
}

/**
 * Setup chat handler
 */
export function setupChatHandler(io: Server): void {
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.data.user.user_id;
    const userRole = socket.data.user.role;

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

        // Store message in database
        const storedMessage = await storeChatMessage({
          sessionId: session_id,
          senderId: userId,
          senderRole: userRole as UserRole,
          message: sanitizeMessage(message),
        });

        // Prepare message for broadcast
        const chatMessage: ChatMessageData = {
          session_id,
          message: storedMessage.message,
          sender_id: storedMessage.senderId,
          sender_role: storedMessage.senderRole,
          timestamp: storedMessage.createdAt.toISOString(),
        };

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

    // Handle chat history request
    socket.on('chat:history', async (data: { session_id: string; limit?: number; offset?: number }) => {
      try {
        const { session_id, limit = 50, offset = 0 } = data;

        // Check user is in session
        const sessionRoomId = RoomManager.createRoomId(RoomType.SESSION, session_id);
        if (!socket.rooms.has(sessionRoomId)) {
          socket.emit('error', {
            message: 'You must join the session to view chat history',
            code: 'NOT_IN_SESSION',
          });
          return;
        }

        const history = await getSessionChatHistory(session_id, limit, offset);

        socket.emit('chat:history', {
          session_id,
          messages: history,
          hasMore: history.length === limit,
        });

        logger.debug('Chat history retrieved', {
          userId,
          sessionId: session_id,
          messageCount: history.length,
        });
      } catch (error) {
        logger.error('Error retrieving chat history', error, {
          userId,
          sessionId: data.session_id,
        });

        socket.emit('error', {
          message: 'Failed to retrieve chat history',
          code: 'CHAT_HISTORY_ERROR',
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
 */
async function storeChatMessage(data: {
  sessionId: string;
  senderId: string;
  senderRole: UserRole;
  message: string;
}): Promise<StoredChatMessage> {
  const message = await prisma.chatMessage.create({
    data: {
      sessionId: data.sessionId,
      senderId: data.senderId,
      senderRole: data.senderRole,
      message: data.message,
    },
  });

  logger.debug('Chat message stored', {
    messageId: message.id,
    sessionId: data.sessionId,
    senderId: data.senderId,
  });

  return message;
}

/**
 * Get chat history for a session
 */
export async function getSessionChatHistory(
  sessionId: string,
  limit: number = 50,
  offset: number = 0
): Promise<ChatMessageData[]> {
  logger.debug('Getting chat history for session', {
    sessionId,
    limit,
    offset,
  });

  const messages = await prisma.chatMessage.findMany({
    where: {
      sessionId,
      isDeleted: false,
      deletedAt: null, // Exclude soft-deleted messages
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    skip: offset,
  });

  // Return in chronological order (oldest first)
  return messages.reverse().map((msg) => ({
    message_id: msg.id,
    session_id: msg.sessionId,
    message: msg.message,
    sender_id: msg.senderId,
    sender_role: msg.senderRole,
    timestamp: msg.createdAt.toISOString(),
  }));
}

/**
 * Delete chat message (soft delete, admin only)
 */
export async function deleteChatMessage(
  messageId: string,
  deletedBy: string
): Promise<boolean> {
  try {
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
      },
    });

    logger.info('Chat message deleted', {
      messageId,
      deletedBy,
    });

    return true;
  } catch (error) {
    logger.error('Failed to delete chat message', error, {
      messageId,
      deletedBy,
    });
    return false;
  }
}

/**
 * Send system message to session
 */
export async function sendSystemMessage(
  io: Server,
  sessionId: string,
  message: string
): Promise<void> {
  const sessionRoomId = RoomManager.createRoomId(RoomType.SESSION, sessionId);

  // Store system message in database
  const storedMessage = await prisma.chatMessage.create({
    data: {
      sessionId,
      senderId: 'system',
      senderRole: 'admin',
      message,
    },
  });

  const systemMessage: ChatMessageData = {
    session_id: sessionId,
    message,
    sender_id: 'system',
    sender_role: 'admin',
    timestamp: storedMessage.createdAt.toISOString(),
    message_id: storedMessage.id,
  };

  io.to(sessionRoomId).emit('chat:message', systemMessage);

  logger.info('System message sent', {
    sessionId,
    messageId: storedMessage.id,
  });
}

/**
 * Broadcast announcement to all sessions (not persisted)
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

/**
 * Get message count for a session
 */
export async function getSessionMessageCount(sessionId: string): Promise<number> {
  return prisma.chatMessage.count({
    where: {
      sessionId,
      isDeleted: false,
    },
  });
}
