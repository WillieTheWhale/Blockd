// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/eye_tracker.h"

#include "base/test/task_environment.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace content {
namespace {

class EyeTrackerTest : public testing::Test {
 protected:
  void SetUp() override {
    eye_tracker_ = std::make_unique<EyeTracker>();
  }

  void TearDown() override { eye_tracker_.reset(); }

  std::unique_ptr<EyeTracker> eye_tracker_;
  base::test::TaskEnvironment task_environment_;
};

TEST_F(EyeTrackerTest, InitializesInStoppedState) {
  EXPECT_FALSE(eye_tracker_->IsRunning());
}

TEST_F(EyeTrackerTest, StartAndStop) {
  eye_tracker_->Start();
  EXPECT_TRUE(eye_tracker_->IsRunning());

  eye_tracker_->Stop();
  EXPECT_FALSE(eye_tracker_->IsRunning());
}

TEST_F(EyeTrackerTest, DoubleStartIgnored) {
  eye_tracker_->Start();
  eye_tracker_->Start();  // Should be ignored
  EXPECT_TRUE(eye_tracker_->IsRunning());
}

TEST_F(EyeTrackerTest, DoubleStopIgnored) {
  eye_tracker_->Start();
  eye_tracker_->Stop();
  eye_tracker_->Stop();  // Should be ignored
  EXPECT_FALSE(eye_tracker_->IsRunning());
}

TEST_F(EyeTrackerTest, CalibrationRequiresRunning) {
  // Cannot calibrate when not running
  eye_tracker_->StartCalibration();
  // No crash expected
}

}  // namespace
}  // namespace content
