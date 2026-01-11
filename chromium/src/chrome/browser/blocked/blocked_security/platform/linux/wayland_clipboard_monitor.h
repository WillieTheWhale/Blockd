// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_WAYLAND_CLIPBOARD_MONITOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_WAYLAND_CLIPBOARD_MONITOR_H_

#include <memory>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/process/process.h"
#include "base/sequence_checker.h"
#include "base/timer/timer.h"

namespace dbus {
class Bus;
class ObjectProxy;
class Response;
class Signal;
}  // namespace dbus

namespace blocked {

// Wayland-specific clipboard monitoring using D-Bus portal or wl-paste fallback.
// Monitors clipboard (CLIPBOARD selection) for changes and notifies
// observers when clipboard content changes.
//
// Implementation approaches:
// 1. Primary: D-Bus portal (org.freedesktop.portal.Desktop) - preferred for
//    sandboxed applications, handles permissions automatically.
// 2. Fallback: wl-paste subprocess polling - works when portal unavailable.
class WaylandClipboardMonitor {
 public:
  // Callback invoked when clipboard content changes.
  // |content| is the new clipboard text content (may be empty for non-text).
  using ClipboardChangedCallback =
      base::RepeatingCallback<void(const std::string& content)>;

  WaylandClipboardMonitor();
  ~WaylandClipboardMonitor();

  WaylandClipboardMonitor(const WaylandClipboardMonitor&) = delete;
  WaylandClipboardMonitor& operator=(const WaylandClipboardMonitor&) = delete;

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
  // Monitoring modes.
  enum class MonitorMode {
    kNone,
    kDBusPortal,
    kWlPaste,
  };

  // Initialize D-Bus connection to portal.
  bool InitializeDBus();

  // Initialize wl-paste fallback.
  bool InitializeWlPaste();

  // Cleanup resources.
  void Cleanup();

  // Poll for clipboard changes (used by wl-paste mode).
  void PollForChanges();

  // Get current clipboard text using wl-paste.
  std::string GetClipboardViaWlPaste();

  // D-Bus signal handler for clipboard changes.
  void OnClipboardChanged(dbus::Signal* signal);

  // D-Bus response handler.
  void OnDBusResponse(dbus::Response* response);

  // Check if wl-paste is available.
  static bool IsWlPasteAvailable();

  MonitorMode mode_ = MonitorMode::kNone;
  bool is_monitoring_ = false;
  std::string last_content_;
  ClipboardChangedCallback callback_;

  // D-Bus connection (for portal mode).
  scoped_refptr<dbus::Bus> bus_;
  raw_ptr<dbus::ObjectProxy> portal_proxy_ = nullptr;

  // Timer for polling (wl-paste mode).
  base::RepeatingTimer poll_timer_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<WaylandClipboardMonitor> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_SECURITY_PLATFORM_LINUX_WAYLAND_CLIPBOARD_MONITOR_H_
