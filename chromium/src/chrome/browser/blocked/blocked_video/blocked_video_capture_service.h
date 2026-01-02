// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_VIDEO_BLOCKED_VIDEO_CAPTURE_SERVICE_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_VIDEO_BLOCKED_VIDEO_CAPTURE_SERVICE_H_

#include <memory>
#include <string>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "components/keyed_service/core/keyed_service.h"

namespace blocked {

class BlockedVideoCaptureService : public KeyedService {
 public:
  enum class CaptureState {
    STOPPED,
    STARTING,
    CAPTURING,
    ERROR
  };

  BlockedVideoCaptureService();
  ~BlockedVideoCaptureService() override;

  void Shutdown() override;

  // Start/stop video capture
  void StartCapture(const std::string& session_id);
  void StopCapture();
  CaptureState GetState() const { return state_; }

  // Video stream settings
  void SetResolution(int width, int height);
  void SetFrameRate(int fps);

 private:
  void OnCaptureStarted();
  void OnCaptureFrame(const std::vector<uint8_t>& frame_data);
  void OnCaptureStopped();

  std::string session_id_;
  CaptureState state_ = CaptureState::STOPPED;

  int capture_width_ = 640;
  int capture_height_ = 480;
  int capture_fps_ = 30;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<BlockedVideoCaptureService> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_VIDEO_BLOCKED_VIDEO_CAPTURE_SERVICE_H_
