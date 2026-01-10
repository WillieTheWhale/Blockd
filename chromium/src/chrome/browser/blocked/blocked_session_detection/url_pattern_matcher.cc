// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_session_detection/url_pattern_matcher.h"

#include "base/logging.h"
#include "base/strings/string_util.h"

namespace blocked {

UrlPatternMatcher::UrlPatternMatcher() {
  InitializeDefaultPatterns();
}

UrlPatternMatcher::~UrlPatternMatcher() = default;

void UrlPatternMatcher::InitializeDefaultPatterns() {
  // Google Meet patterns.
  patterns_.push_back({"meet.google.com", "/*", Platform::kGoogleMeet});

  // Zoom patterns.
  patterns_.push_back({"zoom.us", "/j/*", Platform::kZoom});
  patterns_.push_back({"zoom.us", "/wc/*", Platform::kZoom});
  patterns_.push_back({"*.zoom.us", "/j/*", Platform::kZoom});

  // Microsoft Teams patterns.
  patterns_.push_back({"teams.microsoft.com", "/l/meetup-join/*", Platform::kMicrosoftTeams});
  patterns_.push_back({"teams.live.com", "/*", Platform::kMicrosoftTeams});

  // Webex patterns.
  patterns_.push_back({"*.webex.com", "/meet/*", Platform::kWebex});
  patterns_.push_back({"*.webex.com", "/join/*", Platform::kWebex});

  // Slack Huddle patterns.
  patterns_.push_back({"app.slack.com", "/huddle/*", Platform::kSlackHuddle});

  // Discord patterns.
  patterns_.push_back({"discord.com", "/channels/*", Platform::kDiscord});

  // Skype patterns.
  patterns_.push_back({"join.skype.com", "/*", Platform::kSkype});
  patterns_.push_back({"web.skype.com", "/*", Platform::kSkype});

  LOG(INFO) << "UrlPatternMatcher initialized with " << patterns_.size()
            << " patterns";
}

UrlPatternMatcher::MatchResult UrlPatternMatcher::Match(const GURL& url) const {
  MatchResult result;

  if (!url.is_valid() || !url.SchemeIsHTTPOrHTTPS()) {
    return result;
  }

  for (const auto& pattern : patterns_) {
    if (MatchesPattern(url, pattern)) {
      result.is_match = true;
      result.platform = pattern.platform;
      result.platform_name = GetPlatformName(pattern.platform);
      result.meeting_id = ExtractMeetingId(url, pattern.platform);

      LOG(INFO) << "URL matched platform: " << result.platform_name
                << " (meeting_id: " << result.meeting_id << ")";
      return result;
    }
  }

  return result;
}

bool UrlPatternMatcher::IsInterviewUrl(const GURL& url) const {
  return Match(url).is_match;
}

bool UrlPatternMatcher::MatchesPattern(const GURL& url,
                                        const Pattern& pattern) const {
  std::string host = url.host();

  // Check host pattern.
  if (pattern.host_pattern.find('*') != std::string::npos) {
    // Wildcard pattern (e.g., "*.zoom.us").
    std::string suffix = pattern.host_pattern.substr(1);  // Remove leading *
    if (!base::EndsWith(host, suffix, base::CompareCase::INSENSITIVE_ASCII)) {
      return false;
    }
  } else {
    // Exact match.
    if (!base::EqualsCaseInsensitiveASCII(host, pattern.host_pattern)) {
      return false;
    }
  }

  // Check path pattern.
  std::string path = url.path();
  if (pattern.path_pattern == "/*") {
    // Match any path.
    return true;
  }

  if (pattern.path_pattern.find('*') != std::string::npos) {
    // Path with wildcard.
    std::string prefix = pattern.path_pattern.substr(
        0, pattern.path_pattern.find('*'));
    return base::StartsWith(path, prefix, base::CompareCase::SENSITIVE);
  }

  // Exact path match.
  return path == pattern.path_pattern;
}

std::string UrlPatternMatcher::ExtractMeetingId(const GURL& url,
                                                 Platform platform) const {
  std::string path = url.path();

  switch (platform) {
    case Platform::kGoogleMeet: {
      // Format: /xxx-xxxx-xxx
      if (path.length() > 1) {
        return path.substr(1);  // Remove leading /
      }
      break;
    }

    case Platform::kZoom: {
      // Format: /j/123456789 or /wc/123456789/join
      if (base::StartsWith(path, "/j/", base::CompareCase::SENSITIVE)) {
        size_t end = path.find('?');
        if (end == std::string::npos) end = path.length();
        return path.substr(3, end - 3);
      }
      if (base::StartsWith(path, "/wc/", base::CompareCase::SENSITIVE)) {
        size_t start = 4;
        size_t end = path.find('/', start);
        if (end == std::string::npos) end = path.length();
        return path.substr(start, end - start);
      }
      break;
    }

    case Platform::kMicrosoftTeams: {
      // Extract from query params or path.
      // Meeting ID is usually in a complex URL structure.
      // For now, return the meeting context if available.
      std::string context = url.query();
      if (!context.empty()) {
        return "teams-meeting";
      }
      break;
    }

    case Platform::kWebex: {
      // Format: /meet/username or /join/meetingid
      if (path.length() > 6) {
        return path.substr(path.find('/', 1) + 1);
      }
      break;
    }

    default:
      break;
  }

  return "";
}

// static
std::string UrlPatternMatcher::GetPlatformName(Platform platform) {
  switch (platform) {
    case Platform::kGoogleMeet:
      return "Google Meet";
    case Platform::kZoom:
      return "Zoom";
    case Platform::kMicrosoftTeams:
      return "Microsoft Teams";
    case Platform::kWebex:
      return "Webex";
    case Platform::kSlackHuddle:
      return "Slack Huddle";
    case Platform::kDiscord:
      return "Discord";
    case Platform::kSkype:
      return "Skype";
    case Platform::kUnknown:
    default:
      return "Unknown";
  }
}

void UrlPatternMatcher::AddCustomPattern(const std::string& host_pattern,
                                          const std::string& path_pattern,
                                          Platform platform) {
  patterns_.push_back({host_pattern, path_pattern, platform});
  LOG(INFO) << "Added custom pattern: " << host_pattern << path_pattern;
}

}  // namespace blocked
