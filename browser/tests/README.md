# Blockd Browser Tests

This directory contains unit tests, integration tests, and testing utilities for the Blockd browser WebSocket implementation.

## Contents

- **test_websocket_client.cpp**: C++ unit tests using Google Test
- **mock_ws_server.py**: Python mock WebSocket server for integration testing
- **requirements.txt**: Python dependencies for testing

## Running Tests

### Unit Tests

The C++ unit tests verify the WebSocket client functionality in isolation.

```bash
# Build tests
cd ../build
cmake ..
make -j$(nproc)

# Run all tests
ctest --verbose

# Run specific test
./test_websocket_client --gtest_filter=WebSocketClientTest.ConnectsSuccessfully

# Run with detailed output
./test_websocket_client --gtest_verbose
```

### Integration Tests

Integration tests verify end-to-end communication between the browser and a WebSocket server.

#### Setup

```bash
# Install Python dependencies
pip3 install -r requirements.txt
```

#### Running Mock Server

```bash
# Basic usage
python3 mock_ws_server.py

# Custom port
python3 mock_ws_server.py --port 9000

# Enable debug logging
python3 mock_ws_server.py --debug

# Simulate server commands (alerts, config updates)
python3 mock_ws_server.py --simulate
```

#### Running Browser Tests

1. Start the mock server in one terminal:
   ```bash
   cd tests
   python3 mock_ws_server.py
   ```

2. In another terminal, run the browser:
   ```bash
   cd build
   ./blockd_browser --session-id=test-session-12345 --url=about:blank
   ```

3. Open developer console (F12) and run test commands:
   ```javascript
   // Enable debug mode
   blockdWS.setDebugMode(true);

   // Test eye tracking
   blockdWS.sendEyeTrackingData(0.5, 0.3, 0.85);

   // Test keystroke
   blockdWS.sendKeystrokeEvent('a', 150);

   // Test screen change
   blockdWS.sendScreenChange(2, 'Test Window');

   // Check status
   blockdWS.getStatus().then(console.log);
   ```

4. Verify messages appear in mock server logs

## Test Coverage

### WebSocket Client Tests

- **Initialization**: Client creation, URL parsing, configuration
- **Connection**: Successful connection, SSL/TLS handshake
- **Messaging**: Send events, receive messages, message formatting
- **Queuing**: Message queue when disconnected, queue limits
- **Reconnection**: Automatic reconnection, exponential backoff
- **Heartbeat**: Periodic heartbeat messages
- **Error Handling**: Connection errors, message errors, callbacks
- **Thread Safety**: Concurrent message sending
- **Multiple Clients**: Multiple simultaneous connections

### Mock Server Features

The mock WebSocket server simulates the Blockd backend:

- **Connection Handling**: Accepts WebSocket connections with session ID
- **Message Validation**: Validates JSON message structure
- **Echo Responses**: Echoes messages back for verification
- **Server Commands**: Simulates ALERT, CONFIG_UPDATE messages
- **Event Handling**: Specific handlers for each message type
- **Logging**: Detailed logging of all traffic

### Message Type Coverage

Client to Server:
- ✅ CLIENT_CONNECTED
- ✅ EYE_TRACKING_DATA
- ✅ KEYSTROKE_EVENT
- ✅ SCREEN_CHANGE
- ✅ HEARTBEAT

Server to Client:
- ✅ ALERT
- ✅ CONFIG_UPDATE
- ✅ SESSION_END (manual test)
- ✅ ECHO (test-only)

## Manual Testing Scenarios

### Scenario 1: Normal Operation

1. Start mock server
2. Launch browser with valid session ID
3. Verify CLIENT_CONNECTED message sent
4. Wait 30 seconds, verify HEARTBEAT sent
5. Send test events from console
6. Verify echo responses received

**Expected**: All messages transmitted successfully

### Scenario 2: Reconnection

1. Start mock server
2. Launch browser
3. Verify connection established
4. Stop mock server
5. Restart mock server within 30 seconds
6. Verify browser reconnects automatically
7. Verify queued messages are sent

**Expected**: Automatic reconnection, no message loss

### Scenario 3: Server Commands

1. Start mock server with `--simulate` flag
2. Launch browser
3. Send low confidence eye tracking (< 0.5)
4. Verify ALERT received in console
5. Send screen change with 2 monitors
6. Verify ALERT received

**Expected**: Alerts displayed in console

### Scenario 4: Stress Test

1. Start mock server
2. Launch browser
3. Send rapid eye tracking data (30+ Hz)
4. Send concurrent events from multiple sources
5. Monitor memory and CPU usage
6. Run for 5+ minutes

**Expected**: Stable performance, no crashes, memory stays under 50MB

### Scenario 5: Error Handling

1. Start browser without mock server
2. Verify connection attempts with backoff
3. Verify error callbacks triggered
4. Start mock server mid-attempts
5. Verify connection succeeds

**Expected**: Graceful error handling, automatic recovery

## Debugging Tests

### Enable Verbose Logging

In `config.h`:
```cpp
#define ENABLE_WEBSOCKET_DEBUG_LOGGING true
```

Rebuild and run.

### GDB Debugging

```bash
gdb ./test_websocket_client
(gdb) break WebSocketClient::Connect
(gdb) run
(gdb) continue
```

### Valgrind Memory Check

```bash
valgrind --leak-check=full ./test_websocket_client
```

### Network Traffic Analysis

```bash
# Capture WebSocket traffic
sudo tcpdump -i any -s 0 -w websocket.pcap 'port 8765'

# Analyze with Wireshark
wireshark websocket.pcap
```

## Continuous Integration

For CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Build and Test
  run: |
    cd browser/build
    cmake ..
    make -j$(nproc)

    # Start mock server in background
    cd ../tests
    python3 mock_ws_server.py &
    SERVER_PID=$!
    sleep 2

    # Run tests
    cd ../build
    ctest --output-on-failure

    # Cleanup
    kill $SERVER_PID
```

## Known Issues

1. **CEF Dependency**: Some tests require CEF, which is large (~500MB). Consider mock CEF interfaces for unit tests.

2. **Timing Issues**: Network tests may be flaky due to timing. Increase timeout values if tests fail intermittently.

3. **Port Conflicts**: Ensure port 8765 is available. Use `--port` flag to change.

## Future Improvements

- [ ] Add performance benchmarks
- [ ] Add automated end-to-end tests with Selenium
- [ ] Add WebSocket protocol fuzzing tests
- [ ] Add load testing (multiple concurrent clients)
- [ ] Add tests for SSL/TLS certificate validation
- [ ] Mock CEF interfaces for faster unit tests

## Contributing

When adding new tests:

1. Add test case to `test_websocket_client.cpp`
2. Update test coverage documentation above
3. Ensure test is deterministic (no race conditions)
4. Add descriptive test name: `TEST_F(ClassName, DescriptiveName)`
5. Run all tests before committing

## Support

For test failures or questions:
- Check logs in `blockd_browser.log`
- Review mock server output
- Consult WebSocket protocol documentation
- Contact development team
