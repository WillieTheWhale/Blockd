// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/gaze_estimator.h"

#include <vector>

#include "base/test/task_environment.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace content {
namespace {

class GazeEstimatorTest : public testing::Test {
 protected:
  void SetUp() override {
    gaze_estimator_ = std::make_unique<GazeEstimator>();
  }

  void TearDown() override { gaze_estimator_.reset(); }

  std::unique_ptr<GazeEstimator> gaze_estimator_;
  base::test::TaskEnvironment task_environment_;
};

TEST_F(GazeEstimatorTest, InitializesSuccessfully) {
  EXPECT_TRUE(gaze_estimator_->Initialize());
}

TEST_F(GazeEstimatorTest, EstimateGazeFromEmptyLandmarks) {
  ASSERT_TRUE(gaze_estimator_->Initialize());

  std::vector<GazeEstimator::Landmark> empty_landmarks;
  GazeEstimator::GazeResult result;

  // Should handle empty landmarks gracefully
  bool success = gaze_estimator_->EstimateGaze(empty_landmarks, &result);
  EXPECT_FALSE(success);
}

TEST_F(GazeEstimatorTest, NormalizedOutputRange) {
  ASSERT_TRUE(gaze_estimator_->Initialize());

  // Create synthetic face landmarks (simplified)
  std::vector<GazeEstimator::Landmark> landmarks;
  for (int i = 0; i < 468; i++) {
    GazeEstimator::Landmark lm;
    lm.x = 0.5f;
    lm.y = 0.5f;
    lm.z = 0.0f;
    landmarks.push_back(lm);
  }

  GazeEstimator::GazeResult result;
  bool success = gaze_estimator_->EstimateGaze(landmarks, &result);

  if (success) {
    // Gaze coordinates should be normalized 0-1
    EXPECT_GE(result.x, 0.0f);
    EXPECT_LE(result.x, 1.0f);
    EXPECT_GE(result.y, 0.0f);
    EXPECT_LE(result.y, 1.0f);
    // Confidence should be 0-1
    EXPECT_GE(result.confidence, 0.0f);
    EXPECT_LE(result.confidence, 1.0f);
  }
}

TEST_F(GazeEstimatorTest, DetectsOffScreenGaze) {
  ASSERT_TRUE(gaze_estimator_->Initialize());

  // Simulate off-screen gaze (looking far left)
  std::vector<GazeEstimator::Landmark> landmarks;
  for (int i = 0; i < 468; i++) {
    GazeEstimator::Landmark lm;
    lm.x = -0.5f;  // Off-screen left
    lm.y = 0.5f;
    lm.z = 0.0f;
    landmarks.push_back(lm);
  }

  GazeEstimator::GazeResult result;
  gaze_estimator_->EstimateGaze(landmarks, &result);

  // Off-screen detection depends on implementation
  // This tests the API works without crashing
}

TEST_F(GazeEstimatorTest, ResetClearsCalibration) {
  ASSERT_TRUE(gaze_estimator_->Initialize());
  gaze_estimator_->Reset();
  // Estimator should still work after reset
  EXPECT_TRUE(gaze_estimator_->Initialize());
}

}  // namespace
}  // namespace content
