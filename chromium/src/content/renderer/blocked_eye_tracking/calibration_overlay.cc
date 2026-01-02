// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/calibration_overlay.h"

#include <array>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "third_party/blink/public/web/web_local_frame.h"
#include "third_party/blink/public/web/web_script_source.h"

namespace content {

namespace {

// Calibration point with x,y coordinates.
struct CalibrationGridPoint {
  float x;
  float y;
};

// 9-point calibration grid (3x3).
constexpr std::array<CalibrationGridPoint, 9> kCalibrationGrid = {{
    {0.1f, 0.1f}, {0.5f, 0.1f}, {0.9f, 0.1f},
    {0.1f, 0.5f}, {0.5f, 0.5f}, {0.9f, 0.5f},
    {0.1f, 0.9f}, {0.5f, 0.9f}, {0.9f, 0.9f}
}};

constexpr size_t kNumCalibrationPoints = 9;

// Duration to show each calibration point (milliseconds).
constexpr int kPointDurationMs = 2000;

// JavaScript to inject calibration UI.
constexpr char kCalibrationScript[] = R"(
(function() {
  if (window.__blockedCalibration) {
    return;
  }

  window.__blockedCalibration = {
    overlay: null,
    point: null,

    show: function() {
      // Create fullscreen overlay.
      this.overlay = document.createElement('div');
      this.overlay.id = 'blocked-calibration-overlay';
      this.overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.9);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
      `;

      // Create instruction text.
      const instructions = document.createElement('div');
      instructions.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 24px;
        font-family: sans-serif;
        text-align: center;
      `;
      instructions.textContent = 'Look at the red dot and keep your eyes on it';
      this.overlay.appendChild(instructions);

      // Create calibration point.
      this.point = document.createElement('div');
      this.point.style.cssText = `
        position: absolute;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: red;
        box-shadow: 0 0 20px rgba(255, 0, 0, 0.8);
        transition: all 0.3s ease;
      `;
      this.overlay.appendChild(this.point);

      document.body.appendChild(this.overlay);
    },

    hide: function() {
      if (this.overlay) {
        document.body.removeChild(this.overlay);
        this.overlay = null;
        this.point = null;
      }
    },

    showPoint: function(x, y) {
      if (!this.point) return;

      this.point.style.left = (x * 100) + '%';
      this.point.style.top = (y * 100) + '%';
      this.point.style.transform = 'translate(-50%, -50%) scale(1)';

      // Pulse animation.
      setTimeout(() => {
        if (this.point) {
          this.point.style.transform = 'translate(-50%, -50%) scale(1.5)';
        }
      }, 100);
    }
  };
})();
)";

}  // namespace

CalibrationOverlay::CalibrationOverlay(blink::WebLocalFrame* frame)
    : frame_(frame) {}

CalibrationOverlay::~CalibrationOverlay() {
  Hide();
}

void CalibrationOverlay::Show(CalibrationCallback callback,
                                CompletionCallback completion) {
  if (is_active_) {
    LOG(WARNING) << "Calibration already active";
    return;
  }

  point_callback_ = std::move(callback);
  completion_callback_ = std::move(completion);
  is_active_ = true;
  current_point_index_ = 0;

  // Setup calibration points.
  calibration_points_.clear();
  for (const auto& grid_point : kCalibrationGrid) {
    CalibrationPoint point;
    point.x = grid_point.x;
    point.y = grid_point.y;
    calibration_points_.push_back(point);
  }

  // Inject calibration UI.
  InjectCalibrationUI();

  // Show first point.
  ShowNextPoint();

  LOG(INFO) << "Calibration started";
}

void CalibrationOverlay::Hide() {
  if (!is_active_) {
    return;
  }

  // Remove calibration UI.
  blink::WebScriptSource script(
      blink::WebString::FromUTF8("window.__blockedCalibration?.hide();"));
  frame_->ExecuteScript(script);

  is_active_ = false;
  current_point_index_ = 0;
  calibration_points_.clear();

  LOG(INFO) << "Calibration hidden";
}

void CalibrationOverlay::InjectCalibrationUI() {
  // Inject JavaScript for calibration UI.
  blink::WebScriptSource script(
      blink::WebString::FromUTF8(kCalibrationScript));
  frame_->ExecuteScript(script);

  // Show overlay.
  blink::WebScriptSource show_script(
      blink::WebString::FromUTF8("window.__blockedCalibration?.show();"));
  frame_->ExecuteScript(show_script);
}

void CalibrationOverlay::ShowNextPoint() {
  if (current_point_index_ >= calibration_points_.size()) {
    OnCalibrationComplete();
    return;
  }

  const auto& point = calibration_points_[current_point_index_];

  // Show calibration point in UI.
  std::string script = "window.__blockedCalibration?.showPoint(" +
                       std::to_string(point.x) + ", " +
                       std::to_string(point.y) + ");";
  frame_->ExecuteScript(
      blink::WebScriptSource(blink::WebString::FromUTF8(script)));

  // Notify callback to collect gaze samples.
  point_callback_.Run(point);

  // Schedule next point after delay.
  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&CalibrationOverlay::OnPointCompleted,
                     weak_factory_.GetWeakPtr()),
      base::Milliseconds(kPointDurationMs));

  LOG(INFO) << "Showing calibration point " << current_point_index_ + 1
            << "/" << kNumCalibrationPoints;
}

void CalibrationOverlay::OnPointCompleted() {
  current_point_index_++;
  ShowNextPoint();
}

void CalibrationOverlay::OnCalibrationComplete() {
  LOG(INFO) << "Calibration complete";

  // Hide UI.
  Hide();

  // Notify completion.
  if (completion_callback_) {
    std::move(completion_callback_).Run();
  }
}

}  // namespace content
