// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_EYE_TRACKING_EYE_TRACKER_H_
#define CONTENT_RENDERER_BLOCKED_EYE_TRACKING_EYE_TRACKER_H_

#include <array>
#include <memory>
#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/time/time.h"
#include "content/renderer/blocked_eye_tracking/face_detector.h"
#include "content/renderer/blocked_eye_tracking/gaze_estimator.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream.h"

namespace content {

class EyeTrackingWorker;

// Main coordinator for eye tracking in the renderer process.
// Manages webcam capture, face detection, gaze estimation, and IPC to browser.
// Runs on the renderer main thread but delegates heavy processing to worker.
class EyeTracker {
 public:
  struct GazePoint {
    GazePoint();
    ~GazePoint();
    GazePoint(const GazePoint&);
    GazePoint& operator=(const GazePoint&);
    GazePoint(GazePoint&&) noexcept;
    GazePoint& operator=(GazePoint&&) noexcept;

    float x = 0.0f;  // Normalized 0-1 (left to right)
    float y = 0.0f;  // Normalized 0-1 (top to bottom)
    float confidence = 0.0f;  // 0-1 quality score
    base::TimeTicks timestamp;
    bool is_off_screen = false;
    std::string off_screen_direction;  // "left", "right", "up", "down"
  };

  struct CalibrationPoint {
    CalibrationPoint();
    ~CalibrationPoint();
    CalibrationPoint(const CalibrationPoint&);
    CalibrationPoint& operator=(const CalibrationPoint&);
    CalibrationPoint(CalibrationPoint&&) noexcept;
    CalibrationPoint& operator=(CalibrationPoint&&) noexcept;

    float screen_x = 0.0f;
    float screen_y = 0.0f;
    std::vector<GazePoint> samples;
  };

  enum class State {
    kIdle,
    kInitializing,
    kCalibrating,
    kTracking,
    kStopped,
    kError
  };

  explicit EyeTracker();
  ~EyeTracker();

  EyeTracker(const EyeTracker&) = delete;
  EyeTracker& operator=(const EyeTracker&) = delete;

  // Initialize eye tracking with webcam stream.
  void Initialize(const blink::WebMediaStream& stream);

  // Start eye tracking (after initialization).
  void Start();

  // Stop eye tracking.
  void Stop();

  // Begin calibration sequence (9-point calibration).
  void StartCalibration();

  // Record gaze samples for current calibration point.
  void CalibratePoint(float screen_x, float screen_y);

  // Finish calibration and compute transformation matrix.
  void FinishCalibration();

  // Get current tracking state.
  State GetState() const { return state_; }

  // Get latest gaze point (if tracking).
  const GazePoint& GetLatestGaze() const { return latest_gaze_; }

  // Check if calibration is complete.
  bool IsCalibrated() const { return is_calibrated_; }

 private:
  void OnFrameProcessed(const GazePoint& gaze);
  void OnFaceDetectionFailed();
  void ApplyCalibration(GazePoint* gaze);
  void SendGazeDataToBrowser(const GazePoint& gaze);
  void UpdateState(State new_state);

  State state_ = State::kIdle;
  bool is_calibrated_ = false;

  std::unique_ptr<FaceDetector> face_detector_;
  std::unique_ptr<GazeEstimator> gaze_estimator_;
  std::unique_ptr<EyeTrackingWorker> worker_;

  GazePoint latest_gaze_;
  std::vector<CalibrationPoint> calibration_points_;
  size_t current_calibration_index_ = 0;

  // Calibration transformation matrix (3x3).
  std::array<float, 9> calibration_matrix_ = {1, 0, 0, 0, 1, 0, 0, 0, 1};

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<EyeTracker> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_EYE_TRACKING_EYE_TRACKER_H_
