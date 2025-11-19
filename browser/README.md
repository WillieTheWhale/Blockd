# Blockd Browser - WebSocket Integration

This directory contains the CEF-based browser implementation for the Blockd AI-powered interview security system, with a focus on the WebSocket communication layer.

## Overview

The Blockd Browser provides a secure, monitored environment for conducting online interviews. The WebSocket integration enables real-time bidirectional communication between the browser and the backend monitoring services.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Blockd Browser (CEF)                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐         ┌────────────────────────┐  │
│  │ JavaScript   │ ◄─────► │ C++ WebSocket Client   │  │
│  │ (injected)   │  CEF    │ (Boost.Beast)          │  │
│  └──────────────┘  V8     └────────────────────────┘  │
│        │            Bindings          │                │
│        │                              │                │
│        ▼                              ▼                │
│  ┌──────────────────────────────────────────────────┐  │
│  │         CEF Message Router                       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
                           │
                           │ WebSocket (wss://)
                           ▼
              ┌────────────────────────────┐
              │  Backend WebSocket Server  │
              │  (wss://api.blockd.io/ws)  │
              └────────────────────────────┘
```

## Components

### C++ Components

- **websocket_client.h/cpp**: Core WebSocket client implementation using Boost.Beast
  - Connection management with automatic reconnection
  - Message queuing when disconnected
  - Heartbeat mechanism
  - Thread-safe operations

- **websocket_message_handler.h/cpp**: CEF message router handler
  - Bridges JavaScript calls to C++ WebSocket client
  - Handles message serialization/deserialization

- **browser_app.h/cpp**: Main browser application
  - Integrates WebSocket client with CEF
  - Manages browser lifecycle
  - Injects JavaScript handler

- **main.cpp**: Application entry point
  - Command-line argument parsing
  - CEF initialization
  - Platform-specific setup

### JavaScript Components

- **js/websocket_handler.js**: Browser-side WebSocket API
  - `window.blockdWS`: Global WebSocket instance
  - Event queuing when disconnected
  - Helper methods for common event types

### Configuration

- **config.h**: Compile-time configuration
  - WebSocket URL
  - Reconnection parameters
  - Heartbeat interval
  - Queue limits

## Building

### Prerequisites

- CMake 3.15 or higher
- C++17 compatible compiler
- Boost 1.70 or higher (with Boost.Beast and Boost.Asio)
- OpenSSL 1.1 or higher
- CEF (Chromium Embedded Framework)
- nlohmann/json (header-only library)

### Linux Build

```bash
# Install dependencies (Ubuntu/Debian)
sudo apt-get install cmake build-essential libboost-all-dev libssl-dev

# Download CEF
# Visit https://cef-builds.spotifycdn.com/index.html
# Extract to browser/third_party/cef

# Install nlohmann/json
sudo apt-get install nlohmann-json3-dev
# Or download from https://github.com/nlohmann/json

# Build
cd browser
mkdir build && cd build
cmake ..
make -j$(nproc)

# Run tests
ctest --verbose
```

### macOS Build

```bash
# Install dependencies
brew install cmake boost openssl nlohmann-json

# Download CEF (as above)

# Build
cd browser
mkdir build && cd build
cmake ..
make -j$(sysctl -n hw.ncpu)
```

### Windows Build

```powershell
# Install dependencies via vcpkg
vcpkg install boost:x64-windows openssl:x64-windows nlohmann-json:x64-windows

# Download CEF (as above)

# Build
cd browser
mkdir build
cd build
cmake .. -DCMAKE_TOOLCHAIN_FILE=C:/vcpkg/scripts/buildsystems/vcpkg.cmake
cmake --build . --config Release
```

## Usage

### Running the Browser

```bash
./blockd_browser \
  --session-id=550e8400-e29b-41d4-a716-446655440000 \
  --url=https://meet.google.com/abc-defg-hij
```

### Command-Line Options

- `--session-id=<uuid>`: Session ID from authentication service (required)
- `--url=<url>`: Initial URL to load (default: https://meet.google.com)
- `--help`: Display help message

### JavaScript API

The WebSocket handler is automatically injected into all pages:

```javascript
// Send eye tracking data
blockdWS.sendEyeTrackingData(0.5, 0.3, 0.85);

// Send keystroke event
blockdWS.sendKeystrokeEvent('a', 150);

// Send screen change event
blockdWS.sendScreenChange(2, 'Google Meet');

// Send custom event
blockdWS.sendEvent('CUSTOM_EVENT', { key: 'value' });

// Get connection status
const status = await blockdWS.getStatus();
console.log('Connected:', status.connected);

// Enable debug mode
blockdWS.setDebugMode(true);
```

## Testing

### Unit Tests

```bash
cd build
./test_websocket_client
```

### Integration Tests

1. Start the mock WebSocket server:
   ```bash
   cd tests
   python3 mock_ws_server.py
   ```

2. Run the browser with test session:
   ```bash
   ./blockd_browser --session-id=test-session-12345 --url=about:blank
   ```

3. Open developer console and test:
   ```javascript
   blockdWS.setDebugMode(true);
   blockdWS.sendEvent('TEST_EVENT', { test: 'data' });
   ```

### Mock Server Options

```bash
python3 mock_ws_server.py --help

# Run on custom port
python3 mock_ws_server.py --port 9000

# Enable debug logging
python3 mock_ws_server.py --debug

# Simulate server commands
python3 mock_ws_server.py --simulate
```

## WebSocket Protocol

See [docs/websocket_protocol.md](../docs/websocket_protocol.md) for complete protocol documentation.

### Message Types (Client → Server)

- `CLIENT_CONNECTED`: Initial connection message
- `EYE_TRACKING_DATA`: Eye gaze coordinates
- `KEYSTROKE_EVENT`: Keyboard events
- `SCREEN_CHANGE`: Monitor/window changes
- `HEARTBEAT`: Keep-alive (every 30s)

### Message Types (Server → Client)

- `ALERT`: Suspicious activity notification
- `SESSION_END`: Terminate session
- `CONFIG_UPDATE`: Dynamic configuration

## Performance

- **Connection time**: < 5 seconds
- **Message latency**: < 100ms
- **Memory footprint**: < 10MB
- **CPU usage**: < 1% idle, < 5% active
- **Network bandwidth**: < 50 KB/s

## Integration Points

This WebSocket implementation integrates with:

1. **Agent 1 (CEF Browser Core)**: Base browser application
2. **Agent 5 (Database Schema)**: Session ID from sessions table
3. **Agent 6 (Auth Service)**: Session token provider
4. **Agent 7 (WebSocket Server)**: Backend endpoint
5. **Agent 8 (Eye Tracking)**: Sends eye tracking data
6. **Agent 9 (Keystroke Detection)**: Sends keystroke events
7. **Agent 10 (Screen Monitor)**: Sends screen change events

## Troubleshooting

### Connection Issues

- Verify WebSocket URL in `config.h`
- Check firewall allows outbound HTTPS (443)
- Ensure valid session ID
- Check backend server is running

### Build Issues

- Ensure all dependencies are installed
- Verify CEF_ROOT path in CMakeLists.txt
- Check Boost version >= 1.70
- Ensure C++17 support

### Runtime Issues

- Check `blockd_browser.log` for errors
- Enable WebSocket debug logging in `config.h`
- Use mock server to isolate issues
- Verify JavaScript injection in dev console

## Security Considerations

- All WebSocket connections use TLS (wss://)
- Certificate validation is enforced
- No sensitive interview content is transmitted
- Rate limiting prevents abuse
- Session IDs are single-use

## License

Copyright © 2024 Blockd. All rights reserved.

## Contact

For issues and questions, please contact the Blockd development team.
