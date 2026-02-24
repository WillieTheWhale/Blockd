import { Server, Socket } from 'socket.io';
import { CLIENT_EVENTS, SERVER_EVENTS } from './events';
import { getUserId, getSessionId } from './middleware';
import participantService from '../services/participant.service';
import questionService from '../services/question.service';
import {
  JoinSessionPayload,
  LeaveSessionPayload,
  SubmitAnswerPayload,
  WebSocketMessage,
  BroadcastOptions,
} from '../types/websocket.types';
import { SessionParticipant } from '../types/session.types';
import { CacheService } from '../src/redis';

/**
 * Session Socket Handler
 * Manages WebSocket events for session rooms
 * Uses Redis for distributed session room tracking with TTL-based cleanup
 */

// Redis key prefix for session rooms
const SESSION_ROOMS_KEY_PREFIX = 'session_rooms:';
// TTL for session room data (24 hours)
const SESSION_ROOM_TTL_SECONDS = 86400;

export class SessionSocketHandler {
  private io: Server;
  private sessionRooms: Map<string, Set<string>>; // Local cache for fast lookups
  private cache: CacheService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private socketHandlers: Map<string, Map<string, (...args: any[]) => void>>; // Track handlers per socket

  constructor(io: Server) {
    this.io = io;
    this.sessionRooms = new Map(); // Local cache, backed by Redis
    this.cache = new CacheService();
    this.socketHandlers = new Map(); // Track event handlers for cleanup

    // Start periodic cleanup of stale local cache entries
    this.startCleanupInterval();
  }

