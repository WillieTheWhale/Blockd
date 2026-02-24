/**
 * Shared types for Blockd Electron App
 */

// ============================================================================
// Security Types
// ============================================================================

export type SecurityEventType =
  | 'suspicious_process'
  | 'screen_recording_detected'
  | 'vm_detected'
  | 'window_focus_lost'
  | 'clipboard_activity'
  | 'multiple_monitors'
  | 'fullscreen_exit_attempt'
  | 'keyboard_shortcut_blocked'
  | 'navigation_blocked';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
  type: SecurityEventType;
  severity: Severity;
  timestamp: number;
  description: string;
  metadata: Record<string, unknown>;
}

export interface SuspiciousProcess {
  name: string;
  pid: number;
  path?: string;
  category: 'screen_recording' | 'remote_access' | 'vm_tools' | 'ai_assistant' | 'other';
}

export type VMType = 'vmware' | 'virtualbox' | 'hyperv' | 'parallels' | 'qemu' | 'xen' | 'unknown' | 'none';

export interface VMDetectionResult {
  isVM: boolean;
  vmType: VMType;
  confidence: number;
  detectionMethods: string[];
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus = 'idle' | 'validating' | 'active' | 'ending' | 'ended' | 'error';

export interface Session {
  id: string;
  token: string;
  status: SessionStatus;
  startedAt?: number;
  endedAt?: number;
  settings: SessionSettings;
}

export interface SessionSettings {
  enableEyeTracking: boolean;
  enableVideoCapture: boolean;
  enableTelemetry: boolean;
  enableSecurityMonitoring: boolean;
  monitoringIntervalMs: number;
  allowedOrigins: string[];
}

export interface SessionValidateRequest {
  sessionToken: string;
  browserVersion: string;
  platform: 'windows' | 'macos' | 'linux';
  userAgent: string;
}

export interface SessionValidateResponse {
  valid: boolean;
  sessionId?: string;
  settings?: SessionSettings;
  errorMessage?: string;
}

// ============================================================================
// Eye Tracking Types
// ============================================================================

export interface GazePoint {
  x: number;          // 0-1 normalized screen coordinate
  y: number;          // 0-1 normalized screen coordinate
  confidence: number; // 0-1 confidence score
  timestamp: number;  // milliseconds since epoch
  isOffScreen: boolean;
  offScreenDirection?: 'left' | 'right' | 'up' | 'down';
}

export interface GazeDataBatch {
  sessionId: string;
  points: GazePoint[];
}

export interface CalibrationPoint {
  screenX: number;
  screenY: number;
  samples: Array<{ gazeX: number; gazeY: number; timestamp: number }>;
}

export interface CalibrationResult {
  success: boolean;
  accuracy: number;
  points: CalibrationPoint[];
  transformMatrix?: number[][];
}

// ============================================================================
// Telemetry Types
// ============================================================================

export interface TelemetryData {
  sessionId: string;
  timestamp: number;
  cpuPercent: number;
  memoryMb: number;
  activeProcesses: number;
  windowFocused: boolean;
  batteryLevel?: number;
  networkUpKbps?: number;
  networkDownKbps?: number;
}

// ============================================================================
// Backend Communication Types
// ============================================================================

export type MessageType =
  | 'session_validate'
  | 'session_validate_response'
  | 'session_auth'
  | 'session_start'
  | 'session_end'
  | 'security_event'
  | 'gaze_data'
  | 'telemetry_data'
  | 'video_frame'
  | 'heartbeat'
  | 'error';

export interface BlockedMessage {
  type: MessageType;
  sessionId?: string;
  timestamp: number;
  payload: unknown;
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface BackendConnectorConfig {
  url: string;
  heartbeatIntervalMs: number;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  maxQueuedMessages: number;
}

// ============================================================================
// Meeting Detection Types
// ============================================================================

export type MeetingPlatform = 'google_meet' | 'zoom' | 'teams' | 'unknown';

export interface MeetingInfo {
  platform: MeetingPlatform;
  meetingUrl: string;
  meetingId?: string;
  detectedAt: number;
  isActive: boolean;
}

// ============================================================================
// Video Capture Types
// ============================================================================

export interface VideoCaptureConfig {
  width: number;
  height: number;
  frameRate: number;
  facingMode: 'user' | 'environment';
}

export interface VideoFrame {
  data: Uint8Array;
  width: number;
  height: number;
  timestamp: number;
  format: 'jpeg' | 'png' | 'raw';
}

// ============================================================================
// Window Manager Types
// ============================================================================

export interface WindowConfig {
  width: number;
  height: number;
  fullscreen: boolean;
  kiosk: boolean;
  alwaysOnTop: boolean;
  frame: boolean;
}

export interface BlockedKeyboardShortcut {
  key: string;
  modifiers: ReadonlyArray<'ctrl' | 'alt' | 'shift' | 'meta'>;
  reason: string;
}
