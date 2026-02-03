// Copyright 2024 Blockd Inc. All rights reserved.
// Meeting Platform Detection for Blockd Interview Browser

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_PLATFORM_DETECTOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_PLATFORM_DETECTOR_H_

#include <memory>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/observer_list.h"
#include "base/time/time.h"
#include "url/gurl.h"

namespace blocked {

// Supported meeting platforms
enum class MeetingPlatform {
  kNone = 0,
  kGoogleMeet = 1,
  kZoom = 2,
  kMicrosoftTeams = 3,
};

// Information about a detected meeting
struct MeetingInfo {
  MeetingPlatform platform = MeetingPlatform::kNone;
  std::string meeting_url;
  std::string meeting_id;  // Extracted meeting ID if available
  base::Time detected_at;
  bool is_active = false;
};

// Observer interface for meeting detection events
class MeetingPlatformObserver {
 public:
  virtual ~MeetingPlatformObserver() = default;

  // Called when user enters a meeting platform page
  virtual void OnMeetingDetected(const MeetingInfo& meeting_info) = 0;

  // Called when user leaves a meeting platform page
  virtual void OnMeetingEnded(const MeetingInfo& meeting_info) = 0;

  // Called when meeting state changes (e.g., call started/ended)
  virtual void OnMeetingStateChanged(const MeetingInfo& meeting_info,
                                     bool in_call) = 0;
};

// Detects when user navigates to meeting platforms (Google Meet, Zoom, Teams)
class MeetingPlatformDetector {
 public:
  MeetingPlatformDetector();
  ~MeetingPlatformDetector();

  MeetingPlatformDetector(const MeetingPlatformDetector&) = delete;
  MeetingPlatformDetector& operator=(const MeetingPlatformDetector&) = delete;

  // Singleton access
  static MeetingPlatformDetector* GetInstance();

  // Check if a URL matches a meeting platform
  MeetingPlatform DetectPlatform(const GURL& url) const;

  // Check if URL is a meeting platform
  bool IsMeetingPlatformUrl(const GURL& url) const;

  // Called when navigation occurs - main entry point
  void OnNavigationCommitted(const GURL& url);

  // Called when tab/page is closed
  void OnPageClosed(const GURL& url);

  // Get current meeting info (if any)
  const MeetingInfo& GetCurrentMeeting() const { return current_meeting_; }

  // Check if currently on a meeting platform
  bool IsOnMeetingPlatform() const {
    return current_meeting_.platform != MeetingPlatform::kNone;
  }

  // Observer management
  void AddObserver(MeetingPlatformObserver* observer);
  void RemoveObserver(MeetingPlatformObserver* observer);

  // Get platform name as string
  static std::string GetPlatformName(MeetingPlatform platform);

 private:
  // URL pattern matching helpers
  bool MatchesGoogleMeet(const GURL& url) const;
  bool MatchesZoom(const GURL& url) const;
  bool MatchesMicrosoftTeams(const GURL& url) const;

  // Extract meeting ID from URL
  std::string ExtractMeetingId(const GURL& url, MeetingPlatform platform) const;

  // Notify observers
  void NotifyMeetingDetected(const MeetingInfo& info);
  void NotifyMeetingEnded(const MeetingInfo& info);

  // Current meeting state
  MeetingInfo current_meeting_;

  // Observers
  base::ObserverList<MeetingPlatformObserver> observers_;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_PLATFORM_DETECTOR_H_
