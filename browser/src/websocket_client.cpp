#include "websocket_client.h"

#include <iostream>
#include <sstream>
#include <iomanip>
#include <ctime>
#include <regex>
#include <cmath>

// JSON library - using nlohmann/json (header-only)
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace blockd {

WebSocketClient::WebSocketClient(const std::string& url, const std::string& session_id)
    : url_(url),
      session_id_(session_id),
      use_ssl_(false),
      is_connected_(false),
      is_connecting_(false),
      should_reconnect_(true),
      reconnect_attempts_(0),
      ssl_ctx_(ssl::context::tlsv12_client),
      resolver_(ioc_),
      heartbeat_running_(false) {

    // Parse URL to extract host, port, and path
    if (!ParseUrl(url, host_, port_, path_)) {
        throw std::runtime_error("Invalid WebSocket URL: " + url);
    }

    // Add session_id to path as query parameter
    if (path_.find('?') != std::string::npos) {
        path_ += "&session_id=" + session_id_;
    } else {
        path_ += "?session_id=" + session_id_;
    }

    // Configure SSL context
    if (use_ssl_) {
        ssl_ctx_.set_default_verify_paths();
        ssl_ctx_.set_verify_mode(ssl::verify_peer);
    }

    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Initialized with URL: " << url_
                  << ", Session ID: " << session_id_ << std::endl;
    }
}

WebSocketClient::~WebSocketClient() {
    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Destructor called" << std::endl;
    }

    should_reconnect_ = false;
    StopHeartbeat();
    Disconnect();

    if (io_thread_ && io_thread_->joinable()) {
        io_thread_->join();
    }
}

bool WebSocketClient::ParseUrl(const std::string& url, std::string& host,
                                std::string& port, std::string& path) {
    // Parse WebSocket URL: ws://host:port/path or wss://host:port/path
    std::regex url_regex(R"(^(wss?)://([^:/]+)(?::(\d+))?(/.*)?$)");
    std::smatch matches;

    if (!std::regex_match(url, matches, url_regex)) {
        return false;
    }

    std::string protocol = matches[1];
    host = matches[2];
    port = matches[3].matched ? matches[3].str() : (protocol == "wss" ? "443" : "80");
    path = matches[4].matched ? matches[4].str() : "/";

    use_ssl_ = (protocol == "wss");

    return true;
}

void WebSocketClient::Connect() {
    if (is_connected_ || is_connecting_) {
        if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
            std::cout << "[WebSocket] Already connected or connecting" << std::endl;
        }
        return;
    }

    is_connecting_ = true;
    should_reconnect_ = true;

    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Connecting to " << host_ << ":" << port_ << path_ << std::endl;
    }

    // Start IO context in separate thread
    io_thread_ = std::make_unique<std::thread>([this]() { RunIOContext(); });
}

void WebSocketClient::Disconnect() {
    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Disconnect requested" << std::endl;
    }

    should_reconnect_ = false;
    is_connecting_ = false;

    if (is_connected_) {
        DoClose();
    }

    StopHeartbeat();
}

void WebSocketClient::RunIOContext() {
    try {
        DoConnect();
        ioc_.run();
    } catch (const std::exception& e) {
        OnError(std::string("IO context error: ") + e.what());
    }
}

void WebSocketClient::DoConnect() {
    try {
        // Resolve host
        auto const results = resolver_.resolve(host_, port_);

        if (use_ssl_) {
            // Create SSL WebSocket stream
            ws_ssl_ = std::make_unique<websocket::stream<beast::ssl_stream<tcp::socket>>>(ioc_, ssl_ctx_);

            // Connect to the IP address
            auto ep = net::connect(beast::get_lowest_layer(*ws_ssl_), results);

            // Set SNI hostname
            if (!SSL_set_tlsext_host_name(ws_ssl_->next_layer().native_handle(), host_.c_str())) {
                throw beast::system_error(
                    beast::error_code(static_cast<int>(::ERR_get_error()), net::error::get_ssl_category()),
                    "Failed to set SNI hostname");
            }

            // Perform SSL handshake
            ws_ssl_->next_layer().handshake(ssl::stream_base::client);

            // Set WebSocket options
            ws_ssl_->set_option(websocket::stream_base::timeout::suggested(beast::role_type::client));
            ws_ssl_->set_option(websocket::stream_base::decorator(
                [](websocket::request_type& req) {
                    req.set(http::field::user_agent, "Blockd-Browser/1.0");
                }));

            // Perform WebSocket handshake
            ws_ssl_->handshake(host_, path_);

        } else {
            // Create plain WebSocket stream
            ws_ = std::make_unique<websocket::stream<tcp::socket>>(ioc_);

            // Connect to the IP address
            auto ep = net::connect(beast::get_lowest_layer(*ws_), results);

            // Set WebSocket options
            ws_->set_option(websocket::stream_base::timeout::suggested(beast::role_type::client));
            ws_->set_option(websocket::stream_base::decorator(
                [](websocket::request_type& req) {
                    req.set(http::field::user_agent, "Blockd-Browser/1.0");
                }));

            // Perform WebSocket handshake
            ws_->handshake(host_, path_);
        }

        OnConnected();

    } catch (const std::exception& e) {
        OnError(std::string("Connection error: ") + e.what());
        is_connecting_ = false;

        if (should_reconnect_) {
            Reconnect();
        }
    }
}

