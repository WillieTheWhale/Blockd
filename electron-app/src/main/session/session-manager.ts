/**
 * Session Manager
 *
 * Manages session lifecycle:
 * - Validate session token with backend
 * - Start/end session
 * - Track session state
 * - Store session settings
 */

import { EventEmitter } from 'events';
import { app } from 'electron';
import {
  Session,
  SessionStatus,
  SessionSettings,
  SessionValidateRequest,
  SessionValidateResponse,
} from '../../shared/types.js';
import { BackendConnector } from '../backend/backend-connector.js';
import { SettingsStore } from './settings-store.js';
import {
  createSessionValidateMessage,
  createSessionStartMessage,
  createSessionEndMessage,
} from '../backend/protocol.js';
import { APP_VERSION } from '../../shared/constants.js';

export interface SessionManagerEvents {
  'session-status-changed': (status: SessionStatus) => void;
  'session-started': (session: Session) => void;
  'session-ended': (sessionId: string, reason?: string) => void;
  'session-validated': (valid: boolean, response?: SessionValidateResponse) => void;
  'session-error': (error: Error) => void;
}

export declare interface SessionManager {
  on<K extends keyof SessionManagerEvents>(
    event: K,
    listener: SessionManagerEvents[K]
  ): this;
  emit<K extends keyof SessionManagerEvents>(
    event: K,
    ...args: Parameters<SessionManagerEvents[K]>
  ): boolean;
}

export class SessionManager extends EventEmitter {
  private currentSession: Session | null = null;
  private connector: BackendConnector;
  private settingsStore: SettingsStore;
  private validationTimeout: NodeJS.Timeout | null = null;

  constructor(
    connector: BackendConnector,
    settingsStore: SettingsStore
  ) {
    super();
    this.connector = connector;
    this.settingsStore = settingsStore;

    // Listen for backend messages
    this.connector.on('message', (message) => {
      if (message.type === 'session_validate_response') {
        this.handleValidationResponse(message.payload as SessionValidateResponse);
      }
    });
  }

  // ============================================================================
  // Session Lifecycle
  // ============================================================================

  /**
   * Validate session token with backend
   */
  async validateSession(sessionToken: string): Promise<SessionValidateResponse> {
    console.log('[SessionManager] Validating session token...');

    this.setStatus('validating');

    return new Promise((resolve, reject) => {
      // Build validation request
      const request: SessionValidateRequest = {
        sessionToken,
        browserVersion: APP_VERSION,
        platform: this.getPlatform(),
        userAgent: `Blockd/${APP_VERSION} Electron/${process.versions.electron}`,
      };

      // Send validation message
      const message = createSessionValidateMessage(request);
      this.connector.send(message);

      // Store token for later use
      this.settingsStore.setSessionToken(sessionToken);

      // Set timeout for validation response
      this.validationTimeout = setTimeout(() => {
        const error = new Error('Session validation timeout');
        this.emit('session-error', error);
        reject(error);
      }, 10000); // 10 second timeout

      // Wait for validation response
      const responseHandler = (response: SessionValidateResponse) => {
        if (this.validationTimeout) {
          clearTimeout(this.validationTimeout);
          this.validationTimeout = null;
        }

        if (response.valid) {
          resolve(response);
        } else {
          reject(new Error(response.errorMessage || 'Invalid session token'));
        }
      };

      this.once('session-validated', (valid, response) => {
        if (response) {
          responseHandler(response);
        }
      });
    });
  }

  /**
   * Start a session
   */
  async startSession(sessionToken: string): Promise<Session> {
    console.log('[SessionManager] Starting session...');

    try {
      // Validate session first
      const validation = await this.validateSession(sessionToken);

      if (!validation.valid || !validation.sessionId || !validation.settings) {
        throw new Error('Invalid session validation response');
      }

      // Create session object
      const session: Session = {
        id: validation.sessionId,
        token: sessionToken,
        status: 'active',
        startedAt: Date.now(),
        settings: validation.settings,
      };

      this.currentSession = session;
      this.setStatus('active');

      // Store session data
      this.settingsStore.setSessionId(session.id);
      this.settingsStore.setSessionSettings(session.settings);

      // Notify backend that session has started
      const startMessage = createSessionStartMessage(session.id);
      this.connector.send(startMessage);

      this.emit('session-started', session);
      console.log('[SessionManager] Session started:', session.id);

      return session;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setStatus('error');
      this.emit('session-error', err);
      throw err;
    }
  }

