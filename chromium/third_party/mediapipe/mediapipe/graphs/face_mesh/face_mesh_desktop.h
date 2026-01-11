// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Stub header for MediaPipe FaceMesh graph.
// In production, this would be replaced with actual MediaPipe library code.

#ifndef THIRD_PARTY_MEDIAPIPE_MEDIAPIPE_GRAPHS_FACE_MESH_FACE_MESH_DESKTOP_H_
#define THIRD_PARTY_MEDIAPIPE_MEDIAPIPE_GRAPHS_FACE_MESH_FACE_MESH_DESKTOP_H_

#include <string>
#include <memory>

namespace mediapipe {

// Stub calculator graph for FaceMesh.
class FaceMeshDesktop {
 public:
  FaceMeshDesktop();
  ~FaceMeshDesktop();

  // Initialize the graph from a configuration file.
  bool Initialize(const std::string& config_path);

  // Process a single frame and return landmarks.
  bool ProcessFrame(const uint8_t* rgb_data, int width, int height);

  // Get the number of detected faces.
  int GetNumFaces() const;

  // Shutdown the graph.
  void Shutdown();

 private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace mediapipe

#endif  // THIRD_PARTY_MEDIAPIPE_MEDIAPIPE_GRAPHS_FACE_MESH_FACE_MESH_DESKTOP_H_
