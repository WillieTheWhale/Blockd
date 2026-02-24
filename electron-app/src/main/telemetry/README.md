# Telemetry Collection Module

This directory contains system metrics collection and reporting.

## Module

### TelemetryCollector (`telemetry-collector.ts`)

Collects system metrics using the `systeminformation` package and sends them to the backend.

**Features:**
- CPU usage percentage
- Memory usage (MB)
- Active process count
- Window focus state
- Battery level (if available)
- Network usage (up/down KB/s)
- Configurable collection interval (default 30s)
- Configurable metric selection
- EventEmitter interface

**Usage:**

```typescript
import { TelemetryCollector, getTelemetryCollector } from './telemetry/telemetry-collector';
import { BackendConnector } from './backend/backend-connector';

// Create collector (or use singleton)
const collector = getTelemetryCollector({
  intervalMs: 30000,
  collectCpu: true,
  collectMemory: true,
  collectProcesses: true,
  collectBattery: true,
  collectNetwork: true,
  collectWindowFocus: true,
});

// Listen for events
collector.on('data-collected', (data) => {
  console.log('Telemetry:', {
    cpu: `${data.cpuPercent.toFixed(1)}%`,
    memory: `${data.memoryMb.toFixed(0)}MB`,
    processes: data.activeProcesses,
    battery: data.batteryLevel ? `${data.batteryLevel}%` : 'N/A',
    focused: data.windowFocused,
    network: `↑${data.networkUpKbps?.toFixed(1)} ↓${data.networkDownKbps?.toFixed(1)} KB/s`,
  });
});

collector.on('error', (error) => {
  console.error('Telemetry error:', error);
});

// Start collection
const connector = new BackendConnector();
const window = BrowserWindow.getFocusedWindow();
collector.start('session-123', connector, window);

// Change interval dynamically
collector.setInterval(60000); // 60 seconds

// Check status
if (collector.isRunning()) {
  console.log('Collector is running');
}

// Get configuration
const config = collector.getConfig();
console.log('Current config:', config);

// Update configuration
collector.updateConfig({
  collectBattery: false,
  collectNetwork: false,
});

// Manual collection (one-time)
const data = await collector.collectOnce();
console.log('Manual collection:', data);

// Stop collection
collector.stop();

// Cleanup
collector.destroy();
```

**Events:**
- `data-collected`: Telemetry data collected and sent
- `error`: Error occurred during collection

**Methods:**
- `start(sessionId, connector, window?)`: Start collecting telemetry
- `stop()`: Stop collecting telemetry
- `isRunning()`: Check if collector is running
- `setInterval(ms)`: Change collection interval
- `getConfig()`: Get current configuration
- `updateConfig(config)`: Update configuration
- `collectOnce()`: Collect data once without sending to backend
- `destroy()`: Clean up resources

**Configuration:**

```typescript
interface TelemetryCollectorConfig {
  intervalMs: number;            // Collection interval (default: 30000)
  collectCpu: boolean;           // Collect CPU usage (default: true)
  collectMemory: boolean;        // Collect memory usage (default: true)
  collectProcesses: boolean;     // Collect process count (default: true)
  collectBattery: boolean;       // Collect battery level (default: true)
  collectNetwork: boolean;       // Collect network usage (default: true)
  collectWindowFocus: boolean;   // Collect window focus (default: true)
}
```

**Telemetry Data:**

```typescript
interface TelemetryData {
  sessionId: string;
  timestamp: number;
  cpuPercent: number;           // 0-100
  memoryMb: number;             // Memory usage in MB
  activeProcesses: number;      // Total process count
  windowFocused: boolean;       // Is window focused
  batteryLevel?: number;        // Battery percentage (0-100), undefined if no battery
  networkUpKbps?: number;       // Upload speed in KB/s
  networkDownKbps?: number;     // Download speed in KB/s
}
```

---

## Integration Example

```typescript
import { SessionManager } from './session/session-manager';
import { TelemetryCollector, getTelemetryCollector } from './telemetry/telemetry-collector';
import { BackendConnector } from './backend/backend-connector';

const connector = new BackendConnector();
const sessionManager = new SessionManager(connector, settingsStore);
const collector = getTelemetryCollector();

// Start telemetry when session starts
sessionManager.on('session-started', (session) => {
  // Check if telemetry is enabled in session settings
  if (session.settings.enableTelemetry) {
    const window = BrowserWindow.getFocusedWindow();

    // Use custom interval from session settings
    const config = {
      intervalMs: session.settings.monitoringIntervalMs,
    };

    collector.updateConfig(config);
    collector.start(session.id, connector, window);

    console.log('Telemetry started');
  }
});

// Stop telemetry when session ends
sessionManager.on('session-ended', () => {
  collector.stop();
  console.log('Telemetry stopped');
});
```

---

## Collected Metrics

### 1. CPU Usage
- **Source**: `systeminformation.currentLoad()`
- **Unit**: Percentage (0-100)
- **Description**: Current CPU load across all cores
- **Update frequency**: Every collection interval

### 2. Memory Usage
- **Source**: `systeminformation.mem()`
- **Unit**: Megabytes (MB)
- **Description**: Currently used system memory
- **Update frequency**: Every collection interval

