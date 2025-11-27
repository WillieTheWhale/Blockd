// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_MAC_VM_DETECTOR_MAC_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_MAC_VM_DETECTOR_MAC_H_

#include <string>
#include <vector>

#include "chrome/browser/blocked/platform/vm_detector.h"

namespace blocked {

// macOS implementation of virtual machine detection
class VMDetectorMac : public VMDetector {
 public:
  VMDetectorMac();
  ~VMDetectorMac() override;

  // VMDetector implementation
  bool IsRunningInVM() override;
  std::string GetVMType() override;
  VMDetectionResult DetectVM() override;

 private:
  // Check IOKit registry for VM indicators
  bool CheckIORegistry();

  // Check sysctl for VM indicators
  bool CheckSysctl();

  // Check hardware model
  bool CheckHardwareModel();

  // Check for VM-specific processes
  bool CheckVMProcesses();

  // Determine specific VM type
  std::string DetermineVMType();

  // Known VM manufacturers in IORegistry
  static const std::vector<std::string> kVMwareIOStrings;
  static const std::vector<std::string> kVirtualBoxIOStrings;
  static const std::vector<std::string> kParallelsIOStrings;

  // Cached detection result
  mutable bool detection_complete_ = false;
  mutable VMDetectionResult cached_result_;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_MAC_VM_DETECTOR_MAC_H_
