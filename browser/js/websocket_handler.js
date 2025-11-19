/**
 * Blockd WebSocket Handler
 *
 * This script is injected into each page to provide WebSocket communication
 * capabilities between the browser and the Blockd backend.
 *
 * Usage:
 *   window.blockdWS.sendEvent('EYE_TRACKING_DATA', { x: 0.5, y: 0.3 });
 */

(function() {
    'use strict';

    /**
     * BlockdWebSocket class manages WebSocket communication
     */
    class BlockdWebSocket {
        constructor(sessionId) {
            this.sessionId = sessionId;
            this.connected = false;
            this.eventQueue = [];
            this.messageHandlers = new Map();
            this.debugMode = false;

            // Check if CEF message router is available
            if (!window.blockdQuery) {
                console.error('[BlockdWS] CEF message router not available');
                return;
            }

            // Set up connection status polling
            this.startStatusPolling();

            // Auto-connect
            this.connect();
        }

        /**
         * Connects to the WebSocket server
         * @returns {Promise<void>}
         */
        async connect() {
            try {
                const request = {
                    action: 'connect'
                };

                const response = await this.sendQuery(request);

                if (this.debugMode) {
                    console.log('[BlockdWS] Connection initiated:', response);
                }
            } catch (error) {
                console.error('[BlockdWS] Connect error:', error);
            }
        }

        /**
         * Disconnects from the WebSocket server
         * @returns {Promise<void>}
         */
        async disconnect() {
            try {
                const request = {
                    action: 'disconnect'
                };

                const response = await this.sendQuery(request);
                this.connected = false;

                if (this.debugMode) {
                    console.log('[BlockdWS] Disconnected:', response);
                }
            } catch (error) {
                console.error('[BlockdWS] Disconnect error:', error);
            }
        }

        /**
         * Sends an event to the backend
         * @param {string} eventType - Type of event (e.g., 'EYE_TRACKING_DATA')
         * @param {object} payload - Event data
         * @returns {Promise<void>}
         */
        async sendEvent(eventType, payload) {
            if (!this.connected) {
                // Queue event if not connected
                this.eventQueue.push({ eventType, payload });

                if (this.debugMode) {
                    console.warn('[BlockdWS] Not connected, queueing event:', eventType);
                }
                return;
            }

            try {
                const request = {
                    action: 'send',
                    type: eventType,
                    data: payload
                };

                const response = await this.sendQuery(request);

                if (this.debugMode) {
                    console.log('[BlockdWS] Event sent:', eventType, response);
                }
            } catch (error) {
                console.error('[BlockdWS] Send event error:', error);

                // Re-queue on error
                this.eventQueue.push({ eventType, payload });
            }
        }

        /**
         * Gets current connection status
         * @returns {Promise<object>}
         */
        async getStatus() {
            try {
                const request = {
                    action: 'status'
                };

                const response = await this.sendQuery(request);
                const status = JSON.parse(response);

                // Update connection state
                const wasConnected = this.connected;
                this.connected = status.connected;

                // If just connected, flush queue
                if (this.connected && !wasConnected) {
                    this.onConnected();
                }

                return status;
            } catch (error) {
                console.error('[BlockdWS] Status error:', error);
                return { connected: false, error: error.message };
            }
        }

        /**
         * Registers a handler for incoming messages
         * @param {string} messageType - Type of message to handle
         * @param {function} handler - Handler function
         */
        onMessage(messageType, handler) {
            this.messageHandlers.set(messageType, handler);
        }

        /**
         * Called when connection is established
         * Flushes queued events
         */
        onConnected() {
            if (this.debugMode) {
                console.log('[BlockdWS] Connected, flushing queue:', this.eventQueue.length);
            }

            // Flush event queue
            while (this.eventQueue.length > 0) {
                const event = this.eventQueue.shift();
                this.sendEvent(event.eventType, event.payload);
            }
        }

        /**
         * Starts polling for connection status
         */
        startStatusPolling() {
            setInterval(() => {
                this.getStatus();
            }, 5000); // Poll every 5 seconds
        }

        /**
         * Sends a query to the native layer via CEF
         * @param {object} request - Request object
         * @returns {Promise<string>}
         */
        sendQuery(request) {
            return new Promise((resolve, reject) => {
                window.blockdQuery({
                    request: JSON.stringify(request),
                    onSuccess: (response) => {
                        resolve(response);
                    },
                    onFailure: (error_code, error_message) => {
                        reject(new Error(`${error_code}: ${error_message}`));
                    }
                });
            });
        }

        /**
         * Enables or disables debug mode
         * @param {boolean} enabled
         */
        setDebugMode(enabled) {
            this.debugMode = enabled;
            console.log('[BlockdWS] Debug mode:', enabled ? 'enabled' : 'disabled');
        }

        /**
         * Helper methods for common event types
         */

        /**
         * Sends eye tracking data
         * @param {number} x - X coordinate (0-1)
         * @param {number} y - Y coordinate (0-1)
         * @param {number} confidence - Confidence level (0-1)
         */
        async sendEyeTrackingData(x, y, confidence) {
            await this.sendEvent('EYE_TRACKING_DATA', {
                x: x,
                y: y,
                confidence: confidence
            });
        }

        /**
         * Sends keystroke event
         * @param {string} key - Key pressed
         * @param {number} duration - Key press duration in ms
         */
        async sendKeystrokeEvent(key, duration) {
            await this.sendEvent('KEYSTROKE_EVENT', {
                key: key,
                timestamp: Date.now(),
                duration: duration
            });
        }

        /**
         * Sends screen change event
         * @param {number} monitorCount - Number of monitors
         * @param {string} activeWindow - Active window title
         */
        async sendScreenChange(monitorCount, activeWindow) {
            await this.sendEvent('SCREEN_CHANGE', {
                monitor_count: monitorCount,
                active_window: activeWindow
            });
        }

        /**
         * Sends custom event
         * @param {string} eventType - Custom event type
         * @param {object} data - Custom event data
         */
        async sendCustomEvent(eventType, data) {
            await this.sendEvent(eventType, data);
        }
    }

    // Initialize global WebSocket instance
    // Session ID should be injected by the application
    const SESSION_ID = window.BLOCKD_SESSION_ID || 'default-session';
    window.blockdWS = new BlockdWebSocket(SESSION_ID);

    // Expose utility functions
    window.blockd = window.blockd || {};
    window.blockd.websocket = {
        getInstance: () => window.blockdWS,
        setDebugMode: (enabled) => window.blockdWS.setDebugMode(enabled),
        getStatus: () => window.blockdWS.getStatus()
    };

    console.log('[BlockdWS] Initialized for session:', SESSION_ID);

})();
