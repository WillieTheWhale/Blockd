/**
 * Meeting Platform Detector
 *
 * Detects meeting platform from URL and tracks meeting state.
 * Supports: Google Meet, Zoom, Microsoft Teams
 * Notifies main process when meeting is detected/ended.
 */

/// <reference path="../blockd.d.ts" />

import { MeetingInfo, MeetingPlatform } from '../../shared/types';

export interface MeetingDetectorConfig {
  checkIntervalMs?: number;
  enableAutoDetection?: boolean;
}

export interface MeetingDetectorStatus {
  isMonitoring: boolean;
  currentMeeting: MeetingInfo | null;
  detectionCount: number;
}

/**
 * URL patterns for meeting platform detection
 */
const MEETING_PATTERNS: Record<MeetingPlatform, RegExp[]> = {
  google_meet: [
    /^https?:\/\/meet\.google\.com\/[a-z0-9-]+$/i,
    /^https?:\/\/meet\.google\.com\/lookup\/.+$/i
  ],
  zoom: [
    /^https?:\/\/([\w-]+\.)?zoom\.us\/j\/\d+/i,
    /^https?:\/\/([\w-]+\.)?zoom\.us\/wc\/join\/\d+/i,
    /^https?:\/\/([\w-]+\.)?zoom\.us\/s\/\d+/i
  ],
  teams: [
    /^https?:\/\/teams\.microsoft\.com\/l\/meetup-join\//i,
    /^https?:\/\/teams\.live\.com\/meet\//i,
    /^https?:\/\/([\w-]+\.)?teams\.microsoft\.com\/meet\//i
  ],
  unknown: []
};

/**
 * MeetingDetector class
 * Monitors URL changes and detects meeting platforms
 */
export class MeetingDetector {
  private config: Required<MeetingDetectorConfig>;

  // Detection state
  private isMonitoring = false;
  private currentMeeting: MeetingInfo | null = null;
  private detectionCount = 0;

  // Monitoring
  private monitorTimer: NodeJS.Timeout | null = null;
  private lastCheckedUrl: string = '';

  // Callbacks
  private onMeetingDetectedCallback: ((meeting: MeetingInfo) => void) | null = null;
  private onMeetingEndedCallback: ((meeting: MeetingInfo) => void) | null = null;
  private onStatusChangeCallback: ((status: MeetingDetectorStatus) => void) | null = null;

  constructor(config: MeetingDetectorConfig = {}) {
    this.config = {
      checkIntervalMs: 1000, // Check URL every second
      enableAutoDetection: true,
      ...config
    };
  }

  /**
   * Start monitoring for meetings
   */
  start(): void {
    if (this.isMonitoring) {
      console.warn('Meeting detector already started');
      return;
    }

    this.isMonitoring = true;

    // Perform initial check
    this.checkCurrentUrl();

    // Start periodic URL monitoring
    if (this.config.enableAutoDetection) {
      this.monitorTimer = setInterval(() => {
        this.checkCurrentUrl();
      }, this.config.checkIntervalMs);
    }

    this.updateStatus();

    console.log('Meeting detector started');
  }

  /**
   * Stop monitoring for meetings
   */
  stop(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    // Stop monitoring timer
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }

    // End current meeting if active
    if (this.currentMeeting) {
      this.endMeeting();
    }

    this.updateStatus();

