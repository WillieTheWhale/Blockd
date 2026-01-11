// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/eye_tracking_client_impl.h"

#include "base/functional/bind.h"
#include "base/logging.h"

namespace content {

EyeTrackingClientImpl::EyeTrackingClientImpl(Delegate* delegate)
    : delegate_(delegate) {
  DCHECK(delegate_);
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

EyeTrackingClientImpl::~EyeTrackingClientImpl() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
}

void EyeTrackingClientImpl::Bind(
    mojo::PendingReceiver<blocked::mojom::EyeTrackingClient> receiver,
    mojo::PendingRemote<blocked::mojom::EyeTrackingHost> host_remote) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (receiver_.is_bound()) {
    LOG(WARNING) << "EyeTrackingClientImpl: Resetting existing binding";
    receiver_.reset();
  }

  receiver_.Bind(std::move(receiver));
  receiver_.set_disconnect_handler(
      base::BindOnce(&EyeTrackingClientImpl::OnDisconnected,
                     weak_factory_.GetWeakPtr()));

  host_.Bind(std::move(host_remote));

  LOG(INFO) << "EyeTrackingClientImpl: Bound to Mojo interfaces";
}

bool EyeTrackingClientImpl::IsBound() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return receiver_.is_bound() && host_.is_bound();
}

blocked::mojom::EyeTrackingHost* EyeTrackingClientImpl::GetHost() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return nullptr;
  }
  return host_.get();
}

void EyeTrackingClientImpl::SendGazeUpdate(blocked::mojom::GazeDataPtr gaze) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    LOG(WARNING) << "EyeTrackingClientImpl: Cannot send gaze - not connected";
    return;
  }
  host_->OnGazeUpdate(std::move(gaze));
}

void EyeTrackingClientImpl::SendGazeBatch(
    std::vector<blocked::mojom::GazeDataPtr> gazes) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    LOG(WARNING) << "EyeTrackingClientImpl: Cannot send gaze batch - not connected";
    return;
  }
  host_->OnGazeBatch(std::move(gazes));
}

void EyeTrackingClientImpl::SendCalibrationComplete(
    std::vector<blocked::mojom::CalibrationPointPtr> calibration_data) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    LOG(WARNING) << "EyeTrackingClientImpl: Cannot send calibration - not connected";
    return;
  }
  host_->OnCalibrationComplete(std::move(calibration_data));
  LOG(INFO) << "EyeTrackingClientImpl: Calibration complete sent to browser";
}

void EyeTrackingClientImpl::SendError(const std::string& error_message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    LOG(WARNING) << "EyeTrackingClientImpl: Cannot send error - not connected";
    return;
  }
  host_->OnEyeTrackingError(error_message);
  LOG(ERROR) << "EyeTrackingClientImpl: Error sent to browser: " << error_message;
}

// blocked::mojom::EyeTrackingClient implementation

void EyeTrackingClientImpl::StartEyeTracking(const std::string& session_id) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "EyeTrackingClientImpl: StartEyeTracking for session: "
            << session_id;

  if (is_tracking_) {
    LOG(WARNING) << "EyeTrackingClientImpl: Already tracking, ignoring start request";
    return;
  }

  session_id_ = session_id;
  is_tracking_ = true;

  if (delegate_) {
    delegate_->StartTracking(session_id);
  }
}

void EyeTrackingClientImpl::StopEyeTracking() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "EyeTrackingClientImpl: StopEyeTracking";

  if (!is_tracking_) {
    LOG(WARNING) << "EyeTrackingClientImpl: Not tracking, ignoring stop request";
    return;
  }

  is_tracking_ = false;
  session_id_.clear();

  if (delegate_) {
    delegate_->StopTracking();
  }
}

void EyeTrackingClientImpl::StartCalibration() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "EyeTrackingClientImpl: StartCalibration";

  if (delegate_) {
    delegate_->StartCalibration();
  }
}

void EyeTrackingClientImpl::SetCalibrationSettings(
    blocked::mojom::CalibrationSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "EyeTrackingClientImpl: SetCalibrationSettings - "
            << "num_points=" << settings->num_points
            << ", duration=" << settings->duration_per_point_ms << "ms";

  if (delegate_) {
    delegate_->SetCalibrationSettings(std::move(settings));
  }
}

void EyeTrackingClientImpl::OnDisconnected() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(WARNING) << "EyeTrackingClientImpl: Disconnected from browser";

  if (is_tracking_ && delegate_) {
    delegate_->StopTracking();
  }

  is_tracking_ = false;
  session_id_.clear();

  receiver_.reset();
  host_.reset();
}

}  // namespace content
