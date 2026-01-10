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
    poolSize: number;
    poolTimeout: number;
    idleTimeout: number;
    connectionTimeout: number;
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
    allowNoOrigin: boolean;
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
    responseTimingService: string;
    videoService: string;
    websocketService: string;
  };

  // Cache Configuration
  cache: {
    enabled: boolean;
    defaultTtl: number;
    userTtl: number;
    sessionTtl: number;
    organizationTtl: number;
  };

  // Shutdown Configuration
  shutdown: {
    timeout: number;
    drainTimeout: number;
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
    poolSize: getEnvNumber('DB_POOL_SIZE', 20),
    poolTimeout: getEnvNumber('DB_POOL_TIMEOUT', 10),
    idleTimeout: getEnvNumber('DB_IDLE_TIMEOUT', 900),
    connectionTimeout: getEnvNumber('DB_CONNECTION_TIMEOUT', 5000),
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
    allowNoOrigin: getEnvBoolean('CORS_ALLOW_NO_ORIGIN', false),
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
    responseTimingService: getEnv('RESPONSE_TIMING_SERVICE_URL', 'http://localhost:3005'),
    videoService: getEnv('VIDEO_SERVICE_URL', 'http://localhost:3006'),
    websocketService: getEnv('WEBSOCKET_SERVICE_URL', 'http://localhost:3007'),
  },

  cache: {
    enabled: getEnvBoolean('CACHE_ENABLED', true),
    defaultTtl: getEnvNumber('CACHE_DEFAULT_TTL', 300), // 5 minutes
    userTtl: getEnvNumber('CACHE_USER_TTL', 3600), // 1 hour
    sessionTtl: getEnvNumber('CACHE_SESSION_TTL', 7200), // 2 hours
    organizationTtl: getEnvNumber('CACHE_ORG_TTL', 86400), // 24 hours
  },

  shutdown: {
    timeout: getEnvNumber('SHUTDOWN_TIMEOUT', 30000), // 30 seconds
    drainTimeout: getEnvNumber('SHUTDOWN_DRAIN_TIMEOUT', 10000), // 10 seconds
  },
};

/**
 * Configuration validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate configuration on startup
 */
