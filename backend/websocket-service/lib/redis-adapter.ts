/**
 * Redis Adapter Configuration
 * Configures Socket.io Redis adapter for horizontal scaling
 */

import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { Server } from 'socket.io';
import { RedisConnectionError } from './errors';
import { logger } from './logger';

export interface RedisAdapterConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  tls?: boolean;
  tlsOptions?: {
    rejectUnauthorized?: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}

export class RedisAdapterManager {
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private config: RedisAdapterConfig;
  private isConnected: boolean = false;

  constructor(config: RedisAdapterConfig) {
    this.config = config;
  }

  /**
   * Initialize Redis adapter for Socket.io server
   */
  async initialize(io: Server): Promise<void> {
    try {
      // Create Redis clients
      const redisUrl = this.buildRedisUrl();

      const tlsSocketOptions = this.getTlsSocketOptions();

      this.pubClient = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis connection failed after 10 retries');
              return new Error('Max retries reached');
            }
            const delay = Math.min(retries * 50, 2000);
            logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          },
          ...tlsSocketOptions,
        },
      });

      this.subClient = this.pubClient.duplicate();

      // Set up error handlers
      this.pubClient.on('error', (err) => {
        logger.error('Redis Pub Client Error:', err);
      });

      this.subClient.on('error', (err) => {
        logger.error('Redis Sub Client Error:', err);
      });

      // Set up connection handlers
      this.pubClient.on('connect', () => {
        logger.info('Redis Pub Client connected');
      });

      this.subClient.on('connect', () => {
        logger.info('Redis Sub Client connected');
      });

      this.pubClient.on('ready', () => {
        logger.info('Redis Pub Client ready');
        this.isConnected = true;
      });

      this.subClient.on('ready', () => {
        logger.info('Redis Sub Client ready');
      });

      // Connect both clients
      await Promise.all([
        this.pubClient.connect(),
        this.subClient.connect(),
      ]);

      // Create and attach adapter
      const adapter = createAdapter(this.pubClient, this.subClient, {
        key: this.config.keyPrefix || 'socket.io',
      });

      io.adapter(adapter);

      logger.info('Redis adapter initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Redis adapter:', error);
      throw new RedisConnectionError('Failed to initialize Redis adapter', { error });
    }
  }

  /**
   * Check if Redis is connected
   */
  isRedisConnected(): boolean {
    return this.isConnected &&
           this.pubClient?.isReady === true &&
           this.subClient?.isReady === true;
  }

  /**
   * Get Redis pub client
   */
  getPubClient(): RedisClientType | null {
    return this.pubClient;
  }

  /**
   * Get Redis sub client
   */
  getSubClient(): RedisClientType | null {
    return this.subClient;
  }

  /**
   * Disconnect Redis clients
   */
  async disconnect(): Promise<void> {
    try {
      if (this.pubClient) {
        await this.pubClient.quit();
        logger.info('Redis Pub Client disconnected');
      }
      if (this.subClient) {
        await this.subClient.quit();
        logger.info('Redis Sub Client disconnected');
      }
      this.isConnected = false;
    } catch (error) {
      logger.error('Error disconnecting Redis clients:', error);
      throw error;
    }
  }

  /**
   * Build Redis URL from config
   */
  private buildRedisUrl(): string {
    const { host, port, password, db, tls } = this.config;
    // Use rediss:// protocol for TLS connections
    let url = tls ? 'rediss://' : 'redis://';

    if (password) {
      url += `:${password}@`;
    }

    url += `${host}:${port}`;

    if (db !== undefined) {
      url += `/${db}`;
    }

    return url;
  }

  /**
   * Get TLS socket options from config
   */
  private getTlsSocketOptions(): object | undefined {
    const { tls, tlsOptions } = this.config;

    if (!tls) {
      return undefined;
    }

    return {
      tls: true,
      rejectUnauthorized: tlsOptions?.rejectUnauthorized ?? true,
      ...(tlsOptions?.ca && { ca: tlsOptions.ca }),
      ...(tlsOptions?.cert && { cert: tlsOptions.cert }),
      ...(tlsOptions?.key && { key: tlsOptions.key }),
    };
  }

  /**
   * Publish message to Redis channel
   */
  async publish(channel: string, message: string): Promise<void> {
    if (!this.pubClient || !this.isConnected) {
      throw new RedisConnectionError('Redis not connected');
    }

    try {
      await this.pubClient.publish(channel, message);
    } catch (error) {
      logger.error('Failed to publish message to Redis:', error);
      throw error;
    }
  }

  /**
   * Get Redis connection statistics
   */
  getStats(): {
    pubConnected: boolean;
    subConnected: boolean;
    isReady: boolean;
  } {
    return {
      pubConnected: this.pubClient?.isOpen === true,
      subConnected: this.subClient?.isOpen === true,
      isReady: this.isConnected,
    };
  }
}

/**
 * Create Redis adapter manager instance
 */
export function createRedisAdapter(config: RedisAdapterConfig): RedisAdapterManager {
  return new RedisAdapterManager(config);
}
