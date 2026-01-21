// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/mac/vm_detector_mac.h"

#import <Foundation/Foundation.h>
#import <IOKit/IOKitLib.h>
#include <sys/sysctl.h>
#include <algorithm>

#include "base/logging.h"
#include "base/strings/sys_string_conversions.h"

namespace blocked {

const std::vector<std::string> VMDetectorMac::kVMwareIOStrings = {
  "VMware", "vmware", "VMWARE"
};

const std::vector<std::string> VMDetectorMac::kVirtualBoxIOStrings = {
  "VirtualBox", "VBOX", "Oracle"
};

const std::vector<std::string> VMDetectorMac::kParallelsIOStrings = {
  "Parallels", "prl", "Parallels Software"
};

VMDetectorMac::VMDetectorMac() = default;

VMDetectorMac::~VMDetectorMac() = default;

bool VMDetectorMac::IsRunningInVM() {
  if (!detection_complete_) {
    cached_result_ = DetectVM();
    detection_complete_ = true;
  }
  return cached_result_.is_vm;
}

std::string VMDetectorMac::GetVMType() {
  if (!detection_complete_) {
    cached_result_ = DetectVM();
    detection_complete_ = true;
  }
  return cached_result_.vm_type;
}

VMDetectionResult VMDetectorMac::DetectVM() {
  VMDetectionResult result;
  result.is_vm = false;
  result.confidence = 0.0;
  std::vector<std::string> evidence;

  // Check 1: IORegistry
  if (CheckIORegistry()) {
    result.is_vm = true;
    result.confidence += 0.5;
    evidence.push_back("VM indicators in IORegistry");
  }

  // Check 2: sysctl hw.model
  if (CheckSysctl()) {
    result.is_vm = true;
    result.confidence += 0.3;
    evidence.push_back("VM indicators in sysctl");
  }

  // Check 3: Hardware model
  if (CheckHardwareModel()) {
    result.is_vm = true;
    result.confidence += 0.2;
    evidence.push_back("VM-specific hardware model");
  }

  // Determine specific VM type
  result.vm_type = DetermineVMType();
  result.evidence = evidence;

  if (result.is_vm) {
    LOG(WARNING) << "Virtual machine detected: " << result.vm_type
                 << " (confidence: " << result.confidence << ")";
  }

  return result;
}

bool VMDetectorMac::CheckIORegistry() {
  @autoreleasepool {
    // Get IOPlatformExpertDevice
    io_service_t platform_expert = IOServiceGetMatchingService(
        kIOMasterPortDefault,
        IOServiceMatching("IOPlatformExpertDevice"));

    if (!platform_expert) {
      return false;
    }

    // Check manufacturer
    CFTypeRef manufacturer = IORegistryEntryCreateCFProperty(
        platform_expert,
        CFSTR("manufacturer"),
        kCFAllocatorDefault,
        0);

    bool is_vm = false;

    if (manufacturer) {
      NSString* manufacturer_str = (__bridge NSString*)manufacturer;
      std::string manufacturer_cpp = base::SysNSStringToUTF8(manufacturer_str);

      // Check against known VM manufacturers
      auto check_contains = [&](const std::vector<std::string>& patterns) {
        for (const auto& pattern : patterns) {
          if (manufacturer_cpp.find(pattern) != std::string::npos) {
            return true;
          }
        }
        return false;
      };

      is_vm = check_contains(kVMwareIOStrings) ||
              check_contains(kVirtualBoxIOStrings) ||
              check_contains(kParallelsIOStrings);

      CFRelease(manufacturer);
    }

    // Check model
    CFTypeRef model = IORegistryEntryCreateCFProperty(
        platform_expert,
        CFSTR("model"),
        kCFAllocatorDefault,
        0);

    if (model) {
      NSString* model_str = (__bridge NSString*)model;
      std::string model_cpp = base::SysNSStringToUTF8(model_str);

      if (model_cpp.find("VMware") != std::string::npos ||
          model_cpp.find("VirtualBox") != std::string::npos ||
          model_cpp.find("Parallels") != std::string::npos) {
        is_vm = true;
      }

      CFRelease(model);
    }

    IOObjectRelease(platform_expert);
    return is_vm;
  }
}

bool VMDetectorMac::CheckSysctl() {
  // Check hw.model
  char model[256];
  size_t size = sizeof(model);

  if (sysctlbyname("hw.model", model, &size, nullptr, 0) == 0) {
    std::string model_str(model);

    if (model_str.find("VMware") != std::string::npos ||
        model_str.find("VirtualBox") != std::string::npos ||
        model_str.find("Parallels") != std::string::npos ||
        model_str.find("QEMU") != std::string::npos) {
      LOG(INFO) << "VM detected in hw.model: " << model_str;
      return true;
    }
  }

  // Check machdep.cpu.brand_string
  char cpu_brand[256];
  size = sizeof(cpu_brand);

  if (sysctlbyname("machdep.cpu.brand_string", cpu_brand, &size, nullptr, 0) == 0) {
    std::string cpu_str(cpu_brand);

    // Some VMs expose themselves in CPU brand
    if (cpu_str.find("Virtual") != std::string::npos ||
        cpu_str.find("QEMU") != std::string::npos) {
      LOG(INFO) << "VM detected in CPU brand: " << cpu_str;
      return true;
    }
  }

  return false;
}

bool VMDetectorMac::CheckHardwareModel() {
  @autoreleasepool {
    // Use system_profiler to get hardware info
    NSTask* task = [[NSTask alloc] init];
    [task setLaunchPath:@"/usr/sbin/system_profiler"];
    [task setArguments:@[@"SPHardwareDataType"]];

    NSPipe* pipe = [NSPipe pipe];
    [task setStandardOutput:pipe];

    [task launch];
    [task waitUntilExit];

    NSData* data = [[pipe fileHandleForReading] readDataToEndOfFile];
    NSString* output = [[NSString alloc] initWithData:data
                                             encoding:NSUTF8StringEncoding];

    std::string output_str = base::SysNSStringToUTF8(output);

    // Check for VM indicators in hardware info
    return output_str.find("VMware") != std::string::npos ||
           output_str.find("VirtualBox") != std::string::npos ||
           output_str.find("Parallels") != std::string::npos ||
           output_str.find("Virtual Machine") != std::string::npos;
  }
}

bool VMDetectorMac::CheckVMProcesses() {
  // This would check for running VM processes (vmware-tools, VBoxService, etc.)
  // Implementation would use NSRunningApplication or similar
  // Omitted for brevity as it's covered by ProcessMonitorMac
  return false;
}

std::string VMDetectorMac::DetermineVMType() {
  @autoreleasepool {
    // Check IORegistry manufacturer
    io_service_t platform_expert = IOServiceGetMatchingService(
        kIOMasterPortDefault,
        IOServiceMatching("IOPlatformExpertDevice"));

    if (!platform_expert) {
      return "None";
    }

    CFTypeRef manufacturer = IORegistryEntryCreateCFProperty(
        platform_expert,
        CFSTR("manufacturer"),
        kCFAllocatorDefault,
        0);

    std::string vm_type = "None";

    if (manufacturer) {
      NSString* manufacturer_str = (__bridge NSString*)manufacturer;
      std::string manufacturer_cpp = base::SysNSStringToUTF8(manufacturer_str);

      if (manufacturer_cpp.find("VMware") != std::string::npos) {
        vm_type = "VMware Fusion";
      } else if (manufacturer_cpp.find("VirtualBox") != std::string::npos ||
                 manufacturer_cpp.find("Oracle") != std::string::npos) {
        vm_type = "VirtualBox";
      } else if (manufacturer_cpp.find("Parallels") != std::string::npos) {
        vm_type = "Parallels Desktop";
      } else if (manufacturer_cpp.find("QEMU") != std::string::npos) {
        vm_type = "QEMU";
      } else if (manufacturer_cpp.find("Xen") != std::string::npos) {
        vm_type = "Xen";
      }

      CFRelease(manufacturer);
    }

    IOObjectRelease(platform_expert);
    return vm_type;
  }
}

}  // namespace blocked
