// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_startup/blocked_startup_config.h"

#include "chrome/common/blocked_webui_url_constants.h"
#include "url/gurl.h"

namespace blocked {

// static
GURL BlockedStartupConfig::GetDefaultHomepageURL() {
  return GURL(kChromeUIBlockedHomeURL);
}

// static
GURL BlockedStartupConfig::GetNewTabURL() {
  return GURL(kChromeUIBlockedHomeURL);
}

// static
bool BlockedStartupConfig::IsBlockedURL(const GURL& url) {
  return url.SchemeIs("chrome") && url.host() == kChromeUIBlockedHomeHost;
}

// static
bool BlockedStartupConfig::ShouldOverrideStartupPage() {
  // Always override startup page to show Blocked home.
  return true;
}

// static
bool BlockedStartupConfig::ShouldOverrideNewTabPage() {
  // Always override new tab page to show Blocked home.
  return true;
}

}  // namespace blocked
