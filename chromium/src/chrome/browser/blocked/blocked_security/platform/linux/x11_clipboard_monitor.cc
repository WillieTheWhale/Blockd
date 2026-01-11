// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_security/platform/linux/x11_clipboard_monitor.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/time/time.h"
#include "build/build_config.h"

#if BUILDFLAG(IS_LINUX)
#include <X11/Xatom.h>
#include <X11/Xlib.h>
#include <X11/extensions/Xfixes.h>
#endif

namespace blocked {

X11ClipboardMonitor::X11ClipboardMonitor() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

X11ClipboardMonitor::~X11ClipboardMonitor() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Stop();
}

bool X11ClipboardMonitor::Start(ClipboardChangedCallback callback) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (is_monitoring_) {
    LOG(WARNING) << "X11ClipboardMonitor: Already monitoring";
    return true;
  }

  callback_ = std::move(callback);

  if (!InitializeX11()) {
    LOG(ERROR) << "X11ClipboardMonitor: Failed to initialize X11";
    return false;
  }

  is_monitoring_ = true;

  // Get initial clipboard content.
  last_content_ = GetClipboardText();

  // Start polling for changes.
  // Using timer-based polling as XFixes requires event loop integration.
  poll_timer_.Start(FROM_HERE, base::Milliseconds(500),
                    base::BindRepeating(&X11ClipboardMonitor::PollForChanges,
                                        weak_factory_.GetWeakPtr()));

  LOG(INFO) << "X11ClipboardMonitor: Started monitoring";
  return true;
}

void X11ClipboardMonitor::Stop() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_monitoring_) {
    return;
  }

  poll_timer_.Stop();
  CleanupX11();

  is_monitoring_ = false;
  last_content_.clear();

  LOG(INFO) << "X11ClipboardMonitor: Stopped monitoring";
}

bool X11ClipboardMonitor::InitializeX11() {
#if !BUILDFLAG(IS_LINUX)
  return false;
#else
  display_ = XOpenDisplay(nullptr);
  if (!display_) {
    LOG(ERROR) << "X11ClipboardMonitor: Failed to open X11 display";
    return false;
  }

  // Create a window for receiving events.
  int screen = DefaultScreen(display_);
  window_ = XCreateSimpleWindow(display_, RootWindow(display_, screen),
                                0, 0, 1, 1, 0, 0, 0);

  // Check for XFixes extension.
  int error_base;
  if (XFixesQueryExtension(display_, &xfixes_event_base_, &error_base)) {
    xfixes_available_ = true;

    // Register for clipboard selection change notifications.
    Atom clipboard = XInternAtom(display_, "CLIPBOARD", False);
    XFixesSelectSelectionInput(display_, window_, clipboard,
                               XFixesSetSelectionOwnerNotifyMask |
                               XFixesSelectionWindowDestroyNotifyMask |
                               XFixesSelectionClientCloseNotifyMask);

    LOG(INFO) << "X11ClipboardMonitor: XFixes extension available";
  } else {
    LOG(WARNING) << "X11ClipboardMonitor: XFixes not available, using polling";
    xfixes_available_ = false;
  }

  return true;
#endif
}

void X11ClipboardMonitor::CleanupX11() {
#if BUILDFLAG(IS_LINUX)
  if (window_ != 0 && display_) {
    XDestroyWindow(display_, window_);
    window_ = 0;
  }

  if (display_) {
    XCloseDisplay(display_);
    display_ = nullptr;
  }
#endif
}

void X11ClipboardMonitor::PollForChanges() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_monitoring_ || !display_) {
    return;
  }

#if BUILDFLAG(IS_LINUX)
  // Process any pending XFixes events.
  while (XPending(display_)) {
    XEvent event;
    XNextEvent(display_, &event);

    if (xfixes_available_ &&
        event.type == xfixes_event_base_ + XFixesSelectionNotify) {
      // Clipboard selection changed.
      VLOG(1) << "X11ClipboardMonitor: XFixes selection change detected";
    }
  }
#endif

  // Check current clipboard content.
  std::string current_content = GetClipboardText();

  if (current_content != last_content_) {
    VLOG(1) << "X11ClipboardMonitor: Clipboard content changed";
    last_content_ = current_content;

    if (callback_) {
      callback_.Run(current_content);
    }
  }
}

std::string X11ClipboardMonitor::GetClipboardText() {
#if !BUILDFLAG(IS_LINUX)
  return std::string();
#else
  if (!display_) {
    return std::string();
  }

  Atom clipboard = XInternAtom(display_, "CLIPBOARD", False);
  Atom utf8_string = XInternAtom(display_, "UTF8_STRING", False);
  Atom targets = XInternAtom(display_, "TARGETS", False);

  // Check clipboard owner.
  Window owner = XGetSelectionOwner(display_, clipboard);
  if (owner == None) {
    return std::string();
  }

  // Request clipboard content as UTF-8.
  Atom property = XInternAtom(display_, "BLOCKED_CLIP_PROP", False);
  XConvertSelection(display_, clipboard, utf8_string, property, window_,
                    CurrentTime);

  // Flush and wait for response.
  XFlush(display_);

  // TODO(blocked): This synchronous wait is a temporary implementation.
  // For production, this should be refactored to:
  // 1. Use a dedicated X11 message pump thread with base::Thread
  // 2. Post selection requests and handle responses asynchronously
  // 3. Use base::RunLoop for proper event processing
  // The current implementation may cause brief UI pauses.
  //
  // Note: The polling interval of 500ms mitigates the impact, but this
  // should be addressed before shipping.
  for (int i = 0; i < 50; i++) {  // 500ms timeout (50 * 10ms)
    if (XPending(display_)) {
      XEvent event;
      XNextEvent(display_, &event);

      if (event.type == SelectionNotify) {
        if (event.xselection.property != None) {
          Atom actual_type;
          int actual_format;
          unsigned long nitems, bytes_after;
          unsigned char* data = nullptr;

          int result = XGetWindowProperty(display_, window_, property,
                                          0, 1024 * 1024, True, AnyPropertyType,
                                          &actual_type, &actual_format,
                                          &nitems, &bytes_after, &data);

          if (result == Success && data != nullptr && nitems > 0) {
            std::string content(reinterpret_cast<char*>(data), nitems);
            XFree(data);
            return content;
          }

          if (data) {
            XFree(data);
          }
        }
        break;
      }
    }

    // Small delay.
    usleep(10000);  // 10ms
  }

  return std::string();
#endif
}

}  // namespace blocked
