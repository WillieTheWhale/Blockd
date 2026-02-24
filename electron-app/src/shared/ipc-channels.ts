/**
 * IPC Channel definitions for Main <-> Renderer communication
 */

// Main -> Renderer channels
export const MainToRenderer = {
  // Session events
  SESSION_STARTED: 'session:started',
  SESSION_ENDED: 'session:ended',
  SESSION_ERROR: 'session:error',

  // Backend connection events
  BACKEND_CONNECTED: 'backend:connected',
  BACKEND_DISCONNECTED: 'backend:disconnected',
  BACKEND_ERROR: 'backend:error',

  // Security events
  SECURITY_ALERT: 'security:alert',

  // Window events
  FULLSCREEN_CHANGED: 'window:fullscreen-changed',
  FOCUS_CHANGED: 'window:focus-changed',

  // Meeting events
  MEETING_LOCKDOWN_ACTIVATED: 'meeting:lockdown-activated',
  MEETING_LOCKDOWN_DEACTIVATED: 'meeting:lockdown-deactivated',
} as const;

// Renderer -> Main channels (invoke/handle pattern)
export const RendererToMain = {
  // Session management
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  SESSION_GET_STATUS: 'session:get-status',

  // Eye tracking data
  GAZE_DATA_BATCH: 'gaze:data-batch',
  CALIBRATION_COMPLETE: 'calibration:complete',

  // Video capture
  VIDEO_FRAME: 'video:frame',

  // Meeting detection
  MEETING_DETECTED: 'meeting:detected',
  MEETING_ENDED: 'meeting:ended',

  // Window control
  REQUEST_FULLSCREEN: 'window:request-fullscreen',
  REQUEST_EXIT_FULLSCREEN: 'window:request-exit-fullscreen',

  // Utility
  GET_SYSTEM_INFO: 'system:get-info',
  GET_APP_VERSION: 'app:get-version',
} as const;

// Bidirectional channels (for send/on pattern)
export const BidirectionalChannels = {
  LOG: 'log',
  ERROR: 'error',
} as const;

// Type helpers
export type MainToRendererChannel = typeof MainToRenderer[keyof typeof MainToRenderer];
export type RendererToMainChannel = typeof RendererToMain[keyof typeof RendererToMain];
export type BidirectionalChannel = typeof BidirectionalChannels[keyof typeof BidirectionalChannels];
