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

/**
 * Session Socket Handler
 * Manages WebSocket events for session rooms
 */

export class SessionSocketHandler {
  private io: Server;
  private sessionRooms: Map<string, Set<string>>;

  constructor(io: Server) {
    this.io = io;
    this.sessionRooms = new Map();
  }

  /**
   * Initialize socket handlers
   */
  initialize() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Socket connected: ${socket.id}`);

      // Register event handlers
      this.onJoin(socket);
      this.onLeave(socket);
      this.onPing(socket);
      this.onSubmitAnswer(socket);
      this.onDisconnect(socket);
      this.onError(socket);
    });
  }

  /**
   * Handle join session
   */
  private onJoin(socket: Socket) {
    socket.on(CLIENT_EVENTS.JOIN, async (payload: JoinSessionPayload) => {
      try {
        const userId = getUserId(socket);
        const { session_id } = payload;

        // Join socket.io room
        await socket.join(session_id);

        // Track in session rooms
        if (!this.sessionRooms.has(session_id)) {
          this.sessionRooms.set(session_id, new Set());
        }
        this.sessionRooms.get(session_id)!.add(socket.id);

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
    });
  }

  /**
   * Handle leave session
   */
  private onLeave(socket: Socket) {
    socket.on(CLIENT_EVENTS.LEAVE, async (payload: LeaveSessionPayload) => {
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
    });
  }

  /**
   * Handle ping (heartbeat)
   */
  private onPing(socket: Socket) {
    socket.on(CLIENT_EVENTS.PING, () => {
      socket.emit(SERVER_EVENTS.PONG, {
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Handle submit answer
   */
  private onSubmitAnswer(socket: Socket) {
    socket.on(CLIENT_EVENTS.SUBMIT_ANSWER, async (payload: SubmitAnswerPayload) => {
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
    });
  }

  /**
   * Handle disconnect
   */
  private onDisconnect(socket: Socket) {
    socket.on('disconnect', async () => {
      try {
        const userId = getUserId(socket);
        const sessionId = getSessionId(socket);

        if (sessionId) {
          await this.handleLeave(socket, sessionId, userId);
        }

        console.log(`Socket disconnected: ${socket.id}`);
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  }

  /**
   * Handle errors
   */
  private onError(socket: Socket) {
    socket.on('error', (error: Error) => {
      console.error(`Socket error (${socket.id}):`, error);
      socket.emit(SERVER_EVENTS.ERROR, {
        error_code: 'SOCKET_ERROR',
        message: error.message,
      });
    });
  }

  /**
   * Handle leave logic
   */
  private async handleLeave(socket: Socket, sessionId: string, userId: string): Promise<void> {
    // Leave socket.io room
    await socket.leave(sessionId);

    // Remove from session rooms
    if (this.sessionRooms.has(sessionId)) {
      this.sessionRooms.get(sessionId)!.delete(socket.id);

      if (this.sessionRooms.get(sessionId)!.size === 0) {
        this.sessionRooms.delete(sessionId);
      }
    }

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
