// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/linux/vm_detector_linux.h"

#include <fstream>
#include <algorithm>

#include "base/files/file_util.h"
#include "base/logging.h"
#include "base/strings/string_util.h"

namespace blocked {

VMDetectorLinux::VMDetectorLinux() = default;

VMDetectorLinux::~VMDetectorLinux() = default;

bool VMDetectorLinux::IsRunningInVM() {
  if (!detection_complete_) {
    cached_result_ = DetectVM();
    detection_complete_ = true;
  }
  return cached_result_.is_vm;
}

std::string VMDetectorLinux::GetVMType() {
  if (!detection_complete_) {
    cached_result_ = DetectVM();
    detection_complete_ = true;
  }
  return cached_result_.vm_type;
}

VMDetectionResult VMDetectorLinux::DetectVM() {
  VMDetectionResult result;
  result.is_vm = false;
  result.confidence = 0.0;
  std::vector<std::string> evidence;

  // Check 1: DMI information
  if (CheckDMIInfo()) {
    result.is_vm = true;
    result.confidence += 0.4;
    evidence.push_back("VM indicators in DMI");
  }

  // Check 2: CPUID
  if (CheckCPUID()) {
    result.is_vm = true;
    result.confidence += 0.3;
    evidence.push_back("Hypervisor CPUID flag set");
  }

  // Check 3: Kernel modules
  if (CheckKernelModules()) {
    result.is_vm = true;
    result.confidence += 0.2;
    evidence.push_back("VM kernel modules loaded");
  }

  // Check 4: VM devices
  if (CheckDevices()) {
    result.is_vm = true;
    result.confidence += 0.1;
    evidence.push_back("VM-specific devices detected");
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

bool VMDetectorLinux::CheckDMIInfo() {
  // Check various DMI files for VM indicators
  std::vector<std::pair<std::string, std::vector<std::string>>> dmi_checks = {
    {"product_name", {"VMware", "VirtualBox", "QEMU", "KVM", "Bochs", "Xen"}},
    {"sys_vendor", {"VMware", "VirtualBox", "QEMU", "KVM", "innotek GmbH", "Xen"}},
    {"board_vendor", {"VMware", "Oracle Corporation", "QEMU"}},
    {"bios_vendor", {"SeaBIOS", "Phoenix Technologies LTD"}},  // Common in VMs
  };

  for (const auto& check : dmi_checks) {
    std::string content = ReadDMIFile(check.first);

    for (const auto& pattern : check.second) {
      if (content.find(pattern) != std::string::npos) {
        LOG(INFO) << "VM detected in DMI " << check.first << ": " << pattern;
        return true;
      }
    }
  }

  return false;
}

bool VMDetectorLinux::CheckCPUID() {
  // On Linux, we can check /proc/cpuinfo for hypervisor flag
  std::ifstream cpuinfo("/proc/cpuinfo");
  if (!cpuinfo.is_open()) {
    return false;
  }

  std::string line;
  while (std::getline(cpuinfo, line)) {
    if (line.find("flags") != std::string::npos ||
        line.find("Features") != std::string::npos) {
      if (line.find("hypervisor") != std::string::npos) {
        LOG(INFO) << "Hypervisor flag detected in CPU flags";
        cpuinfo.close();
        return true;
      }
    }
  }

  cpuinfo.close();
  return false;
}

bool VMDetectorLinux::CheckKernelModules() {
  // Check for VM-specific kernel modules
  std::ifstream modules("/proc/modules");
  if (!modules.is_open()) {
    return false;
  }

  std::vector<std::string> vm_modules = {
    "vboxguest",
    "vboxsf",
    "vboxvideo",
    "vmw_balloon",
    "vmw_vmci",
    "vmw_vsock_vmci_transport",
    "vmwgfx",
    "virtio",
    "virtio_balloon",
    "virtio_blk",
    "virtio_net",
    "virtio_pci",
    "xen_blkfront",
    "xen_netfront"
  };

  std::string line;
  while (std::getline(modules, line)) {
    for (const auto& vm_module : vm_modules) {
      if (line.find(vm_module) != std::string::npos) {
        LOG(INFO) << "VM kernel module detected: " << vm_module;
        modules.close();
        return true;
      }
    }
  }

  modules.close();
  return false;
}

bool VMDetectorLinux::CheckDevices() {
  // Check for VM-specific devices
  std::vector<std::string> vm_devices = {
    "/dev/vboxguest",
    "/dev/vboxuser",
    "/dev/vmci",
    "/dev/vport*"
  };

  for (const auto& device : vm_devices) {
    if (access(device.c_str(), F_OK) == 0) {
      LOG(INFO) << "VM device detected: " << device;
      return true;
    }
  }

  return false;
}

std::string VMDetectorLinux::DetermineVMType() {
  // Check DMI product name for specific VM type
  std::string product_name = ReadDMIFile("product_name");
  std::string sys_vendor = ReadDMIFile("sys_vendor");

  if (product_name.find("VMware") != std::string::npos ||
      sys_vendor.find("VMware") != std::string::npos) {
    return "VMware";
  }

  if (product_name.find("VirtualBox") != std::string::npos ||
      sys_vendor.find("VirtualBox") != std::string::npos ||
      sys_vendor.find("innotek") != std::string::npos) {
    return "VirtualBox";
  }

  if (product_name.find("KVM") != std::string::npos ||
      product_name.find("QEMU") != std::string::npos) {
    return "KVM/QEMU";
  }

  if (product_name.find("Xen") != std::string::npos ||
      sys_vendor.find("Xen") != std::string::npos) {
    return "Xen";
  }

  if (product_name.find("Bochs") != std::string::npos) {
    return "Bochs";
  }

  // Check kernel modules for more specific detection
  std::ifstream modules("/proc/modules");
  if (modules.is_open()) {
    std::string line;
    while (std::getline(modules, line)) {
      if (line.find("vbox") != std::string::npos) {
        modules.close();
        return "VirtualBox";
      }
      if (line.find("vmw") != std::string::npos) {
        modules.close();
        return "VMware";
      }
      if (line.find("virtio") != std::string::npos) {
        modules.close();
        return "KVM/QEMU";
      }
      if (line.find("xen") != std::string::npos) {
        modules.close();
        return "Xen";
      }
    }
    modules.close();
  }

  return "Unknown VM";
}

std::string VMDetectorLinux::ReadDMIFile(const std::string& filename) {
  std::string path = "/sys/class/dmi/id/" + filename;
  std::ifstream file(path);

  if (!file.is_open()) {
    return "";
  }

  std::string content;
  std::getline(file, content);
  file.close();

  return content;
}

}  // namespace blocked
