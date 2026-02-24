/**
 * Backend Module Exports
 */

export { BackendConnector } from './backend-connector.js';
export type { BackendConnectorEvents } from './backend-connector.js';

export { MessageQueue } from './message-queue.js';

export {
  validateMessage,
  serializeMessage,
  deserializeMessage,
  createSessionValidateMessage,
  createSessionStartMessage,
  createSessionEndMessage,
  createSecurityEvent,
  createGazeData,
  createTelemetryData,
  createVideoFrame,
  createHeartbeat,
  createErrorMessage,
  estimateMessageSize,
  getMessagePriority,
  canBatchMessages,
  batchMessages,
} from './protocol.js';
export type { MessagePriority } from './protocol.js';
