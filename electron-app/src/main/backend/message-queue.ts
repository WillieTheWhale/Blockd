/**
 * Message Queue
 *
 * FIFO queue for offline message storage with size limits.
 * Automatically drops oldest messages when full.
 */

import { BlockedMessage } from '../../shared/types.js';

export class MessageQueue {
  private queue: BlockedMessage[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Enqueue a message to the queue
   * Drops oldest message if queue is full
   */
  enqueue(message: BlockedMessage): void {
    if (this.queue.length >= this.maxSize) {
      const dropped = this.queue.shift();
      console.warn('[MessageQueue] Queue full, dropped oldest message:', {
        type: dropped?.type,
        timestamp: dropped?.timestamp,
      });
    }

    this.queue.push(message);
  }

  /**
   * Dequeue a message from the queue
   * Returns undefined if queue is empty
   */
  dequeue(): BlockedMessage | undefined {
    return this.queue.shift();
  }

  /**
   * Peek at the first message without removing it
   */
  peek(): BlockedMessage | undefined {
    return this.queue[0];
  }

  /**
   * Get all messages and clear the queue
   */
  flush(): BlockedMessage[] {
    const messages = [...this.queue];
    this.queue = [];
    return messages;
  }

  /**
   * Clear all messages from the queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get the current queue size
   */
  size(): number {
    return this.queue.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Check if queue is full
   */
  isFull(): boolean {
    return this.queue.length >= this.maxSize;
  }

  /**
   * Get queue statistics
   */
  getStats(): { size: number; maxSize: number; utilization: number } {
    return {
      size: this.queue.length,
      maxSize: this.maxSize,
      utilization: this.queue.length / this.maxSize,
    };
  }
}
