import { randomBytes, createHash } from 'crypto';
import { redis } from '../src/redis';

// Constants
const HEARTBEAT_INTERVAL_SECONDS = 30;
const MAX_MISSED_HEARTBEATS = 3;
const BROWSER_TOKEN_EXPIRY_HOURS = 8;
const VERIFICATION_KEY_PREFIX = 'blockd:verification:';
const HEARTBEAT_KEY_PREFIX = 'blockd:heartbeat:';
const MEETING_KEY_PREFIX = 'blockd:meeting:';

// Blockd browser user agent pattern
const BLOCKD_USER_AGENT_PATTERN = /Blockd\/[\d.]+|BlockdBrowser\/[\d.]+/i;

// Valid meeting platforms
const VALID_MEETING_PLATFORMS = [
  'meet.google.com',
  'zoom.us',
  'teams.microsoft.com',
  'teams.live.com',
];

interface HeartbeatDto {
  session_id: string;
  browser_fingerprint: string;
  user_agent: string;
  platform: string;
  timestamp: string;
  meeting_url?: string;
  is_on_meeting_platform: boolean;
  current_url?: string;
}

interface VerifyBrowserDto {
  session_id: string;
  browser_fingerprint: string;
  user_agent: string;
  platform: string;
  blockd_version: string;
  hardware_info?: {
    cpu_cores?: number;
    memory_gb?: number;
    screen_width?: number;
    screen_height?: number;
    gpu_vendor?: string;
  };
}

interface VerificationStatus {
  isVerified: boolean;
  isOnBlockdBrowser: boolean;
  lastHeartbeat: string | null;
  heartbeatIntervalSeconds: number;
  missedHeartbeats: number;
  currentMeetingPlatform: string | null;
  warnings: string[];
}

interface MeetingInfo {
  platform: string;
  url: string;
  detectedAt: string;
}

/**
 * Verification Service
 * Handles verification of Blockd browser usage during interview sessions
 */

export class VerificationService {
  /**
   * Process heartbeat from Blockd browser
   */
  async processHeartbeat(dto: HeartbeatDto): Promise<{
    verified: boolean;
    message: string;
    nextHeartbeatInterval: number;
    sessionActive: boolean;
  }> {
    const verificationKey = `${VERIFICATION_KEY_PREFIX}${dto.session_id}`;
    const heartbeatKey = `${HEARTBEAT_KEY_PREFIX}${dto.session_id}`;

    // Verify this is a legitimate Blockd browser
    const isBlockdBrowser = this.isValidBlockdBrowser(dto.user_agent, dto.browser_fingerprint);

    // Get stored verification data
    const storedData = await redis.get(verificationKey);
    const verification = storedData ? JSON.parse(storedData) : null;

    // Validate fingerprint matches if we have previous data
    if (verification && verification.fingerprint !== dto.browser_fingerprint) {
      // Fingerprint changed - possible browser switching attempt
      await this.logSecurityWarning(dto.session_id, 'FINGERPRINT_MISMATCH', {
        stored_fingerprint: verification.fingerprint.substring(0, 8) + '...',
        received_fingerprint: dto.browser_fingerprint.substring(0, 8) + '...',
      });

      return {
        verified: false,
        message: 'Browser fingerprint mismatch detected',
        nextHeartbeatInterval: HEARTBEAT_INTERVAL_SECONDS,
        sessionActive: true,
      };
    }

    // Store heartbeat
    const heartbeatData = {
      timestamp: dto.timestamp,
      user_agent: dto.user_agent,
      is_on_meeting_platform: dto.is_on_meeting_platform,
      meeting_url: dto.meeting_url,
      current_url: dto.current_url,
    };

    await redis.setex(heartbeatKey, HEARTBEAT_INTERVAL_SECONDS * 2, JSON.stringify(heartbeatData));

    // Update verification status
    const updatedVerification = {
      ...verification,
      fingerprint: dto.browser_fingerprint,
      lastHeartbeat: dto.timestamp,
      isVerified: isBlockdBrowser,
      missedHeartbeats: 0,
      isOnMeetingPlatform: dto.is_on_meeting_platform,
    };

    await redis.setex(verificationKey, 3600, JSON.stringify(updatedVerification));

    // Track meeting platform usage
    if (dto.is_on_meeting_platform && dto.meeting_url) {
      await this.trackMeetingPlatform(dto.session_id, dto.meeting_url);
    }

    return {
      verified: isBlockdBrowser,
      message: isBlockdBrowser
        ? 'Heartbeat received successfully'
        : 'Warning: Non-Blockd browser detected',
      nextHeartbeatInterval: HEARTBEAT_INTERVAL_SECONDS,
      sessionActive: true,
    };
  }

