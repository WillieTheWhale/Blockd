/**
 * Backend Communication Protocol
 *
 * Message serialization/deserialization and helper functions
 * for creating BlockedMessage objects.
 */

import {
  BlockedMessage,
  MessageType,
  SecurityEvent,
  GazeDataBatch,
  TelemetryData,
  VideoFrame,
  SessionValidateRequest,
} from '../../shared/types.js';

// ============================================================================
// Message Validation
// ============================================================================

export function validateMessage(message: unknown): message is BlockedMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const msg = message as Partial<BlockedMessage>;

  // Check required fields
  if (!msg.type || typeof msg.type !== 'string') {
    return false;
  }

  if (typeof msg.timestamp !== 'number') {
    return false;
  }

  // Validate message type
  const validTypes: MessageType[] = [
    'session_validate',
    'session_validate_response',
    'session_start',
    'session_end',
    'security_event',
    'gaze_data',
    'telemetry_data',
    'video_frame',
    'heartbeat',
    'error',
  ];

  if (!validTypes.includes(msg.type as MessageType)) {
    return false;
  }

  // payload can be any type, including undefined
  return true;
}

// ============================================================================
// Message Serialization
// ============================================================================

export function serializeMessage(message: BlockedMessage): string {
  try {
    return JSON.stringify(message);
  } catch (error) {
    throw new Error(`Failed to serialize message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function deserializeMessage(data: string): BlockedMessage {
  try {
    const message = JSON.parse(data);

    if (!validateMessage(message)) {
      throw new Error('Invalid message format');
    }

    return message;
  } catch (error) {
    throw new Error(`Failed to deserialize message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ============================================================================
// Message Factory Functions
// ============================================================================

export function createSessionValidateMessage(
  request: SessionValidateRequest
): BlockedMessage {
  return {
    type: 'session_validate',
    timestamp: Date.now(),
    payload: request,
  };
}

export function createSessionStartMessage(sessionId: string): BlockedMessage {
  return {
    type: 'session_start',
    sessionId,
    timestamp: Date.now(),
    payload: {
      startedAt: Date.now(),
    },
  };
}

export function createSessionEndMessage(
  sessionId: string,
  reason?: string
): BlockedMessage {
  return {
    type: 'session_end',
    sessionId,
    timestamp: Date.now(),
    payload: {
      endedAt: Date.now(),
      reason,
    },
  };
}

export function createSecurityEvent(
  sessionId: string,
  event: SecurityEvent
): BlockedMessage {
  return {
    type: 'security_event',
    sessionId,
    timestamp: Date.now(),
    payload: event,
  };
}

export function createGazeData(
  sessionId: string,
  batch: GazeDataBatch
): BlockedMessage {
  return {
    type: 'gaze_data',
    sessionId,
    timestamp: Date.now(),
    payload: batch,
  };
}

export function createTelemetryData(
  sessionId: string,
  data: TelemetryData
): BlockedMessage {
  return {
    type: 'telemetry_data',
    sessionId,
    timestamp: Date.now(),
    payload: data,
  };
}

export function createVideoFrame(
  sessionId: string,
  frame: VideoFrame
): BlockedMessage {
  return {
    type: 'video_frame',
    sessionId,
    timestamp: Date.now(),
    payload: {
      data: Array.from(frame.data), // Convert Uint8Array to regular array for JSON
      width: frame.width,
      height: frame.height,
      timestamp: frame.timestamp,
      format: frame.format,
    },
  };
}

export function createHeartbeat(sessionId?: string): BlockedMessage {
  return {
    type: 'heartbeat',
    sessionId,
    timestamp: Date.now(),
    payload: {
      uptime: process.uptime(),
    },
  };
}

export function createErrorMessage(
  error: Error,
  sessionId?: string
): BlockedMessage {
  return {
    type: 'error',
    sessionId,
    timestamp: Date.now(),
    payload: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
  };
}

// ============================================================================
// Message Size Estimation
// ============================================================================

export function estimateMessageSize(message: BlockedMessage): number {
  // Estimate JSON size in bytes
  const serialized = serializeMessage(message);
  return new Blob([serialized]).size;
}

// ============================================================================
// Message Prioritization
// ============================================================================

export type MessagePriority = 'high' | 'medium' | 'low';

export function getMessagePriority(message: BlockedMessage): MessagePriority {
  switch (message.type) {
    case 'session_validate':
    case 'session_start':
    case 'session_end':
    case 'error':
      return 'high';

    case 'security_event':
    case 'heartbeat':
      return 'medium';

    case 'gaze_data':
    case 'telemetry_data':
    case 'video_frame':
      return 'low';

    default:
      return 'low';
  }
}

// ============================================================================
// Message Batching
// ============================================================================

export function canBatchMessages(msg1: BlockedMessage, msg2: BlockedMessage): boolean {
  // Only batch messages of the same type from the same session
  return (
    msg1.type === msg2.type &&
    msg1.sessionId === msg2.sessionId &&
    (msg1.type === 'gaze_data' || msg1.type === 'telemetry_data')
  );
}

export function batchMessages(messages: BlockedMessage[]): BlockedMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const batched: BlockedMessage[] = [];
  let currentBatch: BlockedMessage | null = null;

  for (const message of messages) {
    if (!currentBatch) {
      currentBatch = message;
      continue;
    }

    if (canBatchMessages(currentBatch, message)) {
      // Combine payloads
      if (Array.isArray(currentBatch.payload) && Array.isArray(message.payload)) {
        currentBatch.payload = [...currentBatch.payload, ...message.payload];
      }
    } else {
      batched.push(currentBatch);
      currentBatch = message;
    }
  }

  if (currentBatch) {
    batched.push(currentBatch);
  }

  return batched;
}
