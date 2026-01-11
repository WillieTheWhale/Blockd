// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/eye_tracker.h"

#include <cmath>
#include <numeric>

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
constexpr size_t kCalibrationSamplesPerPoint = 60;  // 2 seconds at 30 FPS

}  // namespace

// GazePoint implementation.
EyeTracker::GazePoint::GazePoint() = default;
EyeTracker::GazePoint::~GazePoint() = default;
EyeTracker::GazePoint::GazePoint(const GazePoint&) = default;
EyeTracker::GazePoint& EyeTracker::GazePoint::operator=(
    const GazePoint&) = default;
EyeTracker::GazePoint::GazePoint(GazePoint&&) noexcept = default;
EyeTracker::GazePoint& EyeTracker::GazePoint::operator=(
    GazePoint&&) noexcept = default;

// CalibrationPoint implementation.
EyeTracker::CalibrationPoint::CalibrationPoint() = default;
EyeTracker::CalibrationPoint::~CalibrationPoint() = default;
EyeTracker::CalibrationPoint::CalibrationPoint(const CalibrationPoint&) =
    default;
EyeTracker::CalibrationPoint& EyeTracker::CalibrationPoint::operator=(
    const CalibrationPoint&) = default;
EyeTracker::CalibrationPoint::CalibrationPoint(CalibrationPoint&&) noexcept =
    default;
EyeTracker::CalibrationPoint& EyeTracker::CalibrationPoint::operator=(
    CalibrationPoint&&) noexcept = default;

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

  // Compute calibration matrix using least squares fitting.
  // The transformation maps gaze coordinates (raw) to screen coordinates.
  //
  // Affine transformation:
  //   x' = a*x + b*y + c
  //   y' = d*x + e*y + f
  //
  // We solve for [a,b,c] and [d,e,f] separately using least squares.

  // First, compute average gaze point for each calibration position.
  std::vector<float> gaze_x, gaze_y, screen_x, screen_y;

  for (const auto& point : calibration_points_) {
    if (point.samples.empty()) {
      LOG(WARNING) << "Calibration point has no samples, using screen coords";
      gaze_x.push_back(point.screen_x);
      gaze_y.push_back(point.screen_y);
    } else {
      // Average the gaze samples for this calibration point.
      float avg_x = 0.0f, avg_y = 0.0f;
      float total_weight = 0.0f;

      for (const auto& sample : point.samples) {
        // Weight by confidence to give more importance to high-confidence samples.
        float weight = sample.confidence;
        if (weight < 0.1f) weight = 0.1f;  // Minimum weight to include all samples.

        avg_x += sample.x * weight;
        avg_y += sample.y * weight;
        total_weight += weight;
      }

      if (total_weight > 0.0f) {
        avg_x /= total_weight;
        avg_y /= total_weight;
      }

      gaze_x.push_back(avg_x);
      gaze_y.push_back(avg_y);
    }

    screen_x.push_back(point.screen_x);
    screen_y.push_back(point.screen_y);
  }

  // Compute calibration matrix using least squares.
  if (!ComputeCalibrationMatrix(gaze_x, gaze_y, screen_x, screen_y)) {
    LOG(ERROR) << "Failed to compute calibration matrix, using identity";
    calibration_matrix_ = {1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f};
  }

  is_calibrated_ = true;
  worker_->Stop();
  UpdateState(State::kIdle);

  LOG(INFO) << "Calibration complete - matrix: ["
            << calibration_matrix_[0] << ", " << calibration_matrix_[1] << ", "
            << calibration_matrix_[2] << ", " << calibration_matrix_[3] << ", "
            << calibration_matrix_[4] << ", " << calibration_matrix_[5] << ", "
            << calibration_matrix_[6] << ", " << calibration_matrix_[7] << ", "
            << calibration_matrix_[8] << "]";
}