void WebSocketClient::DoRead() {
    try {
        read_buffer_.clear();

        if (use_ssl_) {
            ws_ssl_->async_read(
                read_buffer_,
                [this](beast::error_code ec, std::size_t bytes_transferred) {
                    if (ec) {
                        OnError(std::string("Read error: ") + ec.message());
                        OnDisconnected();
                        return;
                    }

                    std::string message = beast::buffers_to_string(read_buffer_.data());
                    OnMessage(message);

                    // Continue reading
                    DoRead();
                });
        } else {
            ws_->async_read(
                read_buffer_,
                [this](beast::error_code ec, std::size_t bytes_transferred) {
                    if (ec) {
                        OnError(std::string("Read error: ") + ec.message());
                        OnDisconnected();
                        return;
                    }

                    std::string message = beast::buffers_to_string(read_buffer_.data());
                    OnMessage(message);

                    // Continue reading
                    DoRead();
                });
        }
    } catch (const std::exception& e) {
        OnError(std::string("Read exception: ") + e.what());
    }
}

void WebSocketClient::DoWrite() {
    std::lock_guard<std::mutex> lock(queue_mutex_);

    if (message_queue_.empty() || !is_connected_) {
        return;
    }

    std::string message = message_queue_.front();
    message_queue_.pop();

    try {
        if (use_ssl_) {
            ws_ssl_->write(net::buffer(message));
        } else {
            ws_->write(net::buffer(message));
        }

        if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
            std::cout << "[WebSocket] Sent message: " << message.substr(0, 100) << "..." << std::endl;
        }

        // Process remaining messages
        if (!message_queue_.empty()) {
            DoWrite();
        }

    } catch (const std::exception& e) {
        OnError(std::string("Write error: ") + e.what());
        OnDisconnected();
    }
}

void WebSocketClient::DoClose() {
    try {
        if (use_ssl_ && ws_ssl_) {
            ws_ssl_->close(websocket::close_code::normal);
        } else if (ws_) {
            ws_->close(websocket::close_code::normal);
        }
    } catch (const std::exception& e) {
        // Ignore close errors
        if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
            std::cout << "[WebSocket] Close error (ignored): " << e.what() << std::endl;
        }
    }

    is_connected_ = false;
    OnDisconnected();
}

void WebSocketClient::OnConnected() {
    is_connected_ = true;
    is_connecting_ = false;
    reconnect_attempts_ = 0;

    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Connected successfully" << std::endl;
    }

    // Send CLIENT_CONNECTED message
    json connect_msg = {
        {"type", "CLIENT_CONNECTED"},
        {"payload", {
            {"session_id", session_id_}
        }},
        {"timestamp", GetCurrentTimestamp()},
        {"session_id", session_id_}
    };

    std::lock_guard<std::mutex> lock(queue_mutex_);
    message_queue_.push(connect_msg.dump());

    // Start heartbeat
    StartHeartbeat();

    // Process queued messages
    ProcessMessageQueue();

    // Start reading
    DoRead();

    // Notify connection callback
    if (connection_callback_) {
        connection_callback_(true);
    }
}

void WebSocketClient::OnMessage(const std::string& message) {
    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Received message: " << message.substr(0, 100) << "..." << std::endl;
    }

    // Update last heartbeat time
    last_heartbeat_ = std::chrono::steady_clock::now();

    // Call message callback
    if (message_callback_) {
        message_callback_(message);
    }
}

void WebSocketClient::OnError(const std::string& error) {
    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cerr << "[WebSocket] Error: " << error << std::endl;
    }

    if (error_callback_) {
        error_callback_(error);
    }
}

void WebSocketClient::OnDisconnected() {
    bool was_connected = is_connected_.exchange(false);

    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Disconnected" << std::endl;
    }

    StopHeartbeat();

    if (connection_callback_ && was_connected) {
        connection_callback_(false);
    }

    if (should_reconnect_) {
        Reconnect();
    }
}

