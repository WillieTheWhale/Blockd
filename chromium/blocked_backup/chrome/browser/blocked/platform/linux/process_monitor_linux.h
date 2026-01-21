// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_LINUX_PROCESS_MONITOR_LINUX_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_LINUX_PROCESS_MONITOR_LINUX_H_

#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "base/timer/timer.h"
#include "chrome/browser/blocked/platform/process_monitor.h"

namespace blocked {

struct ProcessInfoLinux {
  pid_t process_id;
  std::string process_name;
  std::string cmdline;
  std::string executable_path;
  bool is_running;
};

// Linux implementation of process monitoring for security events
class ProcessMonitorLinux : public ProcessMonitor {
 public:
  ProcessMonitorLinux();
  ~ProcessMonitorLinux() override;

  // ProcessMonitor implementation
  void Start() override;
  void Stop() override;
  bool IsRunning() const override;
  std::vector<SuspiciousProcess> GetSuspiciousProcesses() override;

 private:
  // Enumerate all running processes from /proc
  std::vector<ProcessInfoLinux> EnumerateProcesses();

  // Check if process is suspicious
  bool IsSuspiciousProcess(const ProcessInfoLinux& process);

  // Read process command line
  std::string ReadProcessCmdline(pid_t pid);

  // Read process executable path
  std::string ReadProcessExe(pid_t pid);

  // Periodic check callback
  void OnCheckTimer();

  // Known suspicious process patterns
  static const std::vector<std::string> kScreenRecorderProcesses;
  static const std::vector<std::string> kRemoteAccessProcesses;
  static const std::vector<std::string> kVirtualMachineProcesses;
  static const std::vector<std::string> kAIAssistantProcesses;

  base::RepeatingTimer check_timer_;
  bool is_running_ = false;

  base::WeakPtrFactory<ProcessMonitorLinux> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_LINUX_PROCESS_MONITOR_LINUX_H_