bool EyeTracker::ComputeCalibrationMatrix(
    const std::vector<float>& gaze_x,
    const std::vector<float>& gaze_y,
    const std::vector<float>& screen_x,
    const std::vector<float>& screen_y) {
  // Solve the least squares problem for affine transformation:
  //   screen = A * gaze + b
  //
  // For x: screen_x = a*gaze_x + b*gaze_y + c
  // For y: screen_y = d*gaze_x + e*gaze_y + f
  //
  // Using normal equations: (X^T * X) * beta = X^T * y
  // where X is the design matrix [gaze_x, gaze_y, 1]

  size_t n = gaze_x.size();
  if (n < 3) {
    LOG(ERROR) << "Need at least 3 calibration points";
    return false;
  }

  // Build the normal equation matrices.
  // X^T * X (3x3 matrix)
  double sum_xx = 0, sum_xy = 0, sum_x = 0;
  double sum_yx = 0, sum_yy = 0, sum_y = 0;
  double sum_1 = static_cast<double>(n);

  // X^T * screen_x and X^T * screen_y
  double sum_x_sx = 0, sum_y_sx = 0, sum_1_sx = 0;
  double sum_x_sy = 0, sum_y_sy = 0, sum_1_sy = 0;

  for (size_t i = 0; i < n; ++i) {
    double gx = static_cast<double>(gaze_x[i]);
    double gy = static_cast<double>(gaze_y[i]);
    double sx = static_cast<double>(screen_x[i]);
    double sy = static_cast<double>(screen_y[i]);

    sum_xx += gx * gx;
    sum_xy += gx * gy;
    sum_x += gx;
    sum_yx += gy * gx;
    sum_yy += gy * gy;
    sum_y += gy;

    sum_x_sx += gx * sx;
    sum_y_sx += gy * sx;
    sum_1_sx += sx;

    sum_x_sy += gx * sy;
    sum_y_sy += gy * sy;
    sum_1_sy += sy;
  }

  // Solve the 3x3 linear system using Cramer's rule.
  // Matrix A = [sum_xx, sum_xy, sum_x]
  //            [sum_yx, sum_yy, sum_y]
  //            [sum_x,  sum_y,  sum_1]

  // Compute determinant of A.
  double det = sum_xx * (sum_yy * sum_1 - sum_y * sum_y)
             - sum_xy * (sum_yx * sum_1 - sum_y * sum_x)
             + sum_x * (sum_yx * sum_y - sum_yy * sum_x);

  if (std::abs(det) < 1e-10) {
    LOG(ERROR) << "Singular matrix in calibration, determinant = " << det;
    return false;
  }

  double inv_det = 1.0 / det;

  // Compute inverse of A (3x3).
  // Using cofactor matrix / det.
  double inv[9];
  inv[0] = (sum_yy * sum_1 - sum_y * sum_y) * inv_det;
  inv[1] = -(sum_xy * sum_1 - sum_y * sum_x) * inv_det;
  inv[2] = (sum_xy * sum_y - sum_yy * sum_x) * inv_det;
  inv[3] = -(sum_yx * sum_1 - sum_y * sum_x) * inv_det;
  inv[4] = (sum_xx * sum_1 - sum_x * sum_x) * inv_det;
  inv[5] = -(sum_xx * sum_y - sum_yx * sum_x) * inv_det;
  inv[6] = (sum_yx * sum_y - sum_yy * sum_x) * inv_det;
  inv[7] = -(sum_xx * sum_y - sum_xy * sum_x) * inv_det;
  inv[8] = (sum_xx * sum_yy - sum_xy * sum_yx) * inv_det;

  // Solve for [a, b, c] = inv(A) * [sum_x_sx, sum_y_sx, sum_1_sx]
  double a = inv[0] * sum_x_sx + inv[1] * sum_y_sx + inv[2] * sum_1_sx;
  double b = inv[3] * sum_x_sx + inv[4] * sum_y_sx + inv[5] * sum_1_sx;
  double c = inv[6] * sum_x_sx + inv[7] * sum_y_sx + inv[8] * sum_1_sx;

  // Solve for [d, e, f] = inv(A) * [sum_x_sy, sum_y_sy, sum_1_sy]
  double d = inv[0] * sum_x_sy + inv[1] * sum_y_sy + inv[2] * sum_1_sy;
  double e = inv[3] * sum_x_sy + inv[4] * sum_y_sy + inv[5] * sum_1_sy;
  double f = inv[6] * sum_x_sy + inv[7] * sum_y_sy + inv[8] * sum_1_sy;

  // Store in calibration matrix (3x3 where last row is [0, 0, 1]).
  // Layout: [a, b, c, d, e, f, 0, 0, 1]
  calibration_matrix_[0] = static_cast<float>(a);
  calibration_matrix_[1] = static_cast<float>(b);
  calibration_matrix_[2] = static_cast<float>(c);
  calibration_matrix_[3] = static_cast<float>(d);
  calibration_matrix_[4] = static_cast<float>(e);
  calibration_matrix_[5] = static_cast<float>(f);
  calibration_matrix_[6] = 0.0f;
  calibration_matrix_[7] = 0.0f;
  calibration_matrix_[8] = 1.0f;

  // Compute calibration quality (average residual error).
  double total_error = 0.0;
  for (size_t i = 0; i < n; ++i) {
    double pred_x = a * gaze_x[i] + b * gaze_y[i] + c;
    double pred_y = d * gaze_x[i] + e * gaze_y[i] + f;
    double error_x = pred_x - screen_x[i];
    double error_y = pred_y - screen_y[i];
    total_error += std::sqrt(error_x * error_x + error_y * error_y);
  }
  double avg_error = total_error / n;

  LOG(INFO) << "Calibration matrix computed, average error: " << avg_error;

  // Warn if calibration error is too high.
  if (avg_error > 0.1) {  // More than 10% of screen.
    LOG(WARNING) << "High calibration error: " << avg_error
                 << " - calibration may be inaccurate";
  }

  return true;
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
