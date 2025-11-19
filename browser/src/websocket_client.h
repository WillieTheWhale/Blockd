#ifndef BLOCKD_BROWSER_WEBSOCKET_CLIENT_H_
#define BLOCKD_BROWSER_WEBSOCKET_CLIENT_H_

#include <string>
#include <functional>
#include <memory>
#include <queue>
#include <mutex>
#include <atomic>
#include <thread>
#include <chrono>

#include <boost/beast/core.hpp>
#include <boost/beast/websocket.hpp>
#include <boost/beast/ssl.hpp>
#include <boost/asio/strand.hpp>
#include <boost/asio/ip/tcp.hpp>

#include "config.h"

namespace blockd {

namespace beast = boost::beast;
namespace http = beast::http;
namespace websocket = beast::websocket;
namespace net = boost::asio;
namespace ssl = boost::asio::ssl;
using tcp = boost::asio::ip::tcp;

// Message callback type
using MessageCallback = std::function<void(const std::string&)>;
using ConnectionCallback = std::function<void(bool)>;
using ErrorCallback = std::function<void(const std::string&)>;

/**
 * WebSocket client for bidirectional communication with Blockd backend.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Message queuing when disconnected
 * - Heartbeat mechanism to keep connection alive
 * - Thread-safe message sending
 * - SSL/TLS support for secure connections
 */
class WebSocketClient {
public:
    /**
     * Constructor
     * @param url WebSocket server URL (e.g., "wss://api.blockd.io/ws")
     * @param session_id Unique session identifier for this connection
     */
    WebSocketClient(const std::string& url, const std::string& session_id);

    /**
     * Destructor - ensures clean shutdown
     */
    ~WebSocketClient();

    /**
     * Initiates connection to the WebSocket server
     * This is non-blocking and returns immediately
     */
    void Connect();

    /**
     * Disconnects from the WebSocket server
     * Stops any reconnection attempts
     */
    void Disconnect();

    /**
     * Sends an event to the server
     * @param event_type Type of event (e.g., "EYE_TRACKING_DATA", "KEYSTROKE_EVENT")
     * @param payload JSON string containing event data
     * @return true if message was sent or queued, false on error
     */
    bool SendEvent(const std::string& event_type, const std::string& payload);

    /**
     * Checks if currently connected to server
     * @return true if connected, false otherwise
     */
    bool IsConnected() const;

    /**
     * Sets callback for incoming messages from server
     * @param callback Function to call when message is received
     */
    void SetMessageCallback(MessageCallback callback);

    /**
     * Sets callback for connection state changes
     * @param callback Function to call when connection state changes (true=connected, false=disconnected)
     */
    void SetConnectionCallback(ConnectionCallback callback);

    /**
     * Sets callback for error events
     * @param callback Function to call when error occurs
     */
    void SetErrorCallback(ErrorCallback callback);

    /**
     * Gets the current session ID
     * @return Session ID string
     */
    std::string GetSessionId() const { return session_id_; }

    /**
     * Gets number of reconnection attempts made
     * @return Reconnect attempt count
     */
    int GetReconnectAttempts() const { return reconnect_attempts_; }

    /**
     * Gets number of queued messages waiting to be sent
     * @return Queue size
     */
    size_t GetQueuedMessageCount() const;

private:
    // Connection lifecycle methods
    void OnConnected();
    void OnMessage(const std::string& message);
    void OnError(const std::string& error);
    void OnDisconnected();
    void Reconnect();

    // Internal operations
    void RunIOContext();
    void DoConnect();
    void DoSSLHandshake();
    void DoWebSocketHandshake();
    void DoRead();
    void DoWrite();
    void DoClose();
    void StartHeartbeat();
    void StopHeartbeat();
    void SendHeartbeat();
    void ProcessMessageQueue();

    // URL parsing
    bool ParseUrl(const std::string& url, std::string& host, std::string& port, std::string& path);

    // Message formatting
    std::string FormatMessage(const std::string& event_type, const std::string& payload);
    std::string GetCurrentTimestamp();

    // Configuration
    std::string url_;
    std::string session_id_;
    std::string host_;
    std::string port_;
    std::string path_;
    bool use_ssl_;

    // Connection state
    std::atomic<bool> is_connected_;
    std::atomic<bool> is_connecting_;
    std::atomic<bool> should_reconnect_;
    std::atomic<int> reconnect_attempts_;

    // Boost.Beast components
    net::io_context ioc_;
    ssl::context ssl_ctx_;
    tcp::resolver resolver_;
    std::unique_ptr<websocket::stream<beast::ssl_stream<tcp::socket>>> ws_ssl_;
    std::unique_ptr<websocket::stream<tcp::socket>> ws_;

    // Threading
    std::unique_ptr<std::thread> io_thread_;
    std::unique_ptr<std::thread> heartbeat_thread_;

    // Message queue for when disconnected
    std::queue<std::string> message_queue_;
    std::mutex queue_mutex_;

    // Read buffer
    beast::flat_buffer read_buffer_;

    // Callbacks
    MessageCallback message_callback_;
    ConnectionCallback connection_callback_;
    ErrorCallback error_callback_;

    // Heartbeat
    std::atomic<bool> heartbeat_running_;
    std::chrono::steady_clock::time_point last_heartbeat_;
};

}  // namespace blockd

#endif  // BLOCKD_BROWSER_WEBSOCKET_CLIENT_H_
