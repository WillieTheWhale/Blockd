// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_X11_CLIPBOARD_MONITOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_X11_CLIPBOARD_MONITOR_H_

#include <memory>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/timer/timer.h"

typedef struct _XDisplay Display;

namespace blocked {

// X11-specific clipboard monitoring using XFixes extension.
// Monitors clipboard (CLIPBOARD selection) for changes and notifies
// observers when clipboard content changes.
class X11ClipboardMonitor {
 public:
  // Callback invoked when clipboard content changes.
  // |content| is the new clipboard text content (may be empty for non-text).
  using ClipboardChangedCallback =
      base::RepeatingCallback<void(const std::string& content)>;

  X11ClipboardMonitor();
  ~X11ClipboardMonitor();

  X11ClipboardMonitor(const X11ClipboardMonitor&) = delete;
  X11ClipboardMonitor& operator=(const X11ClipboardMonitor&) = delete;

  // Start monitoring clipboard changes.
  // Returns true if monitoring started successfully.
  bool Start(ClipboardChangedCallback callback);

  // Stop monitoring clipboard changes.
  void Stop();

  // Check if monitoring is active.
  bool IsActive() const { return is_monitoring_; }

  // Get the last known clipboard content.
  const std::string& GetLastContent() const { return last_content_; }

 private:
  // Initialize X11 connection and XFixes.
  bool InitializeX11();

  // Cleanup X11 resources.
  void CleanupX11();

  // Poll for XFixes selection change events.
  void PollForChanges();

  // Get current clipboard text content.
  std::string GetClipboardText();

  Display* display_ = nullptr;
  unsigned long window_ = 0;  // Window for receiving events

  bool is_monitoring_ = false;
  std::string last_content_;
  ClipboardChangedCallback callback_;

  // Timer for polling (fallback if XFixes not available).
  base::RepeatingTimer poll_timer_;

  bool xfixes_available_ = false;
  int xfixes_event_base_ = 0;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<X11ClipboardMonitor> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_X11_CLIPBOARD_MONITOR_H_
