// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_EYE_TRACKING_CALIBRATION_OVERLAY_H_
#define CONTENT_RENDERER_BLOCKED_EYE_TRACKING_CALIBRATION_OVERLAY_H_

#include <memory>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"

namespace blink {
class WebLocalFrame;
}  // namespace blink

namespace content {

// Displays calibration UI overlay for 9-point calibration.
// Shows calibration points and collects user gaze samples.
class CalibrationOverlay {
 public:
  struct CalibrationPoint {
    float x;  // Screen coordinate 0-1
    float y;  // Screen coordinate 0-1
  };

  using CalibrationCallback =
      base::RepeatingCallback<void(const CalibrationPoint& point)>;
  using CompletionCallback = base::OnceCallback<void()>;

  explicit CalibrationOverlay(blink::WebLocalFrame* frame);
  ~CalibrationOverlay();

  CalibrationOverlay(const CalibrationOverlay&) = delete;
  CalibrationOverlay& operator=(const CalibrationOverlay&) = delete;

  // Show calibration overlay and start calibration sequence.
  void Show(CalibrationCallback callback, CompletionCallback completion);

  // Hide calibration overlay.
  void Hide();

  // Check if calibration is active.
  bool IsActive() const { return is_active_; }

 private:
  void InjectCalibrationUI();
  void ShowNextPoint();
  void OnPointCompleted();
  void OnCalibrationComplete();

  raw_ptr<blink::WebLocalFrame> frame_;

  bool is_active_ = false;
  size_t current_point_index_ = 0;
  std::vector<CalibrationPoint> calibration_points_;

  CalibrationCallback point_callback_;
  CompletionCallback completion_callback_;

  base::WeakPtrFactory<CalibrationOverlay> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_EYE_TRACKING_CALIBRATION_OVERLAY_H_