  /**
   * End the current session
   */
  endSession(reason?: string): void {
    if (!this.currentSession) {
      console.warn('[SessionManager] No active session to end');
      return;
    }

    console.log('[SessionManager] Ending session:', this.currentSession.id, reason);

    const sessionId = this.currentSession.id;
    this.setStatus('ending');

    // Notify backend
    const endMessage = createSessionEndMessage(sessionId, reason);
    this.connector.send(endMessage);

    // Update session object
    this.currentSession.status = 'ended';
    this.currentSession.endedAt = Date.now();

    // Store last session info
    this.settingsStore.setLastSession(sessionId, reason);

    // Clear session data
    this.settingsStore.clearSessionData();

    this.emit('session-ended', sessionId, reason);

    // Clear current session
    this.currentSession = null;
    this.setStatus('ended');

    console.log('[SessionManager] Session ended');
  }

  /**
   * Force end session without waiting for backend response
   */
  forceEndSession(reason: string): void {
    console.warn('[SessionManager] Force ending session:', reason);
    this.endSession(reason);
  }

  // ============================================================================
  // Session State
  // ============================================================================

  /**
   * Get current session
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSession?.id || null;
  }

  /**
   * Get current session status
   */
  getSessionStatus(): SessionStatus {
    return this.currentSession?.status || 'idle';
  }

  /**
   * Check if session is active
   */
  isSessionActive(): boolean {
    return this.currentSession !== null && this.currentSession.status === 'active';
  }

  /**
   * Get session settings
   */
  getSessionSettings(): SessionSettings | null {
    return this.currentSession?.settings || null;
  }

  /**
   * Get session duration in milliseconds
   */
  getSessionDuration(): number {
    if (!this.currentSession || !this.currentSession.startedAt) {
      return 0;
    }

    const endTime = this.currentSession.endedAt || Date.now();
    return endTime - this.currentSession.startedAt;
  }

  /**
   * Get session info for display
   */
  getSessionInfo(): {
    id: string | null;
    status: SessionStatus;
    duration: number;
    settings: SessionSettings | null;
  } {
    return {
      id: this.getCurrentSessionId(),
      status: this.getSessionStatus(),
      duration: this.getSessionDuration(),
      settings: this.getSessionSettings(),
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private handleValidationResponse(response: SessionValidateResponse): void {
    console.log('[SessionManager] Validation response:', response.valid);

    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
      this.validationTimeout = null;
    }

    this.emit('session-validated', response.valid, response);

    if (!response.valid) {
      this.setStatus('error');
      this.emit('session-error', new Error(response.errorMessage || 'Session validation failed'));
    }
  }

  private setStatus(status: SessionStatus): void {
    if (this.currentSession) {
      this.currentSession.status = status;
    }
    this.emit('session-status-changed', status);
  }

  private getPlatform(): 'windows' | 'macos' | 'linux' {
    const platform = process.platform;
    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'macos';
    return 'linux';
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.validationTimeout) {
      clearTimeout(this.validationTimeout);
      this.validationTimeout = null;
    }

    if (this.isSessionActive()) {
      this.endSession('Application closing');
    }

    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton Management
// ============================================================================

let sessionManagerInstance: SessionManager | null = null;

/**
 * Get or create the session manager singleton
 */
export function getSessionManager(
  connector: BackendConnector,
  settingsStore: SettingsStore
): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(connector, settingsStore);
  }
  return sessionManagerInstance;
}

/**
 * Destroy the session manager singleton
 */
export function destroySessionManager(): void {
  if (sessionManagerInstance) {
    sessionManagerInstance.destroy();
    sessionManagerInstance = null;
  }
}