export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ============================================================================
  // Required Configuration Validation
  // ============================================================================

  // Validate JWT keys (critical for auth)
  if (!config.jwt.publicKey) {
    errors.push('JWT_PUBLIC_KEY is required for authentication');
  }
  if (!config.jwt.privateKey) {
    errors.push('JWT_PRIVATE_KEY is required for token signing');
  }

  // Validate database URL
  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  } else if (!config.database.url.startsWith('postgresql://') && !config.database.url.startsWith('postgres://')) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection string');
  }

  // Validate service URLs
  if (!config.services.authService) {
    errors.push('AUTH_SERVICE_URL is required');
  } else if (!isValidUrl(config.services.authService)) {
    errors.push('AUTH_SERVICE_URL must be a valid URL');
  }

  if (!config.services.sessionService) {
    errors.push('SESSION_SERVICE_URL is required');
  } else if (!isValidUrl(config.services.sessionService)) {
    errors.push('SESSION_SERVICE_URL must be a valid URL');
  }

  // ============================================================================
  // Optional Configuration Validation with Warnings
  // ============================================================================

  // AI Detection Service
  if (config.services.aiDetectionService && !isValidUrl(config.services.aiDetectionService)) {
    warnings.push('AI_DETECTION_SERVICE_URL is not a valid URL');
  }

  // Eye Tracking Service
  if (config.services.eyeTrackingService && !isValidUrl(config.services.eyeTrackingService)) {
    warnings.push('EYE_TRACKING_SERVICE_URL is not a valid URL');
  }

  // Redis validation
  if (config.redis.port < 1 || config.redis.port > 65535) {
    warnings.push(`REDIS_PORT (${config.redis.port}) is not a valid port number`);
  }

  // Database pool size
  if (config.database.poolSize < 1 || config.database.poolSize > 100) {
    warnings.push(`DB_POOL_SIZE (${config.database.poolSize}) should be between 1 and 100`);
  }

  // Rate limiting
  if (config.rateLimit.public.max < 1) {
    warnings.push('RATE_LIMIT_PUBLIC_MAX should be at least 1');
  }
  if (config.rateLimit.authenticated.max < config.rateLimit.public.max) {
    warnings.push('RATE_LIMIT_AUTH_MAX should be greater than RATE_LIMIT_PUBLIC_MAX');
  }

  // ============================================================================
  // Production-specific Validation
  // ============================================================================

  if (config.server.isProduction) {
    // CORS should not be wildcard in production
    if (config.cors.origin === '*') {
      errors.push('CORS_ORIGINS cannot be "*" in production');
    }

    // Should have proper JWT keys (not empty)
    if (config.jwt.publicKey.length < 100) {
      warnings.push('JWT_PUBLIC_KEY appears too short for a proper RSA key');
    }
    if (config.jwt.privateKey.length < 100) {
      warnings.push('JWT_PRIVATE_KEY appears too short for a proper RSA key');
    }

    // Redis password should be set
    if (!config.redis.password) {
      warnings.push('REDIS_PASSWORD is not set - recommended for production');
    }

    // Log level should not be debug
    if (config.logging.level === 'debug' || config.logging.level === 'trace') {
      warnings.push(`LOG_LEVEL is "${config.logging.level}" - consider using "info" or "warn" in production`);
    }

    // Pretty print should be disabled in production
    if (config.logging.prettyPrint) {
      warnings.push('LOG_PRETTY_PRINT should be disabled in production for JSON logging');
    }

    // TLS/HTTPS enforcement for service URLs in production
    const serviceUrls = [
      { name: 'AUTH_SERVICE_URL', url: config.services.authService },
      { name: 'SESSION_SERVICE_URL', url: config.services.sessionService },
      { name: 'AI_DETECTION_SERVICE_URL', url: config.services.aiDetectionService },
      { name: 'EYE_TRACKING_SERVICE_URL', url: config.services.eyeTrackingService },
    ];

    for (const { name, url } of serviceUrls) {
      if (url && !url.startsWith('https://') && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
        warnings.push(`${name} should use HTTPS in production (current: ${url.substring(0, 30)}...)`);
      }
    }

    // Database SSL requirement in production
    if (!config.database.url.includes('sslmode=require') && !config.database.url.includes('ssl=true')) {
      warnings.push('DATABASE_URL should include sslmode=require for production');
    }
  }

  // ============================================================================
  // Development-specific Validation
  // ============================================================================

  if (config.server.isDevelopment) {
    // Check for default credentials
    if (config.database.url.includes('blockd_secure_password_2025')) {
      warnings.push('Using default database password - change in production');
    }
  }

  // ============================================================================
  // Log Results
  // ============================================================================

  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
    warnings,
  };

  if (errors.length > 0) {
    console.error('❌ Configuration validation failed:');
    errors.forEach(error => console.error(`   ERROR: ${error}`));
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Configuration warnings:');
    warnings.forEach(warning => console.warn(`   WARN: ${warning}`));
  }

  if (errors.length > 0 && config.server.isProduction) {
    throw new Error(`Configuration invalid: ${errors.join(', ')}`);
  }

  if (result.valid && warnings.length === 0) {
    console.log('✅ Configuration validation passed');
  } else if (result.valid) {
    console.log('✅ Configuration validation passed with warnings');
  }

  return result;
}

/**
 * Get a summary of the current configuration (safe for logging)
 */
export function getConfigSummary(): Record<string, unknown> {
  return {
    server: {
      port: config.server.port,
      host: config.server.host,
      nodeEnv: config.server.nodeEnv,
    },
    database: {
      poolSize: config.database.poolSize,
      poolTimeout: config.database.poolTimeout,
      // Don't log the URL as it may contain credentials
      urlConfigured: !!config.database.url,
    },
    redis: {
      host: config.redis.host,
      port: config.redis.port,
      clusterEnabled: config.redis.clusterEnabled,
      passwordConfigured: !!config.redis.password,
    },
    jwt: {
      publicKeyConfigured: !!config.jwt.publicKey,
      privateKeyConfigured: !!config.jwt.privateKey,
      accessTokenExpiry: config.jwt.accessTokenExpiry,
      refreshTokenExpiry: config.jwt.refreshTokenExpiry,
    },
    cors: {
      credentialsEnabled: config.cors.credentials,
      allowNoOrigin: config.cors.allowNoOrigin,
      // Don't log all origins
    },
    rateLimit: {
      publicMax: config.rateLimit.public.max,
      publicWindow: config.rateLimit.public.timeWindow,
      authMax: config.rateLimit.authenticated.max,
      authWindow: config.rateLimit.authenticated.timeWindow,
    },
    logging: config.logging,
    cache: {
      enabled: config.cache.enabled,
      defaultTtl: config.cache.defaultTtl,
      userTtl: config.cache.userTtl,
      sessionTtl: config.cache.sessionTtl,
    },
    shutdown: config.shutdown,
    services: {
      authServiceConfigured: !!config.services.authService,
      sessionServiceConfigured: !!config.services.sessionService,
      aiDetectionServiceConfigured: !!config.services.aiDetectionService,
      eyeTrackingServiceConfigured: !!config.services.eyeTrackingService,
    },
  };
}

export default config;
