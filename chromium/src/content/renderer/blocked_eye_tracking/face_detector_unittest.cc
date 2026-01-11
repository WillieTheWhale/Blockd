// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/face_detector.h"

#include <vector>

#include "base/test/task_environment.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace content {
namespace {

class FaceDetectorTest : public testing::Test {
 protected:
  void SetUp() override {
    face_detector_ = std::make_unique<FaceDetector>();
  }

  void TearDown() override { face_detector_.reset(); }

  std::unique_ptr<FaceDetector> face_detector_;
  base::test::TaskEnvironment task_environment_;
};

TEST_F(FaceDetectorTest, InitializationSucceeds) {
  EXPECT_TRUE(face_detector_->Initialize());
}

TEST_F(FaceDetectorTest, ProcessEmptyFrameReturnsFalse) {
  ASSERT_TRUE(face_detector_->Initialize());

  // Empty frame data
  std::vector<uint8_t> empty_frame;
  FaceDetector::FaceResult result;

  EXPECT_FALSE(face_detector_->DetectFace(empty_frame.data(), 0, 0, &result));
}

TEST_F(FaceDetectorTest, ProcessValidFrameReturnsLandmarks) {
  ASSERT_TRUE(face_detector_->Initialize());

  // Create a minimal valid frame (640x480 RGB)
  std::vector<uint8_t> frame(640 * 480 * 3, 128);
  FaceDetector::FaceResult result;

  bool detected = face_detector_->DetectFace(frame.data(), 640, 480, &result);

  // Detection may or may not find a face in synthetic data
  if (detected) {
    // If face detected, should have landmarks
    EXPECT_FALSE(result.landmarks.empty());
  }
}

TEST_F(FaceDetectorTest, ResetClearsState) {
  ASSERT_TRUE(face_detector_->Initialize());
  face_detector_->Reset();
  // Should be able to re-initialize after reset
  EXPECT_TRUE(face_detector_->Initialize());
}

}  // namespace
}  // namespace content
