// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_LINUX_PLATFORM_DETECTOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_LINUX_PLATFORM_DETECTOR_H_

#include <string>

namespace blocked {

// Detects the display server type (X11 vs Wayland) on Linux.
// Used to select appropriate clipboard/focus monitoring implementations.
class LinuxPlatformDetector {
 public:
  enum class DisplayServer {
    kUnknown,
    kX11,
    kWayland,
  };

  // Get the detected display server type.
  // Caches the result after first detection.
  static DisplayServer GetDisplayServer();

  // Get the display server as a string for logging.
  static std::string GetDisplayServerName();

  // Check if running under X11.
  static bool IsX11() { return GetDisplayServer() == DisplayServer::kX11; }

  // Check if running under Wayland.
  static bool IsWayland() { return GetDisplayServer() == DisplayServer::kWayland; }

  // Reset the cached detection (for testing).
  static void ResetForTesting();

 private:
  LinuxPlatformDetector() = delete;

  static DisplayServer DetectDisplayServer();

  static DisplayServer cached_server_;
  static bool detection_done_;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_LINUX_PLATFORM_DETECTOR_H_