### 3. Active Processes
- **Source**: `systeminformation.processes()`
- **Unit**: Count
- **Description**: Total number of active processes
- **Update frequency**: Every collection interval
- **Note**: High process count may indicate suspicious activity

### 4. Window Focus
- **Source**: `BrowserWindow.isFocused()`
- **Unit**: Boolean
- **Description**: Whether the app window is currently focused
- **Update frequency**: Every collection interval
- **Note**: Focus loss may indicate user switching away (potential cheating)

### 5. Battery Level
- **Source**: `systeminformation.battery()`
- **Unit**: Percentage (0-100)
- **Description**: Current battery charge level
- **Update frequency**: Every collection interval
- **Note**: Only available on devices with battery (laptops, tablets)

### 6. Network Usage
- **Source**: `systeminformation.networkStats()`
- **Unit**: KB/s (kilobytes per second)
- **Description**: Upload and download speed
- **Update frequency**: Delta between collections
- **Note**: First collection returns 0 (no baseline)

---

## Performance Considerations

### Collection Overhead

The telemetry collector uses asynchronous system calls which have minimal overhead:

- **CPU**: < 1% average
- **Memory**: ~5-10 MB
- **Network**: ~100-500 bytes per collection (JSON payload)

### Recommended Intervals

- **High precision**: 10-15 seconds (increased overhead)
- **Balanced**: 30 seconds (recommended)
- **Low overhead**: 60 seconds (less granular data)

### Optimization Tips

1. **Disable unused metrics**: Turn off battery/network collection on desktop systems
2. **Adjust interval**: Use longer intervals for longer sessions
3. **Batch sending**: Messages are automatically batched by BackendConnector
4. **Error handling**: Handle collection errors gracefully (don't crash)

```typescript
// Optimized configuration for desktop
const desktopConfig = {
  intervalMs: 30000,
  collectCpu: true,
  collectMemory: true,
  collectProcesses: true,
  collectBattery: false,      // Desktop has no battery
  collectNetwork: false,       // Not needed
  collectWindowFocus: true,
};

// Optimized configuration for laptop
const laptopConfig = {
  intervalMs: 30000,
  collectCpu: true,
  collectMemory: true,
  collectProcesses: true,
  collectBattery: true,        // Monitor battery drain
  collectNetwork: true,        // Monitor network usage
  collectWindowFocus: true,
};
```

---

## Error Handling

The collector handles errors gracefully:

```typescript
collector.on('error', (error) => {
  console.error('Telemetry error:', error);

  // Log to file
  logToFile('telemetry-errors.log', error);

  // Don't stop collection - just skip failed metric
  // Collector will try again next interval
});
```

**Common Errors:**
- System information unavailable (VM restrictions)
- Permission denied (macOS security)
- Module not found (missing dependencies)
- Backend connection lost (queued until reconnected)

---

## Data Privacy

The telemetry collector only collects system-level metrics, not user data:

✅ **Collected:**
- System resource usage (CPU, RAM)
- Process count (not process names)
- Window focus state
- Battery level
- Network speed (not traffic content)

❌ **NOT Collected:**
- Process names or paths
- File system access
- Keyboard input
- Mouse movements
- Clipboard content
- Screen content
- Network traffic content

---

## Testing

To test the telemetry collector:

```bash
npm run test:unit -- telemetry
```

Mock systeminformation:

```typescript
import { TelemetryCollector } from './telemetry/telemetry-collector';

jest.mock('systeminformation', () => ({
  currentLoad: jest.fn(() => Promise.resolve({ currentLoad: 45.2 })),
  mem: jest.fn(() => Promise.resolve({ used: 2048 * 1024 * 1024 })),
  processes: jest.fn(() => Promise.resolve({ all: 120 })),
  battery: jest.fn(() => Promise.resolve({ hasBattery: true, percent: 85 })),
  networkStats: jest.fn(() => Promise.resolve([
    { tx_bytes: 1000000, rx_bytes: 5000000 },
  ])),
}));

const collector = new TelemetryCollector();
const data = await collector.collectOnce();

expect(data.cpuPercent).toBe(45.2);
expect(data.memoryMb).toBe(2048);
```

---

## Manual Collection

For debugging or one-time checks:

```typescript
const collector = getTelemetryCollector();

// Collect once without backend
const data = await collector.collectOnce();

console.log('System metrics:', {
  cpu: `${data.cpuPercent.toFixed(1)}%`,
  memory: `${data.memoryMb.toFixed(0)} MB`,
  processes: data.activeProcesses,
  battery: data.batteryLevel ? `${data.batteryLevel}%` : 'N/A',
});
```

---

## Monitoring Dashboard

The backend receives telemetry data and can display it in real-time:

```
┌─────────────────────────────────────┐
│   Session Telemetry                 │
├─────────────────────────────────────┤
│ CPU:       ████████░░ 45.2%         │
│ Memory:    ██████████ 2048 MB       │
│ Processes: 120                      │
│ Battery:   ████████░░ 85%           │
│ Network:   ↑5.2 KB/s ↓12.8 KB/s     │
│ Focus:     ✓ Focused                │
└─────────────────────────────────────┘
```

This helps interviewers monitor:
- System performance issues
- Window focus changes (potential cheating)
- Unusual process count (suspicious software)
- Network spikes (uploading data)
