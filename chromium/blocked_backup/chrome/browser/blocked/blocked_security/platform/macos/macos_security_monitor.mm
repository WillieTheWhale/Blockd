// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_security/platform/macos/macos_security_monitor.h"

#import <AppKit/AppKit.h>
#import <Cocoa/Cocoa.h>
#import <IOKit/IOKitLib.h>

#include <sys/sysctl.h>
#include <algorithm>

#include "base/logging.h"
#include "base/strings/string_util.h"
#include "base/strings/sys_string_conversions.h"

namespace blocked {

MacSecurityMonitor::MacSecurityMonitor() {
  LOG(INFO) << "macOS security monitor initialized";
}

MacSecurityMonitor::~MacSecurityMonitor() {
  StopClipboardMonitoring();
}

std::vector<ProcessInfo> MacSecurityMonitor::GetRunningProcesses() {
  return EnumerateProcessesViaSysctl();
}

std::vector<ProcessInfo> MacSecurityMonitor::EnumerateProcessesViaSysctl() {
  std::vector<ProcessInfo> processes;

  // Get list of all processes using sysctl
  int mib[4] = {CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0};
  size_t size;

  if (sysctl(mib, 4, nullptr, &size, nullptr, 0) == -1) {
    LOG(ERROR) << "Failed to get process list size";
    return processes;
  }

  std::vector<kinfo_proc> proc_list(size / sizeof(kinfo_proc));
  if (sysctl(mib, 4, proc_list.data(), &size, nullptr, 0) == -1) {
    LOG(ERROR) << "Failed to get process list";
    return processes;
  }

  size_t count = size / sizeof(kinfo_proc);

  for (size_t i = 0; i < count; ++i) {
    const kinfo_proc& proc = proc_list[i];
    std::string process_name = proc.kp_proc.p_comm;
    std::string process_name_lower = base::ToLowerASCII(process_name);

    if (IsSuspiciousProcess(process_name_lower)) {
      ProcessInfo info(process_name, "",
                       proc.kp_proc.p_pid, true);
      processes.push_back(info);

      LOG(WARNING) << "Suspicious process detected: " << process_name
                   << " (PID: " << proc.kp_proc.p_pid << ")";
    }
  }

  return processes;
}

bool MacSecurityMonitor::IsSuspiciousProcess(
    const std::string& process_name) {
  for (const auto& suspicious : suspicious_processes_) {
    if (process_name.find(suspicious) != std::string::npos) {
      return true;
    }
  }
  return false;
}

bool MacSecurityMonitor::IsVirtualMachineDetected() {
  if (CheckIORegistry()) {
    LOG(WARNING) << "VM detected via IORegistry";
    return true;
  }

  if (CheckSystemModel()) {
    LOG(WARNING) << "VM detected via system model";
    return true;
  }

  if (CheckProcesses()) {
    LOG(WARNING) << "VM detected via processes";
    return true;
  }

  return false;
}

bool MacSecurityMonitor::CheckIORegistry() {
  // Check IOPlatformExpertDevice for VM indicators
  io_service_t service = IOServiceGetMatchingService(
      kIOMasterPortDefault,
      IOServiceMatching("IOPlatformExpertDevice"));

  if (!service) {
    return false;
  }

  CFTypeRef manufacturer = IORegistryEntryCreateCFProperty(
      service,
      CFSTR("manufacturer"),
      kCFAllocatorDefault,
      0);

  CFTypeRef model = IORegistryEntryCreateCFProperty(
      service,
      CFSTR("model"),
      kCFAllocatorDefault,
      0);

  IOObjectRelease(service);

  bool is_vm = false;

  if (manufacturer) {
    NSString* mfg = (__bridge NSString*)manufacturer;
    NSString* mfg_lower = [mfg lowercaseString];

    if ([mfg_lower containsString:@"vmware"] ||
        [mfg_lower containsString:@"virtualbox"] ||
        [mfg_lower containsString:@"parallels"] ||
        [mfg_lower containsString:@"qemu"]) {
      is_vm = true;
    }

    CFRelease(manufacturer);
  }

  if (model) {
    CFRelease(model);
  }

  return is_vm;
}

bool MacSecurityMonitor::CheckSystemModel() {
  char model[256];
  size_t size = sizeof(model);

  if (sysctlbyname("hw.model", model, &size, nullptr, 0) == 0) {
    std::string model_str = model;
    std::string model_lower = base::ToLowerASCII(model_str);

    if (model_lower.find("vmware") != std::string::npos ||
        model_lower.find("virtualbox") != std::string::npos ||
        model_lower.find("parallels") != std::string::npos) {
      return true;
    }
  }

  return false;
}

bool MacSecurityMonitor::CheckProcesses() {
  std::vector<std::string> vm_processes = {
    "vmware-tools",
    "vmtoolsd",
    "vboxservice",
    "parallels-tools",
    "qemu-ga"
  };

  int mib[4] = {CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0};
  size_t size;

  if (sysctl(mib, 4, nullptr, &size, nullptr, 0) == -1) {
    return false;
  }

  std::vector<kinfo_proc> proc_list(size / sizeof(kinfo_proc));
  if (sysctl(mib, 4, proc_list.data(), &size, nullptr, 0) == -1) {
    return false;
  }

  size_t count = size / sizeof(kinfo_proc);

  for (size_t i = 0; i < count; ++i) {
    const kinfo_proc& proc = proc_list[i];
    std::string process_name = base::ToLowerASCII(proc.kp_proc.p_comm);

    for (const auto& vm_process : vm_processes) {
      if (process_name.find(vm_process) != std::string::npos) {
        return true;
      }
    }
  }

  return false;
}

bool MacSecurityMonitor::IsScreenRecordingActive() {
  return CheckCGWindows();
}

bool MacSecurityMonitor::CheckCGWindows() {
  // Check for screen recording using CGWindowListCopyWindowInfo
  CFArrayRef windowList = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly,
      kCGNullWindowID);

  if (!windowList) {
    return false;
  }

  CFIndex count = CFArrayGetCount(windowList);
  bool found_suspicious = false;

  for (CFIndex i = 0; i < count; ++i) {
    CFDictionaryRef windowInfo =
        (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);

    CFNumberRef layer = (CFNumberRef)CFDictionaryGetValue(
        windowInfo,
        kCGWindowLayer);

    if (layer) {
      int layer_value;
      CFNumberGetValue(layer, kCFNumberIntType, &layer_value);

      // Screen recording overlays typically have negative layer values
      if (layer_value < 0) {
        found_suspicious = true;
        break;
      }
    }
  }

  CFRelease(windowList);
  return found_suspicious;
}

std::string MacSecurityMonitor::GetFocusedWindowTitle() {
  @autoreleasepool {
    NSRunningApplication* frontmost =
        [[NSWorkspace sharedWorkspace] frontmostApplication];

    if (frontmost) {
      NSString* name = [frontmost localizedName];
      return base::SysNSStringToUTF8(name);
    }

    return std::string();
  }
}

void MacSecurityMonitor::StartClipboardMonitoring() {
  if (clipboard_monitoring_active_) {
    return;
  }

  LOG(INFO) << "Starting clipboard monitoring (macOS)";

  // Monitor clipboard using NSPasteboard change count
  // This is a simplified version - full implementation would use
  // NSPasteboard and track change count

  clipboard_monitoring_active_ = true;
}

void MacSecurityMonitor::StopClipboardMonitoring() {
  if (!clipboard_monitoring_active_) {
    return;
  }

  LOG(INFO) << "Stopping clipboard monitoring (macOS)";
  clipboard_monitoring_active_ = false;
}

}  // namespace blocked
