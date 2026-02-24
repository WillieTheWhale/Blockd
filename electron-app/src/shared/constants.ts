/**
 * Shared constants for Blockd Electron App
 */

// Backend Configuration
export const BACKEND_URL = 'wss://api.blockd.site/ws';
export const BACKEND_URL_DEV = 'ws://localhost:3003';

// Timing Constants
export const HEARTBEAT_INTERVAL_MS = 30000;
export const RECONNECT_DELAY_MS = 1000;
export const MAX_RECONNECT_DELAY_MS = 30000;
export const MAX_RECONNECT_ATTEMPTS = 5;
export const SECURITY_CHECK_INTERVAL_MS = 5000;
export const TELEMETRY_INTERVAL_MS = 30000;
export const GAZE_BATCH_INTERVAL_MS = 100;

// Queue Configuration
export const MAX_QUEUED_MESSAGES = 100;

// Video Capture Configuration
export const WEBCAM_CONFIG = {
  width: 640,
  height: 480,
  frameRate: 30,
  facingMode: 'user' as const,
};

export const SCREEN_CAPTURE_CONFIG = {
  width: 1280,
  height: 720,
  frameRate: 5,
};

// Eye Tracking Configuration
export const EYE_TRACKING_FPS = 30;
export const CALIBRATION_POINTS = 9;
export const CALIBRATION_SAMPLES_PER_POINT = 60;
export const CALIBRATION_DURATION_MS = 2000;
export const OFF_SCREEN_THRESHOLD = 0.15;

// Kalman Filter Configuration
export const KALMAN_PROCESS_NOISE = 0.01;
export const KALMAN_MEASUREMENT_NOISE = 0.1;

// Allowed URLs for navigation
export const ALLOWED_ORIGINS = [
  'https://blockd.site',
  'https://api.blockd.site',
  'https://meet.google.com',
  'https://zoom.us',
  'https://teams.microsoft.com',
  'https://teams.live.com',
];

// Meeting Platform URL Patterns
export const MEETING_PATTERNS = {
  google_meet: [/^https:\/\/meet\.google\.com\/.+/],
  zoom: [/^https:\/\/.*\.zoom\.us\/.+/, /^https:\/\/zoom\.us\/.+/],
  teams: [/^https:\/\/teams\.microsoft\.com\/.+/, /^https:\/\/teams\.live\.com\/.+/],
};

// Suspicious Process Patterns
export const SUSPICIOUS_PROCESS_PATTERNS = {
  screen_recording: [
    /obs/i, /obs64/i, /obs-studio/i,
    /camtasia/i, /techsmith/i,
    /bandicam/i, /bdcam/i,
    /screenflow/i,
    /fraps/i,
    /action/i, /mirillis/i,
    /xsplit/i,
    /streamlabs/i,
    /nvcontainer/i, /nvidia.*share/i, /shadowplay/i,
    /amd.*relive/i,
    /icecream.*recorder/i,
    /screenrec/i,
    /sharex/i,
    /faststone/i,
    /hypercam/i,
    /ezvid/i,
    /screencast/i,
    /loom/i,
    /clipchamp/i,
    /snagit/i,
  ],
  remote_access: [
    /teamviewer/i,
    /anydesk/i,
    /rustdesk/i,
    /vnc/i, /tightvnc/i, /realvnc/i, /ultravnc/i,
    /chrome.*remote/i,
    /parsec/i,
    /splashtop/i,
    /logmein/i,
    /gotomypc/i,
    /remotepc/i,
    /screenconnect/i,
    /bomgar/i,
    /dameware/i,
  ],
  vm_tools: [
    /vmtoolsd/i, /vmwaretray/i, /vmwareuser/i,
    /vboxservice/i, /vboxtray/i, /virtualbox/i,
    /parallels/i,
    /qemu/i,
    /xen/i,
  ],
  ai_assistant: [
    /chatgpt/i,
    /copilot/i,
    /claude/i,
    /bard/i,
    /bing.*chat/i,
  ],
};

// VM Detection Indicators
export const VM_MAC_PREFIXES = {
  vmware: ['00:0C:29', '00:50:56', '00:05:69'],
  virtualbox: ['08:00:27', '0A:00:27'],
  hyperv: ['00:15:5D'],
  parallels: ['00:1C:42'],
  xen: ['00:16:3E'],
  qemu: ['52:54:00'],
};

export const VM_BIOS_STRINGS = [
  'vmware', 'virtualbox', 'vbox', 'qemu', 'xen', 'hyper-v', 'parallels', 'kvm',
];

// Modifier key type
type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta';

// Blocked Keyboard Shortcuts
export const BLOCKED_SHORTCUTS: ReadonlyArray<{
  readonly key: string;
  readonly modifiers: ReadonlyArray<ModifierKey>;
  readonly reason: string;
}> = [
  { key: 'F12', modifiers: [], reason: 'DevTools' },
  { key: 'I', modifiers: ['ctrl', 'shift'], reason: 'DevTools' },
  { key: 'J', modifiers: ['ctrl', 'shift'], reason: 'DevTools' },
  { key: 'C', modifiers: ['ctrl', 'shift'], reason: 'DevTools' },
  { key: 'U', modifiers: ['ctrl'], reason: 'View Source' },
  { key: 'Escape', modifiers: [], reason: 'Exit Fullscreen' },
  { key: 'F11', modifiers: [], reason: 'Toggle Fullscreen' },
  { key: 'T', modifiers: ['ctrl'], reason: 'New Tab' },
  { key: 'N', modifiers: ['ctrl'], reason: 'New Window' },
  { key: 'N', modifiers: ['ctrl', 'shift'], reason: 'Incognito' },
  { key: 'W', modifiers: ['ctrl'], reason: 'Close Tab' },
  { key: 'F4', modifiers: ['alt'], reason: 'Close Window' },
  { key: 'F5', modifiers: [], reason: 'Refresh' },
  { key: 'R', modifiers: ['ctrl'], reason: 'Refresh' },
  { key: 'R', modifiers: ['ctrl', 'shift'], reason: 'Hard Refresh' },
  { key: 'P', modifiers: ['ctrl'], reason: 'Print' },
  { key: 'S', modifiers: ['ctrl'], reason: 'Save' },
  { key: 'O', modifiers: ['ctrl'], reason: 'Open File' },
  { key: 'L', modifiers: ['ctrl'], reason: 'Address Bar' },
  { key: 'D', modifiers: ['ctrl'], reason: 'Bookmark' },
];

// App Info
export const APP_NAME = 'Blockd';
export const APP_VERSION = '1.0.0';
export const APP_USER_AGENT = `Blockd/${APP_VERSION} Electron`;
