/**
 * Events Tests
 * Tests for event broadcasting
 */

import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';

describe('Event Broadcasting', () => {
  let httpServer: any;
  let io: Server;
  let serverPort: number;
  let clientSocket1: ClientSocket;
  let clientSocket2: ClientSocket;

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
    if (clientSocket1 && clientSocket1.connected) {
      clientSocket1.disconnect();
    }
    if (clientSocket2 && clientSocket2.connected) {
      clientSocket2.disconnect();
    }
  });

  describe('Room Broadcasting', () => {
    it('should broadcast to all sockets in room', (done) => {
      const roomName = 'test-room';
      let receivedCount = 0;

      clientSocket1 = ioClient(`http://localhost:${serverPort}`);
      clientSocket2 = ioClient(`http://localhost:${serverPort}`);

      clientSocket1.on('connect', () => {
        clientSocket1.emit('join', roomName);
      });

      clientSocket2.on('connect', () => {
        clientSocket2.emit('join', roomName);
      });

      const testMessage = { message: 'test broadcast' };

      clientSocket1.on('test-event', (data) => {
        expect(data).toEqual(testMessage);
        receivedCount++;
        if (receivedCount === 2) done();
      });

      clientSocket2.on('test-event', (data) => {
        expect(data).toEqual(testMessage);
        receivedCount++;
        if (receivedCount === 2) done();
      });

      setTimeout(() => {
        io.to(roomName).emit('test-event', testMessage);
      }, 100);
    });

    it('should not broadcast to sockets not in room', (done) => {
      const roomName = 'test-room';

      clientSocket1 = ioClient(`http://localhost:${serverPort}`);
      clientSocket2 = ioClient(`http://localhost:${serverPort}`);

      let received1 = false;
      let received2 = false;

      clientSocket1.on('connect', () => {
        clientSocket1.emit('join', roomName);
      });

      clientSocket1.on('test-event', () => {
        received1 = true;
      });

      clientSocket2.on('test-event', () => {
        received2 = true;
      });

      setTimeout(() => {
        io.to(roomName).emit('test-event', { message: 'test' });
      }, 100);

      setTimeout(() => {
        expect(received1).toBe(true);
        expect(received2).toBe(false);
        done();
      }, 200);
    });
  });

  describe('Event Acknowledgement', () => {
    it('should support event acknowledgements', (done) => {
      clientSocket1 = ioClient(`http://localhost:${serverPort}`);

      io.on('connection', (socket) => {
        socket.on('test-ack', (data, callback) => {
          expect(data).toEqual({ message: 'test' });
          callback({ success: true });
        });
      });

      clientSocket1.on('connect', () => {
        clientSocket1.emit('test-ack', { message: 'test' }, (response: any) => {
          expect(response.success).toBe(true);
          done();
        });
      });
    });
  });

  describe('Error Events', () => {
    it('should emit error events to specific socket', (done) => {
      clientSocket1 = ioClient(`http://localhost:${serverPort}`);

      clientSocket1.on('error', (error) => {
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('code');
        done();
      });

      clientSocket1.on('connect', () => {
        if (clientSocket1.id) {
          io.to(clientSocket1.id).emit('error', {
            message: 'Test error',
            code: 'TEST_ERROR',
          });
        }
      });
    });
  });
});
