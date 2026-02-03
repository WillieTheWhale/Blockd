// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_security/platform/linux/linux_security_monitor.h"

#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <fstream>

#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/logging.h"
#include "base/strings/string_split.h"
#include "base/strings/string_util.h"

namespace blocked {

LinuxSecurityMonitor::LinuxSecurityMonitor() {
  LOG(INFO) << "Linux security monitor initialized";
}

LinuxSecurityMonitor::~LinuxSecurityMonitor() {
  StopClipboardMonitoring();
}

std::vector<ProcessInfo> LinuxSecurityMonitor::GetRunningProcesses() {
  return EnumerateProcessesViaProc();
}

std::vector<ProcessInfo> LinuxSecurityMonitor::EnumerateProcessesViaProc() {
  std::vector<ProcessInfo> processes;

  DIR* proc_dir = opendir("/proc");
  if (!proc_dir) {
    LOG(ERROR) << "Failed to open /proc directory";
    return processes;
  }

  struct dirent* entry;
  while ((entry = readdir(proc_dir)) != nullptr) {
    // Skip non-numeric directories
    if (entry->d_type != DT_DIR) {
      continue;
    }

    int pid = atoi(entry->d_name);
    if (pid <= 0) {
      continue;
    }

    std::string process_name = GetProcessName(pid);
    if (process_name.empty()) {
      continue;
    }

    std::string process_name_lower = base::ToLowerASCII(process_name);

    if (IsSuspiciousProcess(process_name_lower)) {
      std::string process_path = GetProcessPath(pid);

      ProcessInfo info(process_name, process_path, pid, true);
      processes.push_back(info);

      LOG(WARNING) << "Suspicious process detected: " << process_name
                   << " (PID: " << pid << ")";
    }
  }

  closedir(proc_dir);
  return processes;
}

bool LinuxSecurityMonitor::IsSuspiciousProcess(
    const std::string& process_name) {
  for (const auto& suspicious : suspicious_processes_) {
    if (process_name.find(suspicious) != std::string::npos) {
      return true;
    }
  }
  return false;
}

std::string LinuxSecurityMonitor::GetProcessName(int pid) {
  std::string comm_path = "/proc/" + std::to_string(pid) + "/comm";
  std::string name;

  std::ifstream file(comm_path);
  if (file.is_open()) {
    std::getline(file, name);
    file.close();

    // Remove trailing newline
    if (!name.empty() && name.back() == '\n') {
      name.pop_back();
    }
  }

  return name;
}

std::string LinuxSecurityMonitor::GetProcessPath(int pid) {
  std::string exe_path = "/proc/" + std::to_string(pid) + "/exe";
  char path[PATH_MAX];

  ssize_t len = readlink(exe_path.c_str(), path, sizeof(path) - 1);
  if (len != -1) {
    path[len] = '\0';
    return std::string(path);
  }

  return std::string();
}

bool LinuxSecurityMonitor::IsVirtualMachineDetected() {
  if (CheckDMI()) {
    LOG(WARNING) << "VM detected via DMI";
    return true;
  }

  if (CheckCPUInfo()) {
    LOG(WARNING) << "VM detected via cpuinfo";
    return true;
  }

  if (CheckDevices()) {
    LOG(WARNING) << "VM detected via devices";
    return true;
  }

  if (CheckProcesses()) {
    LOG(WARNING) << "VM detected via processes";
    return true;
  }

  return false;
}

bool LinuxSecurityMonitor::CheckDMI() {
  // Check /sys/class/dmi/id/ for VM indicators
  std::vector<std::string> dmi_files = {
    "/sys/class/dmi/id/product_name",
    "/sys/class/dmi/id/sys_vendor",
    "/sys/class/dmi/id/board_vendor"
  };

  std::vector<std::string> vm_indicators = {
    "vmware", "virtualbox", "qemu", "kvm", "parallels", "xen"
  };

  for (const auto& file_path : dmi_files) {
    std::ifstream file(file_path);
    if (!file.is_open()) {
      continue;
    }

    std::string content;
    std::getline(file, content);
    file.close();

    std::string content_lower = base::ToLowerASCII(content);

    for (const auto& indicator : vm_indicators) {
      if (content_lower.find(indicator) != std::string::npos) {
        return true;
      }
    }
  }

  return false;
}

bool LinuxSecurityMonitor::CheckCPUInfo() {
  std::ifstream file("/proc/cpuinfo");
  if (!file.is_open()) {
    return false;
  }

  std::string line;
  while (std::getline(file, line)) {
    std::string line_lower = base::ToLowerASCII(line);

    if (line_lower.find("hypervisor") != std::string::npos ||
        line_lower.find("vmware") != std::string::npos ||
        line_lower.find("qemu") != std::string::npos ||
        line_lower.find("kvm") != std::string::npos) {
      file.close();
      return true;
    }
  }

  file.close();
  return false;
}

bool LinuxSecurityMonitor::CheckDevices() {
  // Check for VirtualBox devices
  if (access("/dev/vboxguest", F_OK) == 0 ||
      access("/dev/vboxuser", F_OK) == 0) {
    return true;
  }

  // Check for VMware devices
  if (access("/dev/vmci", F_OK) == 0 ||
      access("/dev/vmmon", F_OK) == 0) {
    return true;
  }

  return false;
}

bool LinuxSecurityMonitor::CheckProcesses() {
  std::vector<std::string> vm_processes = {
    "vmtoolsd",
    "vmware-vmblock",
    "vboxservice",
    "vboxclient",
    "qemu-ga"
  };

  DIR* proc_dir = opendir("/proc");
  if (!proc_dir) {
    return false;
  }

  struct dirent* entry;
  while ((entry = readdir(proc_dir)) != nullptr) {
    int pid = atoi(entry->d_name);
    if (pid <= 0) {
      continue;
    }

    std::string process_name = base::ToLowerASCII(GetProcessName(pid));

    for (const auto& vm_process : vm_processes) {
      if (process_name.find(vm_process) != std::string::npos) {
        closedir(proc_dir);
        return true;
      }
    }
  }

  closedir(proc_dir);
  return false;
}

bool LinuxSecurityMonitor::IsScreenRecordingActive() {
  return CheckScreenRecordingProcesses();
}

bool LinuxSecurityMonitor::CheckScreenRecordingProcesses() {
  std::vector<std::string> recording_processes = {
    "obs",
    "simplescreenrecorder",
    "kazam",
    "recordmydesktop",
    "vokoscreen",
    "ffmpeg"  // Often used for screen recording
  };

  DIR* proc_dir = opendir("/proc");
  if (!proc_dir) {
    return false;
  }

  struct dirent* entry;
  while ((entry = readdir(proc_dir)) != nullptr) {
    int pid = atoi(entry->d_name);
    if (pid <= 0) {
      continue;
    }

    std::string process_name = base::ToLowerASCII(GetProcessName(pid));

    for (const auto& recording_process : recording_processes) {
      if (process_name.find(recording_process) != std::string::npos) {
        closedir(proc_dir);
        return true;
      }
    }
  }

  closedir(proc_dir);
  return false;
}

std::string LinuxSecurityMonitor::GetFocusedWindowTitle() {
  return GetFocusedWindowTitleX11();
}

std::string LinuxSecurityMonitor::GetFocusedWindowTitleX11() {
  // This would require X11 library integration
  // Simplified version returns empty string
  // Full implementation would use XGetInputFocus and XGetWindowProperty

  return std::string();
}

void LinuxSecurityMonitor::StartClipboardMonitoring() {
  if (clipboard_monitoring_active_) {
    return;
  }

  LOG(INFO) << "Starting clipboard monitoring (Linux)";

  // Clipboard monitoring on Linux requires X11/Wayland integration
  // This is a simplified version

  clipboard_monitoring_active_ = true;
}

void LinuxSecurityMonitor::StopClipboardMonitoring() {
  if (!clipboard_monitoring_active_) {
    return;
  }

  LOG(INFO) << "Stopping clipboard monitoring (Linux)";
  clipboard_monitoring_active_ = false;
}

}  // namespace blocked
