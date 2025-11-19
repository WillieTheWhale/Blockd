#ifndef BLOCKD_BROWSER_APP_H_
#define BLOCKD_BROWSER_APP_H_

#include <memory>
#include <string>

#include "include/cef_app.h"
#include "include/cef_browser.h"
#include "include/cef_client.h"
#include "include/wrapper/cef_message_router.h"
#include "include/wrapper/cef_helpers.h"

#include "websocket_client.h"
#include "websocket_message_handler.h"

namespace blockd {

/**
 * Main application class for Blockd browser
 * Integrates CEF with WebSocket communication
 */
class BlockdBrowserApp : public CefApp,
                         public CefBrowserProcessHandler,
                         public CefRenderProcessHandler {
public:
    BlockdBrowserApp();

    // CefApp methods
    CefRefPtr<CefBrowserProcessHandler> GetBrowserProcessHandler() override {
        return this;
    }

    CefRefPtr<CefRenderProcessHandler> GetRenderProcessHandler() override {
        return this;
    }

    // CefBrowserProcessHandler methods
    void OnContextInitialized() override;
    void OnBeforeCommandLineProcessing(
        const CefString& process_type,
        CefRefPtr<CefCommandLine> command_line) override;

    // CefRenderProcessHandler methods
    void OnContextCreated(CefRefPtr<CefBrowser> browser,
                         CefRefPtr<CefFrame> frame,
                         CefRefPtr<CefV8Context> context) override;

    void OnWebKitInitialized() override;

    // WebSocket management
    void InitializeWebSocket(const std::string& session_id);
    std::shared_ptr<WebSocketClient> GetWebSocketClient() const {
        return websocket_client_;
    }

private:
    std::shared_ptr<WebSocketClient> websocket_client_;
    CefRefPtr<CefMessageRouterBrowserSide> message_router_browser_;
    CefRefPtr<CefMessageRouterRendererSide> message_router_renderer_;

    IMPLEMENT_REFCOUNTING(BlockdBrowserApp);
};

/**
 * Browser client handler
 * Manages browser-level events and lifecycle
 */
class BlockdBrowserClient : public CefClient,
                            public CefLifeSpanHandler,
                            public CefLoadHandler,
                            public CefDisplayHandler {
public:
    explicit BlockdBrowserClient(CefRefPtr<BlockdBrowserApp> app);

    // CefClient methods
    CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override {
        return this;
    }

    CefRefPtr<CefLoadHandler> GetLoadHandler() override {
        return this;
    }

    CefRefPtr<CefDisplayHandler> GetDisplayHandler() override {
        return this;
    }

    // CefLifeSpanHandler methods
    void OnAfterCreated(CefRefPtr<CefBrowser> browser) override;
    bool DoClose(CefRefPtr<CefBrowser> browser) override;
    void OnBeforeClose(CefRefPtr<CefBrowser> browser) override;

    // CefLoadHandler methods
    void OnLoadStart(CefRefPtr<CefBrowser> browser,
                    CefRefPtr<CefFrame> frame,
                    TransitionType transition_type) override;

    void OnLoadEnd(CefRefPtr<CefBrowser> browser,
                  CefRefPtr<CefFrame> frame,
                  int httpStatusCode) override;

    void OnLoadError(CefRefPtr<CefBrowser> browser,
                    CefRefPtr<CefFrame> frame,
                    ErrorCode errorCode,
                    const CefString& errorText,
                    const CefString& failedUrl) override;

    // CefDisplayHandler methods
    void OnTitleChange(CefRefPtr<CefBrowser> browser,
                      const CefString& title) override;

private:
    CefRefPtr<BlockdBrowserApp> app_;

    IMPLEMENT_REFCOUNTING(BlockdBrowserClient);
};

}  // namespace blockd

#endif  // BLOCKD_BROWSER_APP_H_
