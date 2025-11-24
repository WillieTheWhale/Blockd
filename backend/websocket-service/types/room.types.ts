/**
 * Room Types
 * Type definitions for Socket.io room management
 */

/**
 * Room types in the system
 */
export enum RoomType {
  USER = 'user',          // Personal user room: user:{user_id}
  SESSION = 'session',    // Session room: session:{session_id}
  ORGANIZATION = 'org',   // Organization room: org:{org_id}
  ADMIN = 'admin',        // Admin broadcast room
}

/**
 * Room information
 */
export interface RoomInfo {
  roomId: string;
  type: RoomType;
  participantCount: number;
  createdAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Room join options
 */
export interface RoomJoinOptions {
  roomId: string;
  userId: string;
  role?: string;
  metadata?: Record<string, any>;
}

/**
 * Room leave options
 */
export interface RoomLeaveOptions {
  roomId: string;
  userId: string;
  reason?: string;
}

/**
 * Room broadcast options
 */
export interface RoomBroadcastOptions {
  roomId: string;
  event: string;
  data: any;
  excludeSocketId?: string;
  excludeUserId?: string;
}

/**
 * Room participant info
 */
export interface RoomParticipant {
  userId: string;
  socketId: string;
  role?: string;
  joinedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Session room metadata
 */
export interface SessionRoomMetadata {
  session_id: string;
  interviewer_id?: string;
  interviewee_id?: string;
  status: 'waiting' | 'active' | 'ended';
  started_at?: Date;
}

/**
 * Room statistics
 */
export interface RoomStatistics {
  totalRooms: number;
  roomsByType: Record<RoomType, number>;
  totalParticipants: number;
  averageParticipantsPerRoom: number;
}
