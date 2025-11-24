/**
 * RabbitMQ Publisher for Blockd Platform (Node.js/TypeScript)
 * Handles message publishing to RabbitMQ exchanges with connection pooling and retry logic
 */

import amqp, { Connection, Channel, Options } from 'amqplib';

interface RabbitMQConfig {
  hosts: string[];
  port: number;
  username: string;
  password: string;
  vhost: string;
  heartbeat: number;
  connectionTimeout: number;
}

interface PublishOptions {
  priority?: number;
  expiration?: number;
  correlationId?: string;
  persistent?: boolean;
}

interface MessagePayload {
  [key: string]: any;
}

interface EnrichedMessage {
  timestamp: string;
  exchange: string;
  routing_key: string;
  data: MessagePayload;
}

/**
 * RabbitMQ Publisher with connection pooling and retry logic
 */
export class RabbitMQPublisher {
  private config: RabbitMQConfig;
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnected: boolean = false;
  private connectionAttempts: number = 5;
  private retryDelay: number = 2000;

  constructor(config?: Partial<RabbitMQConfig>) {
    this.config = {
      hosts: config?.hosts || ['localhost', '127.0.0.1'],
      port: config?.port || 5672,
      username: config?.username || 'blockd_user',
      password: config?.password || 'blockd_password_change_in_production',
      vhost: config?.vhost || 'blockd',
      heartbeat: config?.heartbeat || 60,
      connectionTimeout: config?.connectionTimeout || 10000,
    };
  }

