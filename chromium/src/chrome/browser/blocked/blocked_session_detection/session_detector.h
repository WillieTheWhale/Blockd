// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_SESSION_DETECTION_SESSION_DETECTOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_SESSION_DETECTION_SESSION_DETECTOR_H_

#include <memory>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "chrome/browser/blocked/blocked_session_detection/url_pattern_matcher.h"
#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/web_contents_user_data.h"

namespace content {
class WebContents;
}

namespace blocked {

// Monitors web contents for navigation to interview platform URLs.
// When detected, shows a confirmation dialog and starts the Blocked session.
class SessionDetector
    : public content::WebContentsObserver,
      public content::WebContentsUserData<SessionDetector> {
 public:
  // Callback when an interview session should start.
  using SessionStartCallback = base::OnceCallback<void(
      const std::string& platform_name,
      const std::string& meeting_id,
      const GURL& url)>;

  // Callback for user confirmation result.
  using ConfirmationCallback = base::OnceCallback<void(bool confirmed)>;

  ~SessionDetector() override;

  SessionDetector(const SessionDetector&) = delete;
  SessionDetector& operator=(const SessionDetector&) = delete;

  // Set callback for when session should start.
  void SetSessionStartCallback(SessionStartCallback callback);

  // Enable/disable automatic detection.
  void SetAutoDetectionEnabled(bool enabled);
  bool IsAutoDetectionEnabled() const { return auto_detection_enabled_; }

  // Manually trigger session with a token (for manual entry mode).
  void StartSessionWithToken(const std::string& session_token);

  // Get the URL pattern matcher.
  const UrlPatternMatcher& GetPatternMatcher() const {
    return pattern_matcher_;
  }

 private:
  friend class content::WebContentsUserData<SessionDetector>;

  explicit SessionDetector(content::WebContents* web_contents);

  // content::WebContentsObserver overrides.
  void DidFinishNavigation(
      content::NavigationHandle* navigation_handle) override;
  void WebContentsDestroyed() override;

  // Handle URL match.
  void OnInterviewUrlDetected(const UrlPatternMatcher::MatchResult& result,
                              const GURL& url);

  // Show confirmation dialog.
  void ShowConfirmationDialog(const std::string& platform_name,
                              const GURL& url,
                              ConfirmationCallback callback);

  // Handle user confirmation.
  void OnConfirmationResult(const std::string& platform_name,
                            const std::string& meeting_id,
                            const GURL& url,
                            bool confirmed);

  UrlPatternMatcher pattern_matcher_;
  SessionStartCallback session_start_callback_;

  bool auto_detection_enabled_ = true;
  bool session_active_ = false;
  bool confirmation_pending_ = false;

  // Last detected URL to avoid duplicate prompts.
  GURL last_detected_url_;

  WEB_CONTENTS_USER_DATA_KEY_DECL();

  base::WeakPtrFactory<SessionDetector> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_SESSION_DETECTION_SESSION_DETECTOR_H_
