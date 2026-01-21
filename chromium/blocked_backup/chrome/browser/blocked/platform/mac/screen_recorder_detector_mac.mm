// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/mac/screen_recorder_detector_mac.h"

#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#include <algorithm>

#include "base/logging.h"
#include "base/strings/sys_string_conversions.h"

namespace blocked {

const std::vector<std::string> ScreenRecorderDetectorMac::kScreenRecorderBundles = {
  "com.apple.QuickTimePlayerX",
  "com.telestream.screenflow",
  "com.obsproject.obs-studio",
  "com.loom.desktop",
  "com.techsmith.camtasia2020",
  "com.araelium.ScreenFlick",
  "com.syniumsoftware.screenium",
  "com.wulkano.kap",
  "com.bmessage.SimpleScreenRecorder",
  "air.com.smithsonian.camtasia"
};

const std::vector<std::string> ScreenRecorderDetectorMac::kScreenRecorderProcessNames = {
  "QuickTime Player",
  "screencaptureui",
  "ScreenFlow",
  "OBS",
  "obs",
  "Loom",
  "Camtasia",
  "ScreenFlick",
  "Screenium",
  "Kap"
};

ScreenRecorderDetectorMac::ScreenRecorderDetectorMac() = default;

ScreenRecorderDetectorMac::~ScreenRecorderDetectorMac() = default;

bool ScreenRecorderDetectorMac::IsScreenBeingRecorded() {
  std::vector<RecordingApplication> recorders = GetActiveRecorders();
  return !recorders.empty() || IsQuickTimeRecording();
}

std::vector<RecordingApplication> ScreenRecorderDetectorMac::GetActiveRecorders() {
  return DetectKnownRecorders();
}

std::vector<RecordingApplication> ScreenRecorderDetectorMac::DetectKnownRecorders() {
  @autoreleasepool {
    std::vector<RecordingApplication> active_recorders;

    // Get all running applications
    NSArray* running_apps = [[NSWorkspace sharedWorkspace] runningApplications];

    for (NSRunningApplication* app in running_apps) {
      std::string bundle_id = "";
      std::string app_name = "";

      if (app.bundleIdentifier) {
        bundle_id = base::SysNSStringToUTF8(app.bundleIdentifier);
      }

      if (app.localizedName) {
        app_name = base::SysNSStringToUTF8(app.localizedName);
      }

      // Check if this is a known recorder
      bool is_recorder = false;

      if (std::find(kScreenRecorderBundles.begin(),
                   kScreenRecorderBundles.end(),
                   bundle_id) != kScreenRecorderBundles.end()) {
        is_recorder = true;
      }

      if (std::find(kScreenRecorderProcessNames.begin(),
                   kScreenRecorderProcessNames.end(),
                   app_name) != kScreenRecorderProcessNames.end()) {
        is_recorder = true;
      }

      if (is_recorder) {
        RecordingApplication recorder;
        recorder.application_name = app_name;
        recorder.bundle_identifier = bundle_id;
        recorder.process_id = app.processIdentifier;
        recorder.is_recording = true;  // Assume recording if running

        active_recorders.push_back(recorder);

        LOG(WARNING) << "Screen recorder detected: " << app_name
                    << " (bundle: " << bundle_id << ")";
      }
    }

    return active_recorders;
  }
}

bool ScreenRecorderDetectorMac::CheckScreenRecordingPermission() {
  // On macOS 10.15+, screen recording requires permission
  // We can check if any app has this permission (indirect detection)

  // Note: There's no direct API to check if screen is being recorded
  // We rely on process detection instead

  return false;
}

bool ScreenRecorderDetectorMac::IsQuickTimeRecording() {
  @autoreleasepool {
    // Check if QuickTime Player is running with screen recording
    NSArray* running_apps = [[NSWorkspace sharedWorkspace] runningApplications];

    for (NSRunningApplication* app in running_apps) {
      NSString* bundle_id = app.bundleIdentifier;

      if ([bundle_id isEqualToString:@"com.apple.QuickTimePlayerX"]) {
        // QuickTime is running
        // Check if it has windows (might be recording)

        // Get window list
        CFArrayRef window_list = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
            kCGNullWindowID);

        if (window_list) {
          CFIndex count = CFArrayGetCount(window_list);

          for (CFIndex i = 0; i < count; ++i) {
            CFDictionaryRef window_info = (CFDictionaryRef)CFArrayGetValueAtIndex(
                window_list, i);

            CFNumberRef owner_pid = (CFNumberRef)CFDictionaryGetValue(
                window_info, kCGWindowOwnerPID);

            if (owner_pid) {
              pid_t pid;
              CFNumberGetValue(owner_pid, kCFNumberIntType, &pid);

              if (pid == app.processIdentifier) {
                // QuickTime has windows, likely recording
                CFRelease(window_list);
                LOG(WARNING) << "QuickTime Player screen recording detected";
                return true;
              }
            }
          }

          CFRelease(window_list);
        }
      }

      // Check for screencaptureui (macOS screen recording UI)
      if ([bundle_id isEqualToString:@"com.apple.screencaptureui"]) {
        LOG(WARNING) << "macOS screen capture UI detected";
        return true;
      }
    }

    return false;
  }
}

}  // namespace blocked
