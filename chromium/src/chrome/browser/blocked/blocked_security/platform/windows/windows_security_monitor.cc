// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_security/platform/windows/windows_security_monitor.h"

#include <dwmapi.h>
#include <psapi.h>
#include <tlhelp32.h>
#include <winreg.h>

#include <algorithm>
#include <cctype>

#include "base/logging.h"
#include "base/strings/string_util.h"
#include "base/strings/sys_string_conversions.h"

#pragma comment(lib, "dwmapi.lib")

namespace blocked {

namespace {

// Convert wstring to lowercase
std::string ToLowerASCII(const std::wstring& input) {
  std::string result = base::SysWideToUTF8(input);
  std::transform(result.begin(), result.end(), result.begin(),
                 [](unsigned char c) { return std::tolower(c); });
  return result;
}

}  // namespace

WindowsSecurityMonitor::WindowsSecurityMonitor() {
  LOG(INFO) << "Windows security monitor initialized";
}

WindowsSecurityMonitor::~WindowsSecurityMonitor() {
  StopClipboardMonitoring();
}

std::vector<ProcessInfo> WindowsSecurityMonitor::GetRunningProcesses() {
  return EnumerateProcesses();
}

std::vector<ProcessInfo> WindowsSecurityMonitor::EnumerateProcesses() {
  std::vector<ProcessInfo> processes;

  // Create snapshot of all processes
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) {
    LOG(ERROR) << "Failed to create process snapshot";
    return processes;
  }

  PROCESSENTRY32W entry = {0};
  entry.dwSize = sizeof(entry);

  if (!Process32FirstW(snapshot, &entry)) {
    CloseHandle(snapshot);
    return processes;
  }

  do {
    std::string process_name = ToLowerASCII(entry.szExeFile);
    bool is_suspicious = IsSuspiciousProcess(process_name);

    if (is_suspicious) {
      // Get full path
      HANDLE process_handle = OpenProcess(
          PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
          FALSE,
          entry.th32ProcessID);

      std::string process_path;
      if (process_handle) {
        wchar_t path_buffer[MAX_PATH];
        if (GetModuleFileNameExW(process_handle, nullptr,
                                  path_buffer, MAX_PATH)) {
          process_path = base::SysWideToUTF8(path_buffer);
        }
        CloseHandle(process_handle);
      }

      ProcessInfo info(process_name, process_path,
                       static_cast<int>(entry.th32ProcessID),
                       is_suspicious);
      processes.push_back(info);

      LOG(WARNING) << "Suspicious process detected: " << process_name
                   << " (PID: " << entry.th32ProcessID << ")";
    }
  } while (Process32NextW(snapshot, &entry));

  CloseHandle(snapshot);
  return processes;
}

bool WindowsSecurityMonitor::IsSuspiciousProcess(
    const std::string& process_name) {
  for (const auto& suspicious : suspicious_processes_) {
    if (process_name.find(suspicious) != std::string::npos) {
      return true;
    }
  }
  return false;
}

bool WindowsSecurityMonitor::IsVirtualMachineDetected() {
  // Multiple detection methods for higher accuracy
  if (CheckCPUID()) {
    LOG(WARNING) << "VM detected via CPUID";
    return true;
  }

  if (CheckRegistry()) {
    LOG(WARNING) << "VM detected via registry";
    return true;
  }

  if (CheckSMBIOS()) {
    LOG(WARNING) << "VM detected via SMBIOS";
    return true;
  }

  if (CheckProcesses()) {
    LOG(WARNING) << "VM detected via processes";
    return true;
  }

  return false;
}

bool WindowsSecurityMonitor::CheckCPUID() {
#if defined(_M_X64) || defined(__x86_64__)
  int cpu_info[4] = {0};
  __cpuid(cpu_info, 1);

  // Check hypervisor bit (bit 31 of ECX)
  return (cpu_info[2] & (1 << 31)) != 0;
#else
  return false;
#endif
}

bool WindowsSecurityMonitor::CheckRegistry() {
  // Check for VMware registry keys
  HKEY key;
  if (RegOpenKeyExA(HKEY_LOCAL_MACHINE,
                    "HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\"
                    "Target Id 0\\Logical Unit Id 0",
                    0, KEY_READ, &key) == ERROR_SUCCESS) {
    char identifier[256];
    DWORD size = sizeof(identifier);
    if (RegQueryValueExA(key, "Identifier", nullptr, nullptr,
                         (LPBYTE)identifier, &size) == ERROR_SUCCESS) {
      std::string id = identifier;
      std::transform(id.begin(), id.end(), id.begin(), ::tolower);

      RegCloseKey(key);

      if (id.find("vmware") != std::string::npos ||
          id.find("vbox") != std::string::npos ||
          id.find("qemu") != std::string::npos) {
        return true;
      }
    } else {
      RegCloseKey(key);
    }
  }

  // Check for VirtualBox registry keys
  if (RegOpenKeyExA(HKEY_LOCAL_MACHINE,
                    "SOFTWARE\\Oracle\\VirtualBox Guest Additions",
                    0, KEY_READ, &key) == ERROR_SUCCESS) {
    RegCloseKey(key);
    return true;
  }

  return false;
}

