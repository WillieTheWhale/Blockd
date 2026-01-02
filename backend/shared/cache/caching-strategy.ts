/**
 * Caching Strategy for Blockd Platform
 * Defines cache key patterns, TTLs, and helper functions
 */

import crypto from 'crypto';
import { getRedisClient, CacheOptions, RateLimitOptions } from './redis-client';

// Cache TTL Constants (in seconds)
export const CacheTTL = {
  AI_ANSWER: 86400, // 24 hours
  SESSION: 3600, // 1 hour (base TTL, can be extended based on session duration)
  USER_SESSION_TOKEN: 3600, // 1 hour
  GAZE_REALTIME: 30, // 30 seconds
  RATE_LIMIT_WINDOW: 60, // 1 minute
  SHORT_LIVED: 300, // 5 minutes
  MEDIUM_LIVED: 1800, // 30 minutes
  LONG_LIVED: 604800, // 7 days
} as const;

// Cache Key Prefixes
export const CachePrefix = {
  SESSION: 'session',
  AI_ANSWER: 'ai_answer',
  RATE_LIMIT: 'rate_limit',
  USER_SESSION: 'user_session',
  GAZE_REALTIME: 'gaze_realtime',
  PARTICIPANT: 'participant',
  STUDY: 'study',
  ANALYTICS: 'analytics',
} as const;

// Rate Limit Configurations
export const RateLimitConfig = {
  PUBLIC_ENDPOINT: {
    maxRequests: 100,
    windowSeconds: 60,
  } as RateLimitOptions,
  AUTHENTICATED_ENDPOINT: {
    maxRequests: 500,
    windowSeconds: 60,
  } as RateLimitOptions,
  AI_ENDPOINT: {
    maxRequests: 50,
    windowSeconds: 60,
  } as RateLimitOptions,
  GAZE_UPLOAD: {
    maxRequests: 1000,
    windowSeconds: 60,
  } as RateLimitOptions,
} as const;

/**
 * Cache Key Builders
 */
export class CacheKeyBuilder {
  /**
   * Build session cache key
   * Pattern: session:{session_id}
   */
  static session(sessionId: string): string {
    return `${CachePrefix.SESSION}:${sessionId}`;
  }

  /**
   * Build AI answer cache key
   * Pattern: ai_answer:{question_hash}:{model}
   */
  static aiAnswer(question: string, model: string): string {
    const questionHash = this.hashString(question);
    return `${CachePrefix.AI_ANSWER}:${questionHash}:${model}`;
  }

