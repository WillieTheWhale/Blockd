// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_STARTUP_BLOCKED_STARTUP_CONFIG_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_STARTUP_BLOCKED_STARTUP_CONFIG_H_

#include <string>

#include "url/gurl.h"

namespace blocked {

// Configuration for Blocked browser startup behavior.
// This class provides the default homepage and new tab URLs
// for the Blocked interview browser.
class BlockedStartupConfig {
 public:
  // Returns the default homepage URL (chrome://blocked-home).
  static GURL GetDefaultHomepageURL();

  // Returns the URL for new tabs (chrome://blocked-home).
  static GURL GetNewTabURL();

  // Returns true if the given URL is a Blocked internal page.
  static bool IsBlockedURL(const GURL& url);

  // Returns true if we should override the startup page.
  static bool ShouldOverrideStartupPage();

  // Returns true if we should override the new tab page.
  static bool ShouldOverrideNewTabPage();
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_STARTUP_BLOCKED_STARTUP_CONFIG_H_
