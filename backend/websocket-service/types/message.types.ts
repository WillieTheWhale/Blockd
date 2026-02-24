/**
 * Message Types
 * Type definitions for message buffering and queuing
 */

/**
 * Message priority levels
 */
export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Buffered message
 */
export interface BufferedMessage {
  id: string;
  userId: string;
  event: string;
  data: Record<string, unknown>;
  priority: MessagePriority;
  createdAt: Date;
  expiresAt?: Date;
  retryCount?: number;
}

/**
 * Message buffer options
 */
export interface MessageBufferOptions {
  maxSize?: number;
  maxAgeMs?: number;
  priorityEnabled?: boolean;
}

/**
 * Message buffer statistics
 */
export interface MessageBufferStats {
  totalMessages: number;
  messagesByUser: Map<string, number>;
  oldestMessage?: Date;
  newestMessage?: Date;
  averageAge: number;
}

/**
 * Message delivery status
 */
export enum MessageDeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

/**
 * Message delivery result
 */
export interface MessageDeliveryResult {
  messageId: string;
  status: MessageDeliveryStatus;
  deliveredAt?: Date;
  error?: string;
}

/**
 * Batch message delivery options
 */
export interface BatchDeliveryOptions {
  userId: string;
  socketId: string;
  maxMessages?: number;
  priorityOrder?: boolean;
}
