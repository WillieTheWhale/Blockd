// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Stub header for MediaPipe face geometry module.
// In production, this would be replaced with actual MediaPipe library code.

#ifndef THIRD_PARTY_MEDIAPIPE_MEDIAPIPE_MODULES_FACE_GEOMETRY_FACE_GEOMETRY_H_
#define THIRD_PARTY_MEDIAPIPE_MEDIAPIPE_MODULES_FACE_GEOMETRY_FACE_GEOMETRY_H_

#include <array>
#include <vector>

namespace mediapipe {
namespace face_geometry {

// 3D face pose estimation result.
struct FacePose {
  // Rotation matrix (3x3).
  std::array<float, 9> rotation;
  // Translation vector (3).
  std::array<float, 3> translation;
};

// Face geometry calculator for 3D pose estimation.
class FaceGeometry {
 public:
  FaceGeometry();
  ~FaceGeometry();

  // Compute face pose from 2D landmarks.
  bool ComputePose(const std::vector<float>& landmarks_2d,
                   int image_width,
                   int image_height,
                   FacePose* pose);

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace face_geometry
}  // namespace mediapipe

#endif  // THIRD_PARTY_MEDIAPIPE_MEDIAPIPE_MODULES_FACE_GEOMETRY_FACE_GEOMETRY_H_
