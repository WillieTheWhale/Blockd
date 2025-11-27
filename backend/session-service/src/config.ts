import dotenv from 'dotenv';
import { WebSocketConfig } from '../types/websocket.types';

dotenv.config();

export interface Config {
  // Server
  nodeEnv: string;
  port: number;
  host: string;

  // Database
  databaseUrl: string;

  // Redis
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
  };

  // RabbitMQ
  rabbitmq: {
    url: string;
    exchanges: {
      video: string;
      ai: string;
      security: string;
      gaze: string;
    };
  };

  // JWT
  jwt: {
    secret: string;
    expiresIn: string;
  };

  // Session
  session: {
    tokenLength: number;
    tokenTTL: number; // seconds
    maxDurationHours: number;
  };

  // WebSocket
  websocket: WebSocketConfig;

  // Frontend
  frontend: {
    url: string;
    sessionJoinUrlBase: string;
  };

  // External services
  services: {
    email: string;
    apiGateway: string;
  };

  // Risk thresholds
  risk: {
    low: number;
    medium: number;
    high: number;
  };

  // Report generation
  report: {
    enabled: boolean;
    pdfEnabled: boolean;
    storagePath: string;
  };

  // Logging
  logging: {
    level: string;
    prettyPrint: boolean;
  };

  // Rate limiting
  rateLimit: {
    max: number;
    window: number; // milliseconds
  };

  // Monitoring
  monitoring: {
    enableMetrics: boolean;
    metricsPort: number;
  };
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  return value ? value === 'true' : defaultValue;
}

export const config: Config = {
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: getEnvNumber('PORT', 3002),
  host: getEnv('HOST', '0.0.0.0'),

  databaseUrl: getEnv('DATABASE_URL'),

  redis: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD,
    db: getEnvNumber('REDIS_DB', 0),
    keyPrefix: getEnv('REDIS_KEY_PREFIX', 'session:'),
  },

  rabbitmq: {
    url: getEnv('RABBITMQ_URL'),
    exchanges: {
      video: getEnv('RABBITMQ_EXCHANGE_VIDEO', 'video_processing'),
      ai: getEnv('RABBITMQ_EXCHANGE_AI', 'ai_detection'),
      security: getEnv('RABBITMQ_EXCHANGE_SECURITY', 'security_events'),
      gaze: getEnv('RABBITMQ_EXCHANGE_GAZE', 'gaze_analysis'),
    },
  },

  jwt: {
    secret: getEnv('JWT_SECRET'),
    expiresIn: getEnv('JWT_EXPIRES_IN', '24h'),
  },

  session: {
    tokenLength: getEnvNumber('SESSION_TOKEN_LENGTH', 64),
    tokenTTL: getEnvNumber('SESSION_TOKEN_TTL', 86400),
    maxDurationHours: getEnvNumber('MAX_SESSION_DURATION_HOURS', 4),
  },

  websocket: {
    port: getEnvNumber('WEBSOCKET_PORT', 3003),
    cors: {
      origin: getEnv('WEBSOCKET_CORS_ORIGIN', 'http://localhost:3000'),
      credentials: true,
    },
    pingInterval: getEnvNumber('WEBSOCKET_PING_INTERVAL', 25000),
    pingTimeout: getEnvNumber('WEBSOCKET_PING_TIMEOUT', 60000),
    transports: ['websocket', 'polling'],
  },

  frontend: {
    url: getEnv('FRONTEND_URL', 'http://localhost:3000'),
    sessionJoinUrlBase: getEnv('SESSION_JOIN_URL_BASE', 'http://localhost:3000/session/join'),
  },

  services: {
    email: getEnv('EMAIL_SERVICE_URL', 'http://localhost:3005'),
    apiGateway: getEnv('API_GATEWAY_URL', 'http://localhost:3001'),
  },

  risk: {
    low: parseFloat(getEnv('RISK_THRESHOLD_LOW', '0.50')),
    medium: parseFloat(getEnv('RISK_THRESHOLD_MEDIUM', '0.75')),
    high: parseFloat(getEnv('RISK_THRESHOLD_HIGH', '0.90')),
  },

  report: {
    enabled: getEnvBoolean('REPORT_GENERATION_ENABLED', true),
    pdfEnabled: getEnvBoolean('REPORT_PDF_ENABLED', true),
    storagePath: getEnv('REPORT_STORAGE_PATH', '/tmp/reports'),
  },

  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
    prettyPrint: getEnvBoolean('LOG_PRETTY_PRINT', true),
  },

  rateLimit: {
    max: getEnvNumber('RATE_LIMIT_MAX', 100),
    window: getEnvNumber('RATE_LIMIT_WINDOW', 60000),
  },

  monitoring: {
    enableMetrics: getEnvBoolean('ENABLE_METRICS', true),
    metricsPort: getEnvNumber('METRICS_PORT', 9090),
  },
};

export default config;
