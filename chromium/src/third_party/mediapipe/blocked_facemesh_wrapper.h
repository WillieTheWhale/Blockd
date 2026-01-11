// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef THIRD_PARTY_MEDIAPIPE_BLOCKED_FACEMESH_WRAPPER_H_
#define THIRD_PARTY_MEDIAPIPE_BLOCKED_FACEMESH_WRAPPER_H_

#include <memory>
#include <vector>

#include "base/memory/ref_counted.h"

namespace blocked {

// Simplified wrapper around MediaPipe FaceMesh for Blocked integration.
// Provides easy-to-use API for face detection and landmark extraction.
class FaceMeshWrapper {
 public:
  struct Landmark {
    float x;  // Normalized 0-1
    float y;  // Normalized 0-1
    float z;  // Depth estimate
  };

  struct FaceResult {
    std::vector<Landmark> landmarks;  // 468 facial landmarks
    std::vector<Landmark> left_iris;  // 5 left iris landmarks
    std::vector<Landmark> right_iris;  // 5 right iris landmarks
    float detection_confidence;
    float tracking_confidence;
  };

  FaceMeshWrapper();
  ~FaceMeshWrapper();

  FaceMeshWrapper(const FaceMeshWrapper&) = delete;
  FaceMeshWrapper& operator=(const FaceMeshWrapper&) = delete;

  // Initialize MediaPipe graph.
  bool Initialize();

  // Process single image frame.
  // Returns true if face detected, false otherwise.
  bool ProcessFrame(const uint8_t* rgb_data,
                    int width,
                    int height,
                    FaceResult* result);

  // Reset tracking state.
  void Reset();

  // Check if initialized.
  bool IsInitialized() const { return is_initialized_; }

 private:
  bool LoadGraph();
  bool LoadModels();

  bool is_initialized_ = false;

  // Opaque pointer to MediaPipe graph.
  // In production, this would be mediapipe::CalculatorGraph*.
  void* graph_ = nullptr;
};

}  // namespace blocked

#endif  // THIRD_PARTY_MEDIAPIPE_BLOCKED_FACEMESH_WRAPPER_H_
