// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_video/blocked_video_capture_service.h"

#include <algorithm>

#include "base/logging.h"
#include "base/memory/raw_ptr.h"
#include "chrome/browser/blocked/blocked_ipc/blocked_backend_connector.h"

namespace blocked {

BlockedVideoCaptureService::BlockedVideoCaptureService() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
  LOG(INFO) << "Video capture service initialized";
}

BlockedVideoCaptureService::~BlockedVideoCaptureService() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  StopCapture();
}

void BlockedVideoCaptureService::Shutdown() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  StopCapture();

  // Reset Mojo bindings.
  receiver_.reset();
  client_.reset();
}

void BlockedVideoCaptureService::BindInterface(
    mojo::PendingReceiver<mojom::VideoCaptureHost> receiver,
    mojo::PendingRemote<mojom::VideoCaptureClient> client) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  // Reset any existing bindings.
  receiver_.reset();
  client_.reset();

  // Bind the new interfaces.
  receiver_.Bind(std::move(receiver));
  client_.Bind(std::move(client));

  LOG(INFO) << "Video capture Mojo interface bound";
}

void BlockedVideoCaptureService::StartCapture(const std::string& session_id) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == CaptureState::CAPTURING) {
    LOG(WARNING) << "Video capture already active";
    return;
  }

  if (!client_.is_bound()) {
    LOG(ERROR) << "Cannot start capture: client not bound";
    UpdateState(CaptureState::ERROR);
    NotifyObserversError("Video capture client not bound");
    return;
  }

  session_id_ = session_id;
  UpdateState(CaptureState::STARTING);

  LOG(INFO) << "Requesting video capture start: " << capture_width_ << "x"
            << capture_height_ << " @ " << capture_fps_ << "fps";

  // Build capture settings.
  auto settings = mojom::VideoCaptureSettings::New();
  settings->width = capture_width_;
  settings->height = capture_height_;
  settings->frame_rate = capture_fps_;
  settings->format = mojom::VideoFormat::kI420;
  settings->device_id = device_id_;
  settings->enable_encoding = enable_encoding_;

  // Send start command to renderer.
  client_->StartCapture(std::move(settings));
}

void BlockedVideoCaptureService::StopCapture() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == CaptureState::STOPPED) {
    return;
  }

  LOG(INFO) << "Requesting video capture stop";

  // Send stop command to renderer if bound.
  if (client_.is_bound()) {
    client_->StopCapture();
  }

  UpdateState(CaptureState::STOPPED);
}

void BlockedVideoCaptureService::SetResolution(int width, int height) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  capture_width_ = width;
  capture_height_ = height;
  LOG(INFO) << "Video resolution set to: " << width << "x" << height;

  // If currently capturing, update settings in renderer.
  if (state_ == CaptureState::CAPTURING && client_.is_bound()) {
    auto settings = mojom::VideoCaptureSettings::New();
    settings->width = capture_width_;
    settings->height = capture_height_;
    settings->frame_rate = capture_fps_;
    settings->format = mojom::VideoFormat::kI420;
    settings->device_id = device_id_;
    settings->enable_encoding = enable_encoding_;
    client_->UpdateSettings(std::move(settings));
  }
}

void BlockedVideoCaptureService::SetFrameRate(int fps) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  capture_fps_ = fps;
  LOG(INFO) << "Video frame rate set to: " << fps << " fps";
}

void BlockedVideoCaptureService::SetDeviceId(const std::string& device_id) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  device_id_ = device_id;
  LOG(INFO) << "Video device ID set to: "
            << (device_id.empty() ? "(default)" : device_id);
}

void BlockedVideoCaptureService::SetEnableEncoding(bool enable) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  enable_encoding_ = enable;
  LOG(INFO) << "Video encoding " << (enable ? "enabled" : "disabled");
}

void BlockedVideoCaptureService::SetBackendConnector(
    BlockedBackendConnector* connector) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  backend_connector_ = connector;
}

void BlockedVideoCaptureService::AddObserver(Observer* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  observers_.push_back(observer);
}

void BlockedVideoCaptureService::RemoveObserver(Observer* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto it = std::find(observers_.begin(), observers_.end(), observer);
  if (it != observers_.end()) {
    observers_.erase(it);
  }
}

base::TimeDelta BlockedVideoCaptureService::GetCaptureUptime() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (state_ != CaptureState::CAPTURING || capture_start_time_.is_null()) {
    return base::TimeDelta();
  }
  return base::TimeTicks::Now() - capture_start_time_;
}

