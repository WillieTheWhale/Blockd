/**
 * Mock WebSocket Server for Testing
 *
 * Provides a WebSocket server that simulates the real-time
 * features of the Blockd platform for testing purposes.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';

export interface MockWebSocketMessage {
  type: string;
  payload?: any;
  timestamp?: number;
}

export class MockWebSocketServer extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocket> = new Map();
  private port: number;

  constructor(port: number = 4001) {
    super();
    this.port = port;
  }

  /**
   * Start the mock WebSocket server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on('listening', () => {
        console.log(`Mock WebSocket server listening on port ${this.port}`);
        resolve();
      });

      this.wss.on('error', (error) => {
        console.error('Mock WebSocket server error:', error);
        reject(error);
      });

      this.wss.on('connection', (ws: WebSocket, req) => {
        const clientId = this.generateClientId();
        this.clients.set(clientId, ws);

        console.log(`Client connected: ${clientId}`);
        this.emit('connection', clientId, ws);

        // Send welcome message
        this.send(clientId, {
          type: 'connected',
          payload: { clientId, timestamp: Date.now() },
        });

        ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(clientId, message);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });

        ws.on('close', () => {
          console.log(`Client disconnected: ${clientId}`);
          this.clients.delete(clientId);
          this.emit('disconnect', clientId);
        });

        ws.on('error', (error) => {
          console.error(`Client error ${clientId}:`, error);
        });
      });
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(clientId: string, message: MockWebSocketMessage) {
    this.emit('message', clientId, message);

    // Handle specific message types
    switch (message.type) {
      case 'ping':
        this.send(clientId, { type: 'pong', timestamp: Date.now() });
        break;

      case 'security_event':
        // Broadcast security event to all other clients
        this.broadcast(message, clientId);
        break;

      case 'gaze_data':
        // Forward gaze data
        this.emit('gaze_data', clientId, message.payload);
        break;

      case 'chat_message':
        // Broadcast chat message
        this.broadcast(message, clientId);
        break;

      case 'session_update':
        // Broadcast session status update
        this.broadcast(message);
        break;

      default:
        console.log(`Unhandled message type: ${message.type}`);
    }
  }

  /**
   * Send message to a specific client
   */
  send(clientId: string, message: MockWebSocketMessage) {
    const client = this.clients.get(clientId);

    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        ...message,
        timestamp: message.timestamp || Date.now(),
      }));
    }
  }

  /**
   * Broadcast message to all clients except sender
   */
  broadcast(message: MockWebSocketMessage, excludeClientId?: string) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          ...message,
          timestamp: message.timestamp || Date.now(),
        }));
      }
    });
  }

  /**
   * Broadcast message to all clients including sender
   */
  broadcastAll(message: MockWebSocketMessage) {
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          ...message,
          timestamp: message.timestamp || Date.now(),
        }));
      }
    });
  }

  /**
   * Simulate a security event
   */
  simulateSecurityEvent(event: {
    type: string;
    severity: string;
    details?: any;
  }) {
    this.broadcastAll({
      type: 'security_event',
      payload: {
        ...event,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Simulate a session status update
   */
  simulateSessionUpdate(status: string, details?: any) {
    this.broadcastAll({
      type: 'session_update',
      payload: {
        status,
        details,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Simulate participant joining/leaving
   */
  simulateParticipantEvent(action: 'joined' | 'left', participantName: string) {
    this.broadcastAll({
      type: 'participant_event',
      payload: {
        action,
        participantName,
        timestamp: Date.now(),
      },
    });
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Stop the server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        // Close all client connections
        this.clients.forEach((client) => {
          client.close();
        });

        this.wss.close(() => {
          console.log('Mock WebSocket server stopped');
          this.clients.clear();
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Create singleton instance
let mockServerInstance: MockWebSocketServer | null = null;

/**
 * Get or create mock WebSocket server instance
 */
export function getMockWebSocketServer(port: number = 4001): MockWebSocketServer {
  if (!mockServerInstance) {
    mockServerInstance = new MockWebSocketServer(port);
  }
  return mockServerInstance;
}

/**
 * Start mock WebSocket server
 */
export async function startMockWebSocketServer(port: number = 4001): Promise<MockWebSocketServer> {
  const server = getMockWebSocketServer(port);
  await server.start();
  return server;
}

/**
 * Stop mock WebSocket server
 */
export async function stopMockWebSocketServer(): Promise<void> {
  if (mockServerInstance) {
    await mockServerInstance.stop();
    mockServerInstance = null;
  }
}

export default MockWebSocketServer;
