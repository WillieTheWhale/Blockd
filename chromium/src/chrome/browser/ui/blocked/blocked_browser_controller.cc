// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/blocked/blocked_browser_controller.h"

#include "base/logging.h"

namespace blocked {

BlockedBrowserController::BlockedBrowserController() {
  LOG(INFO) << "Blocked browser controller initialized";
}

BlockedBrowserController::~BlockedBrowserController() {
  EndSession();
}

void BlockedBrowserController::StartSession(const std::string& session_token) {
  if (is_session_active_) {
    LOG(WARNING) << "Session already active";
    return;
  }

  LOG(INFO) << "Starting Blocked session";
  session_token_ = session_token;
  is_session_active_ = true;

  EnterFullscreen();
}

void BlockedBrowserController::EndSession() {
  if (!is_session_active_) {
    return;
  }

  LOG(INFO) << "Ending Blocked session";
  is_session_active_ = false;
  session_token_.clear();

  if (is_fullscreen_) {
    ExitFullscreen();
  }
}

bool BlockedBrowserController::ShouldBlockNewTab() const {
  return is_session_active_;
}

bool BlockedBrowserController::ShouldBlockNewWindow() const {
  return is_session_active_;
}

bool BlockedBrowserController::ShouldBlockFullscreenExit() const {
  return is_session_active_;
}

bool BlockedBrowserController::ShouldBlockKeyboardShortcut(
    int key_code,
    int modifiers) const {
  if (!is_session_active_) {
    return false;
  }

  // Block common shortcuts during session
  // Ctrl+T (new tab), Ctrl+N (new window), Ctrl+W (close tab), etc.
  // This is simplified - actual implementation would check specific key codes
  return true;
}

bool BlockedBrowserController::ShouldBlockNavigation(
    const std::string& url) const {
  if (!is_session_active_) {
    return false;
  }

  // Allow only interview-related URLs during session
  // Simplified implementation
  return false;
}

void BlockedBrowserController::EnterFullscreen() {
  if (is_fullscreen_) {
    return;
  }

  LOG(INFO) << "Entering fullscreen mode";
  is_fullscreen_ = true;

  // Actual implementation would call browser fullscreen APIs
}

void BlockedBrowserController::ExitFullscreen() {
  if (!is_fullscreen_) {
    return;
  }

  LOG(INFO) << "Exiting fullscreen mode";
  is_fullscreen_ = false;

  // Actual implementation would call browser fullscreen APIs
}

}  // namespace blocked
