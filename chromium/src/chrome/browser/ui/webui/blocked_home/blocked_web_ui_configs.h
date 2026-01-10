// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_BLOCKED_HOME_BLOCKED_WEB_UI_CONFIGS_H_
#define CHROME_BROWSER_UI_WEBUI_BLOCKED_HOME_BLOCKED_WEB_UI_CONFIGS_H_

namespace blocked {

// Registers all Blocked-specific WebUI configurations.
// This should be called during Chrome's WebUI initialization,
// typically in chrome_web_ui_configs.cc.
//
// Usage in chrome_web_ui_configs.cc:
//   #include "chrome/browser/ui/webui/blocked_home/blocked_web_ui_configs.h"
//   ...
//   blocked::RegisterBlockedWebUIConfigs(map);
//
void RegisterBlockedWebUIConfigs(
    content::WebUIConfigMap& map);

}  // namespace blocked

#endif  // CHROME_BROWSER_UI_WEBUI_BLOCKED_HOME_BLOCKED_WEB_UI_CONFIGS_H_
