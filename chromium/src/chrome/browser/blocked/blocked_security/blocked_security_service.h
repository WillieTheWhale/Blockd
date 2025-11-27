// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_BLOCKED_SECURITY_SERVICE_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_BLOCKED_SECURITY_SERVICE_H_

#include <memory>
#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "base/observer_list.h"
#include "base/sequence_checker.h"
#include "base/time/time.h"
#include "base/timer/timer.h"
#include "components/keyed_service/core/keyed_service.h"

namespace blocked {

// Security event types
enum class SecurityEventType {
  SUSPICIOUS_PROCESS_DETECTED,
  SCREEN_RECORDING_DETECTED,
  WINDOW_FOCUS_LOST,
  VIRTUAL_MACHINE_DETECTED,
  CLIPBOARD_COPY,
  CLIPBOARD_PASTE,
  KEYBOARD_HOOK_DETECTED,
  UNKNOWN_EVENT
};

// Security event severity levels
enum class SecurityEventSeverity {
  LOW,
  MEDIUM,
  HIGH,
  CRITICAL
};

// Represents a single security event
struct SecurityEvent {
  SecurityEventType type;
  SecurityEventSeverity severity;
  base::Time timestamp;
  std::string description;
  std::string metadata;  // JSON-encoded additional data

  SecurityEvent();
  SecurityEvent(SecurityEventType type,
                SecurityEventSeverity severity,
                const std::string& description,
                const std::string& metadata = "");
  ~SecurityEvent();
};

// Process information
struct ProcessInfo {
  std::string name;
  std::string path;
  int pid;
  bool is_suspicious;

  ProcessInfo();
  ProcessInfo(const std::string& name,
              const std::string& path,
              int pid,
              bool is_suspicious = false);
  ~ProcessInfo();
};

// Observer interface for security events
class BlockedSecurityObserver {
 public:
  virtual ~BlockedSecurityObserver() = default;

  // Called when a security event is detected
  virtual void OnSecurityEvent(const SecurityEvent& event) = 0;

  // Called when monitoring state changes
  virtual void OnMonitoringStateChanged(bool is_monitoring) = 0;
};

// Main security monitoring service
// Runs in browser process, coordinates platform-specific monitoring
class BlockedSecurityService : public KeyedService {
 public:
  BlockedSecurityService();
  ~BlockedSecurityService() override;

  // KeyedService implementation
  void Shutdown() override;

  // Start/stop security monitoring
  void StartMonitoring();
  void StopMonitoring();
  bool IsMonitoring() const { return is_monitoring_; }

  // Observer management
  void AddObserver(BlockedSecurityObserver* observer);
  void RemoveObserver(BlockedSecurityObserver* observer);

  // Get recent security events
  std::vector<SecurityEvent> GetRecentEvents(size_t max_count) const;

  // Get current risk level (0.0 - 1.0)
  double GetCurrentRiskLevel() const;

  // Platform-specific checks (exposed for testing)
  std::vector<ProcessInfo> GetRunningProcesses();
  bool IsVirtualMachineDetected();
  bool IsScreenRecordingActive();
  std::string GetFocusedWindowTitle();

 private:
  // Periodic monitoring tasks
  void PerformSecurityCheck();
  void CheckRunningProcesses();
  void CheckWindowFocus();
  void CheckClipboard();

  // Event reporting
  void ReportSecurityEvent(const SecurityEvent& event);
  void UpdateRiskLevel();

  // Platform-specific implementation
  class PlatformMonitor;
  std::unique_ptr<PlatformMonitor> platform_monitor_;

  bool is_monitoring_ = false;
  base::RepeatingTimer monitoring_timer_;

  // Recent events (circular buffer, max 100 events)
  std::vector<SecurityEvent> recent_events_;
  size_t max_recent_events_ = 100;

  // Current risk level (0.0 = safe, 1.0 = critical)
  double current_risk_level_ = 0.0;

  // Last known focused window
  std::string last_focused_window_;

  base::ObserverList<BlockedSecurityObserver> observers_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<BlockedSecurityService> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_BLOCKED_SECURITY_SERVICE_H_
