// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/windows/vm_detector_win.h"

#include <intrin.h>
#include <winreg.h>
#include <algorithm>

#include "base/logging.h"
#include "base/strings/string_util.h"
#include "base/time/time.h"

namespace blocked {

// VMware registry keys
const std::vector<std::wstring> VMDetectorWindows::kVMwareRegistryKeys = {
  L"SOFTWARE\\VMware, Inc.\\VMware Tools",
  L"HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0",
  L"SYSTEM\\ControlSet001\\Services\\vmci",
  L"SYSTEM\\ControlSet001\\Services\\vmhgfs"
};

// VirtualBox registry keys
const std::vector<std::wstring> VMDetectorWindows::kVirtualBoxRegistryKeys = {
  L"SOFTWARE\\Oracle\\VirtualBox Guest Additions",
  L"HARDWARE\\ACPI\\DSDT\\VBOX__",
  L"HARDWARE\\ACPI\\FADT\\VBOX__",
  L"HARDWARE\\ACPI\\RSDT\\VBOX__",
  L"SYSTEM\\ControlSet001\\Services\\VBoxGuest",
  L"SYSTEM\\ControlSet001\\Services\\VBoxMouse",
  L"SYSTEM\\ControlSet001\\Services\\VBoxService"
};

// Hyper-V registry keys
const std::vector<std::wstring> VMDetectorWindows::kHyperVRegistryKeys = {
  L"SOFTWARE\\Microsoft\\Hyper-V\\Guest\\Parameters",
  L"SOFTWARE\\Microsoft\\Virtual Machine\\Guest\\Parameters",
  L"SYSTEM\\ControlSet001\\Services\\vmbus",
  L"SYSTEM\\ControlSet001\\Services\\VMBusHID"
};

// SMBIOS strings for VM detection
const std::vector<std::string> VMDetectorWindows::kVMwareSMBIOSStrings = {
  "VMware", "vmware", "VMWARE"
};

const std::vector<std::string> VMDetectorWindows::kVirtualBoxSMBIOSStrings = {
  "VirtualBox", "VBOX", "Oracle"
};

const std::vector<std::string> VMDetectorWindows::kHyperVSMBIOSStrings = {
  "Microsoft Corporation", "Hyper-V", "Virtual Machine"
};

VMDetectorWindows::VMDetectorWindows() = default;

VMDetectorWindows::~VMDetectorWindows() = default;

bool VMDetectorWindows::IsRunningInVM() {
  if (!detection_complete_) {
    cached_result_ = DetectVM();
    detection_complete_ = true;
  }
  return cached_result_.is_vm;
}

std::string VMDetectorWindows::GetVMType() {
  if (!detection_complete_) {
    cached_result_ = DetectVM();
    detection_complete_ = true;
  }
  return cached_result_.vm_type;
}

VMDetectionResult VMDetectorWindows::DetectVM() {
  VMDetectionResult result;
  result.is_vm = false;
  result.confidence = 0.0;
  std::vector<std::string> evidence;

  // Check 1: CPUID hypervisor bit
  if (CheckCPUID()) {
    result.is_vm = true;
    result.confidence += 0.4;
    evidence.push_back("CPUID hypervisor bit set");
  }

  // Check 2: Registry keys
  if (CheckRegistry()) {
    result.is_vm = true;
    result.confidence += 0.3;
    evidence.push_back("VM-specific registry keys found");
  }

  // Check 3: SMBIOS information
  if (CheckSMBIOS()) {
    result.is_vm = true;
    result.confidence += 0.2;
    evidence.push_back("VM-specific SMBIOS strings found");
  }

  // Check 4: Timing discrepancies
  if (CheckTimingDiscrepancies()) {
    result.confidence += 0.1;
    evidence.push_back("Timing anomalies detected");
  }

  // Determine specific VM type
  VMType vm_type = DetermineVMType();
  switch (vm_type) {
    case VMType::kVMware:
      result.vm_type = "VMware";
      break;
    case VMType::kVirtualBox:
      result.vm_type = "VirtualBox";
      break;
    case VMType::kHyperV:
      result.vm_type = "Hyper-V";
      break;
    case VMType::kParallels:
      result.vm_type = "Parallels";
      break;
    case VMType::kQEMU:
      result.vm_type = "QEMU";
      break;
    case VMType::kXen:
      result.vm_type = "Xen";
      break;
    case VMType::kUnknown:
      result.vm_type = result.is_vm ? "Unknown VM" : "None";
      break;
    default:
      result.vm_type = "None";
      break;
  }

  result.evidence = evidence;

  if (result.is_vm) {
    LOG(WARNING) << "Virtual machine detected: " << result.vm_type
                 << " (confidence: " << result.confidence << ")";
  }

  return result;
}

bool VMDetectorWindows::CheckCPUID() {
  // CPUID instruction with EAX=1
  int cpu_info[4] = {0};
  __cpuid(cpu_info, 1);

  // Check bit 31 of ECX (hypervisor present bit)
  bool hypervisor_present = (cpu_info[2] & (1 << 31)) != 0;

  if (hypervisor_present) {
    // Get hypervisor vendor string (CPUID with EAX=0x40000000)
    __cpuid(cpu_info, 0x40000000);

    char vendor[13];
    memcpy(vendor, &cpu_info[1], 4);
    memcpy(vendor + 4, &cpu_info[2], 4);
    memcpy(vendor + 8, &cpu_info[3], 4);
    vendor[12] = '\0';

    LOG(INFO) << "Hypervisor vendor: " << vendor;
  }

  return hypervisor_present;
}

bool VMDetectorWindows::CheckRegistry() {
  auto check_registry_key = [](const std::wstring& key_path) -> bool {
    HKEY key;
    LONG result = RegOpenKeyExW(HKEY_LOCAL_MACHINE, key_path.c_str(), 0,
                                KEY_READ, &key);
    if (result == ERROR_SUCCESS) {
      RegCloseKey(key);
      return true;
    }
    return false;
  };

  // Check VMware keys
  for (const auto& key : kVMwareRegistryKeys) {
    if (check_registry_key(key)) {
      LOG(INFO) << "Found VMware registry key";
      return true;
    }
  }

  // Check VirtualBox keys
  for (const auto& key : kVirtualBoxRegistryKeys) {
    if (check_registry_key(key)) {
      LOG(INFO) << "Found VirtualBox registry key";
      return true;
    }
  }

  // Check Hyper-V keys
  for (const auto& key : kHyperVRegistryKeys) {
    if (check_registry_key(key)) {
      LOG(INFO) << "Found Hyper-V registry key";
      return true;
    }
  }

  // Check SCSI identifier for VM strings
  HKEY scsi_key;
  if (RegOpenKeyExW(HKEY_LOCAL_MACHINE,
                   L"HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0",
                   0, KEY_READ, &scsi_key) == ERROR_SUCCESS) {
    wchar_t identifier[256];
    DWORD size = sizeof(identifier);

    if (RegQueryValueExW(scsi_key, L"Identifier", nullptr, nullptr,
                        reinterpret_cast<LPBYTE>(identifier), &size) == ERROR_SUCCESS) {
      std::wstring id_str(identifier);
      if (id_str.find(L"VBOX") != std::wstring::npos ||
          id_str.find(L"VMWARE") != std::wstring::npos ||
          id_str.find(L"QEMU") != std::wstring::npos) {
        RegCloseKey(scsi_key);
        return true;
      }
    }
    RegCloseKey(scsi_key);
  }

  return false;
}

bool VMDetectorWindows::CheckSMBIOS() {
  // Read SMBIOS table from registry
  HKEY key;
  if (RegOpenKeyExW(HKEY_LOCAL_MACHINE,
                   L"HARDWARE\\DESCRIPTION\\System\\BIOS",
                   0, KEY_READ, &key) != ERROR_SUCCESS) {
    return false;
  }

  auto check_registry_value = [&](const wchar_t* value_name,
                                  const std::vector<std::string>& patterns) -> bool {
    wchar_t buffer[256];
    DWORD size = sizeof(buffer);

    if (RegQueryValueExW(key, value_name, nullptr, nullptr,
                        reinterpret_cast<LPBYTE>(buffer), &size) == ERROR_SUCCESS) {
      std::string str(buffer, buffer + wcslen(buffer));

      for (const auto& pattern : patterns) {
        if (str.find(pattern) != std::string::npos) {
          return true;
        }
      }
    }
    return false;
  };

  bool found = false;

  // Check SystemManufacturer
  if (check_registry_value(L"SystemManufacturer", kVMwareSMBIOSStrings) ||
      check_registry_value(L"SystemManufacturer", kVirtualBoxSMBIOSStrings) ||
      check_registry_value(L"SystemManufacturer", kHyperVSMBIOSStrings)) {
    found = true;
  }

  // Check SystemProductName
  if (check_registry_value(L"SystemProductName", kVMwareSMBIOSStrings) ||
      check_registry_value(L"SystemProductName", kVirtualBoxSMBIOSStrings) ||
      check_registry_value(L"SystemProductName", kHyperVSMBIOSStrings)) {
    found = true;
  }

  // Check BaseBoardManufacturer
  if (check_registry_value(L"BaseBoardManufacturer", kVMwareSMBIOSStrings) ||
      check_registry_value(L"BaseBoardManufacturer", kVirtualBoxSMBIOSStrings) ||
      check_registry_value(L"BaseBoardManufacturer", kHyperVSMBIOSStrings)) {
    found = true;
  }

  RegCloseKey(key);
  return found;
}

bool VMDetectorWindows::CheckHardware() {
  // Check for VM-specific MAC address prefixes
  // VMware: 00:05:69, 00:0C:29, 00:1C:14, 00:50:56
  // VirtualBox: 08:00:27
  // Hyper-V: 00:15:5D

  // This would require WMI or GetAdaptersInfo, omitted for brevity
  return false;
}

bool VMDetectorWindows::CheckTimingDiscrepancies() {
  // VMs often have timing irregularities due to virtualization overhead
  const int iterations = 10;
  std::vector<int64_t> rdtsc_diffs;

  for (int i = 0; i < iterations; ++i) {
    unsigned long long start = __rdtsc();
    // Perform minimal operation
    volatile int x = 0;
    for (int j = 0; j < 100; ++j) {
      x += j;
    }
    unsigned long long end = __rdtsc();
    rdtsc_diffs.push_back(end - start);
  }

  // Calculate variance
  double mean = 0;
  for (auto diff : rdtsc_diffs) {
    mean += diff;
  }
  mean /= iterations;

  double variance = 0;
  for (auto diff : rdtsc_diffs) {
    variance += (diff - mean) * (diff - mean);
  }
  variance /= iterations;

  // High variance suggests VM (threshold is heuristic)
  return variance > 1000000;
}

VMType VMDetectorWindows::DetermineVMType() {
  // Check registry keys to determine specific VM type
  auto check_key_exists = [](const std::vector<std::wstring>& keys) -> bool {
    for (const auto& key : keys) {
      HKEY h_key;
      if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, key.c_str(), 0, KEY_READ, &h_key) == ERROR_SUCCESS) {
        RegCloseKey(h_key);
        return true;
      }
    }
    return false;
  };

  if (check_key_exists(kVMwareRegistryKeys)) {
    return VMType::kVMware;
  }

  if (check_key_exists(kVirtualBoxRegistryKeys)) {
    return VMType::kVirtualBox;
  }

  if (check_key_exists(kHyperVRegistryKeys)) {
    return VMType::kHyperV;
  }

  // Check CPUID vendor string for more specific detection
  int cpu_info[4] = {0};
  __cpuid(cpu_info, 0x40000000);

  char vendor[13];
  memcpy(vendor, &cpu_info[1], 4);
  memcpy(vendor + 4, &cpu_info[2], 4);
  memcpy(vendor + 8, &cpu_info[3], 4);
  vendor[12] = '\0';

  std::string vendor_str(vendor);
  if (vendor_str.find("VMware") != std::string::npos) {
    return VMType::kVMware;
  } else if (vendor_str.find("VBoxVBox") != std::string::npos) {
    return VMType::kVirtualBox;
  } else if (vendor_str.find("Microsoft Hv") != std::string::npos) {
    return VMType::kHyperV;
  } else if (vendor_str.find("KVMKVMKVM") != std::string::npos) {
    return VMType::kQEMU;
  } else if (vendor_str.find("XenVMMXen") != std::string::npos) {
    return VMType::kXen;
  }

  return VMType::kUnknown;
}

}  // namespace blocked
