// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_SCREEN_RECORDER_DETECTOR_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_SCREEN_RECORDER_DETECTOR_H_

#include <string>
#include <vector>

namespace blocked {

struct RecordingApplication {
  std::string application_name;
  std::string bundle_identifier;  // macOS only
  std::string window_title;
  std::string command_line;
  std::string executable_path;
  uint32_t process_id;
  bool is_recording;
};

// Base class for platform-specific screen recording detection
class ScreenRecorderDetector {
 public:
  virtual ~ScreenRecorderDetector() = default;

  // Check if screen is being recorded
  virtual bool IsScreenBeingRecorded() = 0;

  // Get list of active recording applications
  virtual std::vector<RecordingApplication> GetActiveRecorders() = 0;
};

// Factory method to create platform-specific detector
std::unique_ptr<ScreenRecorderDetector> CreateScreenRecorderDetector();

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_SCREEN_RECORDER_DETECTOR_H_