// mojom::VideoCaptureHost implementation

void BlockedVideoCaptureService::OnVideoFrame(
    mojo_base::BigBuffer frame_data,
    mojom::VideoFrameMetadataPtr metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != CaptureState::CAPTURING) {
    return;
  }

  // Update statistics.
  frames_received_++;
  bytes_received_ += frame_data.size();

  VLOG(3) << "Received video frame #" << metadata->frame_number
          << ": " << metadata->width << "x" << metadata->height
          << " (" << frame_data.size() << " bytes)";

  // Notify observers.
  for (Observer* observer : observers_) {
    observer->OnFrameReceived(metadata->width, metadata->height,
                              metadata->frame_number);
  }

  // Convert BigBuffer to vector for backend transmission.
  std::vector<uint8_t> data(frame_data.byte_span().begin(),
                            frame_data.byte_span().end());

  // Send to backend.
  SendFrameToBackend(data, metadata->width, metadata->height);
}

void BlockedVideoCaptureService::OnEncodedFrame(
    mojo_base::BigBuffer encoded_data,
    base::TimeTicks timestamp) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != CaptureState::CAPTURING) {
    return;
  }

  // Update statistics.
  frames_received_++;
  bytes_received_ += encoded_data.size();

  VLOG(3) << "Received encoded frame: " << encoded_data.size() << " bytes";

  // Convert BigBuffer to vector for backend transmission.
  std::vector<uint8_t> data(encoded_data.byte_span().begin(),
                            encoded_data.byte_span().end());

  // For encoded frames, we send directly without additional processing.
  if (backend_connector_ && backend_connector_->IsConnected()) {
    // Send encoded video data to backend.
    // The backend expects H.264 NAL units for streaming.
    backend_connector_->SendAudioData(data, session_id_,
                                       /*source_type=*/2);  // 2 = video
  }
}

void BlockedVideoCaptureService::OnCaptureStarted(
    mojom::VideoCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(INFO) << "Video capture started: " << settings->width << "x"
            << settings->height << " @ " << settings->frame_rate << "fps";

  // Update local settings from what renderer actually configured.
  capture_width_ = settings->width;
  capture_height_ = settings->height;
  capture_fps_ = settings->frame_rate;

  // Record start time.
  capture_start_time_ = base::TimeTicks::Now();

  // Reset statistics.
  frames_received_ = 0;
  bytes_received_ = 0;

  UpdateState(CaptureState::CAPTURING);
}

void BlockedVideoCaptureService::OnCaptureStopped() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(INFO) << "Video capture stopped. Total frames: " << frames_received_
            << ", bytes: " << bytes_received_;

  UpdateState(CaptureState::STOPPED);
}

void BlockedVideoCaptureService::OnCaptureError(
    const std::string& error_message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(ERROR) << "Video capture error: " << error_message;
  UpdateState(CaptureState::ERROR);
  NotifyObserversError(error_message);
}

void BlockedVideoCaptureService::UpdateState(CaptureState new_state) {
  if (state_ == new_state) {
    return;
  }

  LOG(INFO) << "Video capture state: " << static_cast<int>(state_)
            << " -> " << static_cast<int>(new_state);
  state_ = new_state;
  NotifyObservers(new_state);
}

void BlockedVideoCaptureService::NotifyObservers(CaptureState state) {
  for (Observer* observer : observers_) {
    observer->OnCaptureStateChanged(state);
  }
}

void BlockedVideoCaptureService::NotifyObserversError(
    const std::string& error) {
  for (Observer* observer : observers_) {
    observer->OnCaptureError(error);
  }
}

void BlockedVideoCaptureService::SendFrameToBackend(
    const std::vector<uint8_t>& frame_data,
    int width,
    int height) {
  if (!backend_connector_) {
    VLOG(2) << "No backend connector configured, dropping frame";
    return;
  }

  if (!backend_connector_->IsConnected()) {
    VLOG(2) << "Backend not connected, dropping frame";
    return;
  }

  // Send video frame data to backend.
  // Using SendAudioData with source_type=2 for video (shared transport).
  backend_connector_->SendAudioData(frame_data, session_id_,
                                     /*source_type=*/2);  // 2 = video

  VLOG(3) << "Sent video frame to backend: " << width << "x" << height
          << " (" << frame_data.size() << " bytes)";
}

}  // namespace blocked
