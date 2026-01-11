// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_security/platform/linux/wayland_clipboard_monitor.h"

#include <cstdlib>

#include "base/command_line.h"
#include "base/files/file_path.h"
#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/process/launch.h"
#include "base/strings/string_util.h"
#include "base/time/time.h"
#include "build/build_config.h"

#if BUILDFLAG(IS_LINUX)
#include "dbus/bus.h"
#include "dbus/message.h"
#include "dbus/object_proxy.h"
#endif

namespace blocked {

namespace {

// D-Bus portal constants.
constexpr char kPortalServiceName[] = "org.freedesktop.portal.Desktop";
constexpr char kPortalObjectPath[] = "/org/freedesktop/portal/desktop";
constexpr char kClipboardInterface[] = "org.freedesktop.portal.Clipboard";
constexpr char kRequestInterface[] = "org.freedesktop.portal.Request";

// Polling interval for wl-paste fallback (500ms matches X11 implementation).
constexpr base::TimeDelta kPollInterval = base::Milliseconds(500);

// Timeout for wl-paste subprocess (100ms should be plenty).
constexpr base::TimeDelta kWlPasteTimeout = base::Milliseconds(100);

}  // namespace

WaylandClipboardMonitor::WaylandClipboardMonitor() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

WaylandClipboardMonitor::~WaylandClipboardMonitor() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Stop();
}

bool WaylandClipboardMonitor::Start(ClipboardChangedCallback callback) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (is_monitoring_) {
    LOG(WARNING) << "WaylandClipboardMonitor: Already monitoring";
    return true;
  }

  callback_ = std::move(callback);

  // Try D-Bus portal first.
  if (InitializeDBus()) {
    mode_ = MonitorMode::kDBusPortal;
    is_monitoring_ = true;
    LOG(INFO) << "WaylandClipboardMonitor: Started via D-Bus portal";
    return true;
  }

  // Fall back to wl-paste polling.
  if (InitializeWlPaste()) {
    mode_ = MonitorMode::kWlPaste;
    is_monitoring_ = true;

    // Get initial content.
    last_content_ = GetClipboardViaWlPaste();

    // Start polling.
    poll_timer_.Start(FROM_HERE, kPollInterval,
                      base::BindRepeating(&WaylandClipboardMonitor::PollForChanges,
                                          weak_factory_.GetWeakPtr()));

    LOG(INFO) << "WaylandClipboardMonitor: Started via wl-paste polling";
    return true;
  }

  LOG(ERROR) << "WaylandClipboardMonitor: Failed to initialize any monitor mode";
  return false;
}

void WaylandClipboardMonitor::Stop() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_monitoring_) {
    return;
  }

  poll_timer_.Stop();
  Cleanup();

  is_monitoring_ = false;
  mode_ = MonitorMode::kNone;
  last_content_.clear();

  LOG(INFO) << "WaylandClipboardMonitor: Stopped monitoring";
}

bool WaylandClipboardMonitor::InitializeDBus() {
#if !BUILDFLAG(IS_LINUX)
  return false;
#else
  dbus::Bus::Options options;
  options.bus_type = dbus::Bus::SESSION;
  options.connection_type = dbus::Bus::PRIVATE;

  bus_ = base::MakeRefCounted<dbus::Bus>(options);

  portal_proxy_ = bus_->GetObjectProxy(
      kPortalServiceName,
      dbus::ObjectPath(kPortalObjectPath));

  if (!portal_proxy_) {
    LOG(WARNING) << "WaylandClipboardMonitor: Failed to get portal proxy";
    bus_->ShutdownAndBlock();
    bus_ = nullptr;
    return false;
  }

  // Check if the Clipboard interface is available.
  // Note: The portal Clipboard interface is relatively new (portal version 1.14+).
  // We'll try to connect a signal handler; if it fails, we fall back.
  portal_proxy_->ConnectToSignal(
      kClipboardInterface,
      "SelectionOwnerChanged",
      base::BindRepeating(&WaylandClipboardMonitor::OnClipboardChanged,
                          weak_factory_.GetWeakPtr()),
      base::BindOnce([](const std::string& interface_name,
                        const std::string& signal_name,
                        bool success) {
        if (success) {
          VLOG(1) << "Connected to " << interface_name << "." << signal_name;
        } else {
          LOG(WARNING) << "Failed to connect to " << interface_name
                       << "." << signal_name;
        }
      }));

  // The portal approach requires the application to be registered via
  // org.freedesktop.portal.Session. For a more complete implementation,
  // we would need to:
  // 1. Create a session via portal
  // 2. Register for clipboard access
  // 3. Listen for selection changes
  //
  // Since the Clipboard portal is complex and requires session management,
  // we currently prefer the wl-paste fallback which works more reliably.
  // Returning false to trigger fallback, but keeping the D-Bus setup code
  // for future improvements.
  //
  // TODO(blocked): Implement full portal session management when needed.

  LOG(INFO) << "WaylandClipboardMonitor: D-Bus portal available but "
            << "preferring wl-paste for reliability";
  bus_->ShutdownAndBlock();
  bus_ = nullptr;
  portal_proxy_ = nullptr;
  return false;
#endif
}

