"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsCache = exports.studyCache = exports.participantCache = exports.gazeRealtimeCache = exports.userSessionCache = exports.rateLimitManager = exports.aiAnswerCache = exports.sessionCache = exports.cacheManager = exports.CacheManager = exports.AnalyticsCache = exports.StudyCache = exports.ParticipantCache = exports.GazeRealtimeCache = exports.UserSessionCache = exports.RateLimitManager = exports.AIAnswerCache = exports.SessionCache = exports.CacheKeyBuilder = exports.RateLimitConfig = exports.CachePrefix = exports.CacheTTL = void 0;
const crypto_1 = __importDefault(require("crypto"));
const redis_client_1 = require("./redis-client");
exports.CacheTTL = {
    AI_ANSWER: 86400,
    SESSION: 3600,
    USER_SESSION_TOKEN: 3600,
    GAZE_REALTIME: 30,
    RATE_LIMIT_WINDOW: 60,
    SHORT_LIVED: 300,
    MEDIUM_LIVED: 1800,
    LONG_LIVED: 604800,
};
exports.CachePrefix = {
    SESSION: 'session',
    AI_ANSWER: 'ai_answer',
    RATE_LIMIT: 'rate_limit',
    USER_SESSION: 'user_session',
    GAZE_REALTIME: 'gaze_realtime',
    PARTICIPANT: 'participant',
    STUDY: 'study',
    ANALYTICS: 'analytics',
};
exports.RateLimitConfig = {
    PUBLIC_ENDPOINT: {
        maxRequests: 100,
        windowSeconds: 60,
    },
    AUTHENTICATED_ENDPOINT: {
        maxRequests: 500,
        windowSeconds: 60,
    },
    AI_ENDPOINT: {
        maxRequests: 50,
        windowSeconds: 60,
    },
    GAZE_UPLOAD: {
        maxRequests: 1000,
        windowSeconds: 60,
    },
};
class CacheKeyBuilder {
    static session(sessionId) {
        return `${exports.CachePrefix.SESSION}:${sessionId}`;
    }
    static aiAnswer(question, model) {
        const questionHash = this.hashString(question);
        return `${exports.CachePrefix.AI_ANSWER}:${questionHash}:${model}`;
    }
    static rateLimit(ip, endpoint) {
        const sanitizedEndpoint = endpoint.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `${exports.CachePrefix.RATE_LIMIT}:${ip}:${sanitizedEndpoint}`;
    }
    static userSession(token) {
        const tokenHash = this.hashString(token);
        return `${exports.CachePrefix.USER_SESSION}:${tokenHash}`;
    }
    static gazeRealtime(sessionId) {
        return `${exports.CachePrefix.GAZE_REALTIME}:${sessionId}`;
    }
    static participant(participantId) {
        return `${exports.CachePrefix.PARTICIPANT}:${participantId}`;
    }
    static study(studyId) {
        return `${exports.CachePrefix.STUDY}:${studyId}`;
    }
    static analytics(studyId, metricType) {
        return `${exports.CachePrefix.ANALYTICS}:${studyId}:${metricType}`;
    }
    static hashString(input) {
        return crypto_1.default.createHash('sha256').update(input).digest('hex').substring(0, 16);
    }
}
exports.CacheKeyBuilder = CacheKeyBuilder;
class SessionCache {
    redis = (0, redis_client_1.getRedisClient)();
    async set(sessionId, data, ttl) {
        const key = CacheKeyBuilder.session(sessionId);
        const sessionTTL = ttl || exports.CacheTTL.SESSION;
        await this.redis.set(key, data, { ttl: sessionTTL });
    }
    async get(sessionId) {
        const key = CacheKeyBuilder.session(sessionId);
        return await this.redis.get(key);
    }
    async delete(sessionId) {
        const key = CacheKeyBuilder.session(sessionId);
        return await this.redis.del(key);
    }
    async extend(sessionId, additionalSeconds) {
        const key = CacheKeyBuilder.session(sessionId);
        const currentTTL = await this.redis.ttl(key);
        if (currentTTL > 0) {
            return await this.redis.expire(key, currentTTL + additionalSeconds);
        }
        return false;
    }
    async exists(sessionId) {
        const key = CacheKeyBuilder.session(sessionId);
        return await this.redis.exists(key);
    }
}
exports.SessionCache = SessionCache;
class AIAnswerCache {
    redis = (0, redis_client_1.getRedisClient)();
    async set(question, model, answer, embedding) {
        const key = CacheKeyBuilder.aiAnswer(question, model);
        const data = {
            question,
            model,
            answer,
            embedding,
            cachedAt: new Date().toISOString(),
        };
        await this.redis.set(key, data, { ttl: exports.CacheTTL.AI_ANSWER });
    }
    async get(question, model) {
        const key = CacheKeyBuilder.aiAnswer(question, model);
        return await this.redis.get(key);
    }
    async exists(question, model) {
        const key = CacheKeyBuilder.aiAnswer(question, model);
        return await this.redis.exists(key);
    }
    async delete(question, model) {
        const key = CacheKeyBuilder.aiAnswer(question, model);
        return await this.redis.del(key);
    }
    async clearByModel(model) {
        const pattern = `${exports.CachePrefix.AI_ANSWER}:*:${model}`;
        return await this.redis.deletePattern(pattern);
    }
}
exports.AIAnswerCache = AIAnswerCache;
class RateLimitManager {
    redis = (0, redis_client_1.getRedisClient)();
    async checkPublic(identifier, endpoint) {
        const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
        return await this.redis.rateLimit(key, exports.RateLimitConfig.PUBLIC_ENDPOINT);
    }
    async checkAuthenticated(identifier, endpoint) {
        const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
        return await this.redis.rateLimit(key, exports.RateLimitConfig.AUTHENTICATED_ENDPOINT);
    }
    async checkAI(identifier, endpoint) {
        const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
        return await this.redis.rateLimit(key, exports.RateLimitConfig.AI_ENDPOINT);
    }
    async checkGazeUpload(identifier) {
        const key = CacheKeyBuilder.rateLimit(identifier, 'gaze_upload');
        return await this.redis.rateLimit(key, exports.RateLimitConfig.GAZE_UPLOAD);
    }
    async check(identifier, endpoint, config) {
        const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
        return await this.redis.rateLimit(key, config);
    }
    async reset(identifier, endpoint) {
        const key = CacheKeyBuilder.rateLimit(identifier, endpoint);
        return await this.redis.del(key);
    }
}
exports.RateLimitManager = RateLimitManager;
class UserSessionCache {
    redis = (0, redis_client_1.getRedisClient)();
    async set(token, userData, ttl) {
        const key = CacheKeyBuilder.userSession(token);
        const sessionTTL = ttl || exports.CacheTTL.USER_SESSION_TOKEN;
        await this.redis.set(key, userData, { ttl: sessionTTL });
    }
    async get(token) {
        const key = CacheKeyBuilder.userSession(token);
        return await this.redis.get(key);
    }
    async delete(token) {
        const key = CacheKeyBuilder.userSession(token);
        return await this.redis.del(key);
    }
    async refresh(token) {
        const key = CacheKeyBuilder.userSession(token);
        return await this.redis.expire(key, exports.CacheTTL.USER_SESSION_TOKEN);
    }
}
exports.UserSessionCache = UserSessionCache;
class GazeRealtimeCache {
    redis = (0, redis_client_1.getRedisClient)();
    async set(sessionId, gazeData) {
        const key = CacheKeyBuilder.gazeRealtime(sessionId);
        await this.redis.set(key, gazeData, { ttl: exports.CacheTTL.GAZE_REALTIME });
    }
    async get(sessionId) {
        const key = CacheKeyBuilder.gazeRealtime(sessionId);
        return await this.redis.get(key);
    }
    async delete(sessionId) {
        const key = CacheKeyBuilder.gazeRealtime(sessionId);
        return await this.redis.del(key);
    }
    async getMany(sessionIds) {
        const keys = sessionIds.map(id => CacheKeyBuilder.gazeRealtime(id));
        return await this.redis.mget(keys);
    }
}
exports.GazeRealtimeCache = GazeRealtimeCache;
class ParticipantCache {
    redis = (0, redis_client_1.getRedisClient)();
    async set(participantId, data, ttl) {
        const key = CacheKeyBuilder.participant(participantId);
        await this.redis.set(key, data, { ttl: ttl || exports.CacheTTL.MEDIUM_LIVED });
    }
    async get(participantId) {
        const key = CacheKeyBuilder.participant(participantId);
        return await this.redis.get(key);
    }
    async delete(participantId) {
        const key = CacheKeyBuilder.participant(participantId);
        return await this.redis.del(key);
    }
}
exports.ParticipantCache = ParticipantCache;
class StudyCache {
    redis = (0, redis_client_1.getRedisClient)();
    async set(studyId, data, ttl) {
        const key = CacheKeyBuilder.study(studyId);
        await this.redis.set(key, data, { ttl: ttl || exports.CacheTTL.LONG_LIVED });
    }
    async get(studyId) {
        const key = CacheKeyBuilder.study(studyId);
        return await this.redis.get(key);
    }
    async delete(studyId) {
        const key = CacheKeyBuilder.study(studyId);
        return await this.redis.del(key);
    }
}
exports.StudyCache = StudyCache;
class AnalyticsCache {
    redis = (0, redis_client_1.getRedisClient)();
    async set(studyId, metricType, data, ttl) {
        const key = CacheKeyBuilder.analytics(studyId, metricType);
        await this.redis.set(key, data, { ttl: ttl || exports.CacheTTL.SHORT_LIVED });
    }
    async get(studyId, metricType) {
        const key = CacheKeyBuilder.analytics(studyId, metricType);
        return await this.redis.get(key);
    }
    async delete(studyId, metricType) {
        const key = CacheKeyBuilder.analytics(studyId, metricType);
        return await this.redis.del(key);
    }
    async clearStudy(studyId) {
        const pattern = `${exports.CachePrefix.ANALYTICS}:${studyId}:*`;
        return await this.redis.deletePattern(pattern);
    }
}
exports.AnalyticsCache = AnalyticsCache;
class CacheManager {
    session = new SessionCache();
    aiAnswer = new AIAnswerCache();
    rateLimit = new RateLimitManager();
    userSession = new UserSessionCache();
    gazeRealtime = new GazeRealtimeCache();
    participant = new ParticipantCache();
    study = new StudyCache();
    analytics = new AnalyticsCache();
    redis = (0, redis_client_1.getRedisClient)();
    async healthCheck() {
        try {
            const result = await this.redis.ping();
            return result === 'PONG';
        }
        catch {
            return false;
        }
    }
    async getStats() {
        try {
            const info = await this.redis.info('stats');
            return info;
        }
        catch (error) {
            console.error('[CacheManager] Error getting stats:', error);
            return null;
        }
    }
    async clearAll() {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('clearAll is not allowed in production');
        }
        await this.redis.flushAll();
    }
}
exports.CacheManager = CacheManager;
exports.cacheManager = new CacheManager();
exports.sessionCache = new SessionCache();
exports.aiAnswerCache = new AIAnswerCache();
exports.rateLimitManager = new RateLimitManager();
exports.userSessionCache = new UserSessionCache();
exports.gazeRealtimeCache = new GazeRealtimeCache();
exports.participantCache = new ParticipantCache();
exports.studyCache = new StudyCache();
exports.analyticsCache = new AnalyticsCache();
//# sourceMappingURL=caching-strategy.js.map