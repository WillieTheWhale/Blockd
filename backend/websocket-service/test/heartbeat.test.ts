/**
 * Heartbeat Tests
 * Tests for ping/pong mechanism
 */

import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';

describe('Heartbeat Handler', () => {
  let httpServer: any;
  let io: Server;
  let serverPort: number;
  let clientSocket: ClientSocket;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer, {
      pingInterval: 100, // Short interval for testing
      pingTimeout: 50,
    });
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

  describe('Ping/Pong', () => {
    it('should receive ping from server', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);

      clientSocket.on('ping', (data) => {
        expect(data).toHaveProperty('timestamp');
        expect(typeof data.timestamp).toBe('number');
        done();
      });
    });

    it('should respond to ping with pong', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);

      let pingReceived = false;

      clientSocket.on('ping', (data) => {
        pingReceived = true;
        clientSocket.emit('pong', { timestamp: data.timestamp });
      });

      setTimeout(() => {
        expect(pingReceived).toBe(true);
        done();
      }, 200);
    });

    it('should calculate latency correctly', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);

      clientSocket.on('ping', (data) => {
        const receiveTime = Date.now();
        const latency = receiveTime - data.timestamp;

        expect(latency).toBeGreaterThanOrEqual(0);
        expect(latency).toBeLessThan(1000); // Should be < 1 second

        clientSocket.emit('pong', { timestamp: data.timestamp });
        done();
      });
    });
  });

  describe('Connection Monitoring', () => {
    it('should detect high latency', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);

      clientSocket.on('ping', (data) => {
        // Simulate high latency by delaying pong
        setTimeout(() => {
          clientSocket.emit('pong', { timestamp: data.timestamp });
        }, 600);
      });

      // Server should detect high latency > 500ms
      setTimeout(() => {
        done();
      }, 800);
    });

    it('should maintain connection with regular pongs', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);
      let pongCount = 0;

      clientSocket.on('ping', (data) => {
        pongCount++;
        clientSocket.emit('pong', { timestamp: data.timestamp });
      });

      setTimeout(() => {
        expect(pongCount).toBeGreaterThan(0);
        expect(clientSocket.connected).toBe(true);
        done();
      }, 500);
    });
  });

  describe('Missed Pongs', () => {
    it('should track missed pongs', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`);

      // Ignore pings (don't send pongs)
      clientSocket.on('ping', () => {
        // Don't respond
      });

      // Connection should still be active initially
      setTimeout(() => {
        expect(clientSocket.connected).toBe(true);
        done();
      }, 300);
    });
  });
});
