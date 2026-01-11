// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "testing/gtest/include/gtest/gtest.h"

namespace blocked {
namespace {

// Placeholder unit tests for process monitoring functionality.
// TODO: Implement actual tests when process monitoring is complete.

class ProcessMonitorTest : public testing::Test {
 protected:
  void SetUp() override {}
  void TearDown() override {}
};

TEST_F(ProcessMonitorTest, PlaceholderTest) {
  // Placeholder test - actual implementation pending.
  EXPECT_TRUE(true);
}

TEST_F(ProcessMonitorTest, DetectsScreenRecordingSoftware) {
  // TODO: Test that common screen recording software is detected.
  // - OBS Studio
  // - Camtasia
  // - ScreenFlow
  EXPECT_TRUE(true);
}

TEST_F(ProcessMonitorTest, IgnoresNormalProcesses) {
  // TODO: Test that normal system processes are not flagged.
  EXPECT_TRUE(true);
}

}  // namespace
}  // namespace blocked
