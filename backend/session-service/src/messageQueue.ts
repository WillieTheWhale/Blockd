import amqp from 'amqplib';
import { config } from './config';
import { MessageQueueError } from '../lib/errors';

// RabbitMQ connection singleton
let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;

// Store event handlers for proper cleanup
let connectionErrorHandler: ((error: Error) => void) | null = null;
let connectionCloseHandler: (() => void) | null = null;

export async function connectMessageQueue(): Promise<void> {
  try {
    connection = await amqp.connect(config.rabbitmq.url);
    channel = await connection.createChannel();

    // Declare exchanges
    await channel.assertExchange(config.rabbitmq.exchanges.video, 'topic', { durable: true });
    await channel.assertExchange(config.rabbitmq.exchanges.ai, 'topic', { durable: true });
    await channel.assertExchange(config.rabbitmq.exchanges.security, 'topic', { durable: true });
    await channel.assertExchange(config.rabbitmq.exchanges.gaze, 'topic', { durable: true });

    console.log('RabbitMQ connected');

    // Handle connection errors - store handlers for cleanup
    connectionErrorHandler = (error: Error) => {
      console.error('RabbitMQ connection error:', error);
    };

    connectionCloseHandler = () => {
      console.log('RabbitMQ connection closed');
    };

    connection.on('error', connectionErrorHandler);
    connection.on('close', connectionCloseHandler);
  } catch (error) {
    throw new MessageQueueError(
      'connect',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

export async function disconnectMessageQueue(): Promise<void> {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      // Remove event listeners to prevent memory leaks
      if (connectionErrorHandler) {
        connection.removeListener('error', connectionErrorHandler);
        connectionErrorHandler = null;
      }
      if (connectionCloseHandler) {
        connection.removeListener('close', connectionCloseHandler);
        connectionCloseHandler = null;
      }
      await connection.close();
      connection = null;
    }
  } catch (error) {
    console.error('Error disconnecting from RabbitMQ:', error);
  }
}

export function getChannel(): amqp.Channel {
  if (!channel) {
    throw new MessageQueueError('getChannel', 'Channel not initialized');
  }
  return channel;
}

export class MessageQueueService {
  /**
   * Get channel with lazy initialization
   */
  private getChannelSafe(): amqp.Channel {
    if (!channel) {
      throw new MessageQueueError('getChannel', 'Channel not initialized. Call connectMessageQueue() first.');
    }
    return channel;
  }

  /**
   * Check if message queue is connected
   */
  isConnected(): boolean {
    return channel !== null;
  }

  /**
   * Publish message to exchange
   */
  async publish(
    exchange: string,
    routingKey: string,
    message: object,
    options?: amqp.Options.Publish
  ): Promise<void> {
    try {
      const ch = this.getChannelSafe();
      const messageBuffer = Buffer.from(JSON.stringify(message));

      ch.publish(
        exchange,
        routingKey,
        messageBuffer,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
          ...options,
        }
      );
    } catch (error) {
      throw new MessageQueueError(
        'publish',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Publish video processing event
   */
  async publishVideoEvent(event: 'start' | 'stop', sessionId: string, metadata?: object): Promise<void> {
    await this.publish(
      config.rabbitmq.exchanges.video,
      `video.${event}`,
      {
        session_id: sessionId,
        event,
        metadata,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Publish AI detection event
   */
  async publishAIDetectionEvent(answerId: string, questionId: string, answerText: string): Promise<void> {
    await this.publish(
      config.rabbitmq.exchanges.ai,
      'ai.detect',
      {
        answer_id: answerId,
        question_id: questionId,
        answer_text: answerText,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Publish security event
   */
  async publishSecurityEvent(sessionId: string, eventType: string, severity: string, metadata?: object): Promise<void> {
    await this.publish(
      config.rabbitmq.exchanges.security,
      `security.${severity}`,
      {
        session_id: sessionId,
        event_type: eventType,
        severity,
        metadata,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Publish gaze analysis event
   */
  async publishGazeEvent(sessionId: string, gazeData: object): Promise<void> {
    await this.publish(
      config.rabbitmq.exchanges.gaze,
      'gaze.analyze',
      {
        session_id: sessionId,
        gaze_data: gazeData,
        timestamp: new Date().toISOString(),
      }
    );
  }
}

export default MessageQueueService;