  /**
   * Start periodic cleanup of stale session room entries
   */
  private startCleanupInterval(): void {
    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  public stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Cleanup stale sessions from local cache
   * Sessions with no connected sockets are removed
   */
  private async cleanupStaleSessions(): Promise<void> {
    for (const [sessionId, sockets] of this.sessionRooms.entries()) {
      if (sockets.size === 0) {
        this.sessionRooms.delete(sessionId);
        // Also cleanup from Redis
        await this.cache.delete(`${SESSION_ROOMS_KEY_PREFIX}${sessionId}`);
        console.log(`Cleaned up stale session room: ${sessionId}`);
      }
    }
  }

  /**
   * Add socket to session room (both local cache and Redis)
   */
  private async addSocketToRoom(sessionId: string, socketId: string): Promise<void> {
    // Update local cache
    if (!this.sessionRooms.has(sessionId)) {
      this.sessionRooms.set(sessionId, new Set());
    }
    this.sessionRooms.get(sessionId)!.add(socketId);

    // Update Redis with TTL
    await this.cache.sadd(`${SESSION_ROOMS_KEY_PREFIX}${sessionId}`, socketId);
    await this.cache.expire(`${SESSION_ROOMS_KEY_PREFIX}${sessionId}`, SESSION_ROOM_TTL_SECONDS);
  }

  /**
   * Remove socket from session room (both local cache and Redis)
   */
  private async removeSocketFromRoom(sessionId: string, socketId: string): Promise<void> {
    // Update local cache
    if (this.sessionRooms.has(sessionId)) {
      this.sessionRooms.get(sessionId)!.delete(socketId);

      if (this.sessionRooms.get(sessionId)!.size === 0) {
        this.sessionRooms.delete(sessionId);
        // Cleanup Redis when session is empty
        await this.cache.delete(`${SESSION_ROOMS_KEY_PREFIX}${sessionId}`);
      } else {
        // Remove from Redis set
        await this.cache.srem(`${SESSION_ROOMS_KEY_PREFIX}${sessionId}`, socketId);
      }
    }
  }

  /**
   * Initialize socket handlers
   */
  initialize() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Socket connected: ${socket.id}`);

      // Initialize handler tracking for this socket
      this.socketHandlers.set(socket.id, new Map());

      // Register event handlers with tracking
      this.registerHandler(socket, CLIENT_EVENTS.JOIN, this.createJoinHandler(socket));
      this.registerHandler(socket, CLIENT_EVENTS.LEAVE, this.createLeaveHandler(socket));
      this.registerHandler(socket, CLIENT_EVENTS.PING, this.createPingHandler(socket));
      this.registerHandler(socket, CLIENT_EVENTS.SUBMIT_ANSWER, this.createSubmitAnswerHandler(socket));
      this.registerHandler(socket, 'disconnect', this.createDisconnectHandler(socket));
      this.registerHandler(socket, 'error', this.createErrorHandler(socket));
    });
  }

  /**
   * Register an event handler with tracking for cleanup
   */
  private registerHandler(socket: Socket, event: string, handler: (...args: any[]) => void): void {
    const handlers = this.socketHandlers.get(socket.id);
    if (handlers) {
      handlers.set(event, handler);
    }
    socket.on(event, handler);
  }

  /**
   * Remove all tracked handlers for a socket
   */
  private cleanupSocketHandlers(socket: Socket): void {
    const handlers = this.socketHandlers.get(socket.id);
    if (handlers) {
      handlers.forEach((handler, event) => {
        socket.off(event, handler);
      });
      this.socketHandlers.delete(socket.id);
    }
  }

  /**
   * Create join session handler
   */
  private createJoinHandler(socket: Socket) {
    return async (payload: JoinSessionPayload) => {
      try {
        const userId = getUserId(socket);
        const { session_id } = payload;

        // Join socket.io room
        await socket.join(session_id);

        // Track in session rooms (Redis-backed with TTL)
        await this.addSocketToRoom(session_id, socket.id);

        // Add participant to cache
        const participant: SessionParticipant = {
          session_id,
          user_id: userId,
          role: 'interviewee', // Would be determined from user data
          socket_id: socket.id,
          connected: true,
          joined_at: new Date(),
        };

        await participantService.addParticipant(participant);

        // Store session_id in socket
        (socket as any).sessionId = session_id;

        // Broadcast participant joined
        this.broadcastToSession(session_id, SERVER_EVENTS.PARTICIPANT_JOINED, {
          session_id,
          user_id: userId,
          role: participant.role,
          full_name: 'User', // Would be fetched from user data
          joined_at: participant.joined_at.toISOString(),
        });

        // Send confirmation to client
        socket.emit(SERVER_EVENTS.AUTHENTICATED, {
          session_id,
          connected: true,
        });

        console.log(`User ${userId} joined session ${session_id}`);
      } catch (error) {
        console.error('Error joining session:', error);
        socket.emit(SERVER_EVENTS.ERROR, {
          error_code: 'JOIN_FAILED',
          message: error instanceof Error ? error.message : 'Failed to join session',
        });
      }
    };
  }

  /**
   * Create leave session handler
   */
  private createLeaveHandler(socket: Socket) {
    return async (payload: LeaveSessionPayload) => {
      try {
        const userId = getUserId(socket);
        const { session_id } = payload;

        await this.handleLeave(socket, session_id, userId);
      } catch (error) {
        console.error('Error leaving session:', error);
        socket.emit(SERVER_EVENTS.ERROR, {
          error_code: 'LEAVE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to leave session',
        });
      }
    };
  }

  /**
   * Create ping (heartbeat) handler
   */
  private createPingHandler(socket: Socket) {
    return () => {
      socket.emit(SERVER_EVENTS.PONG, {
        timestamp: new Date().toISOString(),
      });
    };
  }

  /**
   * Create submit answer handler
   */
  private createSubmitAnswerHandler(socket: Socket) {
    return async (payload: SubmitAnswerPayload) => {
      try {
        const userId = getUserId(socket);
        const { session_id, question_id, answer_text } = payload;

        // Submit answer via service
        const answerId = await questionService.submitAnswer({
          question_id,
          answer_text,
          submitted_by: userId,
        });

        // Broadcast answer submitted
        this.broadcastToSession(session_id, SERVER_EVENTS.ANSWER_SUBMITTED, {
          session_id,
          question_id,
          answer_id: answerId,
          submitted_by: userId,
          submitted_at: new Date().toISOString(),
        });

        console.log(`Answer submitted for question ${question_id} in session ${session_id}`);
      } catch (error) {
        console.error('Error submitting answer:', error);
        socket.emit(SERVER_EVENTS.ERROR, {
          error_code: 'SUBMIT_ANSWER_FAILED',
          message: error instanceof Error ? error.message : 'Failed to submit answer',
        });
      }
    };
  }

  /**
   * Create disconnect handler
   */
  private createDisconnectHandler(socket: Socket) {
    return async () => {
      try {
        const userId = getUserId(socket);
        const sessionId = getSessionId(socket);

        if (sessionId) {
          await this.handleLeave(socket, sessionId, userId);
        }

        // Clean up all tracked handlers for this socket
        this.cleanupSocketHandlers(socket);

        console.log(`Socket disconnected: ${socket.id}`);
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    };
  }

  /**
   * Create error handler
   */
  private createErrorHandler(socket: Socket) {
    return (error: Error) => {
      console.error(`Socket error (${socket.id}):`, error);
      socket.emit(SERVER_EVENTS.ERROR, {
        error_code: 'SOCKET_ERROR',
        message: error.message,
      });
    };
  }

  /**
   * Handle leave logic
   */
  private async handleLeave(socket: Socket, sessionId: string, userId: string): Promise<void> {
    // Leave socket.io room
    await socket.leave(sessionId);

    // Remove from session rooms (Redis-backed with TTL)
    await this.removeSocketFromRoom(sessionId, socket.id);

    // Mark participant as disconnected
    await participantService.markParticipantDisconnected(sessionId, userId);

    // Broadcast participant left
    this.broadcastToSession(sessionId, SERVER_EVENTS.PARTICIPANT_LEFT, {
      session_id: sessionId,
      user_id: userId,
      role: 'interviewee',
      left_at: new Date().toISOString(),
    });

    console.log(`User ${userId} left session ${sessionId}`);
  }

  /**
   * Broadcast event to session room
   */
  broadcastToSession<T>(
    sessionId: string,
    event: string,
    data: T,
    options?: Partial<BroadcastOptions>
  ): void {
    const message: WebSocketMessage<T> = {
      event: event as any,
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      data,
    };

    if (options?.exclude_sender && options.sender_socket_id) {
      this.io.to(sessionId).except(options.sender_socket_id).emit(event, message);
    } else {
      this.io.to(sessionId).emit(event, message);
    }
  }

  /**
   * Send event to specific socket
   */
  sendToSocket<T>(socketId: string, event: string, data: T): void {
    const message: WebSocketMessage<T> = {
      event: event as any,
      timestamp: new Date().toISOString(),
      data,
    };

    this.io.to(socketId).emit(event, message);
  }

  /**
   * Get connected sockets for session
   */
  getSessionSockets(sessionId: string): Set<string> {
    return this.sessionRooms.get(sessionId) || new Set();
  }

  /**
   * Get session count
   */
  getActiveSessionCount(): number {
    return this.sessionRooms.size;
  }

  /**
   * Get total connected sockets
   */
  getTotalConnectedSockets(): number {
    let total = 0;
    this.sessionRooms.forEach((sockets) => {
      total += sockets.size;
    });
    return total;
  }
}
