// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "third_party/mediapipe/blocked_facemesh_wrapper.h"

#include "base/test/task_environment.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace blocked {
namespace {

// Unit tests for FaceMeshWrapper functionality.

class FaceMeshWrapperTest : public testing::Test {
 protected:
  void SetUp() override {}
  void TearDown() override {}

  base::test::TaskEnvironment task_environment_;
};

TEST_F(FaceMeshWrapperTest, InitializesSuccessfully) {
  FaceMeshWrapper wrapper;
  EXPECT_FALSE(wrapper.IsInitialized());
  EXPECT_TRUE(wrapper.Initialize());
  EXPECT_TRUE(wrapper.IsInitialized());
}

TEST_F(FaceMeshWrapperTest, ProcessFrameRequiresInitialization) {
  FaceMeshWrapper wrapper;
  FaceMeshWrapper::FaceResult result;
  uint8_t fake_data[640 * 480 * 3] = {0};

  // Should fail without initialization.
  EXPECT_FALSE(wrapper.ProcessFrame(fake_data, 640, 480, &result));
}

TEST_F(FaceMeshWrapperTest, ProcessFrameWithValidData) {
  FaceMeshWrapper wrapper;
  ASSERT_TRUE(wrapper.Initialize());

  FaceMeshWrapper::FaceResult result;
  uint8_t fake_data[640 * 480 * 3] = {0};

  EXPECT_TRUE(wrapper.ProcessFrame(fake_data, 640, 480, &result));

  // Check that landmarks are populated.
  EXPECT_EQ(result.landmarks.size(), 468u);
  EXPECT_EQ(result.left_iris.size(), 5u);
  EXPECT_EQ(result.right_iris.size(), 5u);
  EXPECT_GT(result.detection_confidence, 0.0f);
  EXPECT_GT(result.tracking_confidence, 0.0f);
}

TEST_F(FaceMeshWrapperTest, ProcessFrameRejectsNullData) {
  FaceMeshWrapper wrapper;
  ASSERT_TRUE(wrapper.Initialize());

  FaceMeshWrapper::FaceResult result;
  EXPECT_FALSE(wrapper.ProcessFrame(nullptr, 640, 480, &result));
}

TEST_F(FaceMeshWrapperTest, ProcessFrameRejectsNullResult) {
  FaceMeshWrapper wrapper;
  ASSERT_TRUE(wrapper.Initialize());

  uint8_t fake_data[640 * 480 * 3] = {0};
  EXPECT_FALSE(wrapper.ProcessFrame(fake_data, 640, 480, nullptr));
}

TEST_F(FaceMeshWrapperTest, ResetWorks) {
  FaceMeshWrapper wrapper;
  ASSERT_TRUE(wrapper.Initialize());

  // Reset should not crash.
  wrapper.Reset();
  EXPECT_TRUE(wrapper.IsInitialized());
}

TEST_F(FaceMeshWrapperTest, LandmarkCoordinatesAreNormalized) {
  FaceMeshWrapper wrapper;
  ASSERT_TRUE(wrapper.Initialize());

  FaceMeshWrapper::FaceResult result;
  uint8_t fake_data[640 * 480 * 3] = {0};

  ASSERT_TRUE(wrapper.ProcessFrame(fake_data, 640, 480, &result));

  // All landmarks should have normalized coordinates (0-1).
  for (const auto& lm : result.landmarks) {
    EXPECT_GE(lm.x, 0.0f);
    EXPECT_LE(lm.x, 1.0f);
    EXPECT_GE(lm.y, 0.0f);
    EXPECT_LE(lm.y, 1.0f);
  }

  // Iris landmarks should also be normalized.
  for (const auto& lm : result.left_iris) {
    EXPECT_GE(lm.x, 0.0f);
    EXPECT_LE(lm.x, 1.0f);
  }
  for (const auto& lm : result.right_iris) {
    EXPECT_GE(lm.x, 0.0f);
    EXPECT_LE(lm.x, 1.0f);
  }
}

}  // namespace
}  // namespace blocked
