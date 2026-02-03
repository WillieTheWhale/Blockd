// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_meeting/meeting_fullscreen_controller.h"

#include "base/logging.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_window.h"
#include "chrome/browser/ui/exclusive_access/exclusive_access_context.h"
#include "chrome/browser/ui/exclusive_access/exclusive_access_manager.h"
#include "chrome/browser/ui/exclusive_access/fullscreen_controller.h"
#include "content/public/browser/web_contents.h"

namespace blocked {

MeetingFullscreenController::MeetingFullscreenController(Browser* browser)
    : browser_(browser) {
  LOG(INFO) << "MeetingFullscreenController initialized";

  // Register as observer for meeting platform detection
  MeetingPlatformDetector::GetInstance()->AddObserver(this);
}

MeetingFullscreenController::~MeetingFullscreenController() {
  // Unregister observer
  MeetingPlatformDetector::GetInstance()->RemoveObserver(this);

  // Ensure fullscreen is unlocked on destruction
  if (fullscreen_locked_) {
    ForceUnlockFullscreen();
  }
}

void MeetingFullscreenController::OnMeetingDetected(
    const MeetingInfo& meeting_info) {
  LOG(INFO) << "Meeting detected: "
            << MeetingPlatformDetector::GetPlatformName(meeting_info.platform)
            << " URL: " << meeting_info.meeting_url;

  current_platform_ = meeting_info.platform;
  in_meeting_mode_ = true;
  meeting_start_time_ = base::Time::Now();

  // Enter fullscreen when meeting is detected
  EnterMeetingFullscreen();
}

void MeetingFullscreenController::OnMeetingEnded(
    const MeetingInfo& meeting_info) {
  LOG(INFO) << "Meeting ended: "
            << MeetingPlatformDetector::GetPlatformName(meeting_info.platform);

  // Calculate meeting duration
  base::TimeDelta duration = base::Time::Now() - meeting_start_time_;
  LOG(INFO) << "Meeting duration: " << duration.InMinutes() << " minutes";

  // Exit fullscreen when meeting ends
  ExitMeetingFullscreen();

  // Reset state
  current_platform_ = MeetingPlatform::kNone;
  in_meeting_mode_ = false;
  blocked_exit_attempts_ = 0;
}

void MeetingFullscreenController::OnMeetingStateChanged(
    const MeetingInfo& meeting_info,
    bool in_call) {
  LOG(INFO) << "Meeting state changed: in_call=" << in_call;

  if (in_call && !fullscreen_locked_) {
    // User joined the call, lock fullscreen
    fullscreen_locked_ = true;
    LOG(INFO) << "Fullscreen locked due to active call";
  } else if (!in_call && fullscreen_locked_) {
    // User left the call but still on meeting page
    // Keep fullscreen but unlock for manual exit
    fullscreen_locked_ = false;
    LOG(INFO) << "Fullscreen unlocked - call ended";
  }
}

bool MeetingFullscreenController::ShouldBlockFullscreenExit() const {
  return fullscreen_locked_ && in_meeting_mode_;
}

bool MeetingFullscreenController::OnFullscreenExitAttempt() {
  if (!ShouldBlockFullscreenExit()) {
    return false;  // Allow exit
  }

  blocked_exit_attempts_++;
  LOG(WARNING) << "Fullscreen exit blocked (attempt #" << blocked_exit_attempts_
               << ") - meeting in progress";

  ShowFullscreenLockedNotification();
  return true;  // Block exit
}

void MeetingFullscreenController::EnterMeetingFullscreen() {
  if (!browser_ || !browser_->window()) {
    LOG(ERROR) << "Cannot enter fullscreen: browser or window is null";
    return;
  }

  // Check if already in fullscreen
  if (browser_->window()->IsFullscreen()) {
    LOG(INFO) << "Already in fullscreen mode";
    fullscreen_locked_ = true;
    return;
  }

  LOG(INFO) << "Entering meeting fullscreen mode";

  // Get the active web contents
  content::WebContents* web_contents =
      browser_->tab_strip_model()->GetActiveWebContents();

  if (web_contents) {
    RequestFullscreen(web_contents);
  }

  // Lock fullscreen
  fullscreen_locked_ = true;
}

void MeetingFullscreenController::ExitMeetingFullscreen() {
  if (!browser_ || !browser_->window()) {
    LOG(ERROR) << "Cannot exit fullscreen: browser or window is null";
    return;
  }

  // Unlock first
  fullscreen_locked_ = false;

  // Check if in fullscreen
  if (!browser_->window()->IsFullscreen()) {
    LOG(INFO) << "Not in fullscreen mode";
    return;
  }

  LOG(INFO) << "Exiting meeting fullscreen mode";

  // Get the active web contents
  content::WebContents* web_contents =
      browser_->tab_strip_model()->GetActiveWebContents();

  if (web_contents) {
    ExitFullscreen(web_contents);
  }
}

void MeetingFullscreenController::RequestFullscreen(
    content::WebContents* web_contents) {
  if (!browser_ || !web_contents) {
    return;
  }

  ExclusiveAccessManager* exclusive_access_manager =
      browser_->exclusive_access_manager();
  if (!exclusive_access_manager) {
    return;
  }

  FullscreenController* fullscreen_controller =
      exclusive_access_manager->fullscreen_controller();
  if (!fullscreen_controller) {
    return;
  }

  // Request browser fullscreen (not tab fullscreen to prevent exit prompt)
  fullscreen_controller->ToggleBrowserFullscreenMode();
}

void MeetingFullscreenController::ExitFullscreen(
    content::WebContents* web_contents) {
  if (!browser_ || !web_contents) {
    return;
  }

  ExclusiveAccessManager* exclusive_access_manager =
      browser_->exclusive_access_manager();
  if (!exclusive_access_manager) {
    return;
  }

  FullscreenController* fullscreen_controller =
      exclusive_access_manager->fullscreen_controller();
  if (!fullscreen_controller) {
    return;
  }

  // Exit fullscreen
  if (browser_->window()->IsFullscreen()) {
    fullscreen_controller->ToggleBrowserFullscreenMode();
  }
}

void MeetingFullscreenController::ForceUnlockFullscreen() {
  LOG(INFO) << "Force unlocking fullscreen";
  fullscreen_locked_ = false;
  in_meeting_mode_ = false;
  blocked_exit_attempts_ = 0;
}

void MeetingFullscreenController::ShowFullscreenLockedNotification() {
  // In a full implementation, this would show a notification or toast
  // informing the user that fullscreen is locked during the interview
  LOG(INFO) << "Showing fullscreen locked notification to user";

  // TODO: Implement actual notification UI
  // Could use Chrome's notification system or a custom overlay
}

}  // namespace blocked
