// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_MACOS_MACOS_SECURITY_MONITOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_MACOS_MACOS_SECURITY_MONITOR_H_

#include <memory>
#include <string>
#include <vector>

#include "chrome/browser/blocked/blocked_security/blocked_security_service.h"

namespace blocked {

// macOS-specific security monitoring implementation
class MacSecurityMonitor : public BlockedSecurityService::PlatformMonitor {
 public:
  MacSecurityMonitor();
  ~MacSecurityMonitor() override;

  // PlatformMonitor implementation
  std::vector<ProcessInfo> GetRunningProcesses() override;
  bool IsVirtualMachineDetected() override;
  bool IsScreenRecordingActive() override;
  std::string GetFocusedWindowTitle() override;
  void StartClipboardMonitoring() override;
  void StopClipboardMonitoring() override;

 private:
  // Process enumeration using sysctl
  std::vector<ProcessInfo> EnumerateProcessesViaSysctl();
  bool IsSuspiciousProcess(const std::string& process_name);

  // VM detection methods
  bool CheckIORegistry();
  bool CheckSystemModel();
  bool CheckProcesses();

  // Screen recording detection
  bool CheckCGWindows();

  bool clipboard_monitoring_active_ = false;

  // Known suspicious processes
  std::vector<std::string> suspicious_processes_ = {
    "obs",
    "quicktime player",
    "screen recording",
    "camtasia",
    "teamviewer",
    "anydesk",
    "chatgpt",
    "claude"
  };
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_MACOS_MACOS_SECURITY_MONITOR_H_
