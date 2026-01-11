// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/blocked/blocked_browser_controller.h"

#include "base/check.h"
#include "base/logging.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_list.h"
#include "chrome/browser/ui/browser_window.h"
#include "chrome/browser/ui/exclusive_access/exclusive_access_manager.h"
#include "chrome/browser/ui/exclusive_access/fullscreen_controller.h"
#include "ui/events/keycodes/keyboard_codes.h"

// Modifier key flags (matching ui::EventFlags).
namespace {
constexpr int kControlModifier = 1 << 0;  // ui::EF_CONTROL_DOWN
constexpr int kShiftModifier = 1 << 1;    // ui::EF_SHIFT_DOWN
constexpr int kAltModifier = 1 << 2;      // ui::EF_ALT_DOWN
constexpr int kCommandModifier = 1 << 3;  // ui::EF_COMMAND_DOWN (macOS)
}  // namespace

namespace blocked {

// Static singleton instance.
BlockedBrowserController* BlockedBrowserController::g_instance_ = nullptr;

// static
BlockedBrowserController* BlockedBrowserController::Get() {
  if (!g_instance_) {
    g_instance_ = new BlockedBrowserController();
  }
  return g_instance_;
}

// static
void BlockedBrowserController::Shutdown() {
  if (g_instance_) {
    delete g_instance_;
    g_instance_ = nullptr;
  }
}

BlockedBrowserController::BlockedBrowserController() {
  DCHECK(!g_instance_) << "BlockedBrowserController already exists";
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

  // Check for Ctrl (Windows/Linux) or Cmd (macOS) modifier.
  const bool has_ctrl_or_cmd =
      (modifiers & kControlModifier) || (modifiers & kCommandModifier);
  const bool has_shift = (modifiers & kShiftModifier);
  const bool has_alt = (modifiers & kAltModifier);

  // Block F12 - DevTools.
  if (key_code == ui::VKEY_F12) {
    LOG(WARNING) << "Blocked: F12 (DevTools) blocked during session";
    return true;
  }

  // Block Ctrl+Shift+I / Cmd+Option+I - DevTools.
  if (has_ctrl_or_cmd && has_shift && key_code == ui::VKEY_I) {
    LOG(WARNING) << "Blocked: Ctrl+Shift+I (DevTools) blocked during session";
    return true;
  }

  // Block Ctrl+Shift+J / Cmd+Option+J - DevTools Console.
  if (has_ctrl_or_cmd && has_shift && key_code == ui::VKEY_J) {
    LOG(WARNING) << "Blocked: Ctrl+Shift+J (DevTools Console) blocked";
    return true;
  }

  // Block Ctrl+Shift+C - DevTools Inspect Element.
  if (has_ctrl_or_cmd && has_shift && key_code == ui::VKEY_C) {
    LOG(WARNING) << "Blocked: Ctrl+Shift+C (Inspect Element) blocked";
    return true;
  }

  // Block Ctrl+U - View Source.
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_U) {
    LOG(WARNING) << "Blocked: Ctrl+U (View Source) blocked during session";
    return true;
  }

