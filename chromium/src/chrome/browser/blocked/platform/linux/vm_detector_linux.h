// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_LINUX_VM_DETECTOR_LINUX_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_LINUX_VM_DETECTOR_LINUX_H_

#include <string>
#include <vector>

#include "chrome/browser/blocked/platform/vm_detector.h"

namespace blocked {

// Linux implementation of virtual machine detection
class VMDetectorLinux : public VMDetector {
 public:
  VMDetectorLinux();
  ~VMDetectorLinux() override;

  // VMDetector implementation
  bool IsRunningInVM() override;
  std::string GetVMType() override;
  VMDetectionResult DetectVM() override;

 private:
  // Check /sys/class/dmi/id/ files
  bool CheckDMIInfo();

  // Check for hypervisor CPUID flag
  bool CheckCPUID();

  // Check for VM-specific kernel modules
  bool CheckKernelModules();

  // Check for VM-specific devices
  bool CheckDevices();

  // Determine specific VM type
  std::string DetermineVMType();

  // Read DMI file
  std::string ReadDMIFile(const std::string& filename);

  // Cached detection result
  mutable bool detection_complete_ = false;
  mutable VMDetectionResult cached_result_;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_LINUX_VM_DETECTOR_LINUX_H_
