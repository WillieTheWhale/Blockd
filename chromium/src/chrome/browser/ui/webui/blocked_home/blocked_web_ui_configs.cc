// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/blocked_home/blocked_web_ui_configs.h"

#include <memory>

#include "chrome/browser/ui/webui/blocked_home/blocked_home_ui.h"
#include "content/public/browser/webui_config_map.h"

namespace blocked {

void RegisterBlockedWebUIConfigs(content::WebUIConfigMap& map) {
  // Register chrome://blocked-home
  map.AddWebUIConfig(std::make_unique<BlockedHomeUIConfig>());
}

}  // namespace blocked
