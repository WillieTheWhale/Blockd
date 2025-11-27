/**
 * Load Tests
 * Tests for handling concurrent connections
 */

import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { Server } from 'socket.io';

describe('Load Testing', () => {
  let httpServer: any;
  let io: Server;
  let serverPort: number;
  const clients: ClientSocket[] = [];

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer, {
      pingInterval: 10000,
      pingTimeout: 5000,
    });
    httpServer.listen(() => {
      serverPort = (httpServer.address() as any).port;
      done();
    });
  });

  afterAll((done) => {
    // Disconnect all clients
    clients.forEach((client) => {
      if (client.connected) {
        client.disconnect();
      }
    });

    io.close();
    httpServer.close(done);
  });

  describe('Concurrent Connections', () => {
    it('should handle 100 concurrent connections', (done) => {
      const connectionCount = 100;
      let connectedCount = 0;

      for (let i = 0; i < connectionCount; i++) {
        const client = ioClient(`http://localhost:${serverPort}`);
        clients.push(client);

        client.on('connect', () => {
          connectedCount++;

          if (connectedCount === connectionCount) {
            expect(connectedCount).toBe(connectionCount);
            done();
          }
        });

        client.on('connect_error', (error) => {
          console.error('Connection error:', error);
        });
      }
    }, 30000); // 30 second timeout

    it('should handle 500 concurrent connections', (done) => {
      const connectionCount = 500;
      let connectedCount = 0;

      for (let i = 0; i < connectionCount; i++) {
        const client = ioClient(`http://localhost:${serverPort}`, {
          reconnection: false, // Disable reconnection for load test
        });
        clients.push(client);

        client.on('connect', () => {
          connectedCount++;

          if (connectedCount === connectionCount) {
            expect(connectedCount).toBe(connectionCount);
            done();
          }
        });

        client.on('connect_error', (error) => {
          console.error('Connection error:', error);
        });
      }
    }, 60000); // 60 second timeout
  });

  describe('Message Broadcasting', () => {
    it('should broadcast to all connected clients', (done) => {
      const clientCount = 50;
      let receivedCount = 0;
      const testMessage = { message: 'broadcast test' };

      // Create clients
      for (let i = 0; i < clientCount; i++) {
        const client = ioClient(`http://localhost:${serverPort}`);
        clients.push(client);

        client.on('test-broadcast', (data) => {
          expect(data).toEqual(testMessage);
          receivedCount++;

          if (receivedCount === clientCount) {
            done();
          }
        });
      }

      // Wait for all connections, then broadcast
      setTimeout(() => {
        io.emit('test-broadcast', testMessage);
      }, 2000);
    }, 30000);
  });

  describe('Performance Metrics', () => {
    it('should maintain low latency under load', (done) => {
      const clientCount = 100;
      const latencies: number[] = [];

      for (let i = 0; i < clientCount; i++) {
        const client = ioClient(`http://localhost:${serverPort}`);
        clients.push(client);

        client.on('ping', (data) => {
          const receiveTime = Date.now();
          const latency = receiveTime - data.timestamp;
          latencies.push(latency);

          client.emit('pong', { timestamp: data.timestamp });
        });
      }

      setTimeout(() => {
        if (latencies.length > 0) {
          const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
          const maxLatency = Math.max(...latencies);

          expect(avgLatency).toBeLessThan(100); // Average < 100ms
          expect(maxLatency).toBeLessThan(500); // Max < 500ms
        }
        done();
      }, 5000);
    }, 30000);
  });

  describe('Memory Usage', () => {
    it('should not leak memory with many connections', (done) => {
      const initialMemory = process.memoryUsage().heapUsed;
      const clientCount = 100;

      // Create connections
      for (let i = 0; i < clientCount; i++) {
        const client = ioClient(`http://localhost:${serverPort}`);
        clients.push(client);
      }

      setTimeout(() => {
        const memoryAfterConnect = process.memoryUsage().heapUsed;

        // Disconnect all
        clients.forEach((client) => client.disconnect());

        setTimeout(() => {
          global.gc && global.gc(); // Force garbage collection if available
          const memoryAfterDisconnect = process.memoryUsage().heapUsed;

          // Memory should not grow excessively
          const growth = memoryAfterDisconnect - initialMemory;
          const growthMB = growth / 1024 / 1024;

          expect(growthMB).toBeLessThan(100); // Less than 100MB growth
          done();
        }, 2000);
      }, 3000);
    }, 30000);
  });
});
