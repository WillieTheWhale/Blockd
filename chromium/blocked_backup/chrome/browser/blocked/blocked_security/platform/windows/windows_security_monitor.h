// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_WINDOWS_WINDOWS_SECURITY_MONITOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_WINDOWS_WINDOWS_SECURITY_MONITOR_H_

#include <windows.h>
#include <memory>
#include <string>
#include <vector>

#include "chrome/browser/blocked/blocked_security/blocked_security_service.h"

namespace blocked {

// Windows-specific security monitoring implementation
class WindowsSecurityMonitor
    : public BlockedSecurityService::PlatformMonitor {
 public:
  WindowsSecurityMonitor();
  ~WindowsSecurityMonitor() override;

  // PlatformMonitor implementation
  std::vector<ProcessInfo> GetRunningProcesses() override;
  bool IsVirtualMachineDetected() override;
  bool IsScreenRecordingActive() override;
  std::string GetFocusedWindowTitle() override;
  void StartClipboardMonitoring() override;
  void StopClipboardMonitoring() override;

 private:
  // Process enumeration
  std::vector<ProcessInfo> EnumerateProcesses();
  bool IsSuspiciousProcess(const std::string& process_name);

  // VM detection methods
  bool CheckCPUID();
  bool CheckRegistry();
  bool CheckSMBIOS();
  bool CheckProcesses();

  // Screen recording detection
  bool IsOBSRunning();
  bool IsCamtasiaRunning();
  bool CheckDWMCloakedWindows();

  // Window management
  static BOOL CALLBACK EnumWindowsCallback(HWND hwnd, LPARAM lParam);

  // Clipboard monitoring
  HWND clipboard_listener_hwnd_ = nullptr;
  bool clipboard_monitoring_active_ = false;
  ATOM clipboard_window_class_ = 0;

  // Clipboard message-only window procedure
  static LRESULT CALLBACK ClipboardWndProc(HWND hwnd, UINT msg,
                                            WPARAM wParam, LPARAM lParam);

  // Create/destroy clipboard listener window
  bool CreateClipboardListenerWindow();
  void DestroyClipboardListenerWindow();

  // Handle clipboard change notification
  void OnClipboardChange();

  // Known suspicious processes
  std::vector<std::string> suspicious_processes_ = {
    "obs64.exe",
    "obs32.exe",
    "obs.exe",
    "camtasia.exe",
    "camtasiastudio.exe",
    "bandicam.exe",
    "fraps.exe",
    "xsplit.broadcaster.exe",
    "teamviewer.exe",
    "anydesk.exe",
    "chrome-remote-desktop-host.exe",
    "chatgpt.exe",
    "claude.exe"
  };

  // Known VM processes
  std::vector<std::string> vm_processes_ = {
    "vmtoolsd.exe",
    "vmwareuser.exe",
    "vboxservice.exe",
    "vboxtray.exe",
    "qemu-ga.exe",
    "parallels-tools-agent.exe"
  };
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_WINDOWS_WINDOWS_SECURITY_MONITOR_H_
