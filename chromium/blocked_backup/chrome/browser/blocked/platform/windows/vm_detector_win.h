// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_WINDOWS_VM_DETECTOR_WIN_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_WINDOWS_VM_DETECTOR_WIN_H_

#include <windows.h>
#include <string>
#include <vector>

#include "chrome/browser/blocked/platform/vm_detector.h"

namespace blocked {

enum class VMType {
  kNone,
  kVMware,
  kVirtualBox,
  kHyperV,
  kParallels,
  kQEMU,
  kXen,
  kUnknown
};

// Windows implementation of virtual machine detection
class VMDetectorWindows : public VMDetector {
 public:
  VMDetectorWindows();
  ~VMDetectorWindows() override;

  // VMDetector implementation
  bool IsRunningInVM() override;
  std::string GetVMType() override;
  VMDetectionResult DetectVM() override;

 private:
  // Check CPUID for hypervisor bit
  bool CheckCPUID();

  // Check registry for VM-specific keys
  bool CheckRegistry();

  // Check SMBIOS/DMI information
  bool CheckSMBIOS();

  // Check for VM-specific hardware IDs
  bool CheckHardware();

  // Check for timing discrepancies (VM detection heuristic)
  bool CheckTimingDiscrepancies();

  // Get specific VM type based on evidence
  VMType DetermineVMType();

  // Registry keys to check
  static const std::vector<std::wstring> kVMwareRegistryKeys;
  static const std::vector<std::wstring> kVirtualBoxRegistryKeys;
  static const std::vector<std::wstring> kHyperVRegistryKeys;

  // SMBIOS strings to check
  static const std::vector<std::string> kVMwareSMBIOSStrings;
  static const std::vector<std::string> kVirtualBoxSMBIOSStrings;
  static const std::vector<std::string> kHyperVSMBIOSStrings;

  // Cached detection result
  mutable bool detection_complete_ = false;
  mutable VMDetectionResult cached_result_;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_WINDOWS_VM_DETECTOR_WIN_H_