  /**
   * Verify browser is a legitimate Blockd browser
   */
  async verifyBrowser(dto: VerifyBrowserDto): Promise<{
    verified: boolean;
    browserToken: string | null;
    message: string;
    expiresAt: string | null;
  }> {
    const isBlockdBrowser = this.isValidBlockdBrowser(dto.user_agent, dto.browser_fingerprint);

    if (!isBlockdBrowser) {
      await this.logSecurityWarning(dto.session_id, 'NON_BLOCKD_BROWSER', {
        user_agent: dto.user_agent,
        platform: dto.platform,
      });

      return {
        verified: false,
        browserToken: null,
        message: 'Browser verification failed: Please use the Blockd browser for this interview',
        expiresAt: null,
      };
    }

    // Generate browser token for this session
    const browserToken = this.generateBrowserToken(dto.session_id, dto.browser_fingerprint);
    const expiresAt = new Date(Date.now() + BROWSER_TOKEN_EXPIRY_HOURS * 3600 * 1000).toISOString();

    // Store verification data
    const verificationKey = `${VERIFICATION_KEY_PREFIX}${dto.session_id}`;
    const verificationData = {
      fingerprint: dto.browser_fingerprint,
      browserToken,
      blockdVersion: dto.blockd_version,
      platform: dto.platform,
      hardwareInfo: dto.hardware_info,
      verifiedAt: new Date().toISOString(),
      expiresAt,
      isVerified: true,
      missedHeartbeats: 0,
    };

    await redis.setex(verificationKey, BROWSER_TOKEN_EXPIRY_HOURS * 3600, JSON.stringify(verificationData));

    return {
      verified: true,
      browserToken,
      message: 'Browser verified successfully',
      expiresAt,
    };
  }

  /**
   * Get verification status for a session
   */
  async getVerificationStatus(sessionId: string): Promise<VerificationStatus> {
    const verificationKey = `${VERIFICATION_KEY_PREFIX}${sessionId}`;
    const heartbeatKey = `${HEARTBEAT_KEY_PREFIX}${sessionId}`;
    const meetingKey = `${MEETING_KEY_PREFIX}${sessionId}`;

    const [verificationData, heartbeatData, meetingData] = await Promise.all([
      redis.get(verificationKey),
      redis.get(heartbeatKey),
      redis.get(meetingKey),
    ]);

    const verification = verificationData ? JSON.parse(verificationData) : null;
    const heartbeat = heartbeatData ? JSON.parse(heartbeatData) : null;
    const meeting = meetingData ? JSON.parse(meetingData) : null;

    const warnings: string[] = [];

    // Calculate missed heartbeats
    let missedHeartbeats = 0;
    if (verification?.lastHeartbeat) {
      const lastHeartbeatTime = new Date(verification.lastHeartbeat).getTime();
      const now = Date.now();
      const expectedHeartbeats = Math.floor((now - lastHeartbeatTime) / (HEARTBEAT_INTERVAL_SECONDS * 1000));
      missedHeartbeats = Math.max(0, expectedHeartbeats - 1);
    }

    if (missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
      warnings.push('Multiple heartbeats missed - session may be inactive');
    }

    if (!verification?.isVerified) {
      warnings.push('Browser not verified as Blockd browser');
    }

    return {
      isVerified: verification?.isVerified ?? false,
      isOnBlockdBrowser: verification?.isVerified ?? false,
      lastHeartbeat: verification?.lastHeartbeat ?? null,
      heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
      missedHeartbeats,
      currentMeetingPlatform: meeting?.platform ?? null,
      warnings,
    };
  }

