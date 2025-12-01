/**
 * Electron API Type Declarations
 */

interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface MediaSource {
  id: string;
  name: string;
  thumbnail: string;
}

interface AuthAPI {
  login: (email: string, password: string) => Promise<IpcResult<{ user: User }>>;
  register: (email: string, password: string, fullName: string) => Promise<IpcResult<{ user: User }>>;
  logout: () => Promise<IpcResult>;
  isAuthenticated: () => Promise<IpcResult<boolean>>;
  getUser: () => Promise<IpcResult<User>>;
}

interface SessionAPI {
  join: (sessionToken: string) => Promise<IpcResult>;
  leave: () => Promise<IpcResult>;
}

interface MediaAPI {
  getSources: () => Promise<IpcResult<MediaSource[]>>;
  startCapture: (sourceId: string) => Promise<IpcResult>;
  stopCapture: () => Promise<IpcResult>;
}

interface SecurityAPI {
  startMonitoring: () => Promise<IpcResult>;
  stopMonitoring: () => Promise<IpcResult>;
  getStatus: () => Promise<IpcResult<{
    isMonitoring: boolean;
    suspiciousProcesses: string[];
    isVirtualMachine: boolean;
    isWindowFocused: boolean;
  }>>;
}

interface WebSocketAPI {
  connect: () => Promise<IpcResult>;
  disconnect: () => Promise<IpcResult>;
  send: (event: string, data: unknown) => Promise<IpcResult>;
  onMessage: (callback: (event: string, data: unknown) => void) => void;
  removeAllListeners: () => void;
}

interface GazeAPI {
  send: (data: {
    x: number;
    y: number;
    timestamp: number;
    isOffScreen: boolean;
    confidence: number;
  }) => Promise<IpcResult>;
}

interface AppAPI {
  getVersion: () => Promise<string>;
  quit: () => void;
  minimize: () => void;
  maximize: () => void;
}

interface ElectronAPI {
  auth: AuthAPI;
  session: SessionAPI;
  media: MediaAPI;
  security: SecurityAPI;
  websocket: WebSocketAPI;
  gaze: GazeAPI;
  app: AppAPI;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
