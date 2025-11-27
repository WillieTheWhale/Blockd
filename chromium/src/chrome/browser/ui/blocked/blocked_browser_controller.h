// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_BLOCKED_BLOCKED_BROWSER_CONTROLLER_H_
#define CHROME_BROWSER_UI_BLOCKED_BLOCKED_BROWSER_CONTROLLER_H_

#include <memory>
#include <string>

#include "base/memory/weak_ptr.h"

namespace blocked {

// Controls browser lockdown during active interview sessions
class BlockedBrowserController {
 public:
  BlockedBrowserController();
  ~BlockedBrowserController();

  // Session management
  void StartSession(const std::string& session_token);
  void EndSession();
  bool IsSessionActive() const { return is_session_active_; }

  // Browser restrictions
  bool ShouldBlockNewTab() const;
  bool ShouldBlockNewWindow() const;
  bool ShouldBlockFullscreenExit() const;
  bool ShouldBlockKeyboardShortcut(int key_code, int modifiers) const;
  bool ShouldBlockNavigation(const std::string& url) const;

  // Fullscreen enforcement
  void EnterFullscreen();
  void ExitFullscreen();
  bool IsFullscreen() const { return is_fullscreen_; }

 private:
  bool is_session_active_ = false;
  bool is_fullscreen_ = false;
  std::string session_token_;

  base::WeakPtrFactory<BlockedBrowserController> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_UI_BLOCKED_BLOCKED_BROWSER_CONTROLLER_H_
