/**
 * Room Manager
 * Manages Socket.io rooms and participant tracking
 */

import { Server, Socket } from 'socket.io';
import {
  RoomType,
  RoomInfo,
  RoomJoinOptions,
  RoomLeaveOptions,
  RoomBroadcastOptions,
  RoomParticipant,
  RoomStatistics,
} from '../types/room.types';
import { AuthenticatedSocket } from '../types/socket.types';
import { logger } from './logger';
import { RoomNotFoundError } from './errors';

// Re-export RoomType for convenience
export { RoomType } from '../types/room.types';

/**
 * Simple mutex implementation for room operations
 * Prevents race conditions during concurrent room joins/leaves
 */
class RoomMutex {
  private locks: Map<string, Promise<void>> = new Map();

  /**
   * Acquire a lock for a specific room
   * Returns a release function to call when done
   */
  async acquire(roomId: string): Promise<() => void> {
    // Wait for any existing lock on this room
    while (this.locks.has(roomId)) {
      await this.locks.get(roomId);
    }

    // Create a new lock
    let releaseFn: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });

    this.locks.set(roomId, lockPromise);

    // Return release function
    return () => {
      this.locks.delete(roomId);
      releaseFn!();
    };
  }
}

export class RoomManager {
  private io: Server;
  private rooms: Map<string, RoomInfo> = new Map();
  // Use Map with composite key ${userId}:${socketId} to prevent memory leaks
  // from duplicate entries when the same user reconnects
  private participants: Map<string, Map<string, RoomParticipant>> = new Map();
  // Mutex for preventing race conditions in room operations
  private mutex: RoomMutex = new RoomMutex();

  constructor(io: Server) {
    this.io = io;
  }

  /**
   * Create a room identifier
   */
  static createRoomId(type: RoomType, identifier: string): string {
    return `${type}:${identifier}`;
  }

  /**
   * Parse room identifier
   */
  static parseRoomId(roomId: string): { type: string; identifier: string } {
    const [type, ...rest] = roomId.split(':');
    return {
      type,
      identifier: rest.join(':'),
    };
  }

  /**
   * Join a room
   */
  async joinRoom(socket: AuthenticatedSocket, options: RoomJoinOptions): Promise<void> {
    const { roomId, userId, role, metadata } = options;

    // Acquire lock for this room to prevent race conditions
    const release = await this.mutex.acquire(roomId);

    try {
      // Join the Socket.io room
      await socket.join(roomId);

      // Track room info
      if (!this.rooms.has(roomId)) {
        const parsed = RoomManager.parseRoomId(roomId);
        this.rooms.set(roomId, {
          roomId,
          type: parsed.type as RoomType,
          participantCount: 0,
          createdAt: new Date(),
          metadata,
        });
      }

      // Track participant using Map with composite key to prevent duplicates
      if (!this.participants.has(roomId)) {
        this.participants.set(roomId, new Map());
      }

      const participant: RoomParticipant = {
        userId,
        socketId: socket.id,
        role,
        joinedAt: new Date(),
        metadata,
      };

      // Use composite key to ensure uniqueness and allow efficient lookup/removal
      const participantKey = `${userId}:${socket.id}`;
      this.participants.get(roomId)!.set(participantKey, participant);

      // Update participant count
      const room = this.rooms.get(roomId)!;
      room.participantCount = this.participants.get(roomId)!.size;

      logger.info('User joined room', {
        userId,
        roomId,
        role,
        participantCount: room.participantCount,
      });
    } catch (error) {
      logger.error('Failed to join room', error, { userId, roomId });
      throw error;
    } finally {
      // Always release the lock
      release();
    }
  }

