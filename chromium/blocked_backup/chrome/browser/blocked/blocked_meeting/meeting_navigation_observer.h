// Copyright 2024 Blockd Inc. All rights reserved.
// Navigation Observer for Meeting Platform Detection

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_NAVIGATION_OBSERVER_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_NAVIGATION_OBSERVER_H_

#include "content/public/browser/web_contents_observer.h"
#include "content/public/browser/web_contents_user_data.h"

namespace blocked {

// Observes navigation events and triggers meeting platform detection
class MeetingNavigationObserver
    : public content::WebContentsObserver,
      public content::WebContentsUserData<MeetingNavigationObserver> {
 public:
  ~MeetingNavigationObserver() override;

  MeetingNavigationObserver(const MeetingNavigationObserver&) = delete;
  MeetingNavigationObserver& operator=(const MeetingNavigationObserver&) = delete;

  // content::WebContentsObserver implementation
  void DidFinishNavigation(
      content::NavigationHandle* navigation_handle) override;
  void WebContentsDestroyed() override;

 private:
  friend class content::WebContentsUserData<MeetingNavigationObserver>;

  explicit MeetingNavigationObserver(content::WebContents* web_contents);

  WEB_CONTENTS_USER_DATA_KEY_DECL();
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_NAVIGATION_OBSERVER_H_
