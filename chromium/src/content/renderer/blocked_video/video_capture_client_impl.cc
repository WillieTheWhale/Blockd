// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_video/video_capture_client_impl.h"

#include "base/functional/bind.h"
#include "base/logging.h"

namespace content {

VideoCaptureClientImpl::VideoCaptureClientImpl(Delegate* delegate)
    : delegate_(delegate) {
  DCHECK(delegate_);
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

VideoCaptureClientImpl::~VideoCaptureClientImpl() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
}

void VideoCaptureClientImpl::Bind(
    mojo::PendingReceiver<blocked::mojom::VideoCaptureClient> receiver,
    mojo::PendingRemote<blocked::mojom::VideoCaptureHost> host_remote) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (receiver_.is_bound()) {
    LOG(WARNING) << "VideoCaptureClientImpl: Resetting existing binding";
    receiver_.reset();
  }

  receiver_.Bind(std::move(receiver));
  receiver_.set_disconnect_handler(
      base::BindOnce(&VideoCaptureClientImpl::OnDisconnected,
                     weak_factory_.GetWeakPtr()));

  host_.Bind(std::move(host_remote));

  LOG(INFO) << "VideoCaptureClientImpl: Bound to Mojo interfaces";
}

bool VideoCaptureClientImpl::IsBound() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return receiver_.is_bound() && host_.is_bound();
}

blocked::mojom::VideoCaptureHost* VideoCaptureClientImpl::GetHost() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return nullptr;
  }
  return host_.get();
}

void VideoCaptureClientImpl::SendVideoFrame(
    mojo_base::BigBuffer frame_data,
    blocked::mojom::VideoFrameMetadataPtr metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return;
  }
  host_->OnVideoFrame(std::move(frame_data), std::move(metadata));
}

void VideoCaptureClientImpl::SendEncodedFrame(
    mojo_base::BigBuffer encoded_data,
    base::TimeTicks timestamp) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return;
  }
  host_->OnEncodedFrame(std::move(encoded_data), timestamp);
}

void VideoCaptureClientImpl::NotifyCaptureStarted(
    blocked::mojom::VideoCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    LOG(WARNING) << "VideoCaptureClientImpl: Cannot notify start - not connected";
    return;
  }
  host_->OnCaptureStarted(std::move(settings));
  LOG(INFO) << "VideoCaptureClientImpl: Capture started notification sent";
}

void VideoCaptureClientImpl::NotifyCaptureStopped() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return;
  }
  host_->OnCaptureStopped();
  LOG(INFO) << "VideoCaptureClientImpl: Capture stopped notification sent";
}

void VideoCaptureClientImpl::SendError(const std::string& error_message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return;
  }
  host_->OnCaptureError(error_message);
  LOG(ERROR) << "VideoCaptureClientImpl: Error sent: " << error_message;
}

// blocked::mojom::VideoCaptureClient implementation

void VideoCaptureClientImpl::StartCapture(
    blocked::mojom::VideoCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "VideoCaptureClientImpl: StartCapture - "
            << settings->width << "x" << settings->height
            << " @ " << settings->frame_rate << " fps";

  if (is_capturing_) {
    LOG(WARNING) << "VideoCaptureClientImpl: Already capturing, updating settings";
    if (delegate_) {
      delegate_->UpdateSettings(settings.Clone());
    }
    current_settings_ = std::move(settings);
    return;
  }

  current_settings_ = settings.Clone();
  is_capturing_ = true;

  if (delegate_) {
    delegate_->StartCapture(std::move(settings));
  }
}

void VideoCaptureClientImpl::StopCapture() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "VideoCaptureClientImpl: StopCapture";

  if (!is_capturing_) {
    LOG(WARNING) << "VideoCaptureClientImpl: Not capturing, ignoring stop";
    return;
  }

  is_capturing_ = false;
  current_settings_.reset();

  if (delegate_) {
    delegate_->StopCapture();
  }
}

void VideoCaptureClientImpl::UpdateSettings(
    blocked::mojom::VideoCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "VideoCaptureClientImpl: UpdateSettings";

  current_settings_ = settings.Clone();

  if (delegate_) {
    delegate_->UpdateSettings(std::move(settings));
  }
}

void VideoCaptureClientImpl::OnDisconnected() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(WARNING) << "VideoCaptureClientImpl: Disconnected from browser";

  if (is_capturing_ && delegate_) {
    delegate_->StopCapture();
  }

  is_capturing_ = false;
  current_settings_.reset();

  receiver_.reset();
  host_.reset();
}

}  // namespace content