  /**
   * Establish connection to RabbitMQ cluster
   */
  async connect(): Promise<boolean> {
    for (let attempt = 0; attempt < this.connectionAttempts; attempt++) {
      try {
        const hostIndex = attempt % this.config.hosts.length;
        const host = this.config.hosts[hostIndex];

        const url = `amqp://${this.config.username}:${this.config.password}@${host}:${this.config.port}/${this.config.vhost}`;

        const socketOptions = {
          heartbeat: this.config.heartbeat,
          timeout: this.config.connectionTimeout,
        };

        this.connection = await amqp.connect(url, socketOptions);

        this.connection.on('error', (err) => {
          console.error('RabbitMQ connection error:', err);
          this.isConnected = false;
        });

        this.connection.on('close', () => {
          console.warn('RabbitMQ connection closed');
          this.isConnected = false;
        });

        this.channel = await this.connection.createChannel();

        this.channel.on('error', (err) => {
          console.error('RabbitMQ channel error:', err);
        });

        this.channel.on('close', () => {
          console.warn('RabbitMQ channel closed');
        });

        // Enable publisher confirms
        await this.channel.confirmSelect();

        this.isConnected = true;
        console.log(`Connected to RabbitMQ at ${host}:${this.config.port}/${this.config.vhost}`);
        return true;
      } catch (error) {
        console.warn(
          `Connection attempt ${attempt + 1}/${this.connectionAttempts} failed:`,
          error
        );

        if (attempt < this.connectionAttempts - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    console.error('Failed to connect to RabbitMQ after all attempts');
    this.isConnected = false;
    return false;
  }

  /**
   * Close RabbitMQ connection
   */
  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      this.isConnected = false;
      console.log('Disconnected from RabbitMQ');
    } catch (error) {
      console.error('Error closing connection:', error);
      this.isConnected = false;
      this.connection = null;
      this.channel = null;
    }
  }

  /**
   * Ensure connection is active
   */
  private async ensureConnection(): Promise<boolean> {
    if (!this.isConnected || !this.connection || !this.channel) {
      return await this.connect();
    }
    return true;
  }

  /**
   * Publish message to RabbitMQ exchange
   */
  async publish(
    exchange: string,
    routingKey: string,
    message: MessagePayload,
    options: PublishOptions = {}
  ): Promise<boolean> {
    if (!(await this.ensureConnection())) {
      console.error('Cannot publish: not connected to RabbitMQ');
      return false;
    }

    try {
      const enrichedMessage: EnrichedMessage = {
        timestamp: new Date().toISOString(),
        exchange,
        routing_key: routingKey,
        data: message,
      };

      const content = Buffer.from(JSON.stringify(enrichedMessage));

      const publishOptions: Options.Publish = {
        persistent: options.persistent !== false, // Default to true
        contentType: 'application/json',
        priority: options.priority || 0,
        timestamp: Date.now(),
        ...(options.expiration && { expiration: options.expiration.toString() }),
        ...(options.correlationId && { correlationId: options.correlationId }),
      };

      // Use promise-based confirm
      return await new Promise<boolean>((resolve, reject) => {
        this.channel!.publish(
          exchange,
          routingKey,
          content,
          publishOptions,
          (err, ok) => {
            if (err) {
              console.error(`Failed to publish message to ${exchange}:`, err);
              reject(err);
            } else {
              console.debug(
                `Published message to ${exchange} with routing_key ${routingKey}`
              );
              resolve(true);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error publishing message:', error);
      return false;
    }
  }

  /**
   * Publish multiple messages in a batch
   */
  async publishBatch(
    exchange: string,
    messages: Array<{ routingKey: string; message: MessagePayload }>,
    options: PublishOptions = {}
  ): Promise<number> {
    if (!(await this.ensureConnection())) {
      console.error('Cannot publish batch: not connected to RabbitMQ');
      return 0;
    }

    let successCount = 0;

    for (const { routingKey, message } of messages) {
      if (await this.publish(exchange, routingKey, message, options)) {
        successCount++;
      }
    }

    console.log(`Published ${successCount}/${messages.length} messages in batch`);
    return successCount;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Publish video processing task
 */
export async function publishVideoTask(
  taskType: 'encode' | 'thumbnail' | 'upload',
  videoId: string,
  data: MessagePayload,
  publisher?: RabbitMQPublisher
): Promise<boolean> {
  const message = {
    video_id: videoId,
    task_type: taskType,
    ...data,
  };

  const routingKey = `video.${taskType}.${videoId}`;

  if (publisher) {
    return await publisher.publish('video_processing', routingKey, message);
  } else {
    const pub = new RabbitMQPublisher();
    try {
      await pub.connect();
      return await pub.publish('video_processing', routingKey, message);
    } finally {
      await pub.disconnect();
    }
  }
}

/**
 * Publish AI detection task
 */
export async function publishAITask(
  taskType: 'analyze' | 'embedding' | 'cache',
  examId: string,
  data: MessagePayload,
  publisher?: RabbitMQPublisher
): Promise<boolean> {
  const message = {
    exam_id: examId,
    task_type: taskType,
    ...data,
  };

  const routingKey = `ai.${taskType}.${examId}`;

  if (publisher) {
    return await publisher.publish('ai_detection', routingKey, message);
  } else {
    const pub = new RabbitMQPublisher();
    try {
      await pub.connect();
      return await pub.publish('ai_detection', routingKey, message);
    } finally {
      await pub.disconnect();
    }
  }
}

/**
 * Publish security event
 */
export async function publishSecurityEvent(
  eventType: string,
  data: MessagePayload,
  publisher?: RabbitMQPublisher
): Promise<boolean> {
  const message = {
    event_type: eventType,
    severity: data.severity || 'info',
    ...data,
  };

  const routingKey = `security.${eventType}`;

  if (publisher) {
    return await publisher.publish('security_events', routingKey, message, {
      priority: 5,
    });
  } else {
    const pub = new RabbitMQPublisher();
    try {
      await pub.connect();
      return await pub.publish('security_events', routingKey, message, {
        priority: 5,
      });
    } finally {
      await pub.disconnect();
    }
  }
}

/**
 * Publish gaze analysis task
 */
export async function publishGazeTask(
  taskType: 'process' | 'anomaly',
  sessionId: string,
  data: MessagePayload,
  publisher?: RabbitMQPublisher
): Promise<boolean> {
  const message = {
    session_id: sessionId,
    task_type: taskType,
    ...data,
  };

  const routingKey = `gaze.${taskType}.${sessionId}`;

  if (publisher) {
    return await publisher.publish('gaze_analysis', routingKey, message);
  } else {
    const pub = new RabbitMQPublisher();
    try {
      await pub.connect();
      return await pub.publish('gaze_analysis', routingKey, message);
    } finally {
      await pub.disconnect();
    }
  }
}

/**
 * Example usage
 */
async function main() {
  const publisher = new RabbitMQPublisher();

  try {
    await publisher.connect();

    // Test video task
    await publishVideoTask(
      'encode',
      'video_123',
      { quality: '1080p', codec: 'h264' },
      publisher
    );

    // Test AI task
    await publishAITask(
      'analyze',
      'exam_456',
      { answer_id: 'ans_789', text: 'Sample answer' },
      publisher
    );

    // Test security event
    await publishSecurityEvent(
      'suspicious_activity',
      {
        user_id: 'user_123',
        severity: 'high',
        description: 'Multiple tab switches',
      },
      publisher
    );

    // Test gaze task
    await publishGazeTask(
      'process',
      'session_999',
      { gaze_data: [{ x: 100, y: 200, timestamp: Date.now() }] },
      publisher
    );

    console.log('All test messages published successfully');
  } catch (error) {
    console.error('Error in example:', error);
  } finally {
    await publisher.disconnect();
  }
}

// Run example if executed directly
if (require.main === module) {
  main().catch(console.error);
}