  /**
   * Leave a room
   */
  async leaveRoom(socket: Socket, options: RoomLeaveOptions): Promise<void> {
    const { roomId, userId, reason } = options;

    // Acquire lock for this room to prevent race conditions
    const release = await this.mutex.acquire(roomId);

    try {
      // Leave the Socket.io room
      await socket.leave(roomId);

      // Remove participant using composite key for O(1) lookup
      const participants = this.participants.get(roomId);
      if (participants) {
        const participantKey = `${userId}:${socket.id}`;
        participants.delete(participantKey);

        // Update participant count
        const room = this.rooms.get(roomId);
        if (room) {
          room.participantCount = participants.size;
        }

        // Clean up empty room
        if (participants.size === 0) {
          this.participants.delete(roomId);
          this.rooms.delete(roomId);
          logger.debug('Room cleaned up (empty)', { roomId });
        }
      }

      logger.info('User left room', {
        userId,
        roomId,
        reason,
      });
    } catch (error) {
      logger.error('Failed to leave room', error, { userId, roomId });
      throw error;
    } finally {
      // Always release the lock
      release();
    }
  }

  /**
   * Broadcast to room
   */
  broadcastToRoom(options: RoomBroadcastOptions): void {
    const { roomId, event, data, excludeSocketId, excludeUserId } = options;

    try {
      let emitter = this.io.to(roomId);

      if (excludeSocketId) {
        emitter = emitter.except(excludeSocketId);
      }

      // If excluding by userId, find and exclude all their sockets
      if (excludeUserId) {
        const participants = this.participants.get(roomId);
        if (participants) {
          const socketIds = Array.from(participants.values())
            .filter((p) => p.userId === excludeUserId)
            .map((p) => p.socketId);
          if (socketIds.length > 0) {
            emitter = emitter.except(socketIds);
          }
        }
      }

      emitter.emit(event, data);

      logger.debug('Broadcast to room', {
        roomId,
        event,
        excludeSocketId,
        excludeUserId,
      });
    } catch (error) {
      logger.error('Failed to broadcast to room', error, { roomId, event });
      throw error;
    }
  }

  /**
   * Get room info
   */
  getRoomInfo(roomId: string): RoomInfo | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get room participants
   */
  getRoomParticipants(roomId: string): RoomParticipant[] {
    const participants = this.participants.get(roomId);
    return participants ? Array.from(participants.values()) : [];
  }

  /**
   * Check if user is in room
   */
  isUserInRoom(roomId: string, userId: string): boolean {
    const participants = this.participants.get(roomId);
    if (!participants) {
      return false;
    }
    return Array.from(participants.values()).some((p) => p.userId === userId);
  }

  /**
   * Get all rooms for a user
   */
  getUserRooms(userId: string): string[] {
    const userRooms: string[] = [];

    for (const [roomId, participants] of this.participants.entries()) {
      if (Array.from(participants.values()).some((p) => p.userId === userId)) {
        userRooms.push(roomId);
      }
    }

    return userRooms;
  }

  /**
   * Get room statistics
   */
  getStatistics(): RoomStatistics {
    const roomsByType: Record<RoomType, number> = {
      [RoomType.USER]: 0,
      [RoomType.SESSION]: 0,
      [RoomType.ORGANIZATION]: 0,
      [RoomType.ADMIN]: 0,
    };

    let totalParticipants = 0;

    for (const room of this.rooms.values()) {
      if (room.type in roomsByType) {
        roomsByType[room.type]++;
      }
      totalParticipants += room.participantCount;
    }

    return {
      totalRooms: this.rooms.size,
      roomsByType,
      totalParticipants,
      averageParticipantsPerRoom:
        this.rooms.size > 0 ? totalParticipants / this.rooms.size : 0,
    };
  }

  /**
   * Clean up disconnected sockets from rooms
   */
  cleanupSocket(socketId: string): void {
    for (const [roomId, participants] of this.participants.entries()) {
      // Find and remove participant by socketId
      let removedKey: string | null = null;
      for (const [key, participant] of participants.entries()) {
        if (participant.socketId === socketId) {
          removedKey = key;
          break;
        }
      }

      if (removedKey) {
        participants.delete(removedKey);

        const room = this.rooms.get(roomId);
        if (room) {
          room.participantCount = participants.size;
        }

        if (participants.size === 0) {
          this.participants.delete(roomId);
          this.rooms.delete(roomId);
        }

        logger.debug('Cleaned up socket from room', { socketId, roomId });
      }
    }
  }

  /**
   * Get all active rooms
   */
  getAllRooms(): RoomInfo[] {
    return Array.from(this.rooms.values());
  }
}