  /**
   * Report that a meeting platform was detected
   */
  async reportMeetingDetected(
    sessionId: string,
    info: MeetingInfo
  ): Promise<{
    shouldStartStreaming: boolean;
    streamingConfig: {
      video_endpoint: string;
      audio_endpoint: string;
      quality: string;
    } | null;
  }> {
    const meetingKey = `${MEETING_KEY_PREFIX}${sessionId}`;

    // Validate meeting platform
    const isValidPlatform = VALID_MEETING_PLATFORMS.some((platform) =>
      info.url.includes(platform)
    );

    if (!isValidPlatform) {
      return {
        shouldStartStreaming: false,
        streamingConfig: null,
      };
    }

    // Extract platform name
    let platform = 'unknown';
    if (info.url.includes('meet.google.com')) platform = 'google-meet';
    else if (info.url.includes('zoom.us')) platform = 'zoom';
    else if (info.url.includes('teams.microsoft.com') || info.url.includes('teams.live.com')) platform = 'teams';

    const meetingData = {
      platform,
      url: info.url,
      detectedAt: info.detectedAt,
      isActive: true,
    };

    await redis.setex(meetingKey, 7200, JSON.stringify(meetingData)); // 2 hour expiry

    // Return streaming configuration
    return {
      shouldStartStreaming: true,
      streamingConfig: {
        video_endpoint: '/api/v1/stream/video',
        audio_endpoint: '/api/v1/stream/audio',
        quality: 'medium', // 720p
      },
    };
  }

  /**
   * Report that a meeting has ended
   */
  async reportMeetingEnded(
    sessionId: string,
    info: { platform: string; endedAt: string; durationSeconds: number }
  ): Promise<void> {
    const meetingKey = `${MEETING_KEY_PREFIX}${sessionId}`;

    const existingData = await redis.get(meetingKey);
    if (existingData) {
      const meeting = JSON.parse(existingData);
      meeting.isActive = false;
      meeting.endedAt = info.endedAt;
      meeting.durationSeconds = info.durationSeconds;

      await redis.setex(meetingKey, 3600, JSON.stringify(meeting)); // Keep for 1 hour after end
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Check if user agent indicates a Blockd browser
   */
  private isValidBlockdBrowser(userAgent: string, fingerprint: string): boolean {
    // Check user agent pattern
    if (BLOCKD_USER_AGENT_PATTERN.test(userAgent)) {
      return true;
    }

    // Check for Chromium-based Blockd browser (custom build)
    // The Blockd browser will include specific markers
    if (userAgent.includes('Chrome/') && fingerprint.startsWith('blockd_')) {
      return true;
    }

    // For development: accept requests with valid fingerprint format
    // In production, this should be stricter
    if (process.env.NODE_ENV === 'development' && fingerprint.length >= 32) {
      return true;
    }

    return false;
  }

  /**
   * Generate a secure browser token
   */
  private generateBrowserToken(sessionId: string, fingerprint: string): string {
    const randomPart = randomBytes(16).toString('hex');
    const hashInput = `${sessionId}:${fingerprint}:${randomPart}`;
    const hash = createHash('sha256').update(hashInput).digest('hex');
    return `blockd_${hash.substring(0, 48)}`;
  }

  /**
   * Track meeting platform usage
   */
  private async trackMeetingPlatform(sessionId: string, meetingUrl: string): Promise<void> {
    const meetingKey = `${MEETING_KEY_PREFIX}${sessionId}`;

    const existingData = await redis.get(meetingKey);
    if (existingData) {
      const meeting = JSON.parse(existingData);
      meeting.lastActivity = new Date().toISOString();
      await redis.setex(meetingKey, 7200, JSON.stringify(meeting));
    }
  }

  /**
   * Log security warning
   */
  private async logSecurityWarning(
    sessionId: string,
    warningType: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const warningKey = `blockd:warnings:${sessionId}`;
    const warnings = await redis.lrange(warningKey, 0, -1);

    const warning = {
      type: warningType,
      timestamp: new Date().toISOString(),
      details,
    };

    await redis.rpush(warningKey, JSON.stringify(warning));
    await redis.expire(warningKey, 86400); // 24 hour expiry

    // Also emit as a security event (would be picked up by monitoring)
    console.warn(`[SECURITY WARNING] Session ${sessionId}: ${warningType}`, details);
  }
}

export default new VerificationService();
