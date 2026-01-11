// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_LINUX_SECURITY_MONITOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_LINUX_SECURITY_MONITOR_H_

#include <memory>
#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "chrome/browser/blocked/blocked_security/blocked_security_service.h"

namespace blocked {

class WaylandClipboardMonitor;
class X11ClipboardMonitor;

// Linux-specific security monitoring implementation
class LinuxSecurityMonitor : public BlockedSecurityService::PlatformMonitor {
 public:
  LinuxSecurityMonitor();
  ~LinuxSecurityMonitor() override;

  // PlatformMonitor implementation
  std::vector<ProcessInfo> GetRunningProcesses() override;
  bool IsVirtualMachineDetected() override;
  bool IsScreenRecordingActive() override;
  std::string GetFocusedWindowTitle() override;
  void StartClipboardMonitoring() override;
  void StopClipboardMonitoring() override;

 private:
  // Process enumeration using /proc
  std::vector<ProcessInfo> EnumerateProcessesViaProc();
  bool IsSuspiciousProcess(const std::string& process_name);
  std::string GetProcessName(int pid);
  std::string GetProcessPath(int pid);

  // VM detection methods
  bool CheckDMI();
  bool CheckCPUInfo();
  bool CheckDevices();
  bool CheckProcesses();

  // Screen recording detection (process-based)
  bool CheckScreenRecordingProcesses();

  // X11 window management
  std::string GetFocusedWindowTitleX11();

  bool clipboard_monitoring_active_ = false;

  // Clipboard monitors (X11 or Wayland).
  std::unique_ptr<X11ClipboardMonitor> x11_clipboard_monitor_;
  std::unique_ptr<WaylandClipboardMonitor> wayland_clipboard_monitor_;

  // Callback for clipboard changes.
  void OnClipboardChanged(const std::string& content);

  // Known suspicious processes
  std::vector<std::string> suspicious_processes_ = {
    "obs",
    "simplescreenrecorder",
    "kazam",
    "recordmydesktop",
    "vokoscreen",
    "teamviewer",
    "anydesk",
    "chatgpt",
    "claude"
  };

  // Must be last member for weak pointer safety.
  base::WeakPtrFactory<LinuxSecurityMonitor> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_LINUX_SECURITY_MONITOR_H_
