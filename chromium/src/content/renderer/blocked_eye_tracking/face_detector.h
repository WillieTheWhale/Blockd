// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_EYE_TRACKING_FACE_DETECTOR_H_
#define CONTENT_RENDERER_BLOCKED_EYE_TRACKING_FACE_DETECTOR_H_

#include <memory>
#include <vector>

#include "base/memory/ref_counted.h"
#include "third_party/skia/include/core/SkBitmap.h"

namespace mediapipe {
class FaceMesh;
}  // namespace mediapipe

namespace content {

// Wrapper around MediaPipe FaceMesh for facial landmark detection.
// Detects 468-point facial landmarks including eye and iris landmarks.
class FaceDetector {
 public:
  struct Landmark {
    float x;  // Normalized 0-1
    float y;  // Normalized 0-1
    float z;  // Depth estimate
  };

  struct FaceLandmarks {
    std::vector<Landmark> landmarks;  // 468 points
    float confidence;

    // Key landmark indices (MediaPipe FaceMesh topology).
    static constexpr int kLeftEyeCenter = 468;
    static constexpr int kRightEyeCenter = 473;
    static constexpr int kLeftIrisCenter = 468;
    static constexpr int kRightIrisCenter = 473;

    // Eye contour indices.
    static constexpr int kLeftEyeIndices[] = {
        33, 7, 163, 144, 145, 153, 154, 155, 133,
        173, 157, 158, 159, 160, 161, 246};
    static constexpr int kRightEyeIndices[] = {
        362, 382, 381, 380, 374, 373, 390, 249,
        263, 466, 388, 387, 386, 385, 384, 398};
  };

  FaceDetector();
  ~FaceDetector();

  FaceDetector(const FaceDetector&) = delete;
  FaceDetector& operator=(const FaceDetector&) = delete;

  // Initialize MediaPipe FaceMesh model.
  bool Initialize();

  // Detect facial landmarks in video frame.
  // Returns true if face detected, false otherwise.
  bool DetectFace(const SkBitmap& frame, FaceLandmarks* landmarks);

  // Check if detector is initialized and ready.
  bool IsInitialized() const { return is_initialized_; }

 private:
  bool LoadModel();

  bool is_initialized_ = false;
  std::unique_ptr<mediapipe::FaceMesh> face_mesh_;
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_EYE_TRACKING_FACE_DETECTOR_H_
