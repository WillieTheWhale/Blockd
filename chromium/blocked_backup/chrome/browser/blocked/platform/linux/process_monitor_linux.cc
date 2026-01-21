// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/linux/process_monitor_linux.h"

#include <dirent.h>
#include <unistd.h>
#include <algorithm>
#include <fstream>

#include "base/files/file_util.h"
#include "base/logging.h"
#include "base/strings/string_util.h"
#include "base/time/time.h"

namespace blocked {

// Known suspicious processes for Linux
const std::vector<std::string> ProcessMonitorLinux::kScreenRecorderProcesses = {
  "obs",
  "simplescreenrecorder",
  "kazam",
  "recordmydesktop",
  "vokoscreen",
  "ffmpeg",  // Often used for screen recording
  "screenkey",
  "peek",
  "green-recorder"
};

const std::vector<std::string> ProcessMonitorLinux::kRemoteAccessProcesses = {
  "teamviewer",
  "anydesk",
  "x11vnc",
  "vncviewer",
  "remmina",
  "tigervnc",
  "chrome-remote-desktop"
};

const std::vector<std::string> ProcessMonitorLinux::kVirtualMachineProcesses = {
  "qemu",
  "qemu-system-x86_64",
  "VBoxClient",
  "VBoxService",
  "vmware-vmblock-fuse",
  "vmtoolsd"
};

const std::vector<std::string> ProcessMonitorLinux::kAIAssistantProcesses = {
  "chatgpt",
  "claude",
  "copilot"
};

ProcessMonitorLinux::ProcessMonitorLinux() = default;

ProcessMonitorLinux::~ProcessMonitorLinux() {
  Stop();
}

void ProcessMonitorLinux::Start() {
  if (is_running_) {
    return;
  }

  LOG(INFO) << "Starting Linux process monitor";
  is_running_ = true;

  // Initial check
  OnCheckTimer();

  // Start periodic checks every 5 seconds
  check_timer_.Start(FROM_HERE, base::Seconds(5),
                     base::BindRepeating(&ProcessMonitorLinux::OnCheckTimer,
                                        weak_factory_.GetWeakPtr()));
}

void ProcessMonitorLinux::Stop() {
  if (!is_running_) {
    return;
  }

  LOG(INFO) << "Stopping Linux process monitor";
  check_timer_.Stop();
  is_running_ = false;
}

bool ProcessMonitorLinux::IsRunning() const {
  return is_running_;
}

std::vector<SuspiciousProcess> ProcessMonitorLinux::GetSuspiciousProcesses() {
  std::vector<SuspiciousProcess> suspicious;
  std::vector<ProcessInfoLinux> processes = EnumerateProcesses();

  for (const auto& process : processes) {
    if (IsSuspiciousProcess(process)) {
      SuspiciousProcess sp;
      sp.process_id = process.process_id;
      sp.process_name = process.process_name;
      sp.executable_path = process.executable_path;

      // Categorize
      if (std::find(kScreenRecorderProcesses.begin(),
                   kScreenRecorderProcesses.end(),
                   process.process_name) != kScreenRecorderProcesses.end()) {
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

std::vector<ProcessInfoLinux> ProcessMonitorLinux::EnumerateProcesses() {
  std::vector<ProcessInfoLinux> processes;

  DIR* proc_dir = opendir("/proc");
  if (!proc_dir) {
    LOG(ERROR) << "Failed to open /proc directory";
    return processes;
  }

  struct dirent* entry;
  while ((entry = readdir(proc_dir)) != nullptr) {
    // Check if directory name is numeric (PID)
    if (entry->d_type != DT_DIR) {
      continue;
    }

    std::string dir_name = entry->d_name;
    if (dir_name.find_first_not_of("0123456789") != std::string::npos) {
      continue;
    }

    pid_t pid = std::stoi(dir_name);

    ProcessInfoLinux info;
    info.process_id = pid;
    info.is_running = true;

    // Read /proc/[pid]/comm for process name
    std::string comm_path = "/proc/" + dir_name + "/comm";
    std::ifstream comm_file(comm_path);
    if (comm_file.is_open()) {
      std::getline(comm_file, info.process_name);
      comm_file.close();
    }

    // Read command line
    info.cmdline = ReadProcessCmdline(pid);

    // Read executable path
    info.executable_path = ReadProcessExe(pid);

    processes.push_back(info);
  }

  closedir(proc_dir);
  return processes;
}

bool ProcessMonitorLinux::IsSuspiciousProcess(const ProcessInfoLinux& process) {
  // Check process name
  auto check_in_list = [&](const std::vector<std::string>& list) {
    for (const auto& pattern : list) {
      if (process.process_name.find(pattern) != std::string::npos ||
          process.cmdline.find(pattern) != std::string::npos) {
        return true;
      }
    }
    return false;
  };

  return check_in_list(kScreenRecorderProcesses) ||
         check_in_list(kRemoteAccessProcesses) ||
         check_in_list(kVirtualMachineProcesses) ||
         check_in_list(kAIAssistantProcesses);
}

std::string ProcessMonitorLinux::ReadProcessCmdline(pid_t pid) {
  std::string cmdline_path = "/proc/" + std::to_string(pid) + "/cmdline";
  std::ifstream cmdline_file(cmdline_path);

  if (!cmdline_file.is_open()) {
    return "";
  }

  std::string cmdline;
  std::getline(cmdline_file, cmdline, '\0');  // Arguments separated by null bytes
  cmdline_file.close();

  // Replace null bytes with spaces
  std::replace(cmdline.begin(), cmdline.end(), '\0', ' ');

  return cmdline;
}

std::string ProcessMonitorLinux::ReadProcessExe(pid_t pid) {
  std::string exe_path = "/proc/" + std::to_string(pid) + "/exe";

  char link_target[PATH_MAX];
  ssize_t len = readlink(exe_path.c_str(), link_target, sizeof(link_target) - 1);

  if (len == -1) {
    return "";
  }

  link_target[len] = '\0';
  return std::string(link_target);
}

void ProcessMonitorLinux::OnCheckTimer() {
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
