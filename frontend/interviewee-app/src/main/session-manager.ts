/**
 * Session Manager
 * Manages authentication, session state, and backend communication
 */

import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';

// API Configuration
const API_URL = process.env.BLOCKD_API_URL || 'http://localhost:3000';
const WS_URL = process.env.BLOCKD_WS_URL || 'http://localhost:3003';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface Session {
  id: string;
  token: string;
  status: string;
  interviewerId: string;
  scheduledAt: string;
}

interface LoginResponse {
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  requires_mfa?: boolean;
  mfa_token?: string;
}

interface RegisterResponse {
  user_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export class SessionManager extends EventEmitter {
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;
  private currentUser: User | null = null;
  private currentSession: Session | null = null;
  private socket: Socket | null = null;
  private isCapturing = false;

  constructor() {
    super();
  }

  // ============================================================================
  // AUTHENTICATION
  // ============================================================================

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<{ user: User; tokens: AuthTokens }> {
    const response = await this.apiRequest<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.requires_mfa) {
      throw new Error('MFA_REQUIRED');
    }

    this.accessToken = response.access_token;
    this.refreshTokenValue = response.refresh_token;

    // Fetch user profile
    const user = await this.fetchUserProfile();
    this.currentUser = user;

    return {
      user,
      tokens: {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresIn: response.expires_in,
      },
    };
  }

  /**
   * Register a new user
   */
  async register(email: string, password: string, fullName: string): Promise<{ user: User; tokens: AuthTokens }> {
    const response = await this.apiRequest<RegisterResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        role: 'interviewee',
      }),
    });

    this.accessToken = response.access_token;
    this.refreshTokenValue = response.refresh_token;

    // Fetch user profile
    const user = await this.fetchUserProfile();
    this.currentUser = user;

    return {
      user,
      tokens: {
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
        expiresIn: response.expires_in,
      },
    };
  }

  /**
   * Logout current user
   */
  async logout(): Promise<void> {
    if (this.refreshTokenValue) {
      try {
        await this.apiRequest('/api/v1/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: this.refreshTokenValue }),
        });
      } catch (error) {
        console.error('Logout API error:', error);
      }
    }

    this.accessToken = null;
    this.refreshTokenValue = null;
    this.currentUser = null;
    this.currentSession = null;
    this.disconnectWebSocket();
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<AuthTokens> {
    if (!this.refreshTokenValue) {
      throw new Error('No refresh token available');
    }

    const response = await this.apiRequest<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: this.refreshTokenValue }),
    });

    this.accessToken = response.access_token;
    this.refreshTokenValue = response.refresh_token;

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in,
    };
  }

  /**
   * Fetch current user profile
   */
  private async fetchUserProfile(): Promise<User> {
    const profile = await this.apiRequest<{
      id: string;
      email: string;
      full_name: string;
      role: string;
    }>('/api/v1/auth/me', {
      method: 'GET',
    });

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
    };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null && this.currentUser !== null;
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  /**
   * Join an interview session
   */
  async joinSession(sessionToken: string): Promise<Session> {
    const response = await this.apiRequest<{
      session_id: string;
      status: string;
      interviewer_id: string;
      scheduled_at: string;
    }>('/api/v1/browser/session/join', {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken }),
    });

    this.currentSession = {
      id: response.session_id,
      token: sessionToken,
      status: response.status,
      interviewerId: response.interviewer_id,
      scheduledAt: response.scheduled_at,
    };

    // Connect WebSocket for real-time communication
    await this.connectWebSocket();

    // Join the session room
    this.socket?.emit('session:join', { session_id: response.session_id });

    return this.currentSession;
  }

  /**
   * Leave current session
   */
  async leaveSession(): Promise<void> {
    if (this.currentSession) {
      this.socket?.emit('session:leave', { session_id: this.currentSession.id });

      await this.apiRequest('/api/v1/browser/session/leave', {
        method: 'POST',
        body: JSON.stringify({ session_id: this.currentSession.id }),
      });

      this.currentSession = null;
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  // ============================================================================
  // WEBSOCKET
  // ============================================================================

  /**
   * Connect to WebSocket server
   */
  async connectWebSocket(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = io(WS_URL, {
        auth: {
          token: this.accessToken,
        },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        console.log('[SessionManager] WebSocket connected');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[SessionManager] WebSocket connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[SessionManager] WebSocket disconnected:', reason);
        this.emit('websocket:disconnected', reason);
      });

      // Forward events to renderer
      const eventTypes = [
        'session:started',
        'session:ended',
        'session:state',
        'participant:joined',
        'participant:left',
        'security:alert',
        'gaze:update',
        'chat:message',
        'question:asked',
        'answer:received',
      ];

      for (const eventType of eventTypes) {
        this.socket.on(eventType, (data) => {
          this.emit('websocket:event', eventType, data);
        });
      }
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Send WebSocket event
   */
  sendWebSocketEvent(eventName: string, data: unknown): void {
    if (this.socket?.connected) {
      this.socket.emit(eventName, data);
    } else {
      console.warn('[SessionManager] WebSocket not connected, cannot send event');
    }
  }

  /**
   * Disconnect all connections
   */
  disconnect(): void {
    this.disconnectWebSocket();
  }

  // ============================================================================
  // SECURITY EVENTS
  // ============================================================================

  /**
   * Send security event to backend
   */
  async sendSecurityEvent(event: {
    type: string;
    severity: string;
    description: string;
    metadata?: Record<string, unknown>;
    timestamp: string;
  }): Promise<void> {
    if (!this.currentSession) {
      console.warn('[SessionManager] No active session for security event');
      return;
    }

    // Send via WebSocket for real-time
    this.socket?.emit('security:event', {
      session_id: this.currentSession.id,
      event_type: event.type,
      severity: event.severity,
      description: event.description,
      metadata: event.metadata,
      timestamp: event.timestamp,
    });

    // Also send via HTTP for persistence
    try {
      await this.apiRequest('/api/v1/browser/security/event', {
        method: 'POST',
        body: JSON.stringify({
          session_token: this.currentSession.token,
          event_type: event.type,
          severity: event.severity,
          description: event.description,
          metadata: event.metadata,
        }),
      });
    } catch (error) {
      console.error('[SessionManager] Failed to send security event via HTTP:', error);
    }
  }

  // ============================================================================
  // GAZE DATA
  // ============================================================================

  /**
   * Send gaze tracking data
   */
  async sendGazeData(data: {
    gaze_x: number;
    gaze_y: number;
    is_off_screen: boolean;
    off_screen_direction?: string;
    confidence: number;
  }): Promise<void> {
    if (!this.currentSession || !this.socket?.connected) {
      return;
    }

    this.socket.emit('gaze:stream', {
      session_id: this.currentSession.id,
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  // ============================================================================
  // MEDIA CAPTURE
  // ============================================================================

  /**
   * Start media capture (placeholder - actual capture happens in renderer)
   */
  async startMediaCapture(sourceId: string): Promise<void> {
    this.isCapturing = true;
    console.log('[SessionManager] Started media capture for source:', sourceId);
  }

  /**
   * Stop media capture
   */
  async stopMediaCapture(): Promise<void> {
    this.isCapturing = false;
    console.log('[SessionManager] Stopped media capture');
  }

  // ============================================================================
  // HTTP API
  // ============================================================================

  /**
   * Make authenticated API request
   */
  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_URL}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API request failed: ${response.status}`);
    }

    return response.json();
  }
}
