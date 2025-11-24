import { CacheService } from '../src/redis';
import { SessionParticipant } from '../types/session.types';

/**
 * Participant Service
 * Handles session participant tracking and management
 */

export class ParticipantService {
  private cache: CacheService;

  constructor() {
    this.cache = new CacheService();
  }

  /**
   * Add participant to session
   */
  async addParticipant(participant: SessionParticipant): Promise<void> {
    const key = `participants:${participant.session_id}`;
    await this.cache.hset(key, participant.user_id, participant);
  }

  /**
   * Remove participant from session
   */
  async removeParticipant(sessionId: string, userId: string): Promise<void> {
    const key = `participants:${sessionId}`;
    const participant = await this.getParticipant(sessionId, userId);

    if (participant) {
      participant.connected = false;
      participant.left_at = new Date();
      await this.cache.hset(key, userId, participant);
    }
  }

  /**
   * Get participant
   */
  async getParticipant(sessionId: string, userId: string): Promise<SessionParticipant | null> {
    const key = `participants:${sessionId}`;
    return await this.cache.hget<SessionParticipant>(key, userId, true);
  }

  /**
   * Get all participants in session
   */
  async getSessionParticipants(sessionId: string): Promise<SessionParticipant[]> {
    const key = `participants:${sessionId}`;
    const participantsData = await this.cache.hgetall(key);

    return Object.values(participantsData).map((data) => JSON.parse(data));
  }

  /**
   * Get connected participants
   */
  async getConnectedParticipants(sessionId: string): Promise<SessionParticipant[]> {
    const participants = await this.getSessionParticipants(sessionId);
    return participants.filter((p) => p.connected);
  }

  /**
   * Update participant socket ID
   */
  async updateParticipantSocketId(
    sessionId: string,
    userId: string,
    socketId: string
  ): Promise<void> {
    const participant = await this.getParticipant(sessionId, userId);

    if (participant) {
      participant.socket_id = socketId;
      participant.connected = true;
      await this.addParticipant(participant);
    }
  }

  /**
   * Mark participant as disconnected
   */
  async markParticipantDisconnected(sessionId: string, userId: string): Promise<void> {
    const participant = await this.getParticipant(sessionId, userId);

    if (participant) {
      participant.connected = false;
      participant.left_at = new Date();
      await this.addParticipant(participant);
    }
  }

  /**
   * Clear all participants for session
   */
  async clearSessionParticipants(sessionId: string): Promise<void> {
    const key = `participants:${sessionId}`;
    await this.cache.delete(key);
  }

  /**
   * Check if user is participant in session
   */
  async isParticipant(sessionId: string, userId: string): Promise<boolean> {
    const participant = await this.getParticipant(sessionId, userId);
    return participant !== null;
  }

  /**
   * Get participant count
   */
  async getParticipantCount(sessionId: string): Promise<number> {
    const participants = await this.getSessionParticipants(sessionId);
    return participants.length;
  }

  /**
   * Get connected participant count
   */
  async getConnectedParticipantCount(sessionId: string): Promise<number> {
    const participants = await this.getConnectedParticipants(sessionId);
    return participants.length;
  }
}

export default new ParticipantService();
