#ifndef BLOCKD_BROWSER_CONFIG_H_
#define BLOCKD_BROWSER_CONFIG_H_

// WebSocket Configuration
#define WEBSOCKET_URL "wss://api.blockd.io/ws"
#define RECONNECT_MAX_ATTEMPTS 5
#define HEARTBEAT_INTERVAL_MS 30000
#define CONNECTION_TIMEOUT_MS 10000

// Reconnect backoff configuration
#define RECONNECT_BASE_DELAY_MS 1000
#define RECONNECT_MAX_DELAY_MS 30000

// Message queue configuration
#define MAX_QUEUED_MESSAGES 1000

// Logging configuration
#define ENABLE_WEBSOCKET_DEBUG_LOGGING true

#endif  // BLOCKD_BROWSER_CONFIG_H_
