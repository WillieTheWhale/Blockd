/**
 * Configuration
 * Blockd Auth Service
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001'),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/blockd',

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0')
  },

  // JWT
  jwt: {
    accessTokenExpiry: '1h',
    refreshTokenExpiry: 7 * 24 * 60 * 60, // 7 days in seconds
    issuer: 'blockd-auth',
    audience: 'blockd-api'
  },

  // MFA
  mfa: {
    encryptionKey: process.env.MFA_ENCRYPTION_KEY || '',
    appName: 'Blockd'
  },

  // OAuth
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/auth/oauth/google/callback'
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      callbackUrl: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3001/auth/oauth/microsoft/callback'
    }
  },

  // URLs
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Security
  bcryptSaltRounds: 12,
  rateLimiting: {
    enabled: process.env.RATE_LIMITING_ENABLED !== 'false',
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute'
  },

  // Email (stub)
  email: {
    from: process.env.EMAIL_FROM || 'noreply@blockd.io',
    enabled: process.env.EMAIL_ENABLED === 'true'
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.NODE_ENV === 'development'
  }
};

/**
 * Validate required configuration
 */
export function validateConfig(): void {
  const requiredVars = [
    'DATABASE_URL',
    'MFA_ENCRYPTION_KEY'
  ];

  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    console.warn('⚠️  Some features may not work correctly');
  }

  // Validate MFA encryption key length
  if (process.env.MFA_ENCRYPTION_KEY && process.env.MFA_ENCRYPTION_KEY.length !== 64) {
    console.warn('⚠️  MFA_ENCRYPTION_KEY should be 64 characters (32 bytes hex)');
  }
}

export default config;