bool WaylandClipboardMonitor::InitializeWlPaste() {
  if (!IsWlPasteAvailable()) {
    LOG(WARNING) << "WaylandClipboardMonitor: wl-paste not available";
    return false;
  }

  LOG(INFO) << "WaylandClipboardMonitor: wl-paste is available";
  return true;
}

void WaylandClipboardMonitor::Cleanup() {
#if BUILDFLAG(IS_LINUX)
  if (bus_) {
    bus_->ShutdownAndBlock();
    bus_ = nullptr;
  }
  portal_proxy_ = nullptr;
#endif
}

void WaylandClipboardMonitor::PollForChanges() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_monitoring_) {
    return;
  }

  std::string current_content = GetClipboardViaWlPaste();

  if (current_content != last_content_) {
    VLOG(1) << "WaylandClipboardMonitor: Clipboard content changed";
    last_content_ = current_content;

    if (callback_) {
      callback_.Run(current_content);
    }
  }
}

std::string WaylandClipboardMonitor::GetClipboardViaWlPaste() {
#if !BUILDFLAG(IS_LINUX)
  return std::string();
#else
  // Execute wl-paste to get clipboard content.
  base::CommandLine cmd(base::FilePath("/usr/bin/wl-paste"));
  cmd.AppendArg("--no-newline");  // Don't add trailing newline
  cmd.AppendArg("--type");
  cmd.AppendArg("text/plain");    // Only get text content

  std::string output;
  base::LaunchOptions options;
  options.wait = true;

  // Create a pipe to capture stdout.
  int pipe_fds[2];
  if (pipe(pipe_fds) != 0) {
    VLOG(1) << "WaylandClipboardMonitor: Failed to create pipe";
    return std::string();
  }

  options.fds_to_remap.emplace_back(pipe_fds[1], STDOUT_FILENO);

  base::Process process = base::LaunchProcess(cmd, options);
  close(pipe_fds[1]);  // Close write end in parent

  if (!process.IsValid()) {
    close(pipe_fds[0]);
    VLOG(1) << "WaylandClipboardMonitor: Failed to launch wl-paste";
    return std::string();
  }

  // Read output from pipe.
  char buffer[4096];
  ssize_t bytes_read;
  while ((bytes_read = read(pipe_fds[0], buffer, sizeof(buffer) - 1)) > 0) {
    buffer[bytes_read] = '\0';
    output += buffer;
  }
  close(pipe_fds[0]);

  // Wait for process to complete.
  int exit_code;
  process.WaitForExitWithTimeout(kWlPasteTimeout, &exit_code);

  if (exit_code != 0) {
    // Non-zero exit usually means clipboard is empty or not text.
    VLOG(2) << "WaylandClipboardMonitor: wl-paste exited with code " << exit_code;
    return std::string();
  }

  return output;
#endif
}

void WaylandClipboardMonitor::OnClipboardChanged(dbus::Signal* signal) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_monitoring_ || mode_ != MonitorMode::kDBusPortal) {
    return;
  }

  VLOG(1) << "WaylandClipboardMonitor: D-Bus clipboard change signal received";

  // For D-Bus portal mode, we would need to request the clipboard content
  // through the portal API. This is complex and requires proper session
  // management. For now, we use wl-paste as a simpler approach.
  std::string content = GetClipboardViaWlPaste();

  if (content != last_content_) {
    last_content_ = content;
    if (callback_) {
      callback_.Run(content);
    }
  }
}

void WaylandClipboardMonitor::OnDBusResponse(dbus::Response* response) {
  if (!response) {
    LOG(WARNING) << "WaylandClipboardMonitor: D-Bus call failed";
    return;
  }

  VLOG(1) << "WaylandClipboardMonitor: D-Bus response received";
}

// static
bool WaylandClipboardMonitor::IsWlPasteAvailable() {
  // Check if wl-paste exists and is executable.
  // First check the typical location.
  if (access("/usr/bin/wl-paste", X_OK) == 0) {
    return true;
  }

  // Check PATH.
  const char* path_env = std::getenv("PATH");
  if (!path_env) {
    return false;
  }

  std::string path_str(path_env);
  std::vector<std::string> paths = base::SplitString(
      path_str, ":", base::KEEP_WHITESPACE, base::SPLIT_WANT_NONEMPTY);

  for (const auto& dir : paths) {
    std::string full_path = dir + "/wl-paste";
    if (access(full_path.c_str(), X_OK) == 0) {
      return true;
    }
  }

  return false;
}

}  // namespace blocked
