// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/blocked_home/blocked_home_ui.h"

#include "base/logging.h"
#include "chrome/common/blocked_webui_url_constants.h"
#include "chrome/grit/blocked_home_resources.h"
#include "chrome/grit/blocked_home_resources_map.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/common/url_constants.h"

namespace blocked {

BlockedHomeUIConfig::BlockedHomeUIConfig()
    : DefaultWebUIConfig(content::kChromeUIScheme,
                         kChromeUIBlockedHomeHost) {}

BlockedHomeUI::BlockedHomeUI(content::WebUI* web_ui)
    : WebUIController(web_ui) {
  LOG(INFO) << "BlockedHomeUI: Initializing chrome://blocked-home";
  SetupDataSource();
}

BlockedHomeUI::~BlockedHomeUI() = default;

void BlockedHomeUI::SetupDataSource() {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui()->GetWebContents()->GetBrowserContext(),
      kChromeUIBlockedHomeHost);

  // Add all resources from the generated resource map.
  source->AddResourcePaths(
      base::make_span(kBlockedHomeResources, kBlockedHomeResourcesSize));

  // Set the default resource (main HTML page).
  source->SetDefaultResource(IDR_BLOCKED_HOME_BLOCKED_HOME_HTML);

  // Configure Content Security Policy for security.
  // Allow scripts only from self and chrome://resources.
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ScriptSrc,
      "script-src chrome://resources 'self';");

  // Disable object/embed/applet for security.
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ObjectSrc,
      "object-src 'none';");

  // Allow styles only from self (no unsafe-inline for security).
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::StyleSrc,
      "style-src 'self';");

  LOG(INFO) << "BlockedHomeUI: Data source configured";
}

}  // namespace blocked