  // Block Ctrl+T - New Tab.
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_T) {
    LOG(WARNING) << "Blocked: Ctrl+T (New Tab) blocked during session";
    return true;
  }

  // Block Ctrl+N - New Window.
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_N) {
    LOG(WARNING) << "Blocked: Ctrl+N (New Window) blocked during session";
    return true;
  }

  // Block Ctrl+W - Close Tab.
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_W) {
    LOG(WARNING) << "Blocked: Ctrl+W (Close Tab) blocked during session";
    return true;
  }

  // Block Ctrl+Shift+W - Close Window.
  if (has_ctrl_or_cmd && has_shift && key_code == ui::VKEY_W) {
    LOG(WARNING) << "Blocked: Ctrl+Shift+W (Close Window) blocked";
    return true;
  }

  // Block Alt+F4 (Windows) - Close Window.
  if (has_alt && key_code == ui::VKEY_F4) {
    LOG(WARNING) << "Blocked: Alt+F4 (Close Window) blocked during session";
    return true;
  }

  // Block Escape - Might exit fullscreen.
  if (key_code == ui::VKEY_ESCAPE) {
    LOG(WARNING) << "Blocked: Escape blocked during session";
    return true;
  }

  // Block F11 - Toggle Fullscreen.
  if (key_code == ui::VKEY_F11) {
    LOG(WARNING) << "Blocked: F11 (Toggle Fullscreen) blocked during session";
    return true;
  }

  // Block Ctrl+Shift+Delete - Clear browsing data.
  if (has_ctrl_or_cmd && has_shift && key_code == ui::VKEY_DELETE) {
    LOG(WARNING) << "Blocked: Ctrl+Shift+Delete blocked during session";
    return true;
  }

  // Block Ctrl+H - History.
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_H) {
    LOG(WARNING) << "Blocked: Ctrl+H (History) blocked during session";
    return true;
  }

  // Block Ctrl+J - Downloads.
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_J) {
    LOG(WARNING) << "Blocked: Ctrl+J (Downloads) blocked during session";
    return true;
  }

  // Block Ctrl+C - Copy.
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_C) {
    LOG(WARNING) << "Blocked: Ctrl+C (Copy) blocked during session";
    return true;
  }

  // Block Ctrl+V - Paste.
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_V) {
    LOG(WARNING) << "Blocked: Ctrl+V (Paste) blocked during session";
    return true;
  }

  // Block Ctrl+X - Cut.
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_X) {
    LOG(WARNING) << "Blocked: Ctrl+X (Cut) blocked during session";
    return true;
  }

  // Block Ctrl+A - Select All (often used before copy).
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_A) {
    LOG(WARNING) << "Blocked: Ctrl+A (Select All) blocked during session";
    return true;
  }

  // Block Ctrl+Insert - Copy (alternative).
  if (has_ctrl_or_cmd && key_code == ui::VKEY_INSERT) {
    LOG(WARNING) << "Blocked: Ctrl+Insert (Copy) blocked during session";
    return true;
  }

  // Block Shift+Insert - Paste (alternative).
  if (has_shift && !has_ctrl_or_cmd && key_code == ui::VKEY_INSERT) {
    LOG(WARNING) << "Blocked: Shift+Insert (Paste) blocked during session";
    return true;
  }

  // Block Shift+Delete - Cut (alternative).
  if (has_shift && !has_ctrl_or_cmd && key_code == ui::VKEY_DELETE) {
    LOG(WARNING) << "Blocked: Shift+Delete (Cut) blocked during session";
    return true;
  }

  // Block Ctrl+P - Print (could be used to save content).
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_P) {
    LOG(WARNING) << "Blocked: Ctrl+P (Print) blocked during session";
    return true;
  }

  // Block Ctrl+S - Save (could be used to save content).
  if (has_ctrl_or_cmd && !has_shift && key_code == ui::VKEY_S) {
    LOG(WARNING) << "Blocked: Ctrl+S (Save) blocked during session";
    return true;
  }

  // Allow other shortcuts.
  return false;
}

bool BlockedBrowserController::ShouldBlockNavigation(
    const std::string& url) const {
  if (!is_session_active_) {
    return false;
  }

  // Block chrome://inspect - DevTools remote debugging.
  if (url.find("chrome://inspect") != std::string::npos) {
    LOG(WARNING) << "Blocked: Navigation to chrome://inspect blocked";
    return true;
  }

  // Block chrome://extensions - Could be used to install debugging extensions.
  if (url.find("chrome://extensions") != std::string::npos) {
    LOG(WARNING) << "Blocked: Navigation to chrome://extensions blocked";
    return true;
  }

  // Block chrome://settings - Could be used to change security settings.
  if (url.find("chrome://settings") != std::string::npos) {
    LOG(WARNING) << "Blocked: Navigation to chrome://settings blocked";
    return true;
  }

  // Block chrome://flags - Could enable experimental features.
  if (url.find("chrome://flags") != std::string::npos) {
    LOG(WARNING) << "Blocked: Navigation to chrome://flags blocked";
    return true;
  }

  // Block devtools:// URLs.
  if (url.find("devtools://") != std::string::npos) {
    LOG(WARNING) << "Blocked: Navigation to devtools:// blocked";
    return true;
  }

  // Block view-source: URLs.
  if (url.find("view-source:") != std::string::npos) {
    LOG(WARNING) << "Blocked: Navigation to view-source: blocked";
    return true;
  }

  // Allow other navigation.
  return false;
}

bool BlockedBrowserController::ShouldBlockDevTools() const {
  if (!is_session_active_) {
    return false;
  }

  LOG(WARNING) << "Blocked: DevTools opening blocked during active session";
  return true;
}

bool BlockedBrowserController::ShouldBlockContextMenu() const {
  if (!is_session_active_) {
    return false;
  }

  // Block context menu to prevent "Inspect" and clipboard options.
  LOG(WARNING) << "Blocked: Context menu blocked during active session";
  return true;
}