  /**
   * Build rate limit cache key
   * Pattern: rate_limit:{ip}:{endpoint}
   */
  static rateLimit(ip: string, endpoint: string): string {
    const sanitizedEndpoint = endpoint.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${CachePrefix.RATE_LIMIT}:${ip}:${sanitizedEndpoint}`;
  }

  /**
   * Build user session token cache key
   * Pattern: user_session:{token_hash}
   */
  static userSession(token: string): string {
    const tokenHash = this.hashString(token);
    return `${CachePrefix.USER_SESSION}:${tokenHash}`;
  }

  /**
   * Build gaze realtime cache key
   * Pattern: gaze_realtime:{session_id}
   */
  static gazeRealtime(sessionId: string): string {
    return `${CachePrefix.GAZE_REALTIME}:${sessionId}`;
  }

  /**
   * Build participant cache key
   * Pattern: participant:{participant_id}
   */
  static participant(participantId: string): string {
    return `${CachePrefix.PARTICIPANT}:${participantId}`;
  }

  /**
   * Build study cache key
   * Pattern: study:{study_id}
   */
  static study(studyId: string): string {
    return `${CachePrefix.STUDY}:${studyId}`;
  }

  /**
   * Build analytics cache key
   * Pattern: analytics:{study_id}:{metric_type}
   */
  static analytics(studyId: string, metricType: string): string {
    return `${CachePrefix.ANALYTICS}:${studyId}:${metricType}`;
  }

  /**
   * Hash a string using SHA-256
   */
  private static hashString(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
  }
}

/**
 * Session Cache Manager
 */
export class SessionCache {
  private redis = getRedisClient();

  /**
   * Store session data
   */
  async set(sessionId: string, data: any, ttl?: number): Promise<void> {
    const key = CacheKeyBuilder.session(sessionId);
    const sessionTTL = ttl || CacheTTL.SESSION;

    await this.redis.set(key, data, { ttl: sessionTTL });
  }

  /**
   * Get session data
   */
  async get(sessionId: string): Promise<any | null> {
    const key = CacheKeyBuilder.session(sessionId);
    return await this.redis.get(key);
  }

  /**
   * Delete session data
   */
  async delete(sessionId: string): Promise<number> {
    const key = CacheKeyBuilder.session(sessionId);
    return await this.redis.del(key);
  }

  /**
   * Extend session TTL
   */
  async extend(sessionId: string, additionalSeconds: number): Promise<boolean> {
    const key = CacheKeyBuilder.session(sessionId);
    const currentTTL = await this.redis.ttl(key);

    if (currentTTL > 0) {
      return await this.redis.expire(key, currentTTL + additionalSeconds);
    }

    return false;
  }

  /**
   * Check if session exists
   */
  async exists(sessionId: string): Promise<boolean> {
    const key = CacheKeyBuilder.session(sessionId);
    return await this.redis.exists(key);
  }
}

/**
 * AI Answer Cache Manager
 */
export class AIAnswerCache {
  private redis = getRedisClient();

  /**
   * Store AI answer with embedding
   */
  async set(
    question: string,
    model: string,
    answer: string,
    embedding?: number[]
  ): Promise<void> {
    const key = CacheKeyBuilder.aiAnswer(question, model);
    const data = {
      question,
      model,
      answer,
      embedding,
      cachedAt: new Date().toISOString(),
    };

    await this.redis.set(key, data, { ttl: CacheTTL.AI_ANSWER });
  }

  /**
   * Get cached AI answer
   */
  async get(question: string, model: string): Promise<any | null> {
    const key = CacheKeyBuilder.aiAnswer(question, model);
    return await this.redis.get(key);
  }

  /**
   * Check if answer is cached
   */
  async exists(question: string, model: string): Promise<boolean> {
    const key = CacheKeyBuilder.aiAnswer(question, model);
    return await this.redis.exists(key);
  }

  /**
   * Delete cached answer
   */
  async delete(question: string, model: string): Promise<number> {
    const key = CacheKeyBuilder.aiAnswer(question, model);
    return await this.redis.del(key);
  }

  /**
   * Clear all AI answers for a specific model
   */
  async clearByModel(model: string): Promise<number> {
    const pattern = `${CachePrefix.AI_ANSWER}:*:${model}`;
    return await this.redis.deletePattern(pattern);
  }
}

/**
 * Rate Limit Manager
 */
export class RateLimitManager {
  private redis = getRedisClient();

  /**
   * Check rate limit for public endpoints
   */
  async checkPublic(identifier: string, endpoint: string) {
    const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
    return await this.redis.rateLimit(key, RateLimitConfig.PUBLIC_ENDPOINT);
  }

  /**
   * Check rate limit for authenticated endpoints
   */
  async checkAuthenticated(identifier: string, endpoint: string) {
    const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
    return await this.redis.rateLimit(key, RateLimitConfig.AUTHENTICATED_ENDPOINT);
  }

  /**
   * Check rate limit for AI endpoints
   */
  async checkAI(identifier: string, endpoint: string) {
    const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
    return await this.redis.rateLimit(key, RateLimitConfig.AI_ENDPOINT);
  }

  /**
   * Check rate limit for gaze data uploads
   */
  async checkGazeUpload(identifier: string) {
    const key = CacheKeyBuilder.rateLimit(identifier, 'gaze_upload');
    return await this.redis.rateLimit(key, RateLimitConfig.GAZE_UPLOAD);
  }

  /**
   * Custom rate limit check
   */
  async check(identifier: string, endpoint: string, config: RateLimitOptions) {
    const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
    return await this.redis.rateLimit(key, config);
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string, endpoint: string): Promise<number> {
    const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
    return await this.redis.del(key);
  }
}

/**
 * User Session Token Cache Manager
 */
export class UserSessionCache {
  private redis = getRedisClient();

  /**
   * Store user session token
   */
  async set(token: string, userData: any, ttl?: number): Promise<void> {
    const key = CacheKeyBuilder.userSession(token);
    const sessionTTL = ttl || CacheTTL.USER_SESSION_TOKEN;

    await this.redis.set(key, userData, { ttl: sessionTTL });
  }

  /**
   * Get user session data by token
   */
  async get(token: string): Promise<any | null> {
    const key = CacheKeyBuilder.userSession(token);
    return await this.redis.get(key);
  }

  /**
   * Delete user session token
   */
  async delete(token: string): Promise<number> {
    const key = CacheKeyBuilder.userSession(token);
    return await this.redis.del(key);
  }

  /**
   * Refresh token TTL
   */
  async refresh(token: string): Promise<boolean> {
    const key = CacheKeyBuilder.userSession(token);
    return await this.redis.expire(key, CacheTTL.USER_SESSION_TOKEN);
  }
}

/**
 * Gaze Realtime Data Cache Manager
 */
export class GazeRealtimeCache {
  private redis = getRedisClient();

  /**
   * Store latest gaze data for a session
   */
  async set(sessionId: string, gazeData: any): Promise<void> {
    const key = CacheKeyBuilder.gazeRealtime(sessionId);
    await this.redis.set(key, gazeData, { ttl: CacheTTL.GAZE_REALTIME });
  }

  /**
   * Get latest gaze data for a session
   */
  async get(sessionId: string): Promise<any | null> {
    const key = CacheKeyBuilder.gazeRealtime(sessionId);
    return await this.redis.get(key);
  }

  /**
   * Delete gaze data for a session
   */
  async delete(sessionId: string): Promise<number> {
    const key = CacheKeyBuilder.gazeRealtime(sessionId);
    return await this.redis.del(key);
  }

  /**
   * Batch get gaze data for multiple sessions
   */
  async getMany(sessionIds: string[]): Promise<Array<any | null>> {
    const keys = sessionIds.map(id => CacheKeyBuilder.gazeRealtime(id));
    return await this.redis.mget(keys);
  }
}

/**
 * Participant Cache Manager
 */
export class ParticipantCache {
  private redis = getRedisClient();

  /**
   * Store participant data
   */
  async set(participantId: string, data: any, ttl?: number): Promise<void> {
    const key = CacheKeyBuilder.participant(participantId);
    await this.redis.set(key, data, { ttl: ttl || CacheTTL.MEDIUM_LIVED });
  }

  /**
   * Get participant data
   */
  async get(participantId: string): Promise<any | null> {
    const key = CacheKeyBuilder.participant(participantId);
    return await this.redis.get(key);
  }

  /**
   * Delete participant data
   */
  async delete(participantId: string): Promise<number> {
    const key = CacheKeyBuilder.participant(participantId);
    return await this.redis.del(key);
  }
}

/**
 * Study Cache Manager
 */
export class StudyCache {
  private redis = getRedisClient();

  /**
   * Store study data
   */
  async set(studyId: string, data: any, ttl?: number): Promise<void> {
    const key = CacheKeyBuilder.study(studyId);
    await this.redis.set(key, data, { ttl: ttl || CacheTTL.LONG_LIVED });
  }

  /**
   * Get study data
   */
  async get(studyId: string): Promise<any | null> {
    const key = CacheKeyBuilder.study(studyId);
    return await this.redis.get(key);
  }

  /**
   * Delete study data
   */
  async delete(studyId: string): Promise<number> {
    const key = CacheKeyBuilder.study(studyId);
    return await this.redis.del(key);
  }
}

/**
 * Analytics Cache Manager
 */
export class AnalyticsCache {
  private redis = getRedisClient();

  /**
   * Store analytics data
   */
  async set(studyId: string, metricType: string, data: any, ttl?: number): Promise<void> {
    const key = CacheKeyBuilder.analytics(studyId, metricType);
    await this.redis.set(key, data, { ttl: ttl || CacheTTL.SHORT_LIVED });
  }

  /**
   * Get analytics data
   */
  async get(studyId: string, metricType: string): Promise<any | null> {
    const key = CacheKeyBuilder.analytics(studyId, metricType);
    return await this.redis.get(key);
  }

  /**
   * Delete analytics data
   */
  async delete(studyId: string, metricType: string): Promise<number> {
    const key = CacheKeyBuilder.analytics(studyId, metricType);
    return await this.redis.del(key);
  }

  /**
   * Clear all analytics for a study
   */
  async clearStudy(studyId: string): Promise<number> {
    const pattern = `${CachePrefix.ANALYTICS}:${studyId}:*`;
    return await this.redis.deletePattern(pattern);
  }
}

/**
 * Unified Cache Manager - Single interface for all caching operations
 */
export class CacheManager {
  public session = new SessionCache();
  public aiAnswer = new AIAnswerCache();
  public rateLimit = new RateLimitManager();
  public userSession = new UserSessionCache();
  public gazeRealtime = new GazeRealtimeCache();
  public participant = new ParticipantCache();
  public study = new StudyCache();
  public analytics = new AnalyticsCache();

  private redis = getRedisClient();

  /**
   * Get cache health status
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<any> {
    try {
      const info = await this.redis.info('stats');
      return info;
    } catch (error) {
      console.error('[CacheManager] Error getting stats:', error);
      return null;
    }
  }

  /**
   * Clear all caches (use with extreme caution!)
   */
  async clearAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('clearAll is not allowed in production');
    }
    await this.redis.flushAll();
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();

// Export individual managers for convenience
export const sessionCache = new SessionCache();
export const aiAnswerCache = new AIAnswerCache();
export const rateLimitManager = new RateLimitManager();
export const userSessionCache = new UserSessionCache();
export const gazeRealtimeCache = new GazeRealtimeCache();
export const participantCache = new ParticipantCache();
export const studyCache = new StudyCache();
export const analyticsCache = new AnalyticsCache();
