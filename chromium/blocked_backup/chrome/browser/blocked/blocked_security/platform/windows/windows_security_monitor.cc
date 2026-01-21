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
  // Check system manufacturer and model via WMI-style registry keys.
  // These values are populated from SMBIOS data by Windows.

  const char* registry_paths[] = {
      "HARDWARE\\DESCRIPTION\\System\\BIOS",
      "SYSTEM\\CurrentControlSet\\Control\\SystemInformation",
  };

  const char* value_names[] = {
      "SystemManufacturer",
      "SystemProductName",
      "BIOSVendor",
      "BaseBoardManufacturer",
      "BaseBoardProduct",
  };

  const char* vm_indicators[] = {
      "vmware",
      "virtualbox",
      "vbox",
      "qemu",
      "parallels",
      "xen",
      "hyper-v",
      "microsoft virtual",
      "innotek",
      "oracle vm",
      "kvm",
      "bochs",
      "virtual machine",
  };

  for (const char* path : registry_paths) {
    HKEY key;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, path, 0, KEY_READ, &key) !=
        ERROR_SUCCESS) {
      continue;
    }

    for (const char* value_name : value_names) {
      char buffer[256] = {0};
      DWORD size = sizeof(buffer);
      DWORD type = REG_SZ;

      if (RegQueryValueExA(key, value_name, nullptr, &type,
                           reinterpret_cast<LPBYTE>(buffer),
                           &size) == ERROR_SUCCESS) {
        // Convert to lowercase for comparison.
        std::string value = buffer;
        std::transform(value.begin(), value.end(), value.begin(),
                       [](unsigned char c) { return std::tolower(c); });

        // Check against known VM indicators.
        for (const char* indicator : vm_indicators) {
          if (value.find(indicator) != std::string::npos) {
            LOG(WARNING) << "VM detected via SMBIOS: " << value_name << " = "
                         << buffer;
            RegCloseKey(key);
            return true;
          }
        }
      }
    }

    RegCloseKey(key);
  }

  // Additional check: System firmware table
  // GetSystemFirmwareTable can retrieve raw SMBIOS data.
  DWORD smbios_size = GetSystemFirmwareTable('RSMB', 0, nullptr, 0);
  if (smbios_size > 0) {
    std::vector<BYTE> smbios_data(smbios_size);
    if (GetSystemFirmwareTable('RSMB', 0, smbios_data.data(), smbios_size) ==
        smbios_size) {
      // Parse SMBIOS structures for VM indicators.
      // SMBIOS structure starts after a header.
      // The raw data contains null-terminated strings after each structure.
      std::string smbios_str(reinterpret_cast<char*>(smbios_data.data()),
                             smbios_size);
      std::transform(smbios_str.begin(), smbios_str.end(), smbios_str.begin(),
                     [](unsigned char c) { return std::tolower(c); });

      for (const char* indicator : vm_indicators) {
        if (smbios_str.find(indicator) != std::string::npos) {
          LOG(WARNING) << "VM detected via raw SMBIOS data: " << indicator;
          return true;
        }
      }
    }
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

// Static instance pointer for window procedure callback.
static WindowsSecurityMonitor* g_clipboard_monitor_instance = nullptr;

void WindowsSecurityMonitor::StartClipboardMonitoring() {
  if (clipboard_monitoring_active_) {
    return;
  }

  LOG(INFO) << "Starting clipboard monitoring (Windows)";

  // Create message-only window for clipboard notifications.
  if (!CreateClipboardListenerWindow()) {
    LOG(ERROR) << "Failed to create clipboard listener window";
    return;
  }

  // Register for clipboard format change notifications.
  if (!AddClipboardFormatListener(clipboard_listener_hwnd_)) {
    LOG(ERROR) << "Failed to register clipboard listener, error: "
               << GetLastError();
    DestroyClipboardListenerWindow();
    return;
  }

  clipboard_monitoring_active_ = true;
  LOG(INFO) << "Clipboard monitoring started successfully";
}

void WindowsSecurityMonitor::StopClipboardMonitoring() {
  if (!clipboard_monitoring_active_) {
    return;
  }

  LOG(INFO) << "Stopping clipboard monitoring (Windows)";

  if (clipboard_listener_hwnd_) {
    RemoveClipboardFormatListener(clipboard_listener_hwnd_);
  }

  DestroyClipboardListenerWindow();
  clipboard_monitoring_active_ = false;

  LOG(INFO) << "Clipboard monitoring stopped";
}

bool WindowsSecurityMonitor::CreateClipboardListenerWindow() {
  // Register window class if not already registered.
  if (clipboard_window_class_ == 0) {
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = ClipboardWndProc;
    wc.hInstance = GetModuleHandle(nullptr);
    wc.lpszClassName = L"BlockdClipboardListener";

    clipboard_window_class_ = RegisterClassExW(&wc);
    if (clipboard_window_class_ == 0) {
      DWORD error = GetLastError();
      if (error != ERROR_CLASS_ALREADY_EXISTS) {
        LOG(ERROR) << "Failed to register clipboard window class: " << error;
        return false;
      }
    }
  }

  // Set static instance pointer for callback.
  g_clipboard_monitor_instance = this;

  // Create message-only window (HWND_MESSAGE parent).
  clipboard_listener_hwnd_ = CreateWindowExW(
      0,
      L"BlockdClipboardListener",
      L"Blockd Clipboard Listener",
      0,  // No style needed for message-only window.
      0, 0, 0, 0,
      HWND_MESSAGE,  // Message-only window.
      nullptr,
      GetModuleHandle(nullptr),
      nullptr);

  if (!clipboard_listener_hwnd_) {
    LOG(ERROR) << "Failed to create clipboard listener window: "
               << GetLastError();
    return false;
  }

  return true;
}

void WindowsSecurityMonitor::DestroyClipboardListenerWindow() {
  if (clipboard_listener_hwnd_) {
    DestroyWindow(clipboard_listener_hwnd_);
    clipboard_listener_hwnd_ = nullptr;
  }

  g_clipboard_monitor_instance = nullptr;

  if (clipboard_window_class_ != 0) {
    UnregisterClassW(L"BlockdClipboardListener", GetModuleHandle(nullptr));
    clipboard_window_class_ = 0;
  }
}

// Static window procedure for clipboard listener.
LRESULT CALLBACK WindowsSecurityMonitor::ClipboardWndProc(
    HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
  switch (msg) {
    case WM_CLIPBOARDUPDATE:
      if (g_clipboard_monitor_instance) {
        g_clipboard_monitor_instance->OnClipboardChange();
      }
      return 0;

    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;

    default:
      return DefWindowProcW(hwnd, msg, wParam, lParam);
  }
}

void WindowsSecurityMonitor::OnClipboardChange() {
  // Open clipboard to get contents.
  if (!OpenClipboard(clipboard_listener_hwnd_)) {
    VLOG(1) << "Could not open clipboard";
    return;
  }

  // Check for text content.
  bool has_text = IsClipboardFormatAvailable(CF_UNICODETEXT) ||
                  IsClipboardFormatAvailable(CF_TEXT);

  // Get text content if available (for logging/analysis).
  std::string clipboard_text;
  if (has_text) {
    HANDLE hData = GetClipboardData(CF_UNICODETEXT);
    if (hData) {
      const wchar_t* text = static_cast<const wchar_t*>(GlobalLock(hData));
      if (text) {
        clipboard_text = base::SysWideToUTF8(text);
        GlobalUnlock(hData);
      }
    }
  }

  // Check for suspicious content patterns.
  bool is_suspicious = false;
  std::string detection_reason;

  if (!clipboard_text.empty()) {
    // Check for code-like patterns that might indicate copying from AI.
    if (clipboard_text.length() > 500) {
      // Long text copied - might be AI response.
      is_suspicious = true;
      detection_reason = "large_text_copied";
    }

    // Check for common AI assistant output patterns.
    if (clipboard_text.find("```") != std::string::npos ||
        clipboard_text.find("def ") != std::string::npos ||
        clipboard_text.find("function ") != std::string::npos) {
      is_suspicious = true;
      detection_reason = "code_pattern_detected";
    }
  }

  CloseClipboard();

  if (is_suspicious) {
    LOG(WARNING) << "Suspicious clipboard activity: " << detection_reason
                 << " (length: " << clipboard_text.length() << ")";

    // Report security event would go here.
    // NotifySecurityEvent(SecurityEventType::kClipboardActivity, ...);
  } else {
    VLOG(2) << "Clipboard changed, text length: " << clipboard_text.length();
  }
}

}  // namespace blocked