bool WindowsSecurityMonitor::CheckSMBIOS() {
  // Check system manufacturer via registry
  HKEY key;
  if (RegOpenKeyExA(HKEY_LOCAL_MACHINE,
                    "SYSTEM\\CurrentControlSet\\Services\\mssmbios\\Data",
                    0, KEY_READ, &key) == ERROR_SUCCESS) {
    // SMBIOS data would need to be parsed here
    // Simplified version: just check for known manufacturer strings
    RegCloseKey(key);
  }

  return false;
}

bool WindowsSecurityMonitor::CheckProcesses() {
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) {
    return false;
  }

  PROCESSENTRY32W entry = {0};
  entry.dwSize = sizeof(entry);

  if (!Process32FirstW(snapshot, &entry)) {
    CloseHandle(snapshot);
    return false;
  }

  do {
    std::string process_name = ToLowerASCII(entry.szExeFile);

    for (const auto& vm_process : vm_processes_) {
      if (process_name.find(vm_process) != std::string::npos) {
        CloseHandle(snapshot);
        return true;
      }
    }
  } while (Process32NextW(snapshot, &entry));

  CloseHandle(snapshot);
  return false;
}

bool WindowsSecurityMonitor::IsScreenRecordingActive() {
  if (IsOBSRunning()) {
    return true;
  }

  if (IsCamtasiaRunning()) {
    return true;
  }

  if (CheckDWMCloakedWindows()) {
    return true;
  }

  return false;
}

bool WindowsSecurityMonitor::IsOBSRunning() {
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) {
    return false;
  }

  PROCESSENTRY32W entry = {0};
  entry.dwSize = sizeof(entry);

  if (!Process32FirstW(snapshot, &entry)) {
    CloseHandle(snapshot);
    return false;
  }

  do {
    std::string process_name = ToLowerASCII(entry.szExeFile);
    if (process_name.find("obs") != std::string::npos) {
      CloseHandle(snapshot);
      return true;
    }
  } while (Process32NextW(snapshot, &entry));

  CloseHandle(snapshot);
  return false;
}

bool WindowsSecurityMonitor::IsCamtasiaRunning() {
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) {
    return false;
  }

  PROCESSENTRY32W entry = {0};
  entry.dwSize = sizeof(entry);

  if (!Process32FirstW(snapshot, &entry)) {
    CloseHandle(snapshot);
    return false;
  }

  do {
    std::string process_name = ToLowerASCII(entry.szExeFile);
    if (process_name.find("camtasia") != std::string::npos) {
      CloseHandle(snapshot);
      return true;
    }
  } while (Process32NextW(snapshot, &entry));

  CloseHandle(snapshot);
  return false;
}

bool WindowsSecurityMonitor::CheckDWMCloakedWindows() {
  // Check for cloaked windows (hidden but capturing screen)
  struct EnumData {
    bool found_cloaked;
  } data = {false};

  EnumWindows([](HWND hwnd, LPARAM lParam) -> BOOL {
    auto* data = reinterpret_cast<EnumData*>(lParam);

    // Check if window is cloaked
    int cloaked = 0;
    if (DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED,
                              &cloaked, sizeof(cloaked)) == S_OK) {
      if (cloaked != 0) {
        // Window is cloaked, might be screen recording
        data->found_cloaked = true;
        return FALSE;  // Stop enumeration
      }
    }

    return TRUE;  // Continue enumeration
  }, reinterpret_cast<LPARAM>(&data));

  return data.found_cloaked;
}

std::string WindowsSecurityMonitor::GetFocusedWindowTitle() {
  HWND foreground = GetForegroundWindow();
  if (!foreground) {
    return std::string();
  }

  wchar_t title[256];
  if (GetWindowTextW(foreground, title, sizeof(title) / sizeof(wchar_t)) > 0) {
    return base::SysWideToUTF8(title);
  }

  return std::string();
}

void WindowsSecurityMonitor::StartClipboardMonitoring() {
  if (clipboard_monitoring_active_) {
    return;
  }

  LOG(INFO) << "Starting clipboard monitoring (Windows)";

  // Create invisible window for clipboard monitoring
  // This is a simplified version - full implementation would create a window
  // and register with AddClipboardFormatListener

  clipboard_monitoring_active_ = true;
}

void WindowsSecurityMonitor::StopClipboardMonitoring() {
  if (!clipboard_monitoring_active_) {
    return;
  }

  LOG(INFO) << "Stopping clipboard monitoring (Windows)";

  if (clipboard_listener_hwnd_) {
    RemoveClipboardFormatListener(clipboard_listener_hwnd_);
    clipboard_listener_hwnd_ = nullptr;
  }

  clipboard_monitoring_active_ = false;
}

}  // namespace blocked
