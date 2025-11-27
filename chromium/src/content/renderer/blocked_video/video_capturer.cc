// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_video/video_capturer.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "content/renderer/blocked_ipc/video_frame_sender.h"
#include "content/renderer/blocked_video/frame_processor.h"

namespace content {

VideoCapturer::VideoCapturer() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

VideoCapturer::~VideoCapturer() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Stop();
}

void VideoCapturer::Initialize(const VideoConstraints& constraints) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  DCHECK_EQ(state_, State::kIdle);

  UpdateState(State::kInitializing);
  constraints_ = constraints;

  // Create frame processor.
  frame_processor_ = std::make_unique<FrameProcessor>();

  // Request media stream from camera.
  // In production, this would use getUserMedia() API.
  // For now, create a placeholder stream.
  // TODO(blocked): Implement actual camera access via MediaStreamAPI.

  LOG(INFO) << "VideoCapturer initialized with constraints: "
            << constraints_.width << "x" << constraints_.height
            << " @ " << constraints_.frame_rate << " FPS";

  // Simulate successful stream acquisition.
  blink::WebMediaStream stream;
  OnStreamAcquired(stream);
}

void VideoCapturer::Start() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == State::kCapturing) {
    LOG(WARNING) << "VideoCapturer already capturing";
    return;
  }

  if (state_ != State::kIdle) {
    LOG(ERROR) << "Cannot start capturing from state: "
               << static_cast<int>(state_);
    return;
  }

  UpdateState(State::kCapturing);

  // Start frame processing.
  if (frame_processor_) {
    frame_processor_->Start(
        constraints_.frame_rate,
        base::BindRepeating(&VideoCapturer::OnFrameCaptured,
                            weak_factory_.GetWeakPtr()));
  }

  LOG(INFO) << "Video capture started";
}

void VideoCapturer::Stop() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == State::kStopped || state_ == State::kIdle) {
    return;
  }

  // Stop frame processing.
  if (frame_processor_) {
    frame_processor_->Stop();
  }

  // Release media stream.
  media_stream_.Reset();

  UpdateState(State::kStopped);
  LOG(INFO) << "Video capture stopped";
}

void VideoCapturer::OnStreamAcquired(const blink::WebMediaStream& stream) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  media_stream_ = stream;
  UpdateState(State::kIdle);

  LOG(INFO) << "Video stream acquired successfully";
}

void VideoCapturer::OnStreamFailed(const std::string& error) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(ERROR) << "Failed to acquire video stream: " << error;
  UpdateState(State::kError);
}

void VideoCapturer::OnFrameCaptured(const void* frame_data, int size) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != State::kCapturing) {
    return;
  }

  // Send frame to browser process via Mojo IPC.
  SendFrameToBrowser(frame_data, size);
}

void VideoCapturer::SendFrameToBrowser(const void* frame_data, int size) {
  // Send via VideoFrameSender to browser process.
  VideoFrameSender::GetInstance()->SendFrame(
      static_cast<const uint8_t*>(frame_data),
      size,
      constraints_.width,
      constraints_.height);
}

void VideoCapturer::UpdateState(State new_state) {
  if (state_ == new_state) {
    return;
  }

  LOG(INFO) << "VideoCapturer state: " << static_cast<int>(state_)
            << " -> " << static_cast<int>(new_state);
  state_ = new_state;
}

}  // namespace content
