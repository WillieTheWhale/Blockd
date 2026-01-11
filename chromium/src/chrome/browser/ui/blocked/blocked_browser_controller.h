// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_BLOCKED_BLOCKED_BROWSER_CONTROLLER_H_
#define CHROME_BROWSER_UI_BLOCKED_BLOCKED_BROWSER_CONTROLLER_H_

#include <memory>
#include <string>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"

class Browser;

namespace blocked {

// Controls browser lockdown during active interview sessions.
// This is a singleton that persists for the browser lifetime.
class BlockedBrowserController {
 public:
  // Returns the singleton instance, creating it if necessary.
  static BlockedBrowserController* Get();

  // Destroys the singleton instance. Called during browser shutdown.
  static void Shutdown();

  BlockedBrowserController(const BlockedBrowserController&) = delete;
  BlockedBrowserController& operator=(const BlockedBrowserController&) = delete;

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

  // DevTools blocking - returns true if DevTools should be blocked.
  bool ShouldBlockDevTools() const;

  // Context menu blocking - returns true if context menu should be blocked.
  bool ShouldBlockContextMenu() const;

  // Clipboard blocking - returns true if clipboard operations should be blocked.
  bool ShouldBlockClipboard() const;

  // Copy blocking - returns true if copy operation should be blocked.
  bool ShouldBlockCopy() const;

  // Paste blocking - returns true if paste operation should be blocked.
  bool ShouldBlockPaste() const;

  // Cut blocking - returns true if cut operation should be blocked.
  bool ShouldBlockCut() const;

  // Fullscreen enforcement.
  // If |browser| is null, uses the last active browser.
  void EnterFullscreen(Browser* browser = nullptr);
  void ExitFullscreen(Browser* browser = nullptr);
  bool IsFullscreen() const { return is_fullscreen_; }

  // Sets the browser instance to control. If not set, the controller
  // will use the last active browser from BrowserList.
  void SetControlledBrowser(Browser* browser);
  Browser* GetControlledBrowser() const;

 private:
  friend class BlockedBrowserControllerTest;

  // Private constructor for singleton pattern.
  BlockedBrowserController();

  // Singleton instance.
  static BlockedBrowserController* g_instance_;

  // Gets the browser to control - either the explicitly set one or the
  // last active browser from BrowserList.
  Browser* GetBrowserForFullscreen(Browser* browser_hint) const;

  bool is_session_active_ = false;
  bool is_fullscreen_ = false;
  std::string session_token_;

  // The browser instance being controlled, if explicitly set.
  // If null, the controller will use the last active browser.
  raw_ptr<Browser> controlled_browser_ = nullptr;

  base::WeakPtrFactory<BlockedBrowserController> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_UI_BLOCKED_BLOCKED_BROWSER_CONTROLLER_H_
