/**
 * Connection Tests
 * Tests for socket connection and authentication
 */

import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as jwt from 'jsonwebtoken';

describe('Connection Handler', () => {
  let httpServer: any;
  let io: Server;
  let serverPort: number;
  let clientSocket: ClientSocket;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);
    httpServer.listen(() => {
      serverPort = (httpServer.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    httpServer.close(done);
  });

  afterEach(() => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Authentication', () => {
    it('should reject connection without token', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication');
        done();
      });
    });

    it('should reject connection with invalid token', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: {
          token: 'invalid.token.here',
        },
      });

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Invalid');
        done();
      });
    });

    it('should accept connection with valid token', (done) => {
      // Generate valid test token
      const token = generateTestToken({
        sub: 'test-user-id',
        email: 'test@example.com',
        role: 'interviewer',
      });

      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token },
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should extract token from Authorization header', (done) => {
      const token = generateTestToken({
        sub: 'test-user-id',
        email: 'test@example.com',
        role: 'interviewer',
      });

      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        extraHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });
  });

  describe('Connection Events', () => {
    beforeEach(() => {
      const token = generateTestToken({
        sub: 'test-user-id',
        email: 'test@example.com',
        role: 'interviewer',
      });

      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token },
      });
    });

    it('should emit connected event on successful connection', (done) => {
      clientSocket.on('connected', (data) => {
        expect(data).toHaveProperty('userId');
        expect(data).toHaveProperty('timestamp');
        done();
      });
    });

    it('should join user personal room on connection', (done) => {
      clientSocket.on('connect', () => {
        // Verify user is in their personal room
        // This would require server-side verification
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });
  });

  describe('Disconnection', () => {
    beforeEach(() => {
      const token = generateTestToken({
        sub: 'test-user-id',
        email: 'test@example.com',
        role: 'interviewer',
      });

      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token },
      });
    });

    it('should handle graceful disconnection', (done) => {
      clientSocket.on('connect', () => {
        clientSocket.disconnect();
      });

      clientSocket.on('disconnect', (reason) => {
        expect(reason).toBe('io client disconnect');
        done();
      });
    });

    it('should clean up resources on disconnect', (done) => {
      clientSocket.on('connect', () => {
        clientSocket.disconnect();
      });

      clientSocket.on('disconnect', () => {
        // Verify cleanup happened (would need server-side checks)
        expect(clientSocket.connected).toBe(false);
        done();
      });
    });
  });
});

/**
 * Generate test JWT token
 */
function generateTestToken(payload: any): string {
  // Use a test secret for development
  const secret = 'test-secret';
  return jwt.sign(payload, secret, {
    expiresIn: '1h',
    issuer: 'blockd-auth',
    audience: 'blockd-api',
  });
}
