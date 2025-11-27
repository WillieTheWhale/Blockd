// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/windows/process_monitor_win.h"

#include <psapi.h>
#include <algorithm>

#include "base/logging.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"
#include "base/time/time.h"

namespace blocked {

// Known suspicious processes
const std::vector<std::wstring> ProcessMonitorWindows::kScreenRecorderProcesses = {
  L"obs64.exe",
  L"obs32.exe",
  L"obs.exe",
  L"CamtasiaStudio.exe",
  L"Camtasia.exe",
  L"CamRecorder.exe",
  L"bdcam.exe",  // Bandicam
  L"Bandicam.exe",
  L"Loom.exe",
  L"ScreenToGif.exe",
  L"ShareX.exe",
  L"Fraps.exe",
  L"nvidia-shadowplay.exe",
  L"AMD_Radeon_Software.exe"
};

const std::vector<std::wstring> ProcessMonitorWindows::kRemoteAccessProcesses = {
  L"TeamViewer.exe",
  L"AnyDesk.exe",
  L"RemoteDesktopConnection.exe",
  L"mstsc.exe",
  L"chrome-remote-desktop.exe",
  L"LogMeIn.exe",
  L"VNCViewer.exe"
};

const std::vector<std::wstring> ProcessMonitorWindows::kVirtualMachineProcesses = {
  L"vmtoolsd.exe",  // VMware Tools
  L"VBoxService.exe",  // VirtualBox
  L"VBoxTray.exe",
  L"vmusrvc.exe",  // Parallels
  L"prl_tools.exe"
};

const std::vector<std::wstring> ProcessMonitorWindows::kAIAssistantProcesses = {
  L"ChatGPT.exe",
  L"claude.exe",
  L"Copilot.exe",
  L"Gemini.exe"
};

ProcessMonitorWindows::ProcessMonitorWindows() = default;

ProcessMonitorWindows::~ProcessMonitorWindows() {
  Stop();
}

void ProcessMonitorWindows::Start() {
  if (is_running_) {
    return;
  }

  LOG(INFO) << "Starting Windows process monitor";
  is_running_ = true;

  // Initial check
  OnCheckTimer();

  // Start periodic checks every 5 seconds
  check_timer_.Start(FROM_HERE, base::Seconds(5),
                     base::BindRepeating(&ProcessMonitorWindows::OnCheckTimer,
                                        weak_factory_.GetWeakPtr()));
}

void ProcessMonitorWindows::Stop() {
  if (!is_running_) {
    return;
  }

  LOG(INFO) << "Stopping Windows process monitor";
  check_timer_.Stop();
  is_running_ = false;
}

bool ProcessMonitorWindows::IsRunning() const {
  return is_running_;
}

std::vector<SuspiciousProcess> ProcessMonitorWindows::GetSuspiciousProcesses() {
  std::vector<SuspiciousProcess> suspicious;
  std::vector<ProcessInfo> processes = EnumerateProcesses();

  for (const auto& process : processes) {
    if (IsSuspiciousProcess(process)) {
      SuspiciousProcess sp;
      sp.process_id = process.process_id;
      sp.process_name = base::WideToUTF8(process.process_name);
      sp.executable_path = base::WideToUTF8(process.executable_path);
      sp.window_title = base::WideToUTF8(process.window_title);

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

std::vector<ProcessInfo> ProcessMonitorWindows::EnumerateProcesses() {
  std::vector<ProcessInfo> processes;

  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) {
    LOG(ERROR) << "Failed to create process snapshot";
    return processes;
  }

  PROCESSENTRY32W entry;
  entry.dwSize = sizeof(PROCESSENTRY32W);

  if (!Process32FirstW(snapshot, &entry)) {
    CloseHandle(snapshot);
    return processes;
  }

  do {
    ProcessInfo info;
    info.process_id = entry.th32ProcessID;
    info.process_name = entry.szExeFile;
    info.parent_process_id = entry.th32ParentProcessID;

    // Try to get executable path
    HANDLE process_handle = OpenProcess(
        PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, entry.th32ProcessID);

    if (process_handle) {
      wchar_t path[MAX_PATH];
      if (GetModuleFileNameExW(process_handle, nullptr, path, MAX_PATH)) {
        info.executable_path = path;
      }
      CloseHandle(process_handle);
    }

    // Get window information
    std::vector<HWND> windows = GetProcessWindows(entry.th32ProcessID);
    if (!windows.empty()) {
      info.window_title = GetWindowTitle(windows[0]);
      info.is_visible = IsWindowVisible(windows[0]);
    }

    processes.push_back(info);
  } while (Process32NextW(snapshot, &entry));

  CloseHandle(snapshot);
  return processes;
}

bool ProcessMonitorWindows::IsSuspiciousProcess(const ProcessInfo& process) {
  // Check against known lists
  auto check_in_list = [&](const std::vector<std::wstring>& list) {
    return std::find(list.begin(), list.end(), process.process_name) != list.end();
  };

  return check_in_list(kScreenRecorderProcesses) ||
         check_in_list(kRemoteAccessProcesses) ||
         check_in_list(kVirtualMachineProcesses) ||
         check_in_list(kAIAssistantProcesses);
}

std::wstring ProcessMonitorWindows::GetWindowTitle(HWND window) {
  wchar_t title[256];
  GetWindowTextW(window, title, sizeof(title) / sizeof(wchar_t));
  return std::wstring(title);
}

struct EnumWindowsData {
  DWORD process_id;
  std::vector<HWND>* windows;
};

static BOOL CALLBACK EnumWindowsCallback(HWND window, LPARAM lParam) {
  EnumWindowsData* data = reinterpret_cast<EnumWindowsData*>(lParam);

  DWORD window_process_id;
  GetWindowThreadProcessId(window, &window_process_id);

  if (window_process_id == data->process_id) {
    data->windows->push_back(window);
  }

  return TRUE;
}

std::vector<HWND> ProcessMonitorWindows::GetProcessWindows(DWORD process_id) {
  std::vector<HWND> windows;
  EnumWindowsData data;
  data.process_id = process_id;
  data.windows = &windows;

  EnumWindows(EnumWindowsCallback, reinterpret_cast<LPARAM>(&data));
  return windows;
}

void ProcessMonitorWindows::OnCheckTimer() {
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
