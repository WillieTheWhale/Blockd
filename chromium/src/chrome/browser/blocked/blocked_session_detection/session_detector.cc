// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_session_detection/session_detector.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/web_contents.h"

namespace blocked {

WEB_CONTENTS_USER_DATA_KEY_IMPL(SessionDetector);

SessionDetector::SessionDetector(content::WebContents* web_contents)
    : content::WebContentsObserver(web_contents),
      content::WebContentsUserData<SessionDetector>(*web_contents) {
  LOG(INFO) << "SessionDetector created for WebContents";
}

SessionDetector::~SessionDetector() {
  LOG(INFO) << "SessionDetector destroyed";
}

void SessionDetector::SetSessionStartCallback(SessionStartCallback callback) {
  session_start_callback_ = std::move(callback);
}

void SessionDetector::SetAutoDetectionEnabled(bool enabled) {
  auto_detection_enabled_ = enabled;
  LOG(INFO) << "Auto-detection " << (enabled ? "enabled" : "disabled");
}

void SessionDetector::StartSessionWithToken(const std::string& session_token) {
  if (session_active_) {
    LOG(WARNING) << "Session already active, ignoring token start";
    return;
  }

  LOG(INFO) << "Starting session with manual token";

  session_active_ = true;

  if (session_start_callback_) {
    std::move(session_start_callback_)
        .Run("Manual", session_token, GURL());
  }
}

void SessionDetector::DidFinishNavigation(
    content::NavigationHandle* navigation_handle) {
  // Only handle main frame navigations that committed.
  if (!navigation_handle->IsInPrimaryMainFrame() ||
      !navigation_handle->HasCommitted() ||
      navigation_handle->IsErrorPage()) {
    return;
  }

  if (!auto_detection_enabled_) {
    return;
  }

  if (session_active_ || confirmation_pending_) {
    return;
  }

  const GURL& url = navigation_handle->GetURL();

  // Avoid duplicate detection for same URL.
  if (url == last_detected_url_) {
    return;
  }

  // Check if URL matches an interview platform.
  UrlPatternMatcher::MatchResult result = pattern_matcher_.Match(url);

  if (result.is_match) {
    last_detected_url_ = url;
    OnInterviewUrlDetected(result, url);
  }
}

void SessionDetector::WebContentsDestroyed() {
  LOG(INFO) << "WebContents destroyed, session detector cleanup";
  session_active_ = false;
  confirmation_pending_ = false;
}

void SessionDetector::OnInterviewUrlDetected(
    const UrlPatternMatcher::MatchResult& result,
    const GURL& url) {
  LOG(INFO) << "Interview URL detected: " << result.platform_name
            << " (meeting: " << result.meeting_id << ")";

  confirmation_pending_ = true;

  // Show confirmation dialog to user.
  ShowConfirmationDialog(
      result.platform_name, url,
      base::BindOnce(&SessionDetector::OnConfirmationResult,
                     weak_factory_.GetWeakPtr(), result.platform_name,
                     result.meeting_id, url));
}

void SessionDetector::ShowConfirmationDialog(
    const std::string& platform_name,
    const GURL& url,
    ConfirmationCallback callback) {
  // In a full implementation, this would show a WebUI dialog.
  // For now, we'll auto-confirm (simulating user clicking "Start Session").
  // The actual dialog would be in chrome/browser/ui/webui/blocked_session_confirmation/

  LOG(INFO) << "Would show confirmation dialog for: " << platform_name
            << " at " << url.spec();

  // Simulate user confirmation after a short delay.
  // In production, this would wait for actual user input.
  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(std::move(callback), true),  // Auto-confirm for now
      base::Milliseconds(100));
}

void SessionDetector::OnConfirmationResult(
    const std::string& platform_name,
    const std::string& meeting_id,
    const GURL& url,
    bool confirmed) {
  confirmation_pending_ = false;

  if (!confirmed) {
    LOG(INFO) << "User declined session start for: " << platform_name;
    return;
  }

  LOG(INFO) << "User confirmed session start for: " << platform_name;

  session_active_ = true;

  if (session_start_callback_) {
    std::move(session_start_callback_).Run(platform_name, meeting_id, url);
  }
}

}  // namespace blocked
