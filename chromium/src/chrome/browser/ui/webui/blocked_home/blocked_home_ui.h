// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_WEBUI_BLOCKED_HOME_BLOCKED_HOME_UI_H_
#define CHROME_BROWSER_UI_WEBUI_BLOCKED_HOME_BLOCKED_HOME_UI_H_

#include "content/public/browser/web_ui_controller.h"
#include "content/public/browser/webui_config.h"

namespace blocked {

class BlockedHomeUI;

// WebUI configuration for chrome://blocked-home.
// This config class is used by Chromium's WebUI system to register
// the blocked-home URL and create the appropriate controller.
class BlockedHomeUIConfig
    : public content::DefaultWebUIConfig<BlockedHomeUI> {
 public:
  BlockedHomeUIConfig();
  ~BlockedHomeUIConfig() override = default;
};

// WebUI controller for chrome://blocked-home.
// This is the default landing page for the Blocked interview browser,
// providing quick access to video conferencing platforms.
class BlockedHomeUI : public content::WebUIController {
 public:
  explicit BlockedHomeUI(content::WebUI* web_ui);
  ~BlockedHomeUI() override;

  BlockedHomeUI(const BlockedHomeUI&) = delete;
  BlockedHomeUI& operator=(const BlockedHomeUI&) = delete;

 private:
  // Sets up the WebUI data source with HTML/CSS/JS resources.
  void SetupDataSource();
};

}  // namespace blocked

#endif  // CHROME_BROWSER_UI_WEBUI_BLOCKED_HOME_BLOCKED_HOME_UI_H_
