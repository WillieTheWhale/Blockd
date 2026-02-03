// Copyright 2024 Blockd Inc. All rights reserved.
// Meeting Platform Detection implementation

#include "chrome/browser/blocked/blocked_meeting/meeting_platform_detector.h"

#include "base/logging.h"
#include "base/no_destructor.h"
#include "base/strings/string_util.h"
#include "net/base/registry_controlled_domains/registry_controlled_domain.h"

namespace blocked {

namespace {

// URL patterns for meeting platforms
// Google Meet patterns
const char* kGoogleMeetHosts[] = {
    "meet.google.com",
};

// Zoom patterns
const char* kZoomHosts[] = {
    "zoom.us",
    "us02web.zoom.us",
    "us04web.zoom.us",
    "us05web.zoom.us",
    "us06web.zoom.us",
};

// Microsoft Teams patterns
const char* kTeamsHosts[] = {
    "teams.microsoft.com",
    "teams.live.com",
};

}  // namespace

MeetingPlatformDetector::MeetingPlatformDetector() = default;

MeetingPlatformDetector::~MeetingPlatformDetector() = default;

// static
MeetingPlatformDetector* MeetingPlatformDetector::GetInstance() {
  static base::NoDestructor<MeetingPlatformDetector> instance;
  return instance.get();
}

MeetingPlatform MeetingPlatformDetector::DetectPlatform(const GURL& url) const {
  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS()) {
    return MeetingPlatform::kNone;
  }

  if (MatchesGoogleMeet(url)) {
    return MeetingPlatform::kGoogleMeet;
  }

  if (MatchesZoom(url)) {
    return MeetingPlatform::kZoom;
  }

  if (MatchesMicrosoftTeams(url)) {
    return MeetingPlatform::kMicrosoftTeams;
  }

  return MeetingPlatform::kNone;
}

bool MeetingPlatformDetector::IsMeetingPlatformUrl(const GURL& url) const {
  return DetectPlatform(url) != MeetingPlatform::kNone;
}

void MeetingPlatformDetector::OnNavigationCommitted(const GURL& url) {
  MeetingPlatform platform = DetectPlatform(url);

  // Check if we're leaving a meeting
  if (current_meeting_.platform != MeetingPlatform::kNone &&
      platform == MeetingPlatform::kNone) {
    LOG(INFO) << "[Blockd] Left meeting platform: "
              << GetPlatformName(current_meeting_.platform);

    MeetingInfo ended_meeting = current_meeting_;
    ended_meeting.is_active = false;

    current_meeting_ = MeetingInfo();
    NotifyMeetingEnded(ended_meeting);
    return;
  }

  // Check if we're entering a meeting
  if (platform != MeetingPlatform::kNone) {
    // Check if this is a new meeting or same platform
    bool is_new_meeting = (current_meeting_.platform != platform) ||
                          (current_meeting_.meeting_url != url.spec());

    if (is_new_meeting) {
      // End previous meeting if any
      if (current_meeting_.platform != MeetingPlatform::kNone) {
        MeetingInfo ended_meeting = current_meeting_;
        ended_meeting.is_active = false;
        NotifyMeetingEnded(ended_meeting);
      }

      // Start new meeting
      current_meeting_.platform = platform;
      current_meeting_.meeting_url = url.spec();
      current_meeting_.meeting_id = ExtractMeetingId(url, platform);
      current_meeting_.detected_at = base::Time::Now();
      current_meeting_.is_active = true;

      LOG(INFO) << "[Blockd] Detected meeting platform: "
                << GetPlatformName(platform)
                << " URL: " << url.spec()
                << " Meeting ID: " << current_meeting_.meeting_id;

      NotifyMeetingDetected(current_meeting_);
    }
  }
}

void MeetingPlatformDetector::OnPageClosed(const GURL& url) {
  if (current_meeting_.platform != MeetingPlatform::kNone &&
      current_meeting_.meeting_url == url.spec()) {
    LOG(INFO) << "[Blockd] Meeting page closed: "
              << GetPlatformName(current_meeting_.platform);

    MeetingInfo ended_meeting = current_meeting_;
    ended_meeting.is_active = false;

    current_meeting_ = MeetingInfo();
    NotifyMeetingEnded(ended_meeting);
  }
}

