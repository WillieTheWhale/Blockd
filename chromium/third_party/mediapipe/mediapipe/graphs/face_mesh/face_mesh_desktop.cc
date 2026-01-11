// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Stub implementation for MediaPipe FaceMesh graph.
// In production, this would be replaced with actual MediaPipe library code.

#include "third_party/mediapipe/mediapipe/graphs/face_mesh/face_mesh_desktop.h"

namespace mediapipe {

class FaceMeshDesktop::Impl {
 public:
  bool initialized = false;
  int num_faces = 0;
};

FaceMeshDesktop::FaceMeshDesktop() : impl_(std::make_unique<Impl>()) {}

FaceMeshDesktop::~FaceMeshDesktop() = default;

bool FaceMeshDesktop::Initialize(const std::string& config_path) {
  // Stub: Always return success for build testing.
  impl_->initialized = true;
  return true;
}

bool FaceMeshDesktop::ProcessFrame(const uint8_t* rgb_data,
                                    int width,
                                    int height) {
  if (!impl_->initialized) {
    return false;
  }
  // Stub: Simulate successful face detection.
  impl_->num_faces = 1;
  return true;
}

int FaceMeshDesktop::GetNumFaces() const {
  return impl_->num_faces;
}

void FaceMeshDesktop::Shutdown() {
  impl_->initialized = false;
  impl_->num_faces = 0;
}

}  // namespace mediapipe
