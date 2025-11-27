/**
 * Configuration Management for Blockd API Gateway
 * Centralized configuration from environment variables
 */

import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

export interface Config {
  // Server Configuration
  server: {
    port: number;
    host: string;
    nodeEnv: string;
    isDevelopment: boolean;
    isProduction: boolean;
  };

  // Database Configuration
  database: {
    url: string;
  };

  // Redis Configuration
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    clusterEnabled: boolean;
  };

  // JWT Configuration
  jwt: {
    publicKey: string;
    privateKey: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
  };

  // CORS Configuration
  cors: {
    origin: string | string[];
    credentials: boolean;
  };

  // Rate Limiting Configuration
  rateLimit: {
    public: {
      max: number;
      timeWindow: number; // in seconds
    };
    authenticated: {
      max: number;
      timeWindow: number; // in seconds
    };
  };

  // Logging Configuration
  logging: {
    level: string;
    prettyPrint: boolean;
  };

  // Service URLs (for proxying)
  services: {
    authService: string;
    sessionService: string;
    aiDetectionService: string;
    eyeTrackingService: string;
  };
}

/**
 * Get configuration value with validation
 */
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get numeric configuration value
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

/**
 * Get boolean configuration value
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

/**
 * Parse CORS origins
 */
function parseCorsOrigins(origins: string): string | string[] {
  if (origins === '*') {
    return '*';
  }
  return origins.split(',').map(origin => origin.trim());
}

/**
 * Application Configuration
 */
export const config: Config = {
  server: {
    port: getEnvNumber('PORT', 3000),
    host: getEnv('HOST', '0.0.0.0'),
    nodeEnv: getEnv('NODE_ENV', 'development'),
    isDevelopment: getEnv('NODE_ENV', 'development') === 'development',
    isProduction: getEnv('NODE_ENV', 'development') === 'production',
  },

  database: {
    url: getEnv(
      'DATABASE_URL',
      'postgresql://blockd_app:blockd_secure_password_2025@localhost:5432/blockd'
    ),
  },

  redis: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: getEnvNumber('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD,
    db: getEnvNumber('REDIS_DB', 0),
    clusterEnabled: getEnvBoolean('REDIS_CLUSTER_ENABLED', false),
  },

  jwt: {
    publicKey: getEnv('JWT_PUBLIC_KEY', ''),
    privateKey: getEnv('JWT_PRIVATE_KEY', ''),
    accessTokenExpiry: getEnv('JWT_ACCESS_TOKEN_EXPIRY', '1h'),
    refreshTokenExpiry: getEnv('JWT_REFRESH_TOKEN_EXPIRY', '7d'),
  },

  cors: {
    origin: parseCorsOrigins(getEnv('CORS_ORIGINS', 'http://localhost:3000')),
    credentials: getEnvBoolean('CORS_CREDENTIALS', true),
  },

  rateLimit: {
    public: {
      max: getEnvNumber('RATE_LIMIT_PUBLIC_MAX', 100),
      timeWindow: getEnvNumber('RATE_LIMIT_PUBLIC_WINDOW', 60), // 60 seconds
    },
    authenticated: {
      max: getEnvNumber('RATE_LIMIT_AUTH_MAX', 500),
      timeWindow: getEnvNumber('RATE_LIMIT_AUTH_WINDOW', 60), // 60 seconds
    },
  },

  logging: {
    level: getEnv('LOG_LEVEL', 'info'),
    prettyPrint: getEnvBoolean('LOG_PRETTY_PRINT', true),
  },

  services: {
    authService: getEnv('AUTH_SERVICE_URL', 'http://localhost:3001'),
    sessionService: getEnv('SESSION_SERVICE_URL', 'http://localhost:3002'),
    aiDetectionService: getEnv('AI_DETECTION_SERVICE_URL', 'http://localhost:3003'),
    eyeTrackingService: getEnv('EYE_TRACKING_SERVICE_URL', 'http://localhost:3004'),
  },
};

/**
 * Validate configuration on startup
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Validate JWT keys
  if (!config.jwt.publicKey || !config.jwt.privateKey) {
    errors.push('JWT_PUBLIC_KEY and JWT_PRIVATE_KEY must be set');
  }

  // Validate database URL
  if (!config.database.url) {
    errors.push('DATABASE_URL must be set');
  }

  // Validate service URLs
  if (!config.services.authService) {
    errors.push('AUTH_SERVICE_URL must be set');
  }
  if (!config.services.sessionService) {
    errors.push('SESSION_SERVICE_URL must be set');
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    if (config.server.isProduction) {
      throw new Error('Invalid configuration');
    } else {
      console.warn('⚠️  Running with invalid configuration (development mode)');
    }
  }
}

export default config;
