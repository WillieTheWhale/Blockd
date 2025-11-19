#include "browser_app.h"

#include <iostream>
#include <fstream>
#include <sstream>

#include "config.h"

namespace blockd {

// BlockdBrowserApp implementation

BlockdBrowserApp::BlockdBrowserApp() {
    std::cout << "[BlockdBrowserApp] Initializing" << std::endl;
}

void BlockdBrowserApp::OnContextInitialized() {
    CEF_REQUIRE_UI_THREAD();

    std::cout << "[BlockdBrowserApp] Context initialized" << std::endl;

    // Create message router for browser process
    CefMessageRouterConfig router_config;
    router_config.js_query_function = "blockdQuery";
    router_config.js_cancel_function = "blockdQueryCancel";

    message_router_browser_ = CefMessageRouterBrowserSide::Create(router_config);

    // Initialize WebSocket client
    // Session ID should be obtained from authentication or command line
    // For now, use a placeholder
    std::string session_id = "default-session-id";

    // Check command line for session ID
    CefRefPtr<CefCommandLine> command_line = CefCommandLine::GetGlobalCommandLine();
    if (command_line->HasSwitch("session-id")) {
        session_id = command_line->GetSwitchValue("session-id").ToString();
    }

    InitializeWebSocket(session_id);

    // Create browser window
    CefWindowInfo window_info;
    CefBrowserSettings browser_settings;

#if defined(OS_WIN)
    // Windows configuration
    window_info.SetAsPopup(nullptr, "Blockd Interview Browser");
#elif defined(OS_LINUX)
    // Linux configuration
    window_info.SetAsPopup(nullptr, "Blockd Interview Browser");
#elif defined(OS_MACOSX)
    // macOS configuration
    window_info.SetAsPopup(nullptr, "Blockd Interview Browser");
#endif

    // Browser settings
    browser_settings.background_color = CefColorSetARGB(255, 255, 255, 255);

    // Create browser client
    CefRefPtr<BlockdBrowserClient> client = new BlockdBrowserClient(this);

    // Create the browser
    std::string url = "https://meet.google.com";  // Default URL
    if (command_line->HasSwitch("url")) {
        url = command_line->GetSwitchValue("url").ToString();
    }

    CefBrowserHost::CreateBrowser(window_info, client, url, browser_settings, nullptr, nullptr);
}

void BlockdBrowserApp::OnBeforeCommandLineProcessing(
    const CefString& process_type,
    CefRefPtr<CefCommandLine> command_line) {

    // Disable GPU for better compatibility in virtual environments
    command_line->AppendSwitch("disable-gpu");
    command_line->AppendSwitch("disable-gpu-compositing");

    // Enable features needed for modern web apps
    command_line->AppendSwitch("enable-media-stream");

    std::cout << "[BlockdBrowserApp] Command line processed" << std::endl;
}

void BlockdBrowserApp::OnWebKitInitialized() {
    CEF_REQUIRE_RENDERER_THREAD();

    std::cout << "[BlockdBrowserApp] WebKit initialized" << std::endl;

    // Create message router for renderer process
    CefMessageRouterConfig router_config;
    router_config.js_query_function = "blockdQuery";
    router_config.js_cancel_function = "blockdQueryCancel";

    message_router_renderer_ = CefMessageRouterRendererSide::Create(router_config);
}

void BlockdBrowserApp::OnContextCreated(CefRefPtr<CefBrowser> browser,
                                        CefRefPtr<CefFrame> frame,
                                        CefRefPtr<CefV8Context> context) {
    CEF_REQUIRE_RENDERER_THREAD();

    std::cout << "[BlockdBrowserApp] Context created for frame" << std::endl;

    // Register message router
    if (message_router_renderer_) {
        message_router_renderer_->OnContextCreated(browser, frame, context);
    }

    // Inject WebSocket handler JavaScript
    std::string js_file_path = "js/websocket_handler.js";
    std::ifstream js_file(js_file_path);

    if (js_file.is_open()) {
        std::stringstream buffer;
        buffer << js_file.rdbuf();
        std::string js_code = buffer.str();

        // Inject session ID
        std::string session_id_injection = "window.BLOCKD_SESSION_ID = '" +
            (websocket_client_ ? websocket_client_->GetSessionId() : "default") + "';";

        CefRefPtr<CefV8Context> v8_context = frame->GetV8Context();
        v8_context->Enter();

        // Execute session ID injection
        CefRefPtr<CefV8Value> retval;
        CefRefPtr<CefV8Exception> exception;
        v8_context->Eval(session_id_injection, "", 0, retval, exception);

        // Execute WebSocket handler
        v8_context->Eval(js_code, js_file_path, 0, retval, exception);

        v8_context->Exit();

        if (exception) {
            std::cerr << "[BlockdBrowserApp] JavaScript error: "
                     << exception->GetMessage().ToString() << std::endl;
        }

        std::cout << "[BlockdBrowserApp] WebSocket handler injected" << std::endl;
    } else {
        std::cerr << "[BlockdBrowserApp] Failed to load websocket_handler.js" << std::endl;
    }
}

void BlockdBrowserApp::InitializeWebSocket(const std::string& session_id) {
    std::cout << "[BlockdBrowserApp] Initializing WebSocket with session: "
              << session_id << std::endl;

    try {
        // Create WebSocket client
        websocket_client_ = std::make_shared<WebSocketClient>(WEBSOCKET_URL, session_id);

        // Set callbacks
        websocket_client_->SetConnectionCallback([](bool connected) {
            std::cout << "[WebSocket] Connection state: "
                     << (connected ? "connected" : "disconnected") << std::endl;
        });

        websocket_client_->SetMessageCallback([](const std::string& message) {
            std::cout << "[WebSocket] Received message: " << message << std::endl;
            // TODO: Handle server commands (ALERT, SESSION_END, CONFIG_UPDATE)
        });

        websocket_client_->SetErrorCallback([](const std::string& error) {
            std::cerr << "[WebSocket] Error: " << error << std::endl;
        });

        // Add WebSocket message handler to message router
        if (message_router_browser_) {
            CefRefPtr<WebSocketMessageHandler> handler =
                new WebSocketMessageHandler(websocket_client_);
            message_router_browser_->AddHandler(handler, false);
        }

        // Connect to WebSocket server
        websocket_client_->Connect();

        std::cout << "[BlockdBrowserApp] WebSocket initialized successfully" << std::endl;

    } catch (const std::exception& e) {
        std::cerr << "[BlockdBrowserApp] Failed to initialize WebSocket: "
                 << e.what() << std::endl;
    }
}

// BlockdBrowserClient implementation

BlockdBrowserClient::BlockdBrowserClient(CefRefPtr<BlockdBrowserApp> app)
    : app_(app) {
    std::cout << "[BlockdBrowserClient] Created" << std::endl;
}

void BlockdBrowserClient::OnAfterCreated(CefRefPtr<CefBrowser> browser) {
    CEF_REQUIRE_UI_THREAD();

    std::cout << "[BlockdBrowserClient] Browser created, ID: "
              << browser->GetIdentifier() << std::endl;
}

bool BlockdBrowserClient::DoClose(CefRefPtr<CefBrowser> browser) {
    CEF_REQUIRE_UI_THREAD();

    std::cout << "[BlockdBrowserClient] Browser closing, ID: "
              << browser->GetIdentifier() << std::endl;

    // Allow the close
    return false;
}

void BlockdBrowserClient::OnBeforeClose(CefRefPtr<CefBrowser> browser) {
    CEF_REQUIRE_UI_THREAD();

    std::cout << "[BlockdBrowserClient] Browser closed, ID: "
              << browser->GetIdentifier() << std::endl;

    // Disconnect WebSocket
    if (app_ && app_->GetWebSocketClient()) {
        app_->GetWebSocketClient()->Disconnect();
    }
}

void BlockdBrowserClient::OnLoadStart(CefRefPtr<CefBrowser> browser,
                                     CefRefPtr<CefFrame> frame,
                                     TransitionType transition_type) {
    CEF_REQUIRE_UI_THREAD();

    if (frame->IsMain()) {
        std::cout << "[BlockdBrowserClient] Loading: "
                 << frame->GetURL().ToString() << std::endl;
    }
}

void BlockdBrowserClient::OnLoadEnd(CefRefPtr<CefBrowser> browser,
                                   CefRefPtr<CefFrame> frame,
                                   int httpStatusCode) {
    CEF_REQUIRE_UI_THREAD();

    if (frame->IsMain()) {
        std::cout << "[BlockdBrowserClient] Load complete: "
                 << frame->GetURL().ToString()
                 << " (status: " << httpStatusCode << ")" << std::endl;
    }
}

void BlockdBrowserClient::OnLoadError(CefRefPtr<CefBrowser> browser,
                                     CefRefPtr<CefFrame> frame,
                                     ErrorCode errorCode,
                                     const CefString& errorText,
                                     const CefString& failedUrl) {
    CEF_REQUIRE_UI_THREAD();

    // Don't display an error for downloaded files
    if (errorCode == ERR_ABORTED) {
        return;
    }

    std::cerr << "[BlockdBrowserClient] Load error: "
             << failedUrl.ToString()
             << " (code: " << errorCode << ", " << errorText.ToString() << ")"
             << std::endl;

    // Display error page
    std::stringstream ss;
    ss << "<html><head><title>Load Error</title></head>"
       << "<body bgcolor=\"white\">"
       << "<h2>Failed to load URL: " << failedUrl.ToString() << "</h2>"
       << "<p>Error: " << errorText.ToString() << " (" << errorCode << ")</p>"
       << "</body></html>";

    frame->LoadURL("data:text/html," + ss.str());
}

void BlockdBrowserClient::OnTitleChange(CefRefPtr<CefBrowser> browser,
                                       const CefString& title) {
    CEF_REQUIRE_UI_THREAD();

    std::cout << "[BlockdBrowserClient] Title changed: "
             << title.ToString() << std::endl;

    // Update window title
    // Platform-specific implementation would go here
}

}  // namespace blockd
