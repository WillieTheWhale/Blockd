# Blocked Home WebUI Integration Guide

This document describes how to integrate the `chrome://blocked-home` landing page
into the full Chromium source tree.

## Overview

The Blocked home page is the default landing page for the Blocked interview browser.
It provides quick access to video conferencing platforms (Google Meet, Zoom, Microsoft Teams).

## Files Created

### URL Constants
- `chrome/common/blocked_webui_url_constants.h` - URL constant declarations
- `chrome/common/blocked_webui_url_constants.cc` - URL constant definitions

### WebUI Controller
- `chrome/browser/ui/webui/blocked_home/blocked_home_ui.h` - WebUI controller header
- `chrome/browser/ui/webui/blocked_home/blocked_home_ui.cc` - WebUI controller implementation
- `chrome/browser/ui/webui/blocked_home/blocked_web_ui_configs.h` - WebUI config registration header
- `chrome/browser/ui/webui/blocked_home/blocked_web_ui_configs.cc` - WebUI config registration
- `chrome/browser/ui/webui/blocked_home/BUILD.gn` - Build configuration

### Resources
- `chrome/browser/resources/blocked/home/blocked_home.html` - Landing page HTML
- `chrome/browser/resources/blocked/home/blocked_home.css` - Styling
- `chrome/browser/resources/blocked/home/blocked_home.js` - Navigation logic
- `chrome/browser/resources/blocked/home/BUILD.gn` - Resource build configuration

### Startup Configuration
- `chrome/browser/blocked/blocked_startup/blocked_startup_config.h` - Startup config header
- `chrome/browser/blocked/blocked_startup/blocked_startup_config.cc` - Startup config implementation
- `chrome/browser/blocked/blocked_startup/BUILD.gn` - Build configuration

## Integration Steps

### 1. Register WebUI Configuration

In `chrome/browser/ui/webui/chrome_web_ui_configs.cc`, add:

```cpp
#include "chrome/browser/ui/webui/blocked_home/blocked_web_ui_configs.h"

// In RegisterChromeWebUIConfigs() function:
blocked::RegisterBlockedWebUIConfigs(map);
```

### 2. Set Default Homepage

In `chrome/browser/prefs/browser_prefs.cc`, modify the homepage pref defaults:

```cpp
#include "chrome/browser/blocked/blocked_startup/blocked_startup_config.h"

// In RegisterProfilePrefs():
registry->RegisterStringPref(
    prefs::kHomePage,
    blocked::BlockedStartupConfig::GetDefaultHomepageURL().spec());
registry->RegisterBooleanPref(prefs::kHomePageIsNewTabPage, false);
```

### 3. Override New Tab Page

In `chrome/browser/ui/browser_commands.cc` or the new tab handler:

```cpp
#include "chrome/browser/blocked/blocked_startup/blocked_startup_config.h"

// When determining new tab URL:
if (blocked::BlockedStartupConfig::ShouldOverrideNewTabPage()) {
  return blocked::BlockedStartupConfig::GetNewTabURL();
}
```

### 4. Override Startup Page

In `chrome/browser/ui/startup/startup_browser_creator_impl.cc`:

```cpp
#include "chrome/browser/blocked/blocked_startup/blocked_startup_config.h"

// In AddStartupURLs() or similar:
if (blocked::BlockedStartupConfig::ShouldOverrideStartupPage()) {
  tabs.push_back(blocked::BlockedStartupConfig::GetDefaultHomepageURL());
  return;
}
```

### 5. Update Build Files

Ensure the BUILD.gn includes are properly linked:
- `chrome/browser/blocked/BUILD.gn` already includes the new modules
- `chrome/browser/ui/webui/BUILD.gn` may need to include `blocked_home:blocked_home`

## Testing

After building, verify:

1. Navigate to `chrome://blocked-home` - should display the landing page
2. Launch browser - should open to `chrome://blocked-home`
3. Open new tab (Ctrl+T / Cmd+T) - should open to `chrome://blocked-home`
4. Click each button - should navigate to the respective platform

## URL Scheme

- Host: `blocked-home`
- Full URL: `chrome://blocked-home/`

## Security Notes

- Content Security Policy restricts scripts to self and chrome://resources
- Object embedding is disabled
- All external URLs (Google Meet, Zoom, Teams) use HTTPS
