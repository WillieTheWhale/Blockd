/**
 * Gaze Handler
 * Handles real-time gaze tracking data streaming
 */

import { Server } from 'socket.io';
import { AuthenticatedSocket, GazeData, GazeUpdateData } from '../types/socket.types';
import { RoomManager, RoomType } from '../lib/room-manager';
import { logger } from '../lib/logger';
import prisma from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Gaze data throttler
 */
class GazeThrottler {
  private lastEmitTime = new Map<string, number>();
  private minInterval: number;

  constructor(throttleHz: number) {
    this.minInterval = 1000 / throttleHz; // Convert Hz to ms interval
  }

  shouldEmit(sessionId: string): boolean {
    const now = Date.now();
    const lastTime = this.lastEmitTime.get(sessionId) || 0;

    if (now - lastTime >= this.minInterval) {
      this.lastEmitTime.set(sessionId, now);
      return true;
    }

    return false;
  }

  cleanup(): void {
    const now = Date.now();
    const timeout = 60000; // 1 minute

    for (const [sessionId, lastTime] of this.lastEmitTime.entries()) {
      if (now - lastTime > timeout) {
        this.lastEmitTime.delete(sessionId);
      }
    }
  }
}

/**
 * Setup gaze handler
 */
export function setupGazeHandler(io: Server, throttleHz: number = 10): void {
  const throttler = new GazeThrottler(throttleHz);

  // Cleanup throttler periodically
  const throttlerCleanupInterval = setInterval(() => throttler.cleanup(), 60000);
  gazeIntervalIds.add(throttlerCleanupInterval);

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.data.user.user_id;
    const userRole = socket.data.user.role;

    // Handle gaze data streaming
    socket.on('gaze:stream', async (data: GazeData) => {
      try {
        const { session_id, gaze_x, gaze_y, is_off_screen, off_screen_direction, confidence, timestamp } = data;

        // Only interviewees can stream gaze data
        if (userRole !== 'interviewee') {
          socket.emit('error', {
            message: 'Only interviewees can stream gaze data',
            code: 'UNAUTHORIZED_GAZE_STREAM',
          });
          return;
        }

        // Validate gaze data
        if (!validateGazeData(data)) {
          socket.emit('error', {
            message: 'Invalid gaze data',
            code: 'INVALID_GAZE_DATA',
          });
          return;
        }

        // Throttle broadcasts (10 Hz max)
        if (!throttler.shouldEmit(session_id)) {
          return; // Skip this update to maintain throttle
        }

        // Prepare update data
        const updateData: GazeUpdateData = {
          session_id,
          gaze_x,
          gaze_y,
          is_off_screen,
          off_screen_direction,
          confidence,
          timestamp,
          user_id: userId,
        };

        // Broadcast to session room (except sender)
        const sessionRoomId = RoomManager.createRoomId(RoomType.SESSION, session_id);
        socket.to(sessionRoomId).emit('gaze:update', updateData);

        // Publish to message queue for processing and storage
        await publishGazeData(session_id, updateData);

      } catch (error) {
        logger.error('Error handling gaze stream', error, {
          userId,
          sessionId: data.session_id,
        });

        socket.emit('error', {
          message: 'Failed to process gaze data',
          code: 'GAZE_STREAM_ERROR',
        });
      }
    });
  });

  logger.info('Gaze handler configured', { throttleHz });
}

/**
 * Validate gaze data
 */
function validateGazeData(data: GazeData): boolean {
  // Validate required fields
  if (!data.session_id || data.gaze_x === undefined || data.gaze_y === undefined) {
    return false;
  }

  // Validate coordinate ranges (normalized 0-1)
  if (data.gaze_x < 0 || data.gaze_x > 1 || data.gaze_y < 0 || data.gaze_y > 1) {
    return false;
  }

  // Validate confidence (0-1)
  if (data.confidence < 0 || data.confidence > 1) {
    return false;
  }

  // Validate off-screen direction if off-screen
  if (data.is_off_screen && data.off_screen_direction) {
    const validDirections = [
      'top', 'bottom', 'left', 'right',
      'top-left', 'top-right', 'bottom-left', 'bottom-right',
    ];
    if (!validDirections.includes(data.off_screen_direction)) {
      return false;
    }
  }

  return true;
}

/**
 * Buffer for batch gaze data insertion
 */
const gazeBuffer: Map<string, GazeUpdateData[]> = new Map();
const BUFFER_FLUSH_SIZE = 50; // Flush when buffer reaches this size
const BUFFER_FLUSH_INTERVAL = 5000; // Flush every 5 seconds
const BUFFER_MAX_SIZE = 5000; // Maximum buffer size per session - FIFO eviction beyond this
const SESSION_IDLE_TIMEOUT = 300000; // 5 minutes - cleanup sessions with no activity

