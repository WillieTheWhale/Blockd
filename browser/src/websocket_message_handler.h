#ifndef BLOCKD_BROWSER_WEBSOCKET_MESSAGE_HANDLER_H_
#define BLOCKD_BROWSER_WEBSOCKET_MESSAGE_HANDLER_H_

#include <memory>
#include <string>

#include "include/cef_base.h"
#include "include/wrapper/cef_message_router.h"
#include "websocket_client.h"

namespace blockd {

/**
 * CEF message handler for WebSocket communication
 * Bridges JavaScript calls to C++ WebSocket client
 */
class WebSocketMessageHandler : public CefMessageRouterBrowserSide::Handler {
public:
    explicit WebSocketMessageHandler(std::shared_ptr<WebSocketClient> client);
    ~WebSocketMessageHandler() override;

    /**
     * Called when a JavaScript query is received
     * Handles WebSocket operations from browser-side JavaScript
     */
    bool OnQuery(CefRefPtr<CefBrowser> browser,
                 CefRefPtr<CefFrame> frame,
                 int64 query_id,
                 const CefString& request,
                 bool persistent,
                 CefRefPtr<Callback> callback) override;

    /**
     * Called when a query is canceled
     */
    void OnQueryCanceled(CefRefPtr<CefBrowser> browser,
                         CefRefPtr<CefFrame> frame,
                         int64 query_id) override;

private:
    std::shared_ptr<WebSocketClient> websocket_client_;

    // Helper methods for different actions
    bool HandleSendAction(const std::string& type,
                         const std::string& data,
                         CefRefPtr<Callback> callback);
    bool HandleStatusAction(CefRefPtr<Callback> callback);
    bool HandleConnectAction(CefRefPtr<Callback> callback);
    bool HandleDisconnectAction(CefRefPtr<Callback> callback);

    IMPLEMENT_REFCOUNTING(WebSocketMessageHandler);
};

}  // namespace blockd

#endif  // BLOCKD_BROWSER_WEBSOCKET_MESSAGE_HANDLER_H_
