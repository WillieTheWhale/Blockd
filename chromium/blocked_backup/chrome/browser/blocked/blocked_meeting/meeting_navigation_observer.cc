// Copyright 2024 Blockd Inc. All rights reserved.
// Navigation Observer implementation

#include "chrome/browser/blocked/blocked_meeting/meeting_navigation_observer.h"

#include "base/logging.h"
#include "chrome/browser/blocked/blocked_meeting/meeting_platform_detector.h"
#include "content/public/browser/navigation_handle.h"
#include "content/public/browser/web_contents.h"

namespace blocked {

WEB_CONTENTS_USER_DATA_KEY_IMPL(MeetingNavigationObserver);

MeetingNavigationObserver::MeetingNavigationObserver(
    content::WebContents* web_contents)
    : content::WebContentsObserver(web_contents),
      content::WebContentsUserData<MeetingNavigationObserver>(*web_contents) {
  LOG(INFO) << "[Blockd] MeetingNavigationObserver attached to WebContents";
}

MeetingNavigationObserver::~MeetingNavigationObserver() {
  LOG(INFO) << "[Blockd] MeetingNavigationObserver destroyed";
}

void MeetingNavigationObserver::DidFinishNavigation(
    content::NavigationHandle* navigation_handle) {
  // Only track main frame navigations that committed successfully
  if (!navigation_handle->IsInMainFrame() ||
      !navigation_handle->HasCommitted() ||
      navigation_handle->IsErrorPage()) {
    return;
  }

  const GURL& url = navigation_handle->GetURL();

  LOG(INFO) << "[Blockd] Navigation completed: " << url.spec();

  // Notify the meeting platform detector
  MeetingPlatformDetector::GetInstance()->OnNavigationCommitted(url);
}

void MeetingNavigationObserver::WebContentsDestroyed() {
  LOG(INFO) << "[Blockd] WebContents destroyed - notifying detector";

  // Get the last URL from the web contents before it's destroyed
  if (web_contents()) {
    const GURL& url = web_contents()->GetLastCommittedURL();
    MeetingPlatformDetector::GetInstance()->OnPageClosed(url);
  }
}

}  // namespace blocked
