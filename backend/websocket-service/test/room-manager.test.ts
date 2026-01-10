/**
 * Room Manager Tests
 */

import { RoomManager, RoomType } from '../lib/room-manager';

// Mock Socket.io Server
const mockIo = {
  to: jest.fn().mockReturnThis(),
  except: jest.fn().mockReturnThis(),
  emit: jest.fn(),
} as any;

describe('RoomManager', () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager(mockIo);
    jest.clearAllMocks();
  });

  describe('createRoomId', () => {
    it('should create a valid room ID for user type', () => {
      const roomId = RoomManager.createRoomId(RoomType.USER, 'user-123');
      expect(roomId).toBe('user:user-123');
    });

    it('should create a valid room ID for session type', () => {
      const roomId = RoomManager.createRoomId(RoomType.SESSION, 'session-456');
      expect(roomId).toBe('session:session-456');
    });

    it('should create a valid room ID for organization type', () => {
      const roomId = RoomManager.createRoomId(RoomType.ORGANIZATION, 'org-789');
      expect(roomId).toBe('org:org-789');
    });
  });

  describe('parseRoomId', () => {
    it('should parse a room ID correctly', () => {
      const parsed = RoomManager.parseRoomId('user:user-123');
      expect(parsed).toEqual({
        type: 'user',
        identifier: 'user-123',
      });
    });

    it('should handle room IDs with colons in identifier', () => {
      const parsed = RoomManager.parseRoomId('session:abc:def:123');
      expect(parsed).toEqual({
        type: 'session',
        identifier: 'abc:def:123',
      });
    });
  });

  describe('getStatistics', () => {
    it('should return empty statistics for new manager', () => {
      const stats = roomManager.getStatistics();
      expect(stats.totalRooms).toBe(0);
      expect(stats.totalParticipants).toBe(0);
      expect(stats.averageParticipantsPerRoom).toBe(0);
    });
  });
});
