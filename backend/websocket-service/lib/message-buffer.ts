/**
 * Message Buffer
 * Buffers messages for offline users and delivers on reconnection
 */

import { Server, Socket } from 'socket.io';
import {
  BufferedMessage,
  MessagePriority,
  MessageBufferOptions,
  MessageBufferStats,
  MessageDeliveryStatus,
  MessageDeliveryResult,
  BatchDeliveryOptions,
} from '../types/message.types';
import { logger } from './logger';
import { MessageBufferOverflowError } from './errors';

export class MessageBuffer {
  private buffers: Map<string, BufferedMessage[]> = new Map();
  private options: Required<MessageBufferOptions>;
  private io: Server | null = null;
  private cleanupIntervalId: NodeJS.Timer | null = null;

  constructor(options: MessageBufferOptions = {}) {
    this.options = {
      maxSize: options.maxSize || 100,
      maxAgeMs: options.maxAgeMs || 5 * 60 * 1000, // 5 minutes default
      priorityEnabled: options.priorityEnabled !== false,
    };

    // Start cleanup interval
    this.cleanupIntervalId = setInterval(() => this.cleanup(), 60000); // Cleanup every minute
  }

  /**
   * Set the Socket.io server instance for socket lookup
   */
  setServer(io: Server): void {
    this.io = io;
    logger.debug('MessageBuffer initialized with Socket.io server');
  }

  /**
   * Add message to buffer
   */
  add(
    userId: string,
    event: string,
    data: any,
    priority: MessagePriority = MessagePriority.NORMAL
  ): void {
    if (!this.buffers.has(userId)) {
      this.buffers.set(userId, []);
    }

    const buffer = this.buffers.get(userId)!;

    // Check buffer size
    if (buffer.length >= this.options.maxSize) {
      // Remove oldest low-priority message if enabled
      if (this.options.priorityEnabled) {
        const lowPriorityIndex = buffer.findIndex(
          (m) => m.priority === MessagePriority.LOW || m.priority === MessagePriority.NORMAL
        );
        if (lowPriorityIndex !== -1) {
          buffer.splice(lowPriorityIndex, 1);
          logger.debug('Removed low-priority message from buffer', { userId });
        } else {
          throw new MessageBufferOverflowError(userId, buffer.length, this.options.maxSize);
        }
      } else {
        // Remove oldest message (FIFO)
        buffer.shift();
        logger.debug('Removed oldest message from buffer', { userId });
      }
    }

    const message: BufferedMessage = {
      id: this.generateMessageId(),
      userId,
      event,
      data,
      priority,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.options.maxAgeMs),
      retryCount: 0,
    };

    buffer.push(message);

    // Sort by priority if enabled
    if (this.options.priorityEnabled) {
      buffer.sort((a, b) => b.priority - a.priority);
    }