void MeetingPlatformDetector::AddObserver(MeetingPlatformObserver* observer) {
  observers_.AddObserver(observer);
}

void MeetingPlatformDetector::RemoveObserver(MeetingPlatformObserver* observer) {
  observers_.RemoveObserver(observer);
}

// static
std::string MeetingPlatformDetector::GetPlatformName(MeetingPlatform platform) {
  switch (platform) {
    case MeetingPlatform::kGoogleMeet:
      return "google-meet";
    case MeetingPlatform::kZoom:
      return "zoom";
    case MeetingPlatform::kMicrosoftTeams:
      return "teams";
    case MeetingPlatform::kNone:
    default:
      return "none";
  }
}

bool MeetingPlatformDetector::MatchesGoogleMeet(const GURL& url) const {
  std::string host = url.host();

  for (const char* meet_host : kGoogleMeetHosts) {
    if (host == meet_host) {
      return true;
    }
  }

  return false;
}

bool MeetingPlatformDetector::MatchesZoom(const GURL& url) const {
  std::string host = url.host();

  // Check exact matches
  for (const char* zoom_host : kZoomHosts) {
    if (host == zoom_host) {
      return true;
    }
  }

  // Check wildcard *.zoom.us pattern
  if (base::EndsWith(host, ".zoom.us", base::CompareCase::INSENSITIVE_ASCII)) {
    return true;
  }

  return false;
}

bool MeetingPlatformDetector::MatchesMicrosoftTeams(const GURL& url) const {
  std::string host = url.host();

  for (const char* teams_host : kTeamsHosts) {
    if (host == teams_host) {
      return true;
    }
  }

  return false;
}

std::string MeetingPlatformDetector::ExtractMeetingId(
    const GURL& url,
    MeetingPlatform platform) const {
  std::string path = url.path();

  switch (platform) {
    case MeetingPlatform::kGoogleMeet: {
      // Google Meet URL format: meet.google.com/xxx-xxxx-xxx
      if (path.length() > 1 && path[0] == '/') {
        std::string meeting_code = path.substr(1);
        // Remove any trailing path segments
        size_t slash_pos = meeting_code.find('/');
        if (slash_pos != std::string::npos) {
          meeting_code = meeting_code.substr(0, slash_pos);
        }
        // Validate format (xxx-xxxx-xxx)
        if (meeting_code.length() >= 10) {
          return meeting_code;
        }
      }
      break;
    }

    case MeetingPlatform::kZoom: {
      // Zoom URL formats:
      // zoom.us/j/MEETING_ID
      // zoom.us/wc/MEETING_ID/join
      if (path.find("/j/") != std::string::npos) {
        size_t start = path.find("/j/") + 3;
        size_t end = path.find('/', start);
        if (end == std::string::npos) {
          end = path.length();
        }
        return path.substr(start, end - start);
      }
      if (path.find("/wc/") != std::string::npos) {
        size_t start = path.find("/wc/") + 4;
        size_t end = path.find('/', start);
        if (end == std::string::npos) {
          end = path.length();
        }
        return path.substr(start, end - start);
      }
      break;
    }

    case MeetingPlatform::kMicrosoftTeams: {
      // Teams URL formats vary, try to extract meeting ID from path or query
      // teams.microsoft.com/l/meetup-join/...
      if (path.find("/meetup-join/") != std::string::npos ||
          path.find("/meet/") != std::string::npos) {
        // Return a hash of the full URL as meeting ID
        return std::to_string(std::hash<std::string>{}(url.spec()));
      }
      break;
    }

    default:
      break;
  }

  return "";
}

void MeetingPlatformDetector::NotifyMeetingDetected(const MeetingInfo& info) {
  for (auto& observer : observers_) {
    observer.OnMeetingDetected(info);
  }
}

void MeetingPlatformDetector::NotifyMeetingEnded(const MeetingInfo& info) {
  for (auto& observer : observers_) {
    observer.OnMeetingEnded(info);
  }
}

}  // namespace blocked