bool BlockedBrowserController::ShouldBlockClipboard() const {
  if (!is_session_active_) {
    return false;
  }

  LOG(WARNING) << "Blocked: Clipboard access blocked during active session";
  return true;
}

bool BlockedBrowserController::ShouldBlockCopy() const {
  if (!is_session_active_) {
    return false;
  }

  LOG(WARNING) << "Blocked: Copy operation blocked during active session";
  return true;
}

bool BlockedBrowserController::ShouldBlockPaste() const {
  if (!is_session_active_) {
    return false;
  }

  LOG(WARNING) << "Blocked: Paste operation blocked during active session";
  return true;
}

bool BlockedBrowserController::ShouldBlockCut() const {
  if (!is_session_active_) {
    return false;
  }

  LOG(WARNING) << "Blocked: Cut operation blocked during active session";
  return true;
}

void BlockedBrowserController::EnterFullscreen(Browser* browser) {
  Browser* target_browser = GetBrowserForFullscreen(browser);
  if (!target_browser) {
    LOG(ERROR) << "Blocked: No browser available for fullscreen";
    return;
  }

  if (is_fullscreen_) {
    LOG(INFO) << "Blocked: Already in fullscreen mode";
    return;
  }

  LOG(INFO) << "Blocked: Entering fullscreen mode";

  // Get the exclusive access manager which controls fullscreen.
  ExclusiveAccessManager* exclusive_access_manager =
      target_browser->exclusive_access_manager();
  if (!exclusive_access_manager) {
    LOG(ERROR) << "Blocked: No exclusive access manager available";
    return;
  }

  FullscreenController* fullscreen_controller =
      exclusive_access_manager->fullscreen_controller();
  if (!fullscreen_controller) {
    LOG(ERROR) << "Blocked: No fullscreen controller available";
    return;
  }

  // Enter browser fullscreen (not tab fullscreen).
  // This puts the entire browser window into fullscreen mode.
  if (!fullscreen_controller->IsFullscreen()) {
    fullscreen_controller->ToggleBrowserFullscreenMode();
  }

  is_fullscreen_ = true;
  LOG(INFO) << "Blocked: Fullscreen mode activated";
}

void BlockedBrowserController::ExitFullscreen(Browser* browser) {
  if (!is_fullscreen_) {
    LOG(INFO) << "Blocked: Not in fullscreen mode";
    return;
  }

  // During an active session, block fullscreen exit.
  if (is_session_active_) {
    LOG(WARNING) << "Blocked: Fullscreen exit blocked during active session";
    return;
  }

  Browser* target_browser = GetBrowserForFullscreen(browser);
  if (!target_browser) {
    LOG(ERROR) << "Blocked: No browser available to exit fullscreen";
    is_fullscreen_ = false;
    return;
  }

  LOG(INFO) << "Blocked: Exiting fullscreen mode";

  ExclusiveAccessManager* exclusive_access_manager =
      target_browser->exclusive_access_manager();
  if (!exclusive_access_manager) {
    LOG(ERROR) << "Blocked: No exclusive access manager available";
    is_fullscreen_ = false;
    return;
  }

  FullscreenController* fullscreen_controller =
      exclusive_access_manager->fullscreen_controller();
  if (!fullscreen_controller) {
    LOG(ERROR) << "Blocked: No fullscreen controller available";
    is_fullscreen_ = false;
    return;
  }

  // Exit fullscreen if currently in fullscreen.
  if (fullscreen_controller->IsFullscreen()) {
    fullscreen_controller->ToggleBrowserFullscreenMode();
  }

  is_fullscreen_ = false;
  LOG(INFO) << "Blocked: Fullscreen mode deactivated";
}

void BlockedBrowserController::SetControlledBrowser(Browser* browser) {
  controlled_browser_ = browser;
  if (browser) {
    LOG(INFO) << "Blocked: Controlled browser set";
  } else {
    LOG(INFO) << "Blocked: Controlled browser cleared";
  }
}

Browser* BlockedBrowserController::GetControlledBrowser() const {
  return controlled_browser_;
}

Browser* BlockedBrowserController::GetBrowserForFullscreen(
    Browser* browser_hint) const {
  // Priority: 1) Explicit hint, 2) Controlled browser, 3) Last active browser.
  if (browser_hint) {
    return browser_hint;
  }

  if (controlled_browser_) {
    return controlled_browser_;
  }

  // Fall back to the last active browser.
  return BrowserList::GetInstance()->GetLastActive();
}

}  // namespace blocked
