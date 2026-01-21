// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * @fileoverview JavaScript API for Blocked interview pages.
 * Provides access to eye tracking, video capture, and session management.
 */

(function() {
  'use strict';

  // Check if API already exists.
  if (window.BlockedAPI) {
    console.warn('BlockedAPI already initialized');
    return;
  }

  /**
   * Main Blocked API class.
   * Exposed as window.BlockedAPI for interview pages.
   */
  class BlockedAPI {
    constructor() {
      this.sessionId_ = null;
      this.isEyeTrackingActive_ = false;
      this.isVideoActive_ = false;
      this.eventListeners_ = new Map();

      // Bind Mojo interfaces.
      this.initializeMojo_();
    }

    /**
     * Initialize Mojo interface connections.
     * @private
     */
    initializeMojo_() {
      // In production, bind to actual Mojo interfaces:
      // this.sessionHost_ = blocked.mojom.BlockedSessionHost.getProxy();
      // this.eyeTrackingClient_ = new blocked.mojom.EyeTrackingClient();
      // this.videoCaptureClient_ = new blocked.mojom.VideoCaptureClient();

      console.log('BlockedAPI: Mojo interfaces initialized');
    }

    /**
     * Get current session ID.
     * @return {string|null} Session ID or null if no active session.
     */
    getSessionId() {
      return this.sessionId_;
    }

    /**
     * Check if in active Blocked session.
     * @return {boolean} True if session is active.
     */
    isSessionActive() {
      return this.sessionId_ !== null;
    }

    /**
     * Start eye tracking.
     * @return {Promise<void>}
     */
    async startEyeTracking() {
      if (this.isEyeTrackingActive_) {
        console.warn('Eye tracking already active');
        return;
      }

      // Call Mojo interface to start eye tracking in renderer.
      // await this.eyeTrackingClient_.startEyeTracking(this.sessionId_);

      this.isEyeTrackingActive_ = true;
      this.dispatchEvent_('eyetrackingstarted');

      console.log('BlockedAPI: Eye tracking started');
    }

    /**
     * Stop eye tracking.
     * @return {Promise<void>}
     */
    async stopEyeTracking() {
      if (!this.isEyeTrackingActive_) {
        return;
      }

      // await this.eyeTrackingClient_.stopEyeTracking();

      this.isEyeTrackingActive_ = false;
      this.dispatchEvent_('eyetrackingstopped');

      console.log('BlockedAPI: Eye tracking stopped');
    }

    /**
     * Start calibration sequence.
     * @return {Promise<CalibrationResult>}
     */
    async calibrate() {
      if (!this.isEyeTrackingActive_) {
        throw new Error('Eye tracking must be started before calibration');
      }

      return new Promise((resolve, reject) => {
        // Trigger calibration in renderer.
        // this.eyeTrackingClient_.startCalibration();

        // Listen for calibration complete event.
        const handler = (event) => {
          this.removeEventListener('calibrationcomplete', handler);
          resolve(event.detail);
        };
        this.addEventListener('calibrationcomplete', handler);

        console.log('BlockedAPI: Calibration started');
      });
    }

    /**
     * Start video capture.
     * @param {VideoCaptureSettings=} settings Optional capture settings.
     * @return {Promise<void>}
     */
    async startVideoCapture(settings = {}) {
      if (this.isVideoActive_) {
        console.warn('Video capture already active');
        return;
      }

      const defaultSettings = {
        width: 640,
        height: 480,
        frameRate: 30,
        format: 'I420'
      };

      const finalSettings = {...defaultSettings, ...settings};

      // await this.videoCaptureClient_.startCapture(finalSettings);

      this.isVideoActive_ = true;
      this.dispatchEvent_('videocapturestarted');

      console.log('BlockedAPI: Video capture started', finalSettings);
    }

    /**
     * Stop video capture.
     * @return {Promise<void>}
     */
    async stopVideoCapture() {
      if (!this.isVideoActive_) {
        return;
      }

      // await this.videoCaptureClient_.stopCapture();

      this.isVideoActive_ = false;
      this.dispatchEvent_('videocapturestopped');

      console.log('BlockedAPI: Video capture stopped');
    }

    /**
     * Add event listener.
     * @param {string} eventType Event type.
     * @param {Function} callback Callback function.
     */
    addEventListener(eventType, callback) {
      if (!this.eventListeners_.has(eventType)) {
        this.eventListeners_.set(eventType, []);
      }
      this.eventListeners_.get(eventType).push(callback);
    }

    /**
     * Remove event listener.
     * @param {string} eventType Event type.
     * @param {Function} callback Callback function.
     */
    removeEventListener(eventType, callback) {
      const listeners = this.eventListeners_.get(eventType);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      }
    }

    /**
     * Dispatch custom event.
     * @param {string} eventType Event type.
     * @param {*=} detail Event detail data.
     * @private
     */
    dispatchEvent_(eventType, detail = null) {
      const listeners = this.eventListeners_.get(eventType);
      if (listeners) {
        const event = new CustomEvent(eventType, {detail});
        listeners.forEach(callback => {
          try {
            callback(event);
          } catch (error) {
            console.error('Error in event listener:', error);
          }
        });
      }
    }

    /**
     * Internal: Handle gaze update from renderer.
     * @param {GazeData} gazeData Gaze data point.
     * @private
     */
    onGazeUpdate_(gazeData) {
      this.dispatchEvent_('gazeupdate', gazeData);
    }

    /**
     * Internal: Handle calibration complete.
     * @param {CalibrationResult} result Calibration result.
     * @private
     */
    onCalibrationComplete_(result) {
      this.dispatchEvent_('calibrationcomplete', result);
    }

    /**
     * Internal: Handle video frame captured.
     * @param {VideoFrameData} frameData Frame data.
     * @private
     */
    onVideoFrame_(frameData) {
      this.dispatchEvent_('videoframe', frameData);
    }
  }

  /**
   * @typedef {Object} CalibrationResult
   * @property {boolean} success Whether calibration succeeded.
   * @property {number} accuracy Calibration accuracy score (0-1).
   * @property {string} message Result message.
   */

  /**
   * @typedef {Object} VideoCaptureSettings
   * @property {number=} width Video width.
   * @property {number=} height Video height.
   * @property {number=} frameRate Frame rate.
   * @property {string=} format Video format ('I420', 'NV12', 'RGB24', 'H264').
   * @property {string=} deviceId Camera device ID (empty for default).
   */

  /**
   * @typedef {Object} GazeData
   * @property {number} x Normalized x coordinate (0-1).
   * @property {number} y Normalized y coordinate (0-1).
   * @property {number} confidence Confidence score (0-1).
   * @property {boolean} isOffScreen Whether gaze is off-screen.
   * @property {string} offScreenDirection Direction if off-screen.
   * @property {number} timestamp Timestamp in microseconds.
   */

  // Expose API to window.
  window.BlockedAPI = new BlockedAPI();

  // Also expose as promise for async initialization.
  window.BlockedAPIReady = Promise.resolve(window.BlockedAPI);

  console.log('BlockedAPI initialized and ready');
})();
