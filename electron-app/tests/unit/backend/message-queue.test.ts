/**
 * Unit tests for MessageQueue
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MessageQueue } from '../../../src/main/backend/message-queue';
import { BlockedMessage } from '../../../src/shared/types';

describe('MessageQueue', () => {
  let queue: MessageQueue;

  const createMessage = (type: string = 'security_event'): BlockedMessage => ({
    type: type as any,
    timestamp: Date.now(),
    payload: { test: true },
  });

  beforeEach(() => {
    queue = new MessageQueue(5);
  });

  describe('enqueue', () => {
    it('should add message to queue', () => {
      queue.enqueue(createMessage());
      expect(queue.size()).toBe(1);
    });

    it('should drop oldest message when queue is full', () => {
      // Fill the queue
      for (let i = 0; i < 5; i++) {
        queue.enqueue(createMessage());
      }

      expect(queue.size()).toBe(5);

      // Add one more
      queue.enqueue(createMessage());

      expect(queue.size()).toBe(5);
    });
  });

  describe('dequeue', () => {
    it('should return undefined for empty queue', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('should return and remove first message', () => {
      const msg1 = createMessage('gaze_data');
      const msg2 = createMessage('security_event');

      queue.enqueue(msg1);
      queue.enqueue(msg2);

      const result = queue.dequeue();

      expect(result).toBe(msg1);
      expect(queue.size()).toBe(1);
    });
  });

  describe('peek', () => {
    it('should return undefined for empty queue', () => {
      expect(queue.peek()).toBeUndefined();
    });

    it('should return first message without removing it', () => {
      const msg = createMessage();
      queue.enqueue(msg);

      expect(queue.peek()).toBe(msg);
      expect(queue.size()).toBe(1);
    });
  });

  describe('flush', () => {
    it('should return all messages and clear queue', () => {
      queue.enqueue(createMessage());
      queue.enqueue(createMessage());
      queue.enqueue(createMessage());

      const messages = queue.flush();

      expect(messages).toHaveLength(3);
      expect(queue.size()).toBe(0);
    });

    it('should return empty array for empty queue', () => {
      const messages = queue.flush();
      expect(messages).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should remove all messages from queue', () => {
      queue.enqueue(createMessage());
      queue.enqueue(createMessage());

      queue.clear();

      expect(queue.size()).toBe(0);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty queue', () => {
      expect(queue.isEmpty()).toBe(true);
    });

    it('should return false for non-empty queue', () => {
      queue.enqueue(createMessage());
      expect(queue.isEmpty()).toBe(false);
    });
  });

  describe('isFull', () => {
    it('should return false when not full', () => {
      queue.enqueue(createMessage());
      expect(queue.isFull()).toBe(false);
    });

    it('should return true when full', () => {
      for (let i = 0; i < 5; i++) {
        queue.enqueue(createMessage());
      }
      expect(queue.isFull()).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      queue.enqueue(createMessage());
      queue.enqueue(createMessage());

      const stats = queue.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
      expect(stats.utilization).toBe(0.4);
    });
  });
});
