// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Stub implementation for MediaPipe face landmark module.
// In production, this would be replaced with actual MediaPipe library code.

#include "third_party/mediapipe/mediapipe/modules/face_landmark/face_landmark_front.h"

#include <memory>

namespace mediapipe {
namespace face_landmark {

class FaceLandmarkFront::Impl {
 public:
  bool initialized = false;
};

FaceLandmarkFront::FaceLandmarkFront() : impl_(std::make_unique<Impl>()) {}

FaceLandmarkFront::~FaceLandmarkFront() = default;

bool FaceLandmarkFront::Initialize(const std::string& model_path) {
  // Stub: Always return success for build testing.
  impl_->initialized = true;
  return true;
}

bool FaceLandmarkFront::Detect(const uint8_t* rgb_data,
                                int width,
                                int height,
                                FaceLandmarks* landmarks) {
  if (!impl_->initialized || !landmarks) {
    return false;
  }

  // Stub: Generate 468 fake landmarks centered around face position.
  landmarks->points.clear();
  landmarks->points.reserve(468);

  for (int i = 0; i < 468; i++) {
    Landmark lm;
    // Generate landmarks in a face-shaped distribution.
    float row = static_cast<float>(i / 30);
    float col = static_cast<float>(i % 30);
    lm.x = 0.35f + col * 0.01f;  // Centered around 0.5
    lm.y = 0.25f + row * 0.03f;  // Face region
    lm.z = 0.0f;
    lm.visibility = 1.0f;
    landmarks->points.push_back(lm);
  }

  landmarks->detection_score = 0.95f;
  return true;
}

void FaceLandmarkFront::Reset() {
  // Nothing to reset in stub.
}

}  // namespace face_landmark
}  // namespace mediapipe
