// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/gaze_estimator.h"

#include <cmath>

#include "base/logging.h"

namespace content {

namespace {

// Helper to compute distance between two landmarks.
float Distance(const FaceDetector::Landmark& a,
               const FaceDetector::Landmark& b) {
  float dx = a.x - b.x;
  float dy = a.y - b.y;
  return std::sqrt(dx * dx + dy * dy);
}

// Helper to compute centroid of landmarks.
FaceDetector::Landmark Centroid(
    const std::vector<FaceDetector::Landmark>& points) {
  FaceDetector::Landmark center = {0.0f, 0.0f, 0.0f};

  // Guard against division by zero.
  if (points.empty()) {
    return center;
  }

  for (const auto& point : points) {
    center.x += point.x;
    center.y += point.y;
    center.z += point.z;
  }

  float count = static_cast<float>(points.size());
  center.x /= count;
  center.y /= count;
  center.z /= count;
  return center;
}

}  // namespace

GazeEstimator::GazeEstimator() = default;

GazeEstimator::~GazeEstimator() = default;

GazeEstimator::GazeVector GazeEstimator::EstimateGaze(
    const FaceDetector::FaceLandmarks& landmarks) {

  // MediaPipe FaceMesh provides 468 landmarks by default.
  // With iris refinement enabled, it can provide up to 478 landmarks
  // (468 face + 10 iris landmarks: 5 per eye).
  // We require at least the basic 468 landmarks for gaze estimation.
  constexpr size_t kMinRequiredLandmarks = 468;

  if (landmarks.landmarks.size() < kMinRequiredLandmarks) {
    // Not enough landmarks - face detection may have failed.
    LOG(WARNING) << "Insufficient landmarks for gaze estimation: "
                 << landmarks.landmarks.size() << " (need at least "
                 << kMinRequiredLandmarks << ")";
    GazeVector gaze;
    gaze.x = 0.5f;
    gaze.y = 0.5f;
    gaze.confidence = 0.0f;
    gaze.is_off_screen = true;
    gaze.off_screen_direction = "unknown";
    return gaze;
  }

  // Extract eye states from landmarks.
  EyeState left_eye = ExtractEyeState(landmarks, true);
  EyeState right_eye = ExtractEyeState(landmarks, false);

  // Compute gaze vector.
  GazeVector gaze = ComputeGazeFromEyes(left_eye, right_eye);

  // Apply Kalman filter for smoothing.
  ApplyKalmanFilter(&gaze);

  // Check if looking off-screen.
  gaze.is_off_screen = DetectOffScreen(gaze);

  // Determine off-screen direction.
  if (gaze.is_off_screen) {
    if (gaze.x < 0.0f) {
      gaze.off_screen_direction = "left";
    } else if (gaze.x > 1.0f) {
      gaze.off_screen_direction = "right";
    } else if (gaze.y < 0.0f) {
      gaze.off_screen_direction = "up";
    } else if (gaze.y > 1.0f) {
      gaze.off_screen_direction = "down";
    }
  }

  return gaze;
}

void GazeEstimator::Reset() {
  kalman_state_ = {0.5f, 0.5f, 0.0f, 0.0f};
  kalman_covariance_ = {1.0f, 1.0f, 1.0f, 1.0f};
}

GazeEstimator::EyeState GazeEstimator::ExtractEyeState(
    const FaceDetector::FaceLandmarks& landmarks,
    bool left_eye) {

  EyeState state;

  // Get iris center (MediaPipe provides iris landmarks).
  int iris_center_idx = left_eye ?
      FaceDetector::FaceLandmarks::kLeftIrisCenter :
      FaceDetector::FaceLandmarks::kRightIrisCenter;

  if (iris_center_idx < landmarks.landmarks.size()) {
    const auto& iris = landmarks.landmarks[iris_center_idx];
    state.iris_x = iris.x;
    state.iris_y = iris.y;
  } else {
    // Fallback to eye center.
    state.iris_x = 0.5f;
    state.iris_y = 0.5f;
  }

  // Compute eye bounding box from contour landmarks.
  const int* eye_indices = left_eye ?
      FaceDetector::FaceLandmarks::kLeftEyeIndices :
      FaceDetector::FaceLandmarks::kRightEyeIndices;

  std::vector<FaceDetector::Landmark> eye_points;
  for (int i = 0; i < 16; i++) {
    int idx = eye_indices[i];
    if (idx < landmarks.landmarks.size()) {
      eye_points.push_back(landmarks.landmarks[idx]);
    }
  }

  if (!eye_points.empty()) {
    auto center = Centroid(eye_points);
    state.center_x = center.x;
    state.center_y = center.y;

    // Compute eye dimensions.
    float min_x = 1.0f, max_x = 0.0f;
    float min_y = 1.0f, max_y = 0.0f;
    for (const auto& point : eye_points) {
      min_x = std::min(min_x, point.x);
      max_x = std::max(max_x, point.x);
      min_y = std::min(min_y, point.y);
      max_y = std::max(max_y, point.y);
    }
    state.eye_width = max_x - min_x;
    state.eye_height = max_y - min_y;
  } else {
    state.center_x = 0.5f;
    state.center_y = 0.5f;
    state.eye_width = 0.1f;
    state.eye_height = 0.05f;
  }

  return state;
}

GazeEstimator::GazeVector GazeEstimator::ComputeGazeFromEyes(
    const EyeState& left_eye,
    const EyeState& right_eye) {

  GazeVector gaze;

  // Minimum eye dimension to prevent division by zero or near-zero.
  constexpr float kMinEyeDimension = 0.001f;

  // Compute normalized iris position within eye.
  // Iris at center = looking straight, iris left/right = looking left/right.

  // Guard against division by zero with minimum dimension check.
  float safe_left_width = std::max(left_eye.eye_width, kMinEyeDimension);
  float safe_left_height = std::max(left_eye.eye_height, kMinEyeDimension);
  float safe_right_width = std::max(right_eye.eye_width, kMinEyeDimension);
  float safe_right_height = std::max(right_eye.eye_height, kMinEyeDimension);

  float left_ratio_x = (left_eye.iris_x - left_eye.center_x) / safe_left_width;
  float left_ratio_y = (left_eye.iris_y - left_eye.center_y) / safe_left_height;

  float right_ratio_x = (right_eye.iris_x - right_eye.center_x) / safe_right_width;
  float right_ratio_y = (right_eye.iris_y - right_eye.center_y) / safe_right_height;

  // Average both eyes.
  float avg_ratio_x = (left_ratio_x + right_ratio_x) / 2.0f;
  float avg_ratio_y = (left_ratio_y + right_ratio_y) / 2.0f;

  // Map ratio [-1, 1] to screen coordinates [0, 1].
  // Negative ratio = looking left/up, positive = right/down.
  gaze.x = 0.5f + avg_ratio_x * 0.5f;
  gaze.y = 0.5f + avg_ratio_y * 0.5f;

  // Confidence based on eye visibility and consistency.
  float consistency = 1.0f - std::abs(left_ratio_x - right_ratio_x);
  gaze.confidence = std::max(0.0f, std::min(1.0f, consistency));

  // Reduce confidence if eye dimensions were too small (unreliable detection).
  if (left_eye.eye_width < kMinEyeDimension ||
      left_eye.eye_height < kMinEyeDimension ||
      right_eye.eye_width < kMinEyeDimension ||
      right_eye.eye_height < kMinEyeDimension) {
    gaze.confidence *= 0.5f;
  }

  gaze.is_off_screen = false;
  gaze.off_screen_direction = "";

  return gaze;
}

void GazeEstimator::ApplyKalmanFilter(GazeVector* gaze) {
  // Simple Kalman filter for smoothing gaze coordinates.
  // State: [x, y, vx, vy]
  // Measurement: [x, y]

  // Predict step.
  kalman_state_[0] += kalman_state_[2];  // x += vx
  kalman_state_[1] += kalman_state_[3];  // y += vy

  // Increase uncertainty.
  for (int i = 0; i < 4; i++) {
    kalman_covariance_[i] += kProcessNoise;
  }

  // Update step.
  float innovation_x = gaze->x - kalman_state_[0];
  float innovation_y = gaze->y - kalman_state_[1];

  // Kalman gain.
  float gain_x = kalman_covariance_[0] /
                 (kalman_covariance_[0] + kMeasurementNoise);
  float gain_y = kalman_covariance_[1] /
                 (kalman_covariance_[1] + kMeasurementNoise);

  // Update state.
  kalman_state_[0] += gain_x * innovation_x;
  kalman_state_[1] += gain_y * innovation_y;
  kalman_state_[2] = innovation_x * 0.3f;  // Estimate velocity
  kalman_state_[3] = innovation_y * 0.3f;

  // Update covariance.
  kalman_covariance_[0] *= (1.0f - gain_x);
  kalman_covariance_[1] *= (1.0f - gain_y);

  // Apply filtered values.
  gaze->x = kalman_state_[0];
  gaze->y = kalman_state_[1];
}

bool GazeEstimator::DetectOffScreen(const GazeVector& gaze) {
  return gaze.x < -kOffScreenThreshold ||
         gaze.x > 1.0f + kOffScreenThreshold ||
         gaze.y < -kOffScreenThreshold ||
         gaze.y > 1.0f + kOffScreenThreshold;
}

}  // namespace content
