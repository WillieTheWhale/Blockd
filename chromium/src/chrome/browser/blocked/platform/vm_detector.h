// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_VM_DETECTOR_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_VM_DETECTOR_H_

#include <string>
#include <vector>

namespace blocked {

struct VMDetectionResult {
  bool is_vm;
  double confidence;  // 0.0 to 1.0
  std::string vm_type;  // "VMware", "VirtualBox", "Hyper-V", etc.
  std::vector<std::string> evidence;  // List of detection indicators
};

// Base class for platform-specific VM detection
class VMDetector {
 public:
  virtual ~VMDetector() = default;

  // Check if running in a virtual machine
  virtual bool IsRunningInVM() = 0;

  // Get specific VM type
  virtual std::string GetVMType() = 0;

  // Get detailed detection results
  virtual VMDetectionResult DetectVM() = 0;
};

// Factory method to create platform-specific detector
std::unique_ptr<VMDetector> CreateVMDetector();

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_VM_DETECTOR_H_
