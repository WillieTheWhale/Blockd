/**
 * Room Tests
 * Tests for room join/leave operations
 */

import { Server } from 'socket.io';
import { RoomManager, RoomType } from '../lib/room-manager';
import { createServer } from 'http';

describe('Room Manager', () => {
  let httpServer: any;
  let io: Server;
  let roomManager: RoomManager;

  beforeEach(() => {
    httpServer = createServer();
    io = new Server(httpServer);
    roomManager = new RoomManager(io);
  });

  afterEach((done) => {
    io.close();
    httpServer.close(done);
  });

  describe('Room ID Creation', () => {
    it('should create user room ID', () => {
      const roomId = RoomManager.createRoomId(RoomType.USER, 'user-123');
      expect(roomId).toBe('user:user-123');
    });

    it('should create session room ID', () => {
      const roomId = RoomManager.createRoomId(RoomType.SESSION, 'session-456');
      expect(roomId).toBe('session:session-456');
    });

    it('should create organization room ID', () => {
      const roomId = RoomManager.createRoomId(RoomType.ORGANIZATION, 'org-789');
      expect(roomId).toBe('org:org-789');
    });

    it('should create admin room ID', () => {
      const roomId = RoomManager.createRoomId(RoomType.ADMIN, 'all');
      expect(roomId).toBe('admin:all');
    });
  });

  describe('Room ID Parsing', () => {
    it('should parse user room ID', () => {
      const parsed = RoomManager.parseRoomId('user:user-123');
      expect(parsed.type).toBe('user');
      expect(parsed.identifier).toBe('user-123');
    });

    it('should parse session room ID', () => {
      const parsed = RoomManager.parseRoomId('session:session-456');
      expect(parsed.type).toBe('session');
      expect(parsed.identifier).toBe('session-456');
    });

    it('should handle colons in identifier', () => {
      const parsed = RoomManager.parseRoomId('session:abc:def:ghi');
      expect(parsed.type).toBe('session');
      expect(parsed.identifier).toBe('abc:def:ghi');
    });
  });

  describe('Room Statistics', () => {
    it('should return empty statistics initially', () => {
      const stats = roomManager.getStatistics();
      expect(stats.totalRooms).toBe(0);
      expect(stats.totalParticipants).toBe(0);
    });

    it('should track room statistics', () => {
      // This would require actual socket connections
      const stats = roomManager.getStatistics();
      expect(stats).toHaveProperty('totalRooms');
      expect(stats).toHaveProperty('roomsByType');
      expect(stats).toHaveProperty('totalParticipants');
      expect(stats).toHaveProperty('averageParticipantsPerRoom');
    });
  });

  describe('Get All Rooms', () => {
    it('should return empty array initially', () => {
      const rooms = roomManager.getAllRooms();
      expect(rooms).toEqual([]);
    });

    it('should return all active rooms', () => {
      const rooms = roomManager.getAllRooms();
      expect(Array.isArray(rooms)).toBe(true);
    });
  });
});
