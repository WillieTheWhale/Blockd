// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "third_party/mediapipe/blocked_facemesh_wrapper.h"

#include "base/test/task_environment.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace blocked {
namespace {

class FaceMeshWrapperTest : public testing::Test {
 protected:
  void SetUp() override { wrapper_ = std::make_unique<FaceMeshWrapper>(); }

  void TearDown() override { wrapper_.reset(); }

  std::unique_ptr<FaceMeshWrapper> wrapper_;
  base::test::TaskEnvironment task_environment_;
};

TEST_F(FaceMeshWrapperTest, InitializeSucceeds) {
  EXPECT_FALSE(wrapper_->IsInitialized());
  EXPECT_TRUE(wrapper_->Initialize());
  EXPECT_TRUE(wrapper_->IsInitialized());
}

TEST_F(FaceMeshWrapperTest, DoubleInitializeSucceeds) {
  EXPECT_TRUE(wrapper_->Initialize());
  EXPECT_TRUE(wrapper_->Initialize());
  EXPECT_TRUE(wrapper_->IsInitialized());
}

TEST_F(FaceMeshWrapperTest, ProcessFrameWithoutInitFails) {
  FaceMeshWrapper::FaceResult result;
  std::vector<uint8_t> frame_data(640 * 480 * 3, 128);

  EXPECT_FALSE(
      wrapper_->ProcessFrame(frame_data.data(), 640, 480, &result));
}

TEST_F(FaceMeshWrapperTest, ProcessFrameReturnsLandmarks) {
  ASSERT_TRUE(wrapper_->Initialize());

  FaceMeshWrapper::FaceResult result;
  std::vector<uint8_t> frame_data(640 * 480 * 3, 128);

  EXPECT_TRUE(
      wrapper_->ProcessFrame(frame_data.data(), 640, 480, &result));

  // FaceMesh produces 468 landmarks
  EXPECT_EQ(result.landmarks.size(), 468u);

  // Iris landmarks: 5 per eye
  EXPECT_EQ(result.left_iris.size(), 5u);
  EXPECT_EQ(result.right_iris.size(), 5u);

  // Confidence should be valid
  EXPECT_GT(result.detection_confidence, 0.0f);
  EXPECT_LE(result.detection_confidence, 1.0f);
}

TEST_F(FaceMeshWrapperTest, ProcessFrameWithNullDataFails) {
  ASSERT_TRUE(wrapper_->Initialize());

  FaceMeshWrapper::FaceResult result;
  EXPECT_FALSE(wrapper_->ProcessFrame(nullptr, 640, 480, &result));
}

TEST_F(FaceMeshWrapperTest, ProcessFrameWithNullResultFails) {
  ASSERT_TRUE(wrapper_->Initialize());

  std::vector<uint8_t> frame_data(640 * 480 * 3, 128);
  EXPECT_FALSE(wrapper_->ProcessFrame(frame_data.data(), 640, 480, nullptr));
}

TEST_F(FaceMeshWrapperTest, ResetClearsState) {
  ASSERT_TRUE(wrapper_->Initialize());
  wrapper_->Reset();
  // Wrapper should still be initialized after reset
  EXPECT_TRUE(wrapper_->IsInitialized());
}

TEST_F(FaceMeshWrapperTest, LandmarkCoordinatesAreNormalized) {
  ASSERT_TRUE(wrapper_->Initialize());

  FaceMeshWrapper::FaceResult result;
  std::vector<uint8_t> frame_data(640 * 480 * 3, 128);
  ASSERT_TRUE(wrapper_->ProcessFrame(frame_data.data(), 640, 480, &result));

  for (const auto& landmark : result.landmarks) {
    EXPECT_GE(landmark.x, 0.0f);
    EXPECT_LE(landmark.x, 1.0f);
    EXPECT_GE(landmark.y, 0.0f);
    EXPECT_LE(landmark.y, 1.0f);
  }
}

}  // namespace
}  // namespace blocked