void WebSocketClient::Reconnect() {
    if (reconnect_attempts_ >= RECONNECT_MAX_ATTEMPTS) {
        OnError("Max reconnect attempts reached");
        should_reconnect_ = false;
        return;
    }

    reconnect_attempts_++;

    // Calculate delay with exponential backoff
    int delay_ms = std::min(
        RECONNECT_BASE_DELAY_MS * static_cast<int>(std::pow(2, reconnect_attempts_ - 1)),
        RECONNECT_MAX_DELAY_MS
    );

    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Reconnecting in " << delay_ms << "ms (attempt "
                  << reconnect_attempts_ << "/" << RECONNECT_MAX_ATTEMPTS << ")" << std::endl;
    }

    // Wait before reconnecting
    std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));

    // Reset IO context
    ioc_.restart();

    // Attempt reconnection
    DoConnect();
}

bool WebSocketClient::SendEvent(const std::string& event_type, const std::string& payload) {
    try {
        std::string message = FormatMessage(event_type, payload);

        std::lock_guard<std::mutex> lock(queue_mutex_);

        // Check queue size limit
        if (message_queue_.size() >= MAX_QUEUED_MESSAGES) {
            OnError("Message queue full, dropping message");
            return false;
        }

        message_queue_.push(message);

        if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
            std::cout << "[WebSocket] Queued message: " << event_type << std::endl;
        }

        // If connected, process queue immediately
        if (is_connected_) {
            // Post to IO context to ensure thread safety
            net::post(ioc_, [this]() { DoWrite(); });
        }

        return true;

    } catch (const std::exception& e) {
        OnError(std::string("Send error: ") + e.what());
        return false;
    }
}

std::string WebSocketClient::FormatMessage(const std::string& event_type, const std::string& payload) {
    json message;

    try {
        // Parse payload if it's JSON string
        json payload_json = json::parse(payload);

        message = {
            {"type", event_type},
            {"payload", payload_json},
            {"timestamp", GetCurrentTimestamp()},
            {"session_id", session_id_}
        };
    } catch (const json::parse_error&) {
        // If payload is not valid JSON, treat it as string
        message = {
            {"type", event_type},
            {"payload", payload},
            {"timestamp", GetCurrentTimestamp()},
            {"session_id", session_id_}
        };
    }

    return message.dump();
}

std::string WebSocketClient::GetCurrentTimestamp() {
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();
    return std::to_string(ms);
}

void WebSocketClient::StartHeartbeat() {
    if (heartbeat_running_) {
        return;
    }

    heartbeat_running_ = true;
    last_heartbeat_ = std::chrono::steady_clock::now();

    heartbeat_thread_ = std::make_unique<std::thread>([this]() {
        while (heartbeat_running_) {
            std::this_thread::sleep_for(std::chrono::milliseconds(HEARTBEAT_INTERVAL_MS));

            if (is_connected_ && heartbeat_running_) {
                SendHeartbeat();
            }
        }
    });

    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Heartbeat started" << std::endl;
    }
}

void WebSocketClient::StopHeartbeat() {
    heartbeat_running_ = false;

    if (heartbeat_thread_ && heartbeat_thread_->joinable()) {
        heartbeat_thread_->join();
    }

    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Heartbeat stopped" << std::endl;
    }
}

void WebSocketClient::SendHeartbeat() {
    json heartbeat = {
        {"type", "HEARTBEAT"},
        {"payload", json::object()},
        {"timestamp", GetCurrentTimestamp()},
        {"session_id", session_id_}
    };

    std::lock_guard<std::mutex> lock(queue_mutex_);
    message_queue_.push(heartbeat.dump());

    if (is_connected_) {
        net::post(ioc_, [this]() { DoWrite(); });
    }

    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocket] Heartbeat sent" << std::endl;
    }
}

void WebSocketClient::ProcessMessageQueue() {
    if (is_connected_) {
        net::post(ioc_, [this]() { DoWrite(); });
    }
}

bool WebSocketClient::IsConnected() const {
    return is_connected_;
}

void WebSocketClient::SetMessageCallback(MessageCallback callback) {
    message_callback_ = callback;
}

void WebSocketClient::SetConnectionCallback(ConnectionCallback callback) {
    connection_callback_ = callback;
}

void WebSocketClient::SetErrorCallback(ErrorCallback callback) {
    error_callback_ = callback;
}

size_t WebSocketClient::GetQueuedMessageCount() const {
    std::lock_guard<std::mutex> lock(const_cast<std::mutex&>(queue_mutex_));
    return message_queue_.size();
}

}  // namespace blockd
