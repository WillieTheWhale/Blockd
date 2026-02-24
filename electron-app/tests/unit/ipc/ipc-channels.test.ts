/**
 * Unit tests for IPC Channel Definitions and Type Safety
 */

import { describe, it, expect } from 'vitest';
import { MainToRenderer, RendererToMain } from '../../../src/shared/ipc-channels';

describe('IPC Channel Definitions', () => {
  describe('MainToRenderer channels', () => {
    it('should define all required session channels', () => {
      expect(MainToRenderer.SESSION_STARTED).toBeDefined();
      expect(MainToRenderer.SESSION_ENDED).toBeDefined();
      expect(MainToRenderer.SESSION_ERROR).toBeDefined();
    });

    it('should define all required backend channels', () => {
      expect(MainToRenderer.BACKEND_CONNECTED).toBeDefined();
      expect(MainToRenderer.BACKEND_DISCONNECTED).toBeDefined();
      expect(MainToRenderer.BACKEND_ERROR).toBeDefined();
    });

    it('should define security alert channel', () => {
      expect(MainToRenderer.SECURITY_ALERT).toBeDefined();
    });

    it('should define window state channels', () => {
      expect(MainToRenderer.FULLSCREEN_CHANGED).toBeDefined();
      expect(MainToRenderer.FOCUS_CHANGED).toBeDefined();
    });

    it('should define meeting lockdown channels', () => {
      expect(MainToRenderer.MEETING_LOCKDOWN_ACTIVATED).toBeDefined();
      expect(MainToRenderer.MEETING_LOCKDOWN_DEACTIVATED).toBeDefined();
    });

    it('should have unique channel names', () => {
      const channels = Object.values(MainToRenderer);
      const uniqueChannels = new Set(channels);
      expect(uniqueChannels.size).toBe(channels.length);
    });

    it('should use consistent naming convention with colons', () => {
      for (const channel of Object.values(MainToRenderer)) {
        expect(channel).toMatch(/^[a-z]+:[a-z-]+$/);
      }
    });
  });

  describe('RendererToMain channels', () => {
    it('should define session management channels', () => {
      expect(RendererToMain.SESSION_START).toBeDefined();
      expect(RendererToMain.SESSION_END).toBeDefined();
      expect(RendererToMain.SESSION_GET_STATUS).toBeDefined();
    });

    it('should define eye tracking channels', () => {
      expect(RendererToMain.GAZE_DATA_BATCH).toBeDefined();
      expect(RendererToMain.CALIBRATION_COMPLETE).toBeDefined();
    });

    it('should define video channel', () => {
      expect(RendererToMain.VIDEO_FRAME).toBeDefined();
    });

    it('should define meeting detection channels', () => {
      expect(RendererToMain.MEETING_DETECTED).toBeDefined();
      expect(RendererToMain.MEETING_ENDED).toBeDefined();
    });

    it('should define window control channels', () => {
      expect(RendererToMain.REQUEST_FULLSCREEN).toBeDefined();
      expect(RendererToMain.REQUEST_EXIT_FULLSCREEN).toBeDefined();
    });

    it('should define utility channels', () => {
      expect(RendererToMain.GET_SYSTEM_INFO).toBeDefined();
      expect(RendererToMain.GET_APP_VERSION).toBeDefined();
    });

    it('should have unique channel names', () => {
      const channels = Object.values(RendererToMain);
      const uniqueChannels = new Set(channels);
      expect(uniqueChannels.size).toBe(channels.length);
    });

    it('should use consistent naming convention with colons', () => {
      for (const channel of Object.values(RendererToMain)) {
        expect(channel).toMatch(/^[a-z]+:[a-z-]+$/);
      }
    });
  });

  describe('Channel naming conventions', () => {
    it('should not have conflicting channel names between MainToRenderer and RendererToMain', () => {
      const mainToRendererChannels = new Set(Object.values(MainToRenderer));
      const rendererToMainChannels = new Set(Object.values(RendererToMain));

      for (const channel of rendererToMainChannels) {
        expect(mainToRendererChannels.has(channel)).toBe(false);
      }
    });
  });
});
