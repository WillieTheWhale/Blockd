// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_security/platform/linux/linux_platform_detector.h"

#include <cstdlib>

#include "base/logging.h"
#include "build/build_config.h"

namespace blocked {

// Static member initialization
LinuxPlatformDetector::DisplayServer LinuxPlatformDetector::cached_server_ =
    DisplayServer::kUnknown;
bool LinuxPlatformDetector::detection_done_ = false;

// static
LinuxPlatformDetector::DisplayServer LinuxPlatformDetector::GetDisplayServer() {
  if (!detection_done_) {
    cached_server_ = DetectDisplayServer();
    detection_done_ = true;
  }
  return cached_server_;
}

// static
std::string LinuxPlatformDetector::GetDisplayServerName() {
  switch (GetDisplayServer()) {
    case DisplayServer::kX11:
      return "X11";
    case DisplayServer::kWayland:
      return "Wayland";
    case DisplayServer::kUnknown:
    default:
      return "Unknown";
  }
}

// static
void LinuxPlatformDetector::ResetForTesting() {
  cached_server_ = DisplayServer::kUnknown;
  detection_done_ = false;
}

// static
LinuxPlatformDetector::DisplayServer
LinuxPlatformDetector::DetectDisplayServer() {
#if !BUILDFLAG(IS_LINUX)
  return DisplayServer::kUnknown;
#else
  // Check XDG_SESSION_TYPE environment variable first (most reliable).
  const char* session_type = std::getenv("XDG_SESSION_TYPE");
  if (session_type) {
    std::string type(session_type);
    if (type == "wayland") {
      LOG(INFO) << "Detected Wayland session via XDG_SESSION_TYPE";
      return DisplayServer::kWayland;
    }
    if (type == "x11") {
      LOG(INFO) << "Detected X11 session via XDG_SESSION_TYPE";
      return DisplayServer::kX11;
    }
  }

  // Check WAYLAND_DISPLAY for Wayland.
  const char* wayland_display = std::getenv("WAYLAND_DISPLAY");
  if (wayland_display && wayland_display[0] != '\0') {
    LOG(INFO) << "Detected Wayland session via WAYLAND_DISPLAY";
    return DisplayServer::kWayland;
  }

  // Check DISPLAY for X11.
  const char* x11_display = std::getenv("DISPLAY");
  if (x11_display && x11_display[0] != '\0') {
    LOG(INFO) << "Detected X11 session via DISPLAY";
    return DisplayServer::kX11;
  }

  // Check for XWayland (X11 apps running under Wayland).
  // In this case, both DISPLAY and WAYLAND_DISPLAY may be set.
  // WAYLAND_DISPLAY takes precedence.

  LOG(WARNING) << "Could not detect display server type";
  return DisplayServer::kUnknown;
#endif
}

}  // namespace blocked