// Track in-flight flush operations to prevent concurrent flushes
const flushInProgress = new Set<string>();

// Track last activity time per session for cleanup
const sessionLastActivity: Map<string, number> = new Map();

// Track interval IDs for graceful cleanup
const gazeIntervalIds: Set<NodeJS.Timeout> = new Set();

// Set up interval for flushing buffers
const flushInterval = setInterval(() => {
  for (const [sessionId, buffer] of gazeBuffer.entries()) {
    if (buffer.length > 0 && !flushInProgress.has(sessionId)) {
      flushGazeBuffer(sessionId).catch((error) => {
        logger.error('Unhandled error in scheduled flush', error, { sessionId });
      });
    }
  }
}, BUFFER_FLUSH_INTERVAL);
gazeIntervalIds.add(flushInterval);

// Set up interval for cleaning up ended/idle sessions
const cleanupInterval = setInterval(() => {
  cleanupIdleSessions();
}, 60000); // Check every minute
gazeIntervalIds.add(cleanupInterval);

/**
 * Cleanup idle sessions to prevent memory leaks
 * Removes sessions that have had no activity for SESSION_IDLE_TIMEOUT
 */
function cleanupIdleSessions(): void {
  const now = Date.now();
  const sessionsToCleanup: string[] = [];

  for (const [sessionId, lastActivity] of sessionLastActivity.entries()) {
    if (now - lastActivity > SESSION_IDLE_TIMEOUT) {
      sessionsToCleanup.push(sessionId);
    }
  }

  for (const sessionId of sessionsToCleanup) {
    // Flush any remaining data before cleanup
    if (gazeBuffer.has(sessionId) && gazeBuffer.get(sessionId)!.length > 0) {
      flushGazeBuffer(sessionId).catch((error) => {
        logger.error('Error flushing buffer during cleanup', error, { sessionId });
      });
    }

    // Remove from all tracking maps
    gazeBuffer.delete(sessionId);
    sessionLastActivity.delete(sessionId);
    flushInProgress.delete(sessionId);

    logger.info('Cleaned up idle gaze session', { sessionId });
  }

  if (sessionsToCleanup.length > 0) {
    logger.info('Gaze buffer cleanup complete', {
      cleanedSessions: sessionsToCleanup.length,
      remainingSessions: gazeBuffer.size,
    });
  }
}

/**
 * Mark session as active (call this when receiving gaze data)
 */
function updateSessionActivity(sessionId: string): void {
  sessionLastActivity.set(sessionId, Date.now());
}

/**
 * Shutdown all gaze handler intervals and cleanup resources
 * Call this during graceful shutdown
 */
export function shutdownGazeHandler(): void {
  // Clear all tracked intervals
  for (const intervalId of gazeIntervalIds) {
    clearInterval(intervalId);
  }
  gazeIntervalIds.clear();

  // Flush all remaining buffers
  for (const [sessionId, buffer] of gazeBuffer.entries()) {
    if (buffer.length > 0) {
      flushGazeBuffer(sessionId).catch((error) => {
        logger.error('Error flushing buffer during shutdown', error, { sessionId });
      });
    }
  }

  logger.info('Gaze handler shutdown complete', {
    bufferedSessions: gazeBuffer.size,
  });
}

/**
 * Explicitly end a session and cleanup its resources
 * Call this when a session ends to immediately free memory
 */
export async function endGazeSession(sessionId: string): Promise<void> {
  logger.info('Ending gaze session', { sessionId });

  // Flush any remaining data
  if (gazeBuffer.has(sessionId) && gazeBuffer.get(sessionId)!.length > 0) {
    await flushGazeBuffer(sessionId);
  }

  // Remove from all tracking maps
  gazeBuffer.delete(sessionId);
  sessionLastActivity.delete(sessionId);
  flushInProgress.delete(sessionId);

  logger.info('Gaze session ended and cleaned up', { sessionId });
}

/**
 * Flush gaze buffer to database
 */
async function flushGazeBuffer(sessionId: string): Promise<void> {
  // Prevent concurrent flushes for the same session
  if (flushInProgress.has(sessionId)) {
    return;
  }

  const buffer = gazeBuffer.get(sessionId);
  if (!buffer || buffer.length === 0) return;

  flushInProgress.add(sessionId);

  // Take a snapshot of current buffer and clear only what we're processing
  const dataToFlush = [...buffer];
  gazeBuffer.set(sessionId, []);

  try {
    // Batch insert gaze events
    await prisma.gazeEvent.createMany({
      data: dataToFlush.map((data) => ({
        sessionId: data.session_id,
        timestamp: new Date(data.timestamp),
        gazeX: new Decimal(data.gaze_x.toFixed(8)),
        gazeY: new Decimal(data.gaze_y.toFixed(8)),
        isOffScreen: data.is_off_screen,
        offScreenDirection: data.off_screen_direction || null,
        confidence: new Decimal(data.confidence.toFixed(4)),
        metadata: {},
      })),
      skipDuplicates: true,
    });

    logger.debug('Flushed gaze buffer to database', {
      sessionId,
      count: dataToFlush.length,
    });
  } catch (error) {
    logger.error('Failed to flush gaze buffer', error, { sessionId, count: dataToFlush.length });
    // Put data back at the FRONT of buffer for retry (maintain chronological order)
    const newData = gazeBuffer.get(sessionId) || [];
    gazeBuffer.set(sessionId, [...dataToFlush, ...newData]);
  } finally {
    flushInProgress.delete(sessionId);
  }
}