    console.log('Meeting detector stopped');
  }

  /**
   * Manually check a specific URL
   */
  checkUrl(url: string): MeetingInfo | null {
    const platform = this.detectPlatform(url);

    if (platform === 'unknown') {
      return null;
    }

    const meetingId = this.extractMeetingId(url, platform);

    const meetingInfo: MeetingInfo = {
      platform,
      meetingUrl: url,
      meetingId,
      detectedAt: Date.now(),
      isActive: true
    };

    return meetingInfo;
  }

  /**
   * Get current meeting info
   */
  getCurrentMeeting(): MeetingInfo | null {
    return this.currentMeeting;
  }

  /**
   * Get current status
   */
  getStatus(): MeetingDetectorStatus {
    return {
      isMonitoring: this.isMonitoring,
      currentMeeting: this.currentMeeting,
      detectionCount: this.detectionCount
    };
  }

  /**
   * Set callback for meeting detected
   */
  onMeetingDetected(callback: (meeting: MeetingInfo) => void): void {
    this.onMeetingDetectedCallback = callback;
  }

  /**
   * Set callback for meeting ended
   */
  onMeetingEnded(callback: (meeting: MeetingInfo) => void): void {
    this.onMeetingEndedCallback = callback;
  }

  /**
   * Set callback for status changes
   */
  onStatusChange(callback: (status: MeetingDetectorStatus) => void): void {
    this.onStatusChangeCallback = callback;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
  }

  // ========================================================================
  // Private methods
  // ========================================================================

  /**
   * Check current window URL for meeting
   */
  private checkCurrentUrl(): void {
    const currentUrl = window.location.href;

    // Skip if URL hasn't changed
    if (currentUrl === this.lastCheckedUrl) {
      return;
    }

    this.lastCheckedUrl = currentUrl;

    // Check if URL is a meeting
    const meetingInfo = this.checkUrl(currentUrl);

    if (meetingInfo) {
      // Meeting detected
      if (!this.currentMeeting || this.currentMeeting.meetingUrl !== meetingInfo.meetingUrl) {
        this.startMeeting(meetingInfo);
      }
    } else {
      // No meeting detected
      if (this.currentMeeting) {
        this.endMeeting();
      }
    }
  }

  /**
   * Detect meeting platform from URL
   */
  private detectPlatform(url: string): MeetingPlatform {
    for (const [platform, patterns] of Object.entries(MEETING_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(url)) {
          return platform as MeetingPlatform;
        }
      }
    }

    return 'unknown';
  }

  /**
   * Extract meeting ID from URL
   */
  private extractMeetingId(url: string, platform: MeetingPlatform): string | undefined {
    try {
      switch (platform) {
        case 'google_meet': {
          // Google Meet: meet.google.com/abc-defg-hij
          const match = url.match(/meet\.google\.com\/([a-z0-9-]+)/i);
          return match ? match[1] : undefined;
        }

        case 'zoom': {
          // Zoom: zoom.us/j/1234567890
          const match = url.match(/zoom\.us\/(?:j|wc\/join|s)\/(\d+)/i);
          return match ? match[1] : undefined;
        }

        case 'teams': {
          // Teams: teams.microsoft.com/l/meetup-join/...
          // Extract the meeting ID from the URL path
          const match = url.match(/\/([a-z0-9-_]+)\??/i);
          return match ? match[1] : undefined;
        }

        default:
          return undefined;
      }
    } catch (error) {
      console.error('Error extracting meeting ID:', error);
      return undefined;
    }
  }

  /**
   * Handle meeting start
   */
  private startMeeting(meetingInfo: MeetingInfo): void {
    this.currentMeeting = meetingInfo;
    this.detectionCount++;

    console.log('Meeting detected:', {
      platform: meetingInfo.platform,
      meetingId: meetingInfo.meetingId,
      url: meetingInfo.meetingUrl
    });

    // Notify via callback
    if (this.onMeetingDetectedCallback) {
      this.onMeetingDetectedCallback(meetingInfo);
    }

    // Notify main process via IPC
    if (window.blockd) {
      window.blockd.meeting.detected(meetingInfo).catch((error) => {
        console.error('Failed to notify main process of meeting detection:', error);
      });
    }

    this.updateStatus();
  }

  /**
   * Handle meeting end
   */
  private endMeeting(): void {
    if (!this.currentMeeting) {
      return;
    }

    const endedMeeting: MeetingInfo = {
      ...this.currentMeeting,
      isActive: false
    };

    console.log('Meeting ended:', {
      platform: endedMeeting.platform,
      meetingId: endedMeeting.meetingId
    });

    // Notify via callback
    if (this.onMeetingEndedCallback) {
      this.onMeetingEndedCallback(endedMeeting);
    }

    // Notify main process via IPC
    if (window.blockd) {
      window.blockd.meeting.ended(endedMeeting).catch((error) => {
        console.error('Failed to notify main process of meeting end:', error);
      });
    }

    this.currentMeeting = null;
    this.updateStatus();
  }

  /**
   * Update status and notify callback
   */
  private updateStatus(): void {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(this.getStatus());
    }
  }
}

/**
 * Helper function to get friendly platform name
 */
export function getPlatformName(platform: MeetingPlatform): string {
  switch (platform) {
    case 'google_meet':
      return 'Google Meet';
    case 'zoom':
      return 'Zoom';
    case 'teams':
      return 'Microsoft Teams';
    default:
      return 'Unknown';
  }
}
