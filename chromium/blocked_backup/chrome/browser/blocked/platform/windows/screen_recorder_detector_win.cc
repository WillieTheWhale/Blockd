// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/windows/screen_recorder_detector_win.h"

#include <algorithm>
#include <psapi.h>

#include "base/logging.h"
#include "base/strings/string_util.h"
#include "base/strings/utf_string_conversions.h"

#pragma comment(lib, "dwmapi.lib")

namespace blocked {

const std::vector<std::wstring> ScreenRecorderDetectorWindows::kKnownRecorders = {
  L"obs64.exe",
  L"obs32.exe",
  L"obs.exe",
  L"CamtasiaStudio.exe",
  L"Camtasia.exe",
  L"CamRecorder.exe",
  L"bdcam.exe",
  L"Bandicam.exe",
  L"Loom.exe",
  L"ScreenToGif.exe",
  L"ShareX.exe",
  L"Fraps.exe",
  L"Action.exe",  // Mirillis Action!
  L"D3DGear.exe",
  L"PlayClaw.exe",
  L"XSplit.Broadcaster.exe",
  L"Streamlabs OBS.exe",
  L"nvidia-shadowplay.exe",
  L"AMD_Radeon_Software.exe"
};

const std::vector<std::wstring> ScreenRecorderDetectorWindows::kRecorderWindowClasses = {
  L"Qt5QWindowIcon",  // OBS uses Qt
  L"#32770",  // Common dialog class used by many recorders
};

ScreenRecorderDetectorWindows::ScreenRecorderDetectorWindows() = default;

ScreenRecorderDetectorWindows::~ScreenRecorderDetectorWindows() = default;

bool ScreenRecorderDetectorWindows::IsScreenBeingRecorded() {
  std::vector<ScreenRecorderInfo> recorders = DetectKnownRecorders();
  return !recorders.empty() || HasCloakedWindows();
}

std::vector<RecordingApplication> ScreenRecorderDetectorWindows::GetActiveRecorders() {
  std::vector<RecordingApplication> active_recorders;
  std::vector<ScreenRecorderInfo> detected = DetectKnownRecorders();

  for (const auto& recorder : detected) {
    RecordingApplication app;
    app.application_name = base::WideToUTF8(recorder.process_name);
    app.window_title = base::WideToUTF8(recorder.window_title);
    app.process_id = recorder.process_id;
    app.is_recording = recorder.is_recording;

    active_recorders.push_back(app);
  }

  return active_recorders;
}

std::vector<ScreenRecorderInfo> ScreenRecorderDetectorWindows::DetectKnownRecorders() {
  std::vector<ScreenRecorderInfo> recorders;

  // Enumerate all processes
  DWORD processes[1024];
  DWORD bytes_needed;

  if (!EnumProcesses(processes, sizeof(processes), &bytes_needed)) {
    LOG(ERROR) << "Failed to enumerate processes";
    return recorders;
  }

  DWORD num_processes = bytes_needed / sizeof(DWORD);

  for (DWORD i = 0; i < num_processes; ++i) {
    if (processes[i] == 0) {
      continue;
    }

    HANDLE process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                                 FALSE, processes[i]);
    if (!process) {
      continue;
    }

    wchar_t process_name[MAX_PATH];
    if (GetModuleBaseNameW(process, nullptr, process_name, MAX_PATH)) {
      // Check if this is a known recorder
      auto it = std::find(kKnownRecorders.begin(), kKnownRecorders.end(),
                         std::wstring(process_name));

      if (it != kKnownRecorders.end()) {
        ScreenRecorderInfo info;
        info.process_name = process_name;
        info.process_id = processes[i];
        info.is_recording = true;  // Assume recording if process is running

        // Try to get window title
        struct EnumData {
          DWORD process_id;
          std::wstring* window_title;
        } data;
        data.process_id = processes[i];
        data.window_title = &info.window_title;

        EnumWindows([](HWND window, LPARAM lParam) -> BOOL {
          EnumData* data = reinterpret_cast<EnumData*>(lParam);
          DWORD window_pid;
          GetWindowThreadProcessId(window, &window_pid);

          if (window_pid == data->process_id && IsWindowVisible(window)) {
            wchar_t title[256];
            if (GetWindowTextW(window, title, sizeof(title) / sizeof(wchar_t))) {
              *data->window_title = title;
              return FALSE;  // Stop enumeration
            }
          }
          return TRUE;
        }, reinterpret_cast<LPARAM>(&data));

        info.is_cloaked = false;
        recorders.push_back(info);

        LOG(WARNING) << "Screen recorder detected: "
                    << base::WideToUTF8(process_name);
      }
    }

    CloseHandle(process);
  }

  return recorders;
}

bool ScreenRecorderDetectorWindows::HasCloakedWindows() {
  std::vector<HWND> windows = EnumerateAllWindows();

  for (HWND window : windows) {
    if (IsWindowCloaked(window)) {
      wchar_t class_name[256];
      GetClassNameW(window, class_name, sizeof(class_name) / sizeof(wchar_t));

      wchar_t window_title[256];
      GetWindowTextW(window, window_title, sizeof(window_title) / sizeof(wchar_t));

      LOG(WARNING) << "Cloaked window detected: " << base::WideToUTF8(window_title)
                  << " (class: " << base::WideToUTF8(class_name) << ")";
      return true;
    }
  }

  return false;
}

bool ScreenRecorderDetectorWindows::IsWindowCloaked(HWND window) {
  BOOL is_cloaked = FALSE;

  // DwmGetWindowAttribute with DWMWA_CLOAKED detects hidden windows
  // that are still capturing the screen
  HRESULT hr = DwmGetWindowAttribute(window, DWMWA_CLOAKED,
                                    &is_cloaked, sizeof(is_cloaked));

  if (SUCCEEDED(hr) && is_cloaked) {
    return true;
  }

  return false;
}

struct EnumWindowsData {
  std::vector<HWND>* windows;
};

static BOOL CALLBACK EnumAllWindowsCallback(HWND window, LPARAM lParam) {
  EnumWindowsData* data = reinterpret_cast<EnumWindowsData*>(lParam);
  data->windows->push_back(window);
  return TRUE;
}

std::vector<HWND> ScreenRecorderDetectorWindows::EnumerateAllWindows() {
  std::vector<HWND> windows;
  EnumWindowsData data;
  data.windows = &windows;

  EnumWindows(EnumAllWindowsCallback, reinterpret_cast<LPARAM>(&data));
  return windows;
}

}  // namespace blocked
