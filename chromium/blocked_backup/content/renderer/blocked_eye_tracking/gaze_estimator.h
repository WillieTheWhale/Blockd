// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_EYE_TRACKING_GAZE_ESTIMATOR_H_
#define CONTENT_RENDERER_BLOCKED_EYE_TRACKING_GAZE_ESTIMATOR_H_

#include <array>

#include "content/renderer/blocked_eye_tracking/face_detector.h"

namespace content {

// Computes 2D gaze coordinates from facial landmarks.
// Uses geometric eye model and applies Kalman filtering for smoothing.
class GazeEstimator {
 public:
  struct GazeVector {
    float x;  // Normalized screen coordinate 0-1
    float y;  // Normalized screen coordinate 0-1
    float confidence;  // 0-1 quality metric
    bool is_off_screen;
    std::string off_screen_direction;
  };

  GazeEstimator();
  ~GazeEstimator();

  GazeEstimator(const GazeEstimator&) = delete;
  GazeEstimator& operator=(const GazeEstimator&) = delete;

  // Estimate gaze from facial landmarks.
  GazeVector EstimateGaze(const FaceDetector::FaceLandmarks& landmarks);

  // Reset Kalman filter state.
  void Reset();

 private:
  struct EyeState {
    float iris_x;
    float iris_y;
    float eye_width;
    float eye_height;
    float center_x;
    float center_y;
  };

  EyeState ExtractEyeState(const FaceDetector::FaceLandmarks& landmarks,
                           bool left_eye);

  GazeVector ComputeGazeFromEyes(const EyeState& left_eye,
                                  const EyeState& right_eye);

  void ApplyKalmanFilter(GazeVector* gaze);

  bool DetectOffScreen(const GazeVector& gaze);

  // Kalman filter state: [x, y, vx, vy].
  std::array<float, 4> kalman_state_ = {0.5f, 0.5f, 0.0f, 0.0f};
  std::array<float, 4> kalman_covariance_ = {1.0f, 1.0f, 1.0f, 1.0f};

  // Process and measurement noise parameters.
  static constexpr float kProcessNoise = 0.01f;
  static constexpr float kMeasurementNoise = 0.1f;

  // Off-screen detection thresholds.
  static constexpr float kOffScreenThreshold = 0.15f;  // 15% beyond edges
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_EYE_TRACKING_GAZE_ESTIMATOR_H_
