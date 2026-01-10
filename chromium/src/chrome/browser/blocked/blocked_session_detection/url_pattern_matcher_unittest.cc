// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_session_detection/url_pattern_matcher.h"

#include "testing/gtest/include/gtest/gtest.h"
#include "url/gurl.h"

namespace blocked {
namespace {

class UrlPatternMatcherTest : public testing::Test {
 protected:
  UrlPatternMatcher matcher_;
};

TEST_F(UrlPatternMatcherTest, MatchesGoogleMeet) {
  GURL url("https://meet.google.com/abc-defg-hij");
  auto result = matcher_.Match(url);

  EXPECT_TRUE(result.is_match);
  EXPECT_EQ(result.platform, UrlPatternMatcher::Platform::kGoogleMeet);
  EXPECT_EQ(result.platform_name, "Google Meet");
  EXPECT_EQ(result.meeting_id, "abc-defg-hij");
}

TEST_F(UrlPatternMatcherTest, MatchesZoomJoin) {
  GURL url("https://zoom.us/j/123456789");
  auto result = matcher_.Match(url);

  EXPECT_TRUE(result.is_match);
  EXPECT_EQ(result.platform, UrlPatternMatcher::Platform::kZoom);
  EXPECT_EQ(result.platform_name, "Zoom");
  EXPECT_EQ(result.meeting_id, "123456789");
}

TEST_F(UrlPatternMatcherTest, MatchesZoomWebClient) {
  GURL url("https://zoom.us/wc/123456789/join");
  auto result = matcher_.Match(url);

  EXPECT_TRUE(result.is_match);
  EXPECT_EQ(result.platform, UrlPatternMatcher::Platform::kZoom);
  EXPECT_EQ(result.meeting_id, "123456789");
}

TEST_F(UrlPatternMatcherTest, MatchesMicrosoftTeams) {
  GURL url("https://teams.microsoft.com/l/meetup-join/meeting123");
  auto result = matcher_.Match(url);

  EXPECT_TRUE(result.is_match);
  EXPECT_EQ(result.platform, UrlPatternMatcher::Platform::kMicrosoftTeams);
  EXPECT_EQ(result.platform_name, "Microsoft Teams");
}

TEST_F(UrlPatternMatcherTest, DoesNotMatchRegularWebsite) {
  GURL url("https://www.google.com");
  auto result = matcher_.Match(url);

  EXPECT_FALSE(result.is_match);
  EXPECT_EQ(result.platform, UrlPatternMatcher::Platform::kUnknown);
}

TEST_F(UrlPatternMatcherTest, DoesNotMatchInvalidUrl) {
  GURL url("not-a-valid-url");
  auto result = matcher_.Match(url);

  EXPECT_FALSE(result.is_match);
}

TEST_F(UrlPatternMatcherTest, IsInterviewUrl) {
  EXPECT_TRUE(matcher_.IsInterviewUrl(GURL("https://meet.google.com/abc")));
  EXPECT_TRUE(matcher_.IsInterviewUrl(GURL("https://zoom.us/j/123")));
  EXPECT_FALSE(matcher_.IsInterviewUrl(GURL("https://www.example.com")));
}

TEST_F(UrlPatternMatcherTest, CustomPattern) {
  matcher_.AddCustomPattern("interview.company.com", "/session/*",
                             UrlPatternMatcher::Platform::kUnknown);

  GURL url("https://interview.company.com/session/abc123");
  EXPECT_TRUE(matcher_.IsInterviewUrl(url));
}

}  // namespace
}  // namespace blocked
