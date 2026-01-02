// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PLATFORM_WINDOWS_SCREEN_RECORDER_DETECTOR_WIN_H_
#define CHROME_BROWSER_BLOCKED_PLATFORM_WINDOWS_SCREEN_RECORDER_DETECTOR_WIN_H_

#include <windows.h>
#include <dwmapi.h>
#include <string>
#include <vector>

#include "chrome/browser/blocked/platform/screen_recorder_detector.h"

namespace blocked {

struct ScreenRecorderInfo {
  std::wstring process_name;
  std::wstring window_title;
  DWORD process_id;
  HWND window_handle;
  bool is_recording;
  bool is_cloaked;  // Hidden via DWM
};

// Windows implementation of screen recording detection
class ScreenRecorderDetectorWindows : public ScreenRecorderDetector {
 public:
  ScreenRecorderDetectorWindows();
  ~ScreenRecorderDetectorWindows() override;

  // ScreenRecorderDetector implementation
  bool IsScreenBeingRecorded() override;
  std::vector<RecordingApplication> GetActiveRecorders() override;

 private:
  // Check for known screen recording applications
  std::vector<ScreenRecorderInfo> DetectKnownRecorders();

  // Check for cloaked windows (DWM hidden windows used by recorders)
  bool HasCloakedWindows();

  // Check if a specific window is cloaked
  bool IsWindowCloaked(HWND window);

  // Get all windows and check for recording indicators
  std::vector<HWND> EnumerateAllWindows();

  // Known screen recorder process names
  static const std::vector<std::wstring> kKnownRecorders;

  // Window class names used by recorders
  static const std::vector<std::wstring> kRecorderWindowClasses;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_PLATFORM_WINDOWS_SCREEN_RECORDER_DETECTOR_WIN_H_
