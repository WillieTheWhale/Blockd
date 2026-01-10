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

export class RoomManager {
  private io: Server;
  private rooms: Map<string, RoomInfo> = new Map();
  private participants: Map<string, Set<RoomParticipant>> = new Map();

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

      // Track participant
      if (!this.participants.has(roomId)) {
        this.participants.set(roomId, new Set());
      }

      const participant: RoomParticipant = {
        userId,
        socketId: socket.id,
        role,
        joinedAt: new Date(),
        metadata,
      };

      this.participants.get(roomId)!.add(participant);

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
    }
  }

  /**
   * Leave a room
   */
  async leaveRoom(socket: Socket, options: RoomLeaveOptions): Promise<void> {
    const { roomId, userId, reason } = options;

    try {
      // Leave the Socket.io room
      await socket.leave(roomId);

      // Remove participant
      const participants = this.participants.get(roomId);
      if (participants) {
        const toRemove = Array.from(participants).find(
          (p) => p.userId === userId && p.socketId === socket.id
        );
        if (toRemove) {
          participants.delete(toRemove);
        }

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
          const socketIds = Array.from(participants)
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
    return participants ? Array.from(participants) : [];
  }

  /**
   * Check if user is in room
   */
  isUserInRoom(roomId: string, userId: string): boolean {
    const participants = this.participants.get(roomId);
    if (!participants) {
      return false;
    }
    return Array.from(participants).some((p) => p.userId === userId);
  }

  /**
   * Get all rooms for a user
   */
  getUserRooms(userId: string): string[] {
    const userRooms: string[] = [];

    for (const [roomId, participants] of this.participants.entries()) {
      if (Array.from(participants).some((p) => p.userId === userId)) {
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
      const toRemove = Array.from(participants).find((p) => p.socketId === socketId);
      if (toRemove) {
        participants.delete(toRemove);

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
