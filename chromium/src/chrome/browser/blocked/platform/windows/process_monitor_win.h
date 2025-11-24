// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_WINDOWS_PROCESS_MONITOR_WIN_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_WINDOWS_PROCESS_MONITOR_WIN_H_

#include <windows.h>
#include <tlhelp32.h>
#include <string>
#include <vector>
#include <memory>

#include "base/memory/weak_ptr.h"
#include "base/timer/timer.h"
#include "chrome/browser/blocked/platform/process_monitor.h"

namespace blocked {

struct ProcessInfo {
  DWORD process_id;
  std::wstring process_name;
  std::wstring executable_path;
  std::wstring window_title;
  bool is_visible;
  DWORD parent_process_id;
};

// Windows implementation of process monitoring for security events
class ProcessMonitorWindows : public ProcessMonitor {
 public:
  ProcessMonitorWindows();
  ~ProcessMonitorWindows() override;

  // ProcessMonitor implementation
  void Start() override;
  void Stop() override;
  bool IsRunning() const override;
  std::vector<SuspiciousProcess> GetSuspiciousProcesses() override;

 private:
  // Enumerate all running processes
  std::vector<ProcessInfo> EnumerateProcesses();

  // Check if process is suspicious (screen recorder, VM tools, etc.)
  bool IsSuspiciousProcess(const ProcessInfo& process);

  // Get window title for a process
  std::wstring GetWindowTitle(HWND window);

  // Enumerate windows for a process
  std::vector<HWND> GetProcessWindows(DWORD process_id);

  // Periodic check callback
  void OnCheckTimer();

  // Known suspicious process patterns
  static const std::vector<std::wstring> kScreenRecorderProcesses;
  static const std::vector<std::wstring> kRemoteAccessProcesses;
  static const std::vector<std::wstring> kVirtualMachineProcesses;
  static const std::vector<std::wstring> kAIAssistantProcesses;

  // Check interval (5 seconds)
  base::RepeatingTimer check_timer_;
  bool is_running_ = false;

  base::WeakPtrFactory<ProcessMonitorWindows> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_WINDOWS_PROCESS_MONITOR_WIN_H_
