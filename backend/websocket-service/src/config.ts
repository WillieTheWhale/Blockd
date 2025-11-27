/**
 * Configuration Management
 * Centralized configuration for WebSocket service
 */

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  // Server
  port: number;
  host: string;
  nodeEnv: string;

  // CORS
  allowedOrigins: string[];
  credentials: boolean;

  // Socket.io
  pingInterval: number;
  pingTimeout: number;
  maxHttpBufferSize: number;
  transports: ('websocket' | 'polling')[];

  // Redis
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
  };

  // JWT
  jwt: {
    publicKeyPath: string;
    algorithm: string;
    issuer: string;
    audience: string;
  };

  // Rate Limiting
  rateLimit: {
    maxEventsPerMinute: number;
    checkInterval: number;
  };

  // Message Buffer
  messageBuffer: {
    maxSize: number;
    maxAgeMs: number;
  };

  // Reconnection
  reconnect: {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
  };

  // Gaze Streaming
  gaze: {
    throttleHz: number;
  };

  // Logging
  logging: {
    level: string;
    format: 'json' | 'pretty';
  };
}

/**
 * Parse comma-separated string to array
 */
function parseArray(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/**
 * Parse integer with default value
 */
function parseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse boolean with default value
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get configuration from environment variables
 */
export function getConfig(): Config {
  return {
    // Server
    port: parseInt(process.env.PORT, 3003),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',

    // CORS
    allowedOrigins: parseArray(
      process.env.ALLOWED_ORIGINS,
      ['http://localhost:3000', 'http://localhost:5173']
    ),
    credentials: parseBoolean(process.env.CORS_CREDENTIALS, true),

    // Socket.io
    pingInterval: parseInt(process.env.PING_INTERVAL, 25000), // 25 seconds
    pingTimeout: parseInt(process.env.PING_TIMEOUT, 20000), // 20 seconds
    maxHttpBufferSize: parseInt(process.env.MAX_HTTP_BUFFER_SIZE, 1e6), // 1MB
    transports: parseArray(process.env.TRANSPORTS, ['websocket', 'polling']) as ('websocket' | 'polling')[],

    // Redis
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 6379),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB, 0),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'blockd:ws',
    },

    // JWT
    jwt: {
      publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || '../auth-service/keys/public.pem',
      algorithm: process.env.JWT_ALGORITHM || 'RS256',
      issuer: process.env.JWT_ISSUER || 'blockd-auth',
      audience: process.env.JWT_AUDIENCE || 'blockd-api',
    },

    // Rate Limiting
    rateLimit: {
      maxEventsPerMinute: parseInt(process.env.RATE_LIMIT_MAX_EVENTS, 1000),
      checkInterval: parseInt(process.env.RATE_LIMIT_CHECK_INTERVAL, 1000), // 1 second
    },

    // Message Buffer
    messageBuffer: {
      maxSize: parseInt(process.env.MESSAGE_BUFFER_MAX_SIZE, 100),
      maxAgeMs: parseInt(process.env.MESSAGE_BUFFER_MAX_AGE_MS, 300000), // 5 minutes
    },

    // Reconnection
    reconnect: {
      maxAttempts: parseInt(process.env.RECONNECT_MAX_ATTEMPTS, 10),
      initialDelay: parseInt(process.env.RECONNECT_INITIAL_DELAY, 1000), // 1 second
      maxDelay: parseInt(process.env.RECONNECT_MAX_DELAY, 30000), // 30 seconds
    },

    // Gaze Streaming
    gaze: {
      throttleHz: parseInt(process.env.GAZE_THROTTLE_HZ, 10), // 10 Hz max
    },

    // Logging
    logging: {
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      format: (process.env.LOG_FORMAT as 'json' | 'pretty') || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty'),
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: Config): void {
  const errors: string[] = [];

  // Validate port
  if (config.port < 1 || config.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  // Validate Redis
  if (!config.redis.host) {
    errors.push('Redis host is required');
  }
  if (config.redis.port < 1 || config.redis.port > 65535) {
    errors.push('Redis port must be between 1 and 65535');
  }

  // Validate JWT
  if (!config.jwt.publicKeyPath) {
    errors.push('JWT public key path is required');
  }

  // Validate allowed origins
  if (config.allowedOrigins.length === 0) {
    errors.push('At least one allowed origin is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Get and validate configuration
 */
export function loadConfig(): Config {
  const config = getConfig();
  validateConfig(config);
  return config;
}
