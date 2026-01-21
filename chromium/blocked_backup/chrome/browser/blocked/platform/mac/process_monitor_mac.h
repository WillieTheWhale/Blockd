// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_MAC_PROCESS_MONITOR_MAC_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_MAC_PROCESS_MONITOR_MAC_H_

#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "base/timer/timer.h"
#include "chrome/browser/blocked/platform/process_monitor.h"

namespace blocked {

struct ProcessInfoMac {
  pid_t process_id;
  std::string process_name;
  std::string bundle_identifier;
  std::string executable_path;
  bool is_running;
};

// macOS implementation of process monitoring for security events
class ProcessMonitorMac : public ProcessMonitor {
 public:
  ProcessMonitorMac();
  ~ProcessMonitorMac() override;

  // ProcessMonitor implementation
  void Start() override;
  void Stop() override;
  bool IsRunning() const override;
  std::vector<SuspiciousProcess> GetSuspiciousProcesses() override;

 private:
  // Enumerate all running processes using sysctl
  std::vector<ProcessInfoMac> EnumerateProcesses();

  // Check if process is suspicious
  bool IsSuspiciousProcess(const ProcessInfoMac& process);

  // Get bundle identifier for a process
  std::string GetBundleIdentifier(pid_t pid);

  // Periodic check callback
  void OnCheckTimer();

  // Known suspicious process patterns
  static const std::vector<std::string> kScreenRecorderProcesses;
  static const std::vector<std::string> kScreenRecorderBundles;
  static const std::vector<std::string> kRemoteAccessProcesses;
  static const std::vector<std::string> kVirtualMachineProcesses;
  static const std::vector<std::string> kAIAssistantProcesses;

  base::RepeatingTimer check_timer_;
  bool is_running_ = false;

  base::WeakPtrFactory<ProcessMonitorMac> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_MAC_PROCESS_MONITOR_MAC_H_
