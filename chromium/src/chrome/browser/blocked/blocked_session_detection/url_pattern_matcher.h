// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_SESSION_DETECTION_URL_PATTERN_MATCHER_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_SESSION_DETECTION_URL_PATTERN_MATCHER_H_

#include <string>
#include <vector>

#include "url/gurl.h"

namespace blocked {

// Matches URLs against known interview platform patterns.
// Detects Google Meet, Zoom, Microsoft Teams, and similar platforms.
class UrlPatternMatcher {
 public:
  // Interview platform type.
  enum class Platform {
    kUnknown,
    kGoogleMeet,
    kZoom,
    kMicrosoftTeams,
    kWebex,
    kSlackHuddle,
    kDiscord,
    kSkype,
  };

  struct MatchResult {
    bool is_match = false;
    Platform platform = Platform::kUnknown;
    std::string meeting_id;  // Extracted meeting/room ID if available
    std::string platform_name;
  };

  UrlPatternMatcher();
  ~UrlPatternMatcher();

  UrlPatternMatcher(const UrlPatternMatcher&) = delete;
  UrlPatternMatcher& operator=(const UrlPatternMatcher&) = delete;

  // Check if URL matches an interview platform.
  MatchResult Match(const GURL& url) const;

  // Check if URL is likely an interview/meeting URL.
  bool IsInterviewUrl(const GURL& url) const;

  // Get platform name from enum.
  static std::string GetPlatformName(Platform platform);

  // Add custom pattern (for testing or configuration).
  void AddCustomPattern(const std::string& host_pattern,
                        const std::string& path_pattern,
                        Platform platform);

 private:
  struct Pattern {
    std::string host_pattern;
    std::string path_pattern;
    Platform platform;
  };

  std::vector<Pattern> patterns_;

  void InitializeDefaultPatterns();
  bool MatchesPattern(const GURL& url, const Pattern& pattern) const;
  std::string ExtractMeetingId(const GURL& url, Platform platform) const;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_SESSION_DETECTION_URL_PATTERN_MATCHER_H_