/**
 * Store gaze data - buffers for batch insert
 * Implements FIFO eviction when buffer exceeds BUFFER_MAX_SIZE to prevent memory exhaustion
 */
async function publishGazeData(sessionId: string, data: GazeUpdateData): Promise<void> {
  try {
    // Update session activity timestamp for cleanup tracking
    updateSessionActivity(sessionId);

    // Add to buffer
    if (!gazeBuffer.has(sessionId)) {
      gazeBuffer.set(sessionId, []);
    }
    const buffer = gazeBuffer.get(sessionId)!;
    buffer.push(data);

    // FIFO eviction: if buffer exceeds max size, drop oldest entries
    if (buffer.length > BUFFER_MAX_SIZE) {
      const evictCount = buffer.length - BUFFER_MAX_SIZE;
      buffer.splice(0, evictCount);
      logger.warn('Gaze buffer exceeded max size, evicted oldest entries', {
        sessionId,
        evictedCount: evictCount,
        bufferSize: buffer.length,
      });
    }

    // Flush if buffer is full
    if (buffer.length >= BUFFER_FLUSH_SIZE) {
      await flushGazeBuffer(sessionId);
    }

    logger.debug('Buffered gaze data', {
      sessionId,
      bufferSize: buffer.length,
    });
  } catch (error) {
    logger.error('Failed to buffer gaze data', error, { sessionId });
    // Don't throw - this is async processing, shouldn't block real-time stream
  }
}

/**
 * Get gaze statistics for a session
 */
export async function getSessionGazeStats(sessionId: string): Promise<{
  totalDataPoints: number;
  averageConfidence: number;
  offScreenPercentage: number;
  lastUpdate: string | null;
}> {
  try {
    logger.debug('Getting gaze stats for session', { sessionId });

    // Get aggregated stats from database
    const stats = await prisma.gazeEvent.aggregate({
      where: { sessionId },
      _count: { id: true },
      _avg: { confidence: true },
    });

    // Get off-screen count
    const offScreenCount = await prisma.gazeEvent.count({
      where: { sessionId, isOffScreen: true },
    });

    // Get last update timestamp
    const lastEvent = await prisma.gazeEvent.findFirst({
      where: { sessionId },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });

    const totalDataPoints = stats._count.id || 0;
    const averageConfidence = stats._avg.confidence
      ? parseFloat(stats._avg.confidence.toString())
      : 0;
    const offScreenPercentage =
      totalDataPoints > 0 ? (offScreenCount / totalDataPoints) * 100 : 0;

    return {
      totalDataPoints,
      averageConfidence,
      offScreenPercentage,
      lastUpdate: lastEvent?.timestamp.toISOString() || null,
    };
  } catch (error) {
    logger.error('Failed to get gaze stats', error, { sessionId });
    return {
      totalDataPoints: 0,
      averageConfidence: 0,
      offScreenPercentage: 0,
      lastUpdate: null,
    };
  }
}

/**
 * Calculate gaze metrics from raw data
 */
export function calculateGazeMetrics(gazeData: GazeData[]): {
  averageX: number;
  averageY: number;
  averageConfidence: number;
  offScreenCount: number;
  offScreenPercentage: number;
  directionDistribution: Record<string, number>;
} {
  if (gazeData.length === 0) {
    return {
      averageX: 0,
      averageY: 0,
      averageConfidence: 0,
      offScreenCount: 0,
      offScreenPercentage: 0,
      directionDistribution: {},
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumConfidence = 0;
  let offScreenCount = 0;
  const directionDistribution: Record<string, number> = {};

  for (const data of gazeData) {
    sumX += data.gaze_x;
    sumY += data.gaze_y;
    sumConfidence += data.confidence;

    if (data.is_off_screen) {
      offScreenCount++;
      if (data.off_screen_direction) {
        directionDistribution[data.off_screen_direction] =
          (directionDistribution[data.off_screen_direction] || 0) + 1;
      }
    }
  }

  const count = gazeData.length;

  return {
    averageX: sumX / count,
    averageY: sumY / count,
    averageConfidence: sumConfidence / count,
    offScreenCount,
    offScreenPercentage: (offScreenCount / count) * 100,
    directionDistribution,
  };
}
