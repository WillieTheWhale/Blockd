// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_video/frame_processor.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/task/sequenced_task_runner.h"

namespace content {

namespace {

// Calculate frame interval from FPS.
base::TimeDelta GetFrameInterval(int frame_rate) {
  return base::Milliseconds(1000 / frame_rate);
}

}  // namespace

FrameProcessor::FrameProcessor() = default;

FrameProcessor::~FrameProcessor() {
  Stop();
}

void FrameProcessor::Start(int frame_rate, FrameCallback callback) {
  if (is_processing_) {
    LOG(WARNING) << "FrameProcessor already processing";
    return;
  }

  frame_rate_ = frame_rate;
  frame_callback_ = std::move(callback);
  is_processing_ = true;
  last_frame_time_ = base::TimeTicks::Now();

  // Start processing loop.
  ProcessNextFrame();

  LOG(INFO) << "FrameProcessor started at " << frame_rate << " FPS";
}

void FrameProcessor::Stop() {
  if (!is_processing_) {
    return;
  }

  is_processing_ = false;
  frame_callback_.Reset();

  LOG(INFO) << "FrameProcessor stopped";
}

void FrameProcessor::ProcessNextFrame() {
  if (!is_processing_) {
    return;
  }

  base::TimeTicks now = base::TimeTicks::Now();
  base::TimeDelta elapsed = now - last_frame_time_;
  base::TimeDelta frame_interval = GetFrameInterval(frame_rate_);

  if (elapsed >= frame_interval) {
    // Capture and process frame.
    CaptureFrame();
    last_frame_time_ = now;
  }

  // Calculate delay to next frame.
  base::TimeDelta remaining = frame_interval - elapsed;
  if (remaining < base::TimeDelta()) {
    remaining = base::Milliseconds(1);
  }

  // Schedule next frame.
  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&FrameProcessor::ProcessNextFrame,
                     weak_factory_.GetWeakPtr()),
      remaining);
}

void FrameProcessor::CaptureFrame() {
  // In production, this would capture actual video frame from WebRTC track.
  // For now, generate dummy frame data.

  // Dummy I420 frame: 640x480 = 460800 bytes.
  constexpr int kFrameSize = 640 * 480 * 3 / 2;
  static uint8_t dummy_frame[kFrameSize] = {0};

  // Invoke callback with frame data.
  if (frame_callback_) {
    frame_callback_.Run(dummy_frame, kFrameSize);
  }
}

}  // namespace content
