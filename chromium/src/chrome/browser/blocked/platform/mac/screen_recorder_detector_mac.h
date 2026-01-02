// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_MAC_SCREEN_RECORDER_DETECTOR_MAC_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_MAC_SCREEN_RECORDER_DETECTOR_MAC_H_

#include <string>
#include <vector>

#include "chrome/browser/blocked/platform/screen_recorder_detector.h"

namespace blocked {

// macOS implementation of screen recording detection
class ScreenRecorderDetectorMac : public ScreenRecorderDetector {
 public:
  ScreenRecorderDetectorMac();
  ~ScreenRecorderDetectorMac() override;

  // ScreenRecorderDetector implementation
  bool IsScreenBeingRecorded() override;
  std::vector<RecordingApplication> GetActiveRecorders() override;

 private:
  // Check for known screen recording applications
  std::vector<RecordingApplication> DetectKnownRecorders();

  // Check macOS screen recording permission status
  bool CheckScreenRecordingPermission();

  // Check for QuickTime screen recording
  bool IsQuickTimeRecording();

  // Known screen recorder bundle identifiers
  static const std::vector<std::string> kScreenRecorderBundles;
  static const std::vector<std::string> kScreenRecorderProcessNames;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_MAC_SCREEN_RECORDER_DETECTOR_MAC_H_