    logger.debug('Message added to buffer', {
      userId,
      event,
      priority,
      bufferSize: buffer.length,
    });
  }

  /**
   * Flush all buffered messages to socket
   */
  async flush(userId: string, socket: Socket): Promise<MessageDeliveryResult[]> {
    const buffer = this.buffers.get(userId);
    if (!buffer || buffer.length === 0) {
      return [];
    }

    const results: MessageDeliveryResult[] = [];

    for (const message of buffer) {
      const result = await this.deliverMessage(message, socket);
      results.push(result);
    }

    // Clear buffer after flushing
    this.buffers.delete(userId);

    logger.info('Messages flushed to user', {
      userId,
      count: results.length,
      delivered: results.filter((r) => r.status === MessageDeliveryStatus.DELIVERED).length,
      failed: results.filter((r) => r.status === MessageDeliveryStatus.FAILED).length,
    });

    return results;
  }

  /**
   * Flush messages in batches
   */
  async flushBatch(options: BatchDeliveryOptions): Promise<MessageDeliveryResult[]> {
    const { userId, socketId, maxMessages = 10, priorityOrder = true } = options;

    const buffer = this.buffers.get(userId);
    if (!buffer || buffer.length === 0) {
      return [];
    }

    // Get messages to deliver
    let messages = buffer.slice(0, maxMessages);

    if (priorityOrder && this.options.priorityEnabled) {
      messages.sort((a, b) => b.priority - a.priority);
    }

    const results: MessageDeliveryResult[] = [];
    const socket = this.getSocketById(socketId);

    if (!socket) {
      logger.warn('Socket not found for batch flush', { userId, socketId });
      return [];
    }

    for (const message of messages) {
      const result = await this.deliverMessage(message, socket);
      results.push(result);

      // Remove delivered messages
      if (result.status === MessageDeliveryStatus.DELIVERED) {
        const index = buffer.indexOf(message);
        if (index !== -1) {
          buffer.splice(index, 1);
        }
      }
    }

    // Clean up empty buffer
    if (buffer.length === 0) {
      this.buffers.delete(userId);
    }

    return results;
  }

  /**
   * Deliver a single message
   */
  private async deliverMessage(
    message: BufferedMessage,
    socket: Socket
  ): Promise<MessageDeliveryResult> {
    try {
      // Check if message expired
      if (message.expiresAt && message.expiresAt < new Date()) {
        return {
          messageId: message.id,
          status: MessageDeliveryStatus.EXPIRED,
          error: 'Message expired',
        };
      }

      // Emit message to socket
      socket.emit(message.event, message.data);

      return {
        messageId: message.id,
        status: MessageDeliveryStatus.DELIVERED,
        deliveredAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to deliver message', error, {
        messageId: message.id,
        event: message.event,
      });

      return {
        messageId: message.id,
        status: MessageDeliveryStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get buffer statistics
   */
  getStats(): MessageBufferStats {
    const messagesByUser = new Map<string, number>();
    let oldestMessage: Date | undefined;
    let newestMessage: Date | undefined;
    let totalAge = 0;
    let totalMessages = 0;

    for (const [userId, buffer] of this.buffers.entries()) {
      messagesByUser.set(userId, buffer.length);

      for (const message of buffer) {
        totalMessages++;
        totalAge += Date.now() - message.createdAt.getTime();

        if (!oldestMessage || message.createdAt < oldestMessage) {
          oldestMessage = message.createdAt;
        }
        if (!newestMessage || message.createdAt > newestMessage) {
          newestMessage = message.createdAt;
        }
      }
    }

    return {
      totalMessages,
      messagesByUser,
      oldestMessage,
      newestMessage,
      averageAge: totalMessages > 0 ? totalAge / totalMessages : 0,
    };
  }

  /**
   * Get buffer size for user
   */
  getBufferSize(userId: string): number {
    const buffer = this.buffers.get(userId);
    return buffer ? buffer.length : 0;
  }

  /**
   * Clear buffer for user
   */
  clearBuffer(userId: string): void {
    this.buffers.delete(userId);
    logger.debug('Buffer cleared for user', { userId });
  }

  /**
   * Clear all buffers
   */
  clearAllBuffers(): void {
    this.buffers.clear();
    logger.debug('All buffers cleared');
  }

  /**
   * Destroy the MessageBuffer and clean up resources
   */
  destroy(): void {
    // Clear the cleanup interval
    if (this.cleanupIntervalId !== null) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    // Clear all buffers
    this.clearAllBuffers();

    // Clear server reference
    this.io = null;

    logger.debug('MessageBuffer destroyed');
  }

  /**
   * Cleanup expired messages
   */
  private cleanup(): void {
    const now = new Date();
    let totalCleaned = 0;

    for (const [userId, buffer] of this.buffers.entries()) {
      const originalLength = buffer.length;

      // Remove expired messages
      const filtered = buffer.filter((message) => {
        return !message.expiresAt || message.expiresAt > now;
      });

      const cleaned = originalLength - filtered.length;
      totalCleaned += cleaned;

      if (filtered.length === 0) {
        this.buffers.delete(userId);
      } else if (cleaned > 0) {
        this.buffers.set(userId, filtered);
      }
    }

    if (totalCleaned > 0) {
      logger.debug('Cleaned up expired messages', { count: totalCleaned });
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get socket by ID from Socket.io server
   */
  private getSocketById(socketId: string): Socket | null {
    if (!this.io) {
      logger.warn('MessageBuffer: Socket.io server not set, call setServer() first');
      return null;
    }

    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) {
      logger.debug('Socket not found', { socketId });
      return null;
    }

    return socket;
  }
}
