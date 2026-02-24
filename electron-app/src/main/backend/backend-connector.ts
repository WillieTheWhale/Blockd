/**
 * Backend Connector
 *
 * WebSocket connection to Blockd backend with:
 * - Automatic reconnection with exponential backoff
 * - Message queueing when disconnected
 * - Heartbeat mechanism
 * - Connection status events
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { BlockedMessage, ConnectionStatus, BackendConnectorConfig } from '../../shared/types.js';
import { MessageQueue } from './message-queue.js';
import {
  serializeMessage,
  deserializeMessage,
  createHeartbeat,
  validateMessage,
} from './protocol.js';
import {
  BACKEND_URL,
  HEARTBEAT_INTERVAL_MS,
  RECONNECT_DELAY_MS,
  MAX_RECONNECT_ATTEMPTS,
  MAX_QUEUED_MESSAGES,
} from '../../shared/constants.js';

export interface BackendConnectorEvents {
  'status-change': (status: ConnectionStatus) => void;
  'message': (message: BlockedMessage) => void;
  'error': (error: Error) => void;
  'connected': () => void;
  'disconnected': (reason?: string) => void;
  'reconnecting': (attempt: number, maxAttempts: number) => void;
}

export declare interface BackendConnector {
  on<K extends keyof BackendConnectorEvents>(
    event: K,
    listener: BackendConnectorEvents[K]
  ): this;
  emit<K extends keyof BackendConnectorEvents>(
    event: K,
    ...args: Parameters<BackendConnectorEvents[K]>
  ): boolean;
}

export class BackendConnector extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: BackendConnectorConfig;
  private messageQueue: MessageQueue;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private currentStatus: ConnectionStatus = 'disconnected';
  private sessionId?: string;
  private isManuallyDisconnected = false;
  private lastHeartbeatTime = 0;
  private pendingMessages = 0;

  constructor(config?: Partial<BackendConnectorConfig>) {
    super();

    this.config = {
      url: config?.url || BACKEND_URL,
      heartbeatIntervalMs: config?.heartbeatIntervalMs || HEARTBEAT_INTERVAL_MS,
      reconnectDelayMs: config?.reconnectDelayMs || RECONNECT_DELAY_MS,
      maxReconnectAttempts: config?.maxReconnectAttempts || MAX_RECONNECT_ATTEMPTS,
      maxQueuedMessages: config?.maxQueuedMessages || MAX_QUEUED_MESSAGES,
    };

    this.messageQueue = new MessageQueue(this.config.maxQueuedMessages);
  }

  /**
   * Connect to the backend WebSocket server
   * Session ID is sent via WebSocket message after connection (not in URL query string for security)
   */
  connect(sessionId?: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.warn('[BackendConnector] Already connected');
      return;
    }

    if (sessionId) {
      this.sessionId = sessionId;
    }

    this.isManuallyDisconnected = false;
    this.setStatus('connecting');

    try {
      // Security: Don't include sessionId in URL query string - send via WebSocket message instead
      const url = this.config.url;

      console.log('[BackendConnector] Connecting to:', url);
      this.ws = new WebSocket(url);

      this.ws.on('open', this.handleOpen.bind(this));
      this.ws.on('message', this.handleMessage.bind(this));
      this.ws.on('error', this.handleError.bind(this));
      this.ws.on('close', this.handleClose.bind(this));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[BackendConnector] Connection error:', err);
      this.handleError(err);
    }
  }

  /**
   * Disconnect from the backend
   */
  disconnect(reason?: string): void {
    console.log('[BackendConnector] Disconnecting:', reason);
    this.isManuallyDisconnected = true;
    this.cleanup();
    this.setStatus('disconnected');
    this.emit('disconnected', reason);
  }

  /**
   * Send a message to the backend
   * Queues message if not connected
   */
  send(message: BlockedMessage): void {
    // Validate message before sending/queueing
    if (!validateMessage(message)) {
      console.error('[BackendConnector] Invalid message, discarding:', message);
      return;
    }

    if (this.isConnected()) {
      this.sendImmediate(message);
    } else {
      console.log('[BackendConnector] Not connected, queueing message:', message.type);
      this.messageQueue.enqueue(message);
    }
  }

  /**
   * Send a message immediately without queueing
   */
  private sendImmediate(message: BlockedMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    try {
      const serialized = serializeMessage(message);
      this.ws.send(serialized);
      this.pendingMessages++;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[BackendConnector] Failed to send message:', err);
      this.emit('error', err);
      // Re-queue the message
      this.messageQueue.enqueue(message);
    }
  }

  /**
   * Flush queued messages to the backend
   */
  private flushQueue(): void {
    if (!this.isConnected()) {
      console.warn('[BackendConnector] Cannot flush queue, not connected');
      return;
    }

    const messages = this.messageQueue.flush();
    console.log(`[BackendConnector] Flushing ${messages.length} queued messages`);

    for (const message of messages) {
      try {
        this.sendImmediate(message);
      } catch (error) {
        console.error('[BackendConnector] Failed to flush message:', error);
        // Stop flushing on first error to prevent message loss
        // Re-queue remaining messages
        this.messageQueue.enqueue(message);
        break;
      }
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    return this.currentStatus;
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return this.messageQueue.getStats();
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      status: this.currentStatus,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.size(),
      pendingMessages: this.pendingMessages,
      lastHeartbeat: this.lastHeartbeatTime,
      timeSinceLastHeartbeat: Date.now() - this.lastHeartbeatTime,
    };
  }

  // ============================================================================
  // Private Event Handlers
  // ============================================================================

  private handleOpen(): void {
    console.log('[BackendConnector] Connected to backend');
    this.reconnectAttempts = 0;
    this.setStatus('connected');

    // Security: Send session ID via WebSocket message instead of URL query string
    if (this.sessionId) {
      this.sendImmediate({
        type: 'session_auth',
        sessionId: this.sessionId,
        timestamp: Date.now(),
        payload: { sessionId: this.sessionId },
      });
    }

    this.emit('connected');

    // Start heartbeat
    this.startHeartbeat();

    // Flush queued messages
    this.flushQueue();
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const rawMessage = data.toString();
      const message = deserializeMessage(rawMessage);

      console.log('[BackendConnector] Received message:', message.type);
      this.emit('message', message);

      // Handle heartbeat response
      if (message.type === 'heartbeat') {
        this.lastHeartbeatTime = Date.now();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[BackendConnector] Failed to parse message:', err);
      this.emit('error', err);
    }
  }

  private handleError(error: Error): void {
    console.error('[BackendConnector] WebSocket error:', error);
    this.emit('error', error);
    this.setStatus('error');
  }

  private handleClose(code: number, reason: string): void {
    console.log(`[BackendConnector] Connection closed: ${code} - ${reason}`);

    this.cleanup();

    if (this.isManuallyDisconnected) {
      this.setStatus('disconnected');
      return;
    }

    // Attempt reconnection
    this.attemptReconnect();
  }

  // ============================================================================
  // Reconnection Logic
  // ============================================================================

  private attemptReconnect(): void {
    if (this.isManuallyDisconnected) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(
        '[BackendConnector] Max reconnection attempts reached, giving up'
      );
      this.setStatus('error');
      this.emit('error', new Error('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    this.setStatus('reconnecting');
    this.emit('reconnecting', this.reconnectAttempts, this.config.maxReconnectAttempts);

    // Exponential backoff
    const delay = Math.min(
      this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    console.log(
      `[BackendConnector] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`
    );

    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.sessionId);
    }, delay);
  }

  // ============================================================================
  // Heartbeat
  // ============================================================================

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        try {
          const heartbeat = createHeartbeat(this.sessionId);
          this.sendImmediate(heartbeat);
          console.log('[BackendConnector] Heartbeat sent');
        } catch (error) {
          console.error('[BackendConnector] Failed to send heartbeat:', error);
        }
      }
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    this.disconnect('Connector destroyed');
    this.messageQueue.clear();
    this.removeAllListeners();
  }

  // ============================================================================
  // Status Management
  // ============================================================================

  private setStatus(status: ConnectionStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.emit('status-change', status);
      console.log('[BackendConnector] Status changed to:', status);
    }
  }
}
