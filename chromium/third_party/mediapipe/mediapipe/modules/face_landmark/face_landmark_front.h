// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Stub header for MediaPipe face landmark module.
// In production, this would be replaced with actual MediaPipe library code.

#ifndef THIRD_PARTY_MEDIAPIPE_MEDIAPIPE_MODULES_FACE_LANDMARK_FACE_LANDMARK_FRONT_H_
#define THIRD_PARTY_MEDIAPIPE_MEDIAPIPE_MODULES_FACE_LANDMARK_FACE_LANDMARK_FRONT_H_

#include <memory>
#include <string>
#include <vector>

namespace mediapipe {
namespace face_landmark {

// Single facial landmark point.
struct Landmark {
  float x;  // Normalized x coordinate (0-1).
  float y;  // Normalized y coordinate (0-1).
  float z;  // Estimated depth.
  float visibility;  // Visibility score.
};

// Complete facial landmark detection result (468 points).
struct FaceLandmarks {
  std::vector<Landmark> points;
  float detection_score;
};

// Face landmark detector for front-facing camera.
class FaceLandmarkFront {
 public:
  FaceLandmarkFront();
  ~FaceLandmarkFront();

  // Initialize with model path.
  bool Initialize(const std::string& model_path);

  // Detect landmarks in an image.
  bool Detect(const uint8_t* rgb_data,
              int width,
              int height,
              FaceLandmarks* landmarks);

  // Reset detection state.
  void Reset();

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace face_landmark
}  // namespace mediapipe

#endif  // THIRD_PARTY_MEDIAPIPE_MEDIAPIPE_MODULES_FACE_LANDMARK_FACE_LANDMARK_FRONT_H_
