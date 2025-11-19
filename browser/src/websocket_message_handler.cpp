#include "websocket_message_handler.h"

#include <iostream>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace blockd {

WebSocketMessageHandler::WebSocketMessageHandler(std::shared_ptr<WebSocketClient> client)
    : websocket_client_(client) {
    if (!websocket_client_) {
        throw std::runtime_error("WebSocket client cannot be null");
    }
}

WebSocketMessageHandler::~WebSocketMessageHandler() {
}

bool WebSocketMessageHandler::OnQuery(CefRefPtr<CefBrowser> browser,
                                       CefRefPtr<CefFrame> frame,
                                       int64 query_id,
                                       const CefString& request,
                                       bool persistent,
                                       CefRefPtr<Callback> callback) {
    try {
        std::string request_str = request.ToString();

        if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
            std::cout << "[WebSocketMessageHandler] Received query: " << request_str << std::endl;
        }

        // Parse JSON request
        json req = json::parse(request_str);

        // Check for required 'action' field
        if (!req.contains("action")) {
            callback->Failure(1, "Missing 'action' field");
            return true;
        }

        std::string action = req["action"];

        // Route to appropriate handler
        if (action == "send") {
            if (!req.contains("type") || !req.contains("data")) {
                callback->Failure(2, "Missing 'type' or 'data' field for send action");
                return true;
            }
            return HandleSendAction(req["type"], req["data"].dump(), callback);
        }
        else if (action == "status") {
            return HandleStatusAction(callback);
        }
        else if (action == "connect") {
            return HandleConnectAction(callback);
        }
        else if (action == "disconnect") {
            return HandleDisconnectAction(callback);
        }
        else {
            callback->Failure(3, "Unknown action: " + action);
            return true;
        }

    } catch (const json::parse_error& e) {
        std::string error = std::string("JSON parse error: ") + e.what();
        callback->Failure(4, error);
        return true;
    } catch (const std::exception& e) {
        std::string error = std::string("Error: ") + e.what();
        callback->Failure(5, error);
        return true;
    }

    return false;
}

void WebSocketMessageHandler::OnQueryCanceled(CefRefPtr<CefBrowser> browser,
                                               CefRefPtr<CefFrame> frame,
                                               int64 query_id) {
    if (ENABLE_WEBSOCKET_DEBUG_LOGGING) {
        std::cout << "[WebSocketMessageHandler] Query canceled: " << query_id << std::endl;
    }
}

bool WebSocketMessageHandler::HandleSendAction(const std::string& type,
                                                const std::string& data,
                                                CefRefPtr<Callback> callback) {
    if (!websocket_client_) {
        callback->Failure(10, "WebSocket client not initialized");
        return true;
    }

    bool success = websocket_client_->SendEvent(type, data);

    if (success) {
        json response = {
            {"status", "success"},
            {"message", "Event queued for sending"}
        };
        callback->Success(response.dump());
    } else {
        callback->Failure(11, "Failed to queue event");
    }

    return true;
}

bool WebSocketMessageHandler::HandleStatusAction(CefRefPtr<Callback> callback) {
    if (!websocket_client_) {
        callback->Failure(10, "WebSocket client not initialized");
        return true;
    }

    json response = {
        {"connected", websocket_client_->IsConnected()},
        {"session_id", websocket_client_->GetSessionId()},
        {"reconnect_attempts", websocket_client_->GetReconnectAttempts()},
        {"queued_messages", websocket_client_->GetQueuedMessageCount()}
    };

    callback->Success(response.dump());
    return true;
}

bool WebSocketMessageHandler::HandleConnectAction(CefRefPtr<Callback> callback) {
    if (!websocket_client_) {
        callback->Failure(10, "WebSocket client not initialized");
        return true;
    }

    websocket_client_->Connect();

    json response = {
        {"status", "success"},
        {"message", "Connection initiated"}
    };

    callback->Success(response.dump());
    return true;
}

bool WebSocketMessageHandler::HandleDisconnectAction(CefRefPtr<Callback> callback) {
    if (!websocket_client_) {
        callback->Failure(10, "WebSocket client not initialized");
        return true;
    }

    websocket_client_->Disconnect();

    json response = {
        {"status", "success"},
        {"message", "Disconnection initiated"}
    };

    callback->Success(response.dump());
    return true;
}

}  // namespace blockd
