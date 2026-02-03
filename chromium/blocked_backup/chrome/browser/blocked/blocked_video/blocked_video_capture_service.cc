// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_video/blocked_video_capture_service.h"

#include "base/logging.h"

namespace blocked {

BlockedVideoCaptureService::BlockedVideoCaptureService() {
  LOG(INFO) << "Video capture service initialized";
}

BlockedVideoCaptureService::~BlockedVideoCaptureService() {
  StopCapture();
}

void BlockedVideoCaptureService::Shutdown() {
  StopCapture();
}

void BlockedVideoCaptureService::StartCapture(const std::string& session_id) {
  if (state_ == CaptureState::CAPTURING) {
    LOG(WARNING) << "Video capture already active";
    return;
  }

  session_id_ = session_id;
  state_ = CaptureState::STARTING;

  LOG(INFO) << "Starting video capture: " << capture_width_ << "x"
            << capture_height_ << " @ " << capture_fps_ << "fps";

  // Actual implementation would use getUserMedia API or native capture
  OnCaptureStarted();
}

void BlockedVideoCaptureService::StopCapture() {
  if (state_ == CaptureState::STOPPED) {
    return;
  }

  LOG(INFO) << "Stopping video capture";
  state_ = CaptureState::STOPPED;
  OnCaptureStopped();
}

void BlockedVideoCaptureService::SetResolution(int width, int height) {
  capture_width_ = width;
  capture_height_ = height;
  LOG(INFO) << "Video resolution set to: " << width << "x" << height;
}

void BlockedVideoCaptureService::SetFrameRate(int fps) {
  capture_fps_ = fps;
  LOG(INFO) << "Video frame rate set to: " << fps << " fps";
}

void BlockedVideoCaptureService::OnCaptureStarted() {
  state_ = CaptureState::CAPTURING;
  LOG(INFO) << "Video capture started successfully";
}

void BlockedVideoCaptureService::OnCaptureFrame(
    const std::vector<uint8_t>& frame_data) {
  // Process and send frame data to backend
  VLOG(3) << "Captured frame: " << frame_data.size() << " bytes";
}

void BlockedVideoCaptureService::OnCaptureStopped() {
  LOG(INFO) << "Video capture stopped";
}

}  // namespace blocked
