// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/mac/process_monitor_mac.h"

#import <Cocoa/Cocoa.h>
#include <libproc.h>
#include <sys/sysctl.h>
#include <algorithm>

#include "base/logging.h"
#include "base/strings/sys_string_conversions.h"
#include "base/time/time.h"

namespace blocked {

// Known suspicious processes for macOS
const std::vector<std::string> ProcessMonitorMac::kScreenRecorderProcesses = {
  "QuickTime Player",
  "screencaptureui",
  "ScreenFlow",
  "OBS",
  "obs",
  "Loom",
  "Camtasia",
  "ScreenFlick",
  "Screenium",
  "Kap",
  "recordMyDesktop"
};

const std::vector<std::string> ProcessMonitorMac::kScreenRecorderBundles = {
  "com.apple.QuickTimePlayerX",
  "com.telestream.screenflow",
  "com.obsproject.obs-studio",
  "com.loom.desktop",
  "com.techsmith.camtasia2020",
  "com.araelium.ScreenFlick",
  "com.syniumsoftware.screenium",
  "com.wulkano.kap"
};

const std::vector<std::string> ProcessMonitorMac::kRemoteAccessProcesses = {
  "TeamViewer",
  "AnyDesk",
  "Chrome Remote Desktop",
  "ScreenConnect",
  "LogMeIn",
  "VNC Viewer"
};

const std::vector<std::string> ProcessMonitorMac::kVirtualMachineProcesses = {
  "VMware Fusion",
  "VirtualBox",
  "Parallels Desktop",
  "UTM",
  "QEMU"
};

const std::vector<std::string> ProcessMonitorMac::kAIAssistantProcesses = {
  "ChatGPT",
  "Claude",
  "Copilot"
};

ProcessMonitorMac::ProcessMonitorMac() = default;

ProcessMonitorMac::~ProcessMonitorMac() {
  Stop();
}

void ProcessMonitorMac::Start() {
  if (is_running_) {
    return;
  }

  LOG(INFO) << "Starting macOS process monitor";
  is_running_ = true;

  // Initial check
  OnCheckTimer();

  // Start periodic checks every 5 seconds
  check_timer_.Start(FROM_HERE, base::Seconds(5),
                     base::BindRepeating(&ProcessMonitorMac::OnCheckTimer,
                                        weak_factory_.GetWeakPtr()));
}

void ProcessMonitorMac::Stop() {
  if (!is_running_) {
    return;
  }

  LOG(INFO) << "Stopping macOS process monitor";
  check_timer_.Stop();
  is_running_ = false;
}

bool ProcessMonitorMac::IsRunning() const {
  return is_running_;
}

std::vector<SuspiciousProcess> ProcessMonitorMac::GetSuspiciousProcesses() {
  std::vector<SuspiciousProcess> suspicious;
  std::vector<ProcessInfoMac> processes = EnumerateProcesses();

  for (const auto& process : processes) {
    if (IsSuspiciousProcess(process)) {
      SuspiciousProcess sp;
      sp.process_id = process.process_id;
      sp.process_name = process.process_name;
      sp.executable_path = process.executable_path;

      // Categorize based on bundle identifier or process name
      if (std::find(kScreenRecorderProcesses.begin(),
                   kScreenRecorderProcesses.end(),
                   process.process_name) != kScreenRecorderProcesses.end() ||
          std::find(kScreenRecorderBundles.begin(),
                   kScreenRecorderBundles.end(),
                   process.bundle_identifier) != kScreenRecorderBundles.end()) {
        sp.category = SuspiciousProcessCategory::kScreenRecorder;
        sp.severity = SecurityEventSeverity::kHigh;
      } else if (std::find(kRemoteAccessProcesses.begin(),
                          kRemoteAccessProcesses.end(),
                          process.process_name) != kRemoteAccessProcesses.end()) {
        sp.category = SuspiciousProcessCategory::kRemoteAccess;
        sp.severity = SecurityEventSeverity::kHigh;
      } else if (std::find(kVirtualMachineProcesses.begin(),
                          kVirtualMachineProcesses.end(),
                          process.process_name) != kVirtualMachineProcesses.end()) {
        sp.category = SuspiciousProcessCategory::kVirtualMachine;
        sp.severity = SecurityEventSeverity::kCritical;
      } else if (std::find(kAIAssistantProcesses.begin(),
                          kAIAssistantProcesses.end(),
                          process.process_name) != kAIAssistantProcesses.end()) {
        sp.category = SuspiciousProcessCategory::kAIAssistant;
        sp.severity = SecurityEventSeverity::kCritical;
      }

      suspicious.push_back(sp);
    }
  }

  return suspicious;
}

std::vector<ProcessInfoMac> ProcessMonitorMac::EnumerateProcesses() {
  std::vector<ProcessInfoMac> processes;

  // Get process count
  int mib[4] = {CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0};
  size_t size;

  if (sysctl(mib, 4, nullptr, &size, nullptr, 0) < 0) {
    LOG(ERROR) << "Failed to get process count";
    return processes;
  }

  size_t count = size / sizeof(struct kinfo_proc);

  // Use vector for automatic memory management (RAII).
  // This ensures memory is freed even if an exception occurs.
  std::vector<struct kinfo_proc> proc_list(count);

  if (sysctl(mib, 4, proc_list.data(), &size, nullptr, 0) < 0) {
    LOG(ERROR) << "Failed to get process list";
    return processes;
  }

  // Recalculate count in case it changed.
  count = std::min(count, size / sizeof(struct kinfo_proc));

  for (size_t i = 0; i < count; ++i) {
    ProcessInfoMac info;
    info.process_id = proc_list[i].kp_proc.p_pid;
    info.process_name = proc_list[i].kp_proc.p_comm;
    info.is_running = true;

    // Get executable path
    char path_buffer[PROC_PIDPATHINFO_MAXSIZE];
    if (proc_pidpath(info.process_id, path_buffer, sizeof(path_buffer)) > 0) {
      info.executable_path = path_buffer;
    }

    // Get bundle identifier
    info.bundle_identifier = GetBundleIdentifier(info.process_id);

    processes.push_back(info);
  }

  return processes;
}

bool ProcessMonitorMac::IsSuspiciousProcess(const ProcessInfoMac& process) {
  // Check process name
  auto check_in_list = [&](const std::vector<std::string>& list,
                           const std::string& value) {
    return std::find(list.begin(), list.end(), value) != list.end();
  };

  if (check_in_list(kScreenRecorderProcesses, process.process_name) ||
      check_in_list(kRemoteAccessProcesses, process.process_name) ||
      check_in_list(kVirtualMachineProcesses, process.process_name) ||
      check_in_list(kAIAssistantProcesses, process.process_name)) {
    return true;
  }

  // Check bundle identifier
  if (check_in_list(kScreenRecorderBundles, process.bundle_identifier)) {
    return true;
  }

  return false;
}

std::string ProcessMonitorMac::GetBundleIdentifier(pid_t pid) {
  @autoreleasepool {
    NSRunningApplication* app = [NSRunningApplication
        runningApplicationWithProcessIdentifier:pid];

    if (app && app.bundleIdentifier) {
      return base::SysNSStringToUTF8(app.bundleIdentifier);
    }

    return "";
  }
}

void ProcessMonitorMac::OnCheckTimer() {
  std::vector<SuspiciousProcess> suspicious = GetSuspiciousProcesses();

  if (!suspicious.empty()) {
    LOG(WARNING) << "Detected " << suspicious.size() << " suspicious processes";

    for (const auto& process : suspicious) {
      NotifySecurityEvent(
          SecurityEventType::kSuspiciousProcessDetected,
          process.severity,
          "Suspicious process detected: " + process.process_name,
          {{"process_id", std::to_string(process.process_id)},
           {"process_name", process.process_name},
           {"executable_path", process.executable_path},
           {"category", std::to_string(static_cast<int>(process.category))}});
    }
  }
}

}  // namespace blocked
