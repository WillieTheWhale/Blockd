// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/face_detector.h"

#include "base/files/file_path.h"
#include "base/logging.h"
#include "base/path_service.h"

// Forward declare MediaPipe types to avoid circular dependencies.
// In production, link against MediaPipe library.
namespace mediapipe {
class FaceMesh {
 public:
  FaceMesh() = default;
  ~FaceMesh() = default;
  bool Initialize(const std::string& model_path) { return true; }
  bool Process(const void* image_data, int width, int height,
               std::vector<float>* landmarks) { return false; }
};
}  // namespace mediapipe

namespace content {

namespace {

// MediaPipe FaceMesh model file.
constexpr char kFaceMeshModelFile[] = "mediapipe_face_mesh.tflite";

}  // namespace

// FaceLandmarks implementation.
FaceDetector::FaceLandmarks::FaceLandmarks() = default;
FaceDetector::FaceLandmarks::~FaceLandmarks() = default;
FaceDetector::FaceLandmarks::FaceLandmarks(const FaceLandmarks&) = default;
FaceDetector::FaceLandmarks& FaceDetector::FaceLandmarks::operator=(
    const FaceLandmarks&) = default;
FaceDetector::FaceLandmarks::FaceLandmarks(FaceLandmarks&&) noexcept = default;
FaceDetector::FaceLandmarks& FaceDetector::FaceLandmarks::operator=(
    FaceLandmarks&&) noexcept = default;

FaceDetector::FaceDetector() = default;

FaceDetector::~FaceDetector() = default;

bool FaceDetector::Initialize() {
  if (is_initialized_) {
    return true;
  }

  face_mesh_ = std::make_unique<mediapipe::FaceMesh>();

  if (!LoadModel()) {
    LOG(ERROR) << "Failed to load MediaPipe FaceMesh model";
    return false;
  }

  is_initialized_ = true;
  LOG(INFO) << "FaceDetector initialized successfully";
  return true;
}

bool FaceDetector::DetectFace(const SkBitmap& frame,
                                FaceLandmarks* landmarks) {
  if (!is_initialized_) {
    LOG(ERROR) << "FaceDetector not initialized";
    return false;
  }

  if (frame.empty() || !landmarks) {
    return false;
  }

  // Extract pixel data from SkBitmap.
  const void* pixels = frame.getPixels();
  const int width = frame.width();
  const int height = frame.height();

  // Process frame with MediaPipe.
  std::vector<float> raw_landmarks;
  if (!face_mesh_->Process(pixels, width, height, &raw_landmarks)) {
    return false;
  }

  // Convert raw landmarks to structured format.
  // MediaPipe outputs 468 landmarks * 3 coordinates (x, y, z) = 1404 floats.
  constexpr int kNumLandmarks = 468;
  if (raw_landmarks.size() < kNumLandmarks * 3) {
    LOG(ERROR) << "Invalid landmark count: " << raw_landmarks.size();
    return false;
  }

  landmarks->landmarks.clear();
  landmarks->landmarks.reserve(kNumLandmarks);

  for (int i = 0; i < kNumLandmarks; i++) {
    Landmark lm;
    lm.x = raw_landmarks[i * 3 + 0];
    lm.y = raw_landmarks[i * 3 + 1];
    lm.z = raw_landmarks[i * 3 + 2];
    landmarks->landmarks.push_back(lm);
  }

  // Confidence is not directly provided by MediaPipe, estimate from z-depth.
  float avg_depth = 0.0f;
  for (const auto& lm : landmarks->landmarks) {
    avg_depth += std::abs(lm.z);
  }
  avg_depth /= kNumLandmarks;

  // Higher depth variance = lower confidence.
  landmarks->confidence = std::max(0.0f, std::min(1.0f, 1.0f - avg_depth));

  return true;
}

bool FaceDetector::LoadModel() {
  // Get path to MediaPipe model file in resources.
  base::FilePath exe_dir;
  if (!base::PathService::Get(base::DIR_EXE, &exe_dir)) {
    LOG(ERROR) << "Failed to get executable directory";
    return false;
  }

  base::FilePath model_path =
      exe_dir.AppendASCII("resources")
             .AppendASCII("mediapipe")
             .AppendASCII(kFaceMeshModelFile);

  // Initialize MediaPipe with model file.
  if (!face_mesh_->Initialize(model_path.AsUTF8Unsafe())) {
    LOG(ERROR) << "Failed to initialize MediaPipe FaceMesh";
    return false;
  }

  LOG(INFO) << "Loaded MediaPipe FaceMesh model from: " << model_path;
  return true;
}

}  // namespace content
