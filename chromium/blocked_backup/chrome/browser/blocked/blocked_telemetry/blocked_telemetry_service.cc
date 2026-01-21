// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_telemetry/blocked_telemetry_service.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/process/process_metrics.h"
#include "base/system/sys_info.h"
#include "build/build_config.h"

#if BUILDFLAG(IS_WIN)
#include <windows.h>
#include <psapi.h>
#include <tlhelp32.h>
#elif BUILDFLAG(IS_MAC)
#include <sys/sysctl.h>
#import <Cocoa/Cocoa.h>
#elif BUILDFLAG(IS_LINUX)
#include <dirent.h>
#include <cstring>
#endif

#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_list.h"
#include "ui/views/widget/widget.h"

namespace blocked {

namespace {
constexpr base::TimeDelta kCollectionInterval = base::Seconds(5);
}

TelemetryData::TelemetryData() = default;
TelemetryData::~TelemetryData() = default;

BlockedTelemetryService::BlockedTelemetryService() {
  LOG(INFO) << "Telemetry service initialized";
}

BlockedTelemetryService::~BlockedTelemetryService() {
  StopCollection();
}

void BlockedTelemetryService::Shutdown() {
  StopCollection();
}

void BlockedTelemetryService::StartCollection() {
  if (is_collecting_)
    return;

  LOG(INFO) << "Starting telemetry collection";
  is_collecting_ = true;

  CollectTelemetry();
  collection_timer_.Start(FROM_HERE, kCollectionInterval,
                          base::BindRepeating(
                              &BlockedTelemetryService::CollectTelemetry,
                              weak_factory_.GetWeakPtr()));
}

void BlockedTelemetryService::StopCollection() {
  if (!is_collecting_)
    return;

  LOG(INFO) << "Stopping telemetry collection";
  is_collecting_ = false;
  collection_timer_.Stop();
}

std::vector<TelemetryData> BlockedTelemetryService::GetRecentData(
    size_t max_count) const {
  if (max_count >= recent_data_.size())
    return recent_data_;

  return std::vector<TelemetryData>(recent_data_.end() - max_count,
                                    recent_data_.end());
}

void BlockedTelemetryService::CollectTelemetry() {
  TelemetryData data;
  data.timestamp = base::Time::Now();
  data.cpu_percent = GetCPUUsage();
  data.memory_mb = GetMemoryUsage();
  data.active_processes = GetActiveProcessCount();
  data.window_focused = IsWindowFocused();

  recent_data_.push_back(data);
  if (recent_data_.size() > max_recent_data_) {
    recent_data_.erase(recent_data_.begin());
  }

  VLOG(2) << "Telemetry: CPU=" << data.cpu_percent << "% Memory="
          << data.memory_mb << "MB Processes=" << data.active_processes;
}

double BlockedTelemetryService::GetCPUUsage() {
  std::unique_ptr<base::ProcessMetrics> metrics(
      base::ProcessMetrics::CreateCurrentProcessMetrics());
  return metrics->GetPlatformIndependentCPUUsage();
}

int64_t BlockedTelemetryService::GetMemoryUsage() {
  std::unique_ptr<base::ProcessMetrics> metrics(
      base::ProcessMetrics::CreateCurrentProcessMetrics());
  return metrics->GetWorkingSetSize() / (1024 * 1024);  // Convert to MB
}

int BlockedTelemetryService::GetActiveProcessCount() {
#if BUILDFLAG(IS_WIN)
  // Windows: Use toolhelp32 to enumerate processes.
  int count = 0;
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) {
    LOG(WARNING) << "Failed to create process snapshot";
    return 0;
  }

  PROCESSENTRY32W pe32;
  pe32.dwSize = sizeof(pe32);

  if (Process32FirstW(snapshot, &pe32)) {
    do {
      count++;
    } while (Process32NextW(snapshot, &pe32));
  }

  CloseHandle(snapshot);
  return count;

#elif BUILDFLAG(IS_MAC)
  // macOS: Use sysctl to get process count.
  int mib[4] = {CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0};
  size_t size;

  if (sysctl(mib, 4, nullptr, &size, nullptr, 0) < 0) {
    LOG(WARNING) << "Failed to get process count via sysctl";
    return 0;
  }

  return static_cast<int>(size / sizeof(struct kinfo_proc));

#elif BUILDFLAG(IS_LINUX)
  // Linux: Count directories in /proc that are numeric (PIDs).
  int count = 0;
  DIR* proc_dir = opendir("/proc");
  if (!proc_dir) {
    LOG(WARNING) << "Failed to open /proc directory";
    return 0;
  }

  struct dirent* entry;
  while ((entry = readdir(proc_dir)) != nullptr) {
    // Check if the directory name is a number (PID).
    bool is_pid = true;
    for (const char* p = entry->d_name; *p != '\0'; ++p) {
      if (*p < '0' || *p > '9') {
        is_pid = false;
        break;
      }
    }
    if (is_pid && entry->d_name[0] != '\0') {
      count++;
    }
  }

  closedir(proc_dir);
  return count;

#else
  // Unsupported platform.
  return 0;
#endif
}

bool BlockedTelemetryService::IsWindowFocused() {
  // Check if any Blocked browser window has focus.
  const BrowserList* browser_list = BrowserList::GetInstance();
  if (!browser_list) {
    return false;
  }

  for (Browser* browser : *browser_list) {
    if (!browser) {
      continue;
    }

    // Get the browser's native window.
    gfx::NativeWindow native_window = browser->window()->GetNativeWindow();
    if (!native_window) {
      continue;
    }

#if BUILDFLAG(IS_WIN)
    // Windows: Check if our window is the foreground window.
    HWND hwnd = native_window->GetHost()->GetAcceleratedWidget();
    if (hwnd && GetForegroundWindow() == hwnd) {
      return true;
    }
#elif BUILDFLAG(IS_MAC)
    // macOS: Check if our app is active and the window is key.
    @autoreleasepool {
      NSWindow* ns_window = native_window.GetNativeNSWindow();
      if (ns_window && [ns_window isKeyWindow] &&
          [[NSApplication sharedApplication] isActive]) {
        return true;
      }
    }
#elif BUILDFLAG(IS_LINUX)
    // Linux: Use views::Widget to check focus.
    views::Widget* widget = views::Widget::GetWidgetForNativeWindow(native_window);
    if (widget && widget->IsActive()) {
      return true;
    }
#endif
  }

  return false;
}

}  // namespace blocked
