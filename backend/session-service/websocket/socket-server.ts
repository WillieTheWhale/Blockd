import { Server as SocketIOServer } from 'socket.io';
import { createServer, Server as HTTPServer } from 'http';
import { config } from '../src/config';
import { authenticateSocket } from './middleware';
import { SessionSocketHandler } from './session.socket';

/**
 * WebSocket Server
 * Socket.io server setup and configuration
 */

export class WebSocketServer {
  private io: SocketIOServer;
  private httpServer: HTTPServer;
  private sessionHandler: SessionSocketHandler;

  constructor() {
    // Create HTTP server for Socket.io
    this.httpServer = createServer();

    // Initialize Socket.io
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: config.websocket.cors.origin,
        credentials: config.websocket.cors.credentials,
      },
      pingInterval: config.websocket.pingInterval,
      pingTimeout: config.websocket.pingTimeout,
      transports: config.websocket.transports,
    });

    // Initialize session handler
    this.sessionHandler = new SessionSocketHandler(this.io);

    // Setup middleware
    this.setupMiddleware();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Authentication middleware
    this.io.use(authenticateSocket);

    // Connection logging
    this.io.on('connection', (socket) => {
      console.log(`WebSocket client connected: ${socket.id}`);
      console.log(`Total connected clients: ${this.io.sockets.sockets.size}`);
    });
  }

  /**
   * Start WebSocket server
   */
  async start(): Promise<void> {
    // Initialize session handlers
    this.sessionHandler.initialize();

    // Start HTTP server
    return new Promise((resolve) => {
      this.httpServer.listen(config.websocket.port, () => {
        console.log(`WebSocket server listening on port ${config.websocket.port}`);
        resolve();
      });
    });
  }

  /**
   * Stop WebSocket server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Close all socket connections
      this.io.close((err) => {
        if (err) {
          reject(err);
          return;
        }

        // Close HTTP server
        this.httpServer.close((err) => {
          if (err) {
            reject(err);
            return;
          }

          console.log('WebSocket server stopped');
          resolve();
        });
      });
    });
  }

  /**
   * Get Socket.io instance
   */
  getIO(): SocketIOServer {
    return this.io;
  }

  /**
   * Get session handler
   */
  getSessionHandler(): SessionSocketHandler {
    return this.sessionHandler;
  }

  /**
   * Get server statistics
   */
  getStats(): {
    connected_clients: number;
    active_sessions: number;
    uptime: number;
  } {
    return {
      connected_clients: this.io.sockets.sockets.size,
      active_sessions: this.sessionHandler.getActiveSessionCount(),
      uptime: process.uptime(),
    };
  }
}

// Export singleton instance
let websocketServer: WebSocketServer | null = null;

export function getWebSocketServer(): WebSocketServer {
  if (!websocketServer) {
    websocketServer = new WebSocketServer();
  }
  return websocketServer;
}

export default WebSocketServer;
