// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_PROCESS_MONITOR_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_PROCESS_MONITOR_H_

#include <string>
#include <vector>
#include <map>
#include <functional>

namespace blocked {

enum class SuspiciousProcessCategory {
  kScreenRecorder,
  kRemoteAccess,
  kVirtualMachine,
  kAIAssistant,
  kUnknown
};

enum class SecurityEventSeverity {
  kLow,
  kMedium,
  kHigh,
  kCritical
};

enum class SecurityEventType {
  kSuspiciousProcessDetected,
  kWindowFocusChanged,
  kClipboardActivity,
  kScreenRecordingDetected,
  kVirtualMachineDetected
};

struct SuspiciousProcess {
  uint32_t process_id;
  std::string process_name;
  std::string executable_path;
  std::string window_title;
  SuspiciousProcessCategory category;
  SecurityEventSeverity severity;
};

// Base class for platform-specific process monitoring
class ProcessMonitor {
 public:
  virtual ~ProcessMonitor() = default;

  // Start monitoring
  virtual void Start() = 0;

  // Stop monitoring
  virtual void Stop() = 0;

  // Check if monitoring is active
  virtual bool IsRunning() const = 0;

  // Get list of suspicious processes currently running
  virtual std::vector<SuspiciousProcess> GetSuspiciousProcesses() = 0;

  // Set callback for security events
  void SetSecurityEventCallback(
      std::function<void(SecurityEventType, SecurityEventSeverity,
                        const std::string&,
                        const std::map<std::string, std::string>&)> callback) {
    security_event_callback_ = callback;
  }

 protected:
  // Notify about security event
  void NotifySecurityEvent(
      SecurityEventType type,
      SecurityEventSeverity severity,
      const std::string& description,
      const std::map<std::string, std::string>& metadata) {
    if (security_event_callback_) {
      security_event_callback_(type, severity, description, metadata);
    }
  }

 private:
  std::function<void(SecurityEventType, SecurityEventSeverity,
                    const std::string&,
                    const std::map<std::string, std::string>&)>
      security_event_callback_;
};

// Factory method to create platform-specific monitor
std::unique_ptr<ProcessMonitor> CreateProcessMonitor();

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_PROCESS_MONITOR_H_
