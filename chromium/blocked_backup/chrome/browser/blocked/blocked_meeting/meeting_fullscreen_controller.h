// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_FULLSCREEN_CONTROLLER_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_FULLSCREEN_CONTROLLER_H_

#include "base/memory/weak_ptr.h"
#include "base/time/time.h"
#include "chrome/browser/blocked/blocked_meeting/meeting_platform_detector.h"

namespace content {
class WebContents;
}  // namespace content

class Browser;

namespace blocked {

// Controls automatic fullscreen entry/exit during meetings
// - Automatically enters fullscreen when user joins a meeting
// - Prevents fullscreen exit during active meeting
// - Automatically exits fullscreen when meeting ends
class MeetingFullscreenController : public MeetingPlatformObserver {
 public:
  explicit MeetingFullscreenController(Browser* browser);
  ~MeetingFullscreenController() override;

  MeetingFullscreenController(const MeetingFullscreenController&) = delete;
  MeetingFullscreenController& operator=(const MeetingFullscreenController&) = delete;

  // Check if fullscreen is locked due to active meeting
  bool IsFullscreenLocked() const { return fullscreen_locked_; }

  // Check if currently in meeting fullscreen mode
  bool IsInMeetingMode() const { return in_meeting_mode_; }

  // Get the current meeting platform
  MeetingPlatform GetCurrentPlatform() const { return current_platform_; }

  // Manual override for testing/admin purposes
  void ForceUnlockFullscreen();

  // MeetingPlatformObserver implementation
  void OnMeetingDetected(const MeetingInfo& meeting_info) override;
  void OnMeetingEnded(const MeetingInfo& meeting_info) override;
  void OnMeetingStateChanged(const MeetingInfo& meeting_info,
                             bool in_call) override;

  // Called by browser to check if fullscreen exit should be blocked
  bool ShouldBlockFullscreenExit() const;

  // Called by browser when user attempts to exit fullscreen
  // Returns true if the exit was blocked
  bool OnFullscreenExitAttempt();

 private:
  // Enter fullscreen mode
  void EnterMeetingFullscreen();

  // Exit fullscreen mode
  void ExitMeetingFullscreen();

  // Request fullscreen for the current web contents
  void RequestFullscreen(content::WebContents* web_contents);

  // Exit fullscreen for the current web contents
  void ExitFullscreen(content::WebContents* web_contents);

  // Show notification that fullscreen is locked
  void ShowFullscreenLockedNotification();

  // The browser window being controlled
  Browser* browser_;

  // Current state
  bool fullscreen_locked_ = false;
  bool in_meeting_mode_ = false;
  MeetingPlatform current_platform_ = MeetingPlatform::kNone;
  base::Time meeting_start_time_;

  // Track blocked exit attempts for logging/analytics
  int blocked_exit_attempts_ = 0;

  base::WeakPtrFactory<MeetingFullscreenController> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_FULLSCREEN_CONTROLLER_H_
