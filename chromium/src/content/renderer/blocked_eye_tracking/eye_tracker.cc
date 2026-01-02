// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/eye_tracker.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/task/thread_pool.h"
#include "content/renderer/blocked_eye_tracking/eye_tracking_worker.h"
#include "content/renderer/blocked_ipc/gaze_data_sender.h"

namespace content {

namespace {

// Calibration grid: 3x3 = 9 points
constexpr float kCalibrationGridX[] = {0.1f, 0.5f, 0.9f};
constexpr float kCalibrationGridY[] = {0.1f, 0.5f, 0.9f};
constexpr int kCalibrationSamplesPerPoint = 60;  // 2 seconds at 30 FPS

}  // namespace

EyeTracker::EyeTracker() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

EyeTracker::~EyeTracker() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Stop();
}

void EyeTracker::Initialize(const blink::WebMediaStream& stream) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  DCHECK_EQ(state_, State::kIdle);

  UpdateState(State::kInitializing);

  // Create components.
  face_detector_ = std::make_unique<FaceDetector>();
  gaze_estimator_ = std::make_unique<GazeEstimator>();
  worker_ = std::make_unique<EyeTrackingWorker>(
      stream,
      base::BindRepeating(&EyeTracker::OnFrameProcessed,
                          weak_factory_.GetWeakPtr()),
      base::BindRepeating(&EyeTracker::OnFaceDetectionFailed,
                          weak_factory_.GetWeakPtr()));

  // Initialize MediaPipe face detector.
  face_detector_->Initialize();

  UpdateState(State::kIdle);
  LOG(INFO) << "EyeTracker initialized successfully";
}

void EyeTracker::Start() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == State::kTracking) {
    LOG(WARNING) << "EyeTracker already tracking";
    return;
  }

  if (!is_calibrated_) {
    LOG(ERROR) << "Cannot start tracking without calibration";
    return;
  }

  UpdateState(State::kTracking);
  worker_->Start();
  LOG(INFO) << "Eye tracking started";
}

void EyeTracker::Stop() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == State::kStopped || state_ == State::kIdle) {
    return;
  }

  if (worker_) {
    worker_->Stop();
  }

  UpdateState(State::kStopped);
  LOG(INFO) << "Eye tracking stopped";
}

void EyeTracker::StartCalibration() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  UpdateState(State::kCalibrating);
  calibration_points_.clear();
  current_calibration_index_ = 0;

  // Create 9 calibration points in 3x3 grid.
  for (float y : kCalibrationGridY) {
    for (float x : kCalibrationGridX) {
      CalibrationPoint point;
      point.screen_x = x;
      point.screen_y = y;
      calibration_points_.push_back(point);
    }
  }

  // Start worker to collect gaze samples.
  worker_->Start();
  LOG(INFO) << "Calibration started with " << calibration_points_.size()
            << " points";
}

void EyeTracker::CalibratePoint(float screen_x, float screen_y) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  DCHECK_EQ(state_, State::kCalibrating);

  if (current_calibration_index_ >= calibration_points_.size()) {
    LOG(ERROR) << "Invalid calibration point index";
    return;
  }

  auto& point = calibration_points_[current_calibration_index_];
  point.screen_x = screen_x;
  point.screen_y = screen_y;

  // Samples will be collected in OnFrameProcessed().
  LOG(INFO) << "Calibrating point " << current_calibration_index_ + 1 << "/9 "
            << "at (" << screen_x << ", " << screen_y << ")";
}

void EyeTracker::FinishCalibration() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  DCHECK_EQ(state_, State::kCalibrating);

  // Compute calibration matrix using least squares.
  // This is a simplified version - production would use more robust fitting.

  // For now, use identity matrix (no calibration adjustment).
  // TODO(blocked): Implement proper calibration matrix computation.
  for (int i = 0; i < 9; i++) {
    calibration_matrix_[i] = (i % 4 == 0) ? 1.0f : 0.0f;
  }

  is_calibrated_ = true;
  worker_->Stop();
  UpdateState(State::kIdle);

  LOG(INFO) << "Calibration complete";
}

void EyeTracker::OnFrameProcessed(const GazePoint& gaze) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  latest_gaze_ = gaze;

  if (state_ == State::kCalibrating) {
    // Collect calibration samples.
    if (current_calibration_index_ < calibration_points_.size()) {
      auto& point = calibration_points_[current_calibration_index_];
      point.samples.push_back(gaze);

      if (point.samples.size() >= kCalibrationSamplesPerPoint) {
        current_calibration_index_++;

        if (current_calibration_index_ >= calibration_points_.size()) {
          // All points collected, ready to finish calibration.
          LOG(INFO) << "All calibration samples collected";
        }
      }
    }
  } else if (state_ == State::kTracking) {
    // Apply calibration and send to browser.
    GazePoint calibrated_gaze = gaze;
    ApplyCalibration(&calibrated_gaze);
    SendGazeDataToBrowser(calibrated_gaze);
  }
}

void EyeTracker::OnFaceDetectionFailed() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  // Face lost - send off-screen event.
  GazePoint lost_gaze;
  lost_gaze.x = -1.0f;
  lost_gaze.y = -1.0f;
  lost_gaze.confidence = 0.0f;
  lost_gaze.is_off_screen = true;
  lost_gaze.off_screen_direction = "unknown";
  lost_gaze.timestamp = base::TimeTicks::Now();

  if (state_ == State::kTracking) {
    SendGazeDataToBrowser(lost_gaze);
  }
}

void EyeTracker::ApplyCalibration(GazePoint* gaze) {
  DCHECK(gaze);

  if (!is_calibrated_) {
    return;
  }

  // Apply 3x3 transformation matrix to gaze coordinates.
  // [x', y', 1] = [x, y, 1] * M
  float x = gaze->x;
  float y = gaze->y;

  gaze->x = calibration_matrix_[0] * x +
            calibration_matrix_[1] * y +
            calibration_matrix_[2];
  gaze->y = calibration_matrix_[3] * x +
            calibration_matrix_[4] * y +
            calibration_matrix_[5];

  // Clamp to [0, 1] range.
  gaze->x = std::max(0.0f, std::min(1.0f, gaze->x));
  gaze->y = std::max(0.0f, std::min(1.0f, gaze->y));
}

void EyeTracker::SendGazeDataToBrowser(const GazePoint& gaze) {
  // Send via Mojo IPC to browser process.
  GazeDataSender::GetInstance()->SendGaze(
      gaze.x, gaze.y, gaze.confidence, gaze.is_off_screen,
      gaze.off_screen_direction, gaze.timestamp);
}

void EyeTracker::UpdateState(State new_state) {
  if (state_ == new_state) {
    return;
  }

  LOG(INFO) << "EyeTracker state: " << static_cast<int>(state_)
            << " -> " << static_cast<int>(new_state);
  state_ = new_state;
}

}  // namespace content
