import { nanoid } from 'nanoid';
import { CacheService } from '../src/redis';
import { config } from '../src/config';
import { SessionTokenInvalidError } from '../lib/errors';

/**
 * Token Service
 * Handles session token generation and validation
 */

export class TokenService {
  private cache: CacheService;

  constructor() {
    this.cache = new CacheService();
  }

  /**
   * Generate unique session token
   */
  generateSessionToken(): string {
    return nanoid(config.session.tokenLength);
  }

  /**
   * Store session token in cache
   */
  async storeSessionToken(token: string, sessionId: string): Promise<void> {
    const key = `token:${token}`;
    await this.cache.set(key, sessionId, config.session.tokenTTL);
  }

  /**
   * Validate session token and get session ID
   */
  async validateSessionToken(token: string): Promise<string> {
    const key = `token:${token}`;
    const sessionId = await this.cache.get<string>(key);

    if (!sessionId) {
      throw new SessionTokenInvalidError();
    }

    return sessionId;
  }

  /**
   * Invalidate session token
   */
  async invalidateSessionToken(token: string): Promise<void> {
    const key = `token:${token}`;
    await this.cache.delete(key);
  }

  /**
   * Extend token TTL
   */
  async extendTokenTTL(token: string, ttlSeconds?: number): Promise<void> {
    const key = `token:${token}`;
    const exists = await this.cache.exists(key);

    if (!exists) {
      throw new SessionTokenInvalidError();
    }

    await this.cache.expire(key, ttlSeconds || config.session.tokenTTL);
  }
}

export default new TokenService();
