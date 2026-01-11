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

  // Email (AWS SES)
  email: {
    from: process.env.EMAIL_FROM || 'noreply@blockd.io',
    enabled: process.env.EMAIL_ENABLED === 'true',
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
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
  const isProduction = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables
  const requiredVars = ['DATABASE_URL'];
  const missing = requiredVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    if (isProduction) {
      errors.push(`Missing required environment variables: ${missing.join(', ')}`);
    } else {
      warnings.push(`Missing environment variables: ${missing.join(', ')}`);
    }
  }

  // Validate MFA encryption key (required in production)
  const mfaKey = process.env.MFA_ENCRYPTION_KEY;
  if (!mfaKey || mfaKey.length === 0) {
    if (isProduction) {
      errors.push('MFA_ENCRYPTION_KEY is required in production');
    } else {
      warnings.push('MFA_ENCRYPTION_KEY not set - MFA features will be disabled');
    }
  } else if (mfaKey.length !== 64) {
    errors.push(`MFA_ENCRYPTION_KEY must be 64 characters (32 bytes hex), got ${mfaKey.length} characters`);
  } else if (!/^[0-9a-fA-F]+$/.test(mfaKey)) {
    errors.push('MFA_ENCRYPTION_KEY must contain only hexadecimal characters (0-9, a-f, A-F)');
  }

  // Validate AWS SES configuration (required in production if email is enabled)
  if (process.env.EMAIL_ENABLED === 'true' && isProduction) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      // Only warn - AWS SDK can use IAM roles in EKS/EC2
      warnings.push('AWS credentials not set - email will use IAM role authentication if available');
    }
    if (!process.env.AWS_REGION) {
      warnings.push('AWS_REGION not set - defaulting to us-east-1');
    }
  }

  // Log warnings
  for (const warning of warnings) {
    console.warn(`⚠️  ${warning}`);
  }

  // Throw errors in production, warn in development
  if (errors.length > 0) {
    console.error('Configuration validation errors:');
    for (const error of errors) {
      console.error(`  ❌ ${error}`);
    }
    if (isProduction) {
      throw new Error(`Configuration validation failed: ${errors.join('; ')}`);
    }
    console.warn('⚠️  Running with invalid configuration (development mode only)');
  }
}

export default config;
