/**
 * Blockd Browser - Main Entry Point
 *
 * CEF-based secure browser for AI-powered interview monitoring
 */

#include <iostream>
#include <string>

#include "include/cef_app.h"
#include "include/cef_sandbox_win.h"
#include "include/wrapper/cef_helpers.h"

#include "browser_app.h"
#include "config.h"

#if defined(OS_WIN)
#include <windows.h>
#endif

namespace {

void PrintUsage() {
    std::cout << "Blockd Browser - AI-powered Interview Security System\n\n";
    std::cout << "Usage: blockd_browser [options]\n\n";
    std::cout << "Options:\n";
    std::cout << "  --session-id=<id>     Session ID for WebSocket connection (required)\n";
    std::cout << "  --url=<url>           Initial URL to load (default: https://meet.google.com)\n";
    std::cout << "  --help                Display this help message\n";
    std::cout << "\nEnvironment:\n";
    std::cout << "  WebSocket URL: " << WEBSOCKET_URL << "\n";
    std::cout << "\nExample:\n";
    std::cout << "  blockd_browser --session-id=550e8400-e29b-41d4-a716-446655440000 \\\n";
    std::cout << "                 --url=https://meet.google.com/abc-defg-hij\n";
    std::cout << std::endl;
}

}  // namespace

#if defined(OS_WIN)
// Entry point for Windows
int APIENTRY wWinMain(HINSTANCE hInstance,
                      HINSTANCE hPrevInstance,
                      LPTSTR lpCmdLine,
                      int nCmdShow) {
    UNREFERENCED_PARAMETER(hPrevInstance);
    UNREFERENCED_PARAMETER(lpCmdLine);

    // Enable High-DPI support on Windows 7 or newer
    CefEnableHighDPISupport();

    void* sandbox_info = nullptr;

#if defined(CEF_USE_SANDBOX)
    // Manage the life span of the sandbox information object
    CefScopedSandboxInfo scoped_sandbox;
    sandbox_info = scoped_sandbox.sandbox_info();
#endif

    // Provide CEF with command-line arguments
    CefMainArgs main_args(hInstance);

    // Create the application instance
    CefRefPtr<blockd::BlockdBrowserApp> app(new blockd::BlockdBrowserApp());

    // Execute the secondary process, if any
    int exit_code = CefExecuteProcess(main_args, app, sandbox_info);
    if (exit_code >= 0) {
        // The secondary process has completed
        return exit_code;
    }

    // Specify CEF global settings
    CefSettings settings;

#if !defined(CEF_USE_SANDBOX)
    settings.no_sandbox = true;
#endif

    settings.multi_threaded_message_loop = false;
    settings.external_message_pump = false;

    // Initialize CEF
    CefInitialize(main_args, settings, app.get(), sandbox_info);

    // Run the CEF message loop
    CefRunMessageLoop();

    // Shut down CEF
    CefShutdown();

    return 0;
}

#else

// Entry point for Linux and macOS
int main(int argc, char* argv[]) {
    // Parse command line arguments
    CefMainArgs main_args(argc, argv);

    // Check for help flag before CEF initialization
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--help" || arg == "-h") {
            PrintUsage();
            return 0;
        }
    }

    // Create the application instance
    CefRefPtr<blockd::BlockdBrowserApp> app(new blockd::BlockdBrowserApp());

    // Execute the secondary process, if any
    int exit_code = CefExecuteProcess(main_args, app.get(), nullptr);
    if (exit_code >= 0) {
        // The secondary process has completed
        return exit_code;
    }

    // Validate session ID
    CefRefPtr<CefCommandLine> command_line = CefCommandLine::CreateCommandLine();
    command_line->InitFromArgv(argc, argv);

    if (!command_line->HasSwitch("session-id")) {
        std::cerr << "Error: --session-id is required\n\n";
        PrintUsage();
        return 1;
    }

    // Specify CEF global settings
    CefSettings settings;
    settings.no_sandbox = true;  // Disable sandbox for simplicity
    settings.multi_threaded_message_loop = false;
    settings.external_message_pump = false;

    // Set log file
    CefString(&settings.log_file).FromASCII("blockd_browser.log");
    settings.log_severity = LOGSEVERITY_INFO;

    // Set resources directory
    // CefString(&settings.resources_dir_path).FromASCII("/path/to/resources");
    // CefString(&settings.locales_dir_path).FromASCII("/path/to/locales");

    std::cout << "Starting Blockd Browser..." << std::endl;
    std::cout << "Session ID: " << command_line->GetSwitchValue("session-id").ToString() << std::endl;
    std::cout << "WebSocket URL: " << WEBSOCKET_URL << std::endl;

    // Initialize CEF
    if (!CefInitialize(main_args, settings, app.get(), nullptr)) {
        std::cerr << "Failed to initialize CEF" << std::endl;
        return 1;
    }

    std::cout << "CEF initialized successfully" << std::endl;

    // Run the CEF message loop
    CefRunMessageLoop();

    // Shut down CEF
    CefShutdown();

    std::cout << "Blockd Browser shutdown complete" << std::endl;

    return 0;
}

#endif
