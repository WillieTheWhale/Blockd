// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_LINUX_SCREEN_RECORDER_DETECTOR_LINUX_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_LINUX_SCREEN_RECORDER_DETECTOR_LINUX_H_

#include <string>
#include <vector>

#include "chrome/browser/blocked/platform/screen_recorder_detector.h"

namespace blocked {

// Linux implementation of screen recording detection
class ScreenRecorderDetectorLinux : public ScreenRecorderDetector {
 public:
  ScreenRecorderDetectorLinux();
  ~ScreenRecorderDetectorLinux() override;

  // ScreenRecorderDetector implementation
  bool IsScreenBeingRecorded() override;
  std::vector<RecordingApplication> GetActiveRecorders() override;

 private:
  // Check for known screen recording applications
  std::vector<RecordingApplication> DetectKnownRecorders();

  // Check for X11 screen recording
  bool CheckX11Recording();

  // Known screen recorder process names
  static const std::vector<std::string> kScreenRecorderProcesses;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_LINUX_SCREEN_RECORDER_DETECTOR_LINUX_H_
