// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_ipc/blocked_session_host_impl.h"

#include <algorithm>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "chrome/browser/blocked/blocked_ipc/blocked_backend_connector.h"
#include "chrome/browser/blocked/blocked_video/blocked_video_capture_service.h"

namespace blocked {

BlockedSessionHostImpl::BlockedSessionHostImpl() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
  LOG(INFO) << "BlockedSessionHostImpl created";
}

BlockedSessionHostImpl::~BlockedSessionHostImpl() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Shutdown();
}

void BlockedSessionHostImpl::Shutdown() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(INFO) << "BlockedSessionHostImpl shutting down";

  // End the session if active.
  if (session_state_ != mojom::SessionState::IDLE &&
      session_state_ != mojom::SessionState::ENDED) {
    EndSession();
  }

  // Reset all Mojo bindings.
  session_receiver_.reset();
  session_client_.reset();
  eye_tracking_receiver_.reset();
  eye_tracking_client_.reset();
  audio_capture_receiver_.reset();
  audio_capture_client_.reset();
}

void BlockedSessionHostImpl::Initialize(
    BlockedBackendConnector* backend_connector,
    BlockedVideoCaptureService* video_capture_service) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  backend_connector_ = backend_connector;
  video_capture_service_ = video_capture_service;

  LOG(INFO) << "BlockedSessionHostImpl initialized with services";
}

void BlockedSessionHostImpl::StartSession(const std::string& session_id,
                                          const std::string& session_token) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (session_state_ == mojom::SessionState::ACTIVE) {
    LOG(WARNING) << "Session already active";
    return;
  }

  session_id_ = session_id;
  session_token_ = session_token;

  UpdateSessionState(mojom::SessionState::INITIALIZING);

  LOG(INFO) << "Starting session: " << session_id;

  // Send session config to renderer if connected.
  if (session_client_.is_bound()) {
    SendSessionConfig();
  }

  // Connect to backend.
  if (backend_connector_) {
    backend_connector_->Connect(session_token);
  }
}

void BlockedSessionHostImpl::EndSession() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (session_state_ == mojom::SessionState::ENDED ||
      session_state_ == mojom::SessionState::IDLE) {
    return;
  }

  LOG(INFO) << "Ending session: " << session_id_;

  // Stop eye tracking.
  if (eye_tracking_client_.is_bound()) {
    eye_tracking_client_->StopEyeTracking();
  }

  // Stop video capture.
  if (video_capture_service_) {
    video_capture_service_->StopCapture();
  }

  // Stop audio capture.
  if (audio_capture_client_.is_bound()) {
    audio_capture_client_->StopCapture();
  }

  // Notify renderer.
  if (session_client_.is_bound()) {
    session_client_->EndSession();
  }

  // Disconnect from backend.
  if (backend_connector_) {
    backend_connector_->Disconnect();
  }

  UpdateSessionState(mojom::SessionState::ENDED);

  // Clear session data.
  session_id_.clear();
  session_token_.clear();
}

void BlockedSessionHostImpl::PauseSession() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (session_state_ != mojom::SessionState::ACTIVE) {
    LOG(WARNING) << "Cannot pause - session not active";
    return;
  }

  LOG(INFO) << "Pausing session: " << session_id_;
  UpdateSessionState(mojom::SessionState::PAUSED);
}

void BlockedSessionHostImpl::ResumeSession() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (session_state_ != mojom::SessionState::PAUSED) {
    LOG(WARNING) << "Cannot resume - session not paused";
    return;
  }

  LOG(INFO) << "Resuming session: " << session_id_;
  UpdateSessionState(mojom::SessionState::ACTIVE);
}

void BlockedSessionHostImpl::SetEyeTrackingEnabled(bool enabled) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  eye_tracking_enabled_ = enabled;
  LOG(INFO) << "Eye tracking " << (enabled ? "enabled" : "disabled");
}

void BlockedSessionHostImpl::SetVideoCaptureEnabled(bool enabled) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  video_capture_enabled_ = enabled;
  LOG(INFO) << "Video capture " << (enabled ? "enabled" : "disabled");
}

void BlockedSessionHostImpl::SetAudioCaptureEnabled(bool enabled) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  audio_capture_enabled_ = enabled;
  LOG(INFO) << "Audio capture " << (enabled ? "enabled" : "disabled");
}

void BlockedSessionHostImpl::BindSessionHost(
    mojo::PendingReceiver<mojom::BlockedSessionHost> receiver,
    mojo::PendingRemote<mojom::BlockedSessionClient> client) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  // Reset existing bindings.
  session_receiver_.reset();
  session_client_.reset();

  // Bind new interfaces.
  session_receiver_.Bind(std::move(receiver));
  session_receiver_.set_disconnect_handler(base::BindOnce(
      &BlockedSessionHostImpl::OnSessionClientDisconnected,
      weak_factory_.GetWeakPtr()));

  session_client_.Bind(std::move(client));

  LOG(INFO) << "Session host bound to renderer";

  // If session is already started, send config.
  if (!session_id_.empty()) {
    SendSessionConfig();
  }
}

void BlockedSessionHostImpl::AddObserver(Observer* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  observers_.push_back(observer);
}

void BlockedSessionHostImpl::RemoveObserver(Observer* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto it = std::find(observers_.begin(), observers_.end(), observer);
  if (it != observers_.end()) {
    observers_.erase(it);
  }
}

// mojom::BlockedSessionHost implementation.

void BlockedSessionHostImpl::OnRendererReady() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(INFO) << "Renderer reported ready";

  // Notify observers.
  for (Observer* observer : observers_) {
    observer->OnRendererReady();
  }

  // If session is initializing, move to calibrating or active.
  if (session_state_ == mojom::SessionState::INITIALIZING) {
    if (eye_tracking_enabled_) {
      UpdateSessionState(mojom::SessionState::CALIBRATING);
      // Start calibration in renderer.
      if (eye_tracking_client_.is_bound()) {
        eye_tracking_client_->StartCalibration();
      }
    } else {
      UpdateSessionState(mojom::SessionState::ACTIVE);
      StartActiveSession();
    }
  }
}

void BlockedSessionHostImpl::OnSessionEvent(const std::string& event_type,
                                            const std::string& data) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  VLOG(1) << "Session event: " << event_type << " - " << data;

  // Notify observers.
  for (Observer* observer : observers_) {
    observer->OnSessionEvent(event_type, data);
  }

  // Forward to backend if connected.
  if (backend_connector_ && backend_connector_->IsConnected()) {
    backend_connector_->SendSecurityEvent(event_type, "info", data, "{}");
  }
}

void BlockedSessionHostImpl::GetSessionState(GetSessionStateCallback callback) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  std::move(callback).Run(session_state_);
}

void BlockedSessionHostImpl::BindEyeTracking(
    mojo::PendingReceiver<mojom::EyeTrackingHost> eye_tracking_host,
    mojo::PendingRemote<mojom::EyeTrackingClient> eye_tracking_client) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  // Reset existing bindings.
  eye_tracking_receiver_.reset();
  eye_tracking_client_.reset();

  // Bind new interfaces.
  eye_tracking_receiver_.Bind(std::move(eye_tracking_host));
  eye_tracking_client_.Bind(std::move(eye_tracking_client));

  LOG(INFO) << "Eye tracking interfaces bound";

  // If session is active and eye tracking is enabled, start it.
  if (session_state_ == mojom::SessionState::ACTIVE && eye_tracking_enabled_) {
    eye_tracking_client_->StartEyeTracking(session_id_);
  }
}

void BlockedSessionHostImpl::BindVideoCapture(
    mojo::PendingReceiver<mojom::VideoCaptureHost> video_capture_host,
    mojo::PendingRemote<mojom::VideoCaptureClient> video_capture_client) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(INFO) << "Video capture interfaces binding requested";

  // Delegate to video capture service if available.
  if (video_capture_service_) {
    video_capture_service_->BindInterface(std::move(video_capture_host),
                                          std::move(video_capture_client));

    // If session is active and video capture is enabled, start it.
    if (session_state_ == mojom::SessionState::ACTIVE &&
        video_capture_enabled_) {
      video_capture_service_->StartCapture(session_id_);
    }
  } else {
    LOG(ERROR) << "Video capture service not available";
  }
}

void BlockedSessionHostImpl::BindAudioCapture(
    mojo::PendingReceiver<mojom::AudioCaptureHost> audio_capture_host,
    mojo::PendingRemote<mojom::AudioCaptureClient> audio_capture_client) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  // Reset existing bindings.
  audio_capture_receiver_.reset();
  audio_capture_client_.reset();

  // Bind new interfaces.
  audio_capture_receiver_.Bind(std::move(audio_capture_host));
  audio_capture_client_.Bind(std::move(audio_capture_client));

  LOG(INFO) << "Audio capture interfaces bound";

  // If session is active and audio capture is enabled, start it.
  if (session_state_ == mojom::SessionState::ACTIVE && audio_capture_enabled_) {
    auto settings = mojom::AudioCaptureSettings::New();
    settings->sample_rate = 48000;
    settings->channels = 1;
    settings->bits_per_sample = 16;
    settings->codec = mojom::AudioCodec::OPUS;
    settings->opus_bitrate = 64000;
    settings->frame_duration_ms = 20;
    settings->enable_microphone = true;
    settings->enable_tab_audio = false;
    settings->enable_noise_suppression = true;
    settings->enable_echo_cancellation = true;
    settings->enable_auto_gain_control = true;

    audio_capture_client_->StartCapture(std::move(settings));
  }
}

// mojom::EyeTrackingHost implementation.

void BlockedSessionHostImpl::OnGazeUpdate(mojom::GazeDataPtr gaze) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!gaze) {
    return;
  }

  gaze_events_received_++;

  VLOG(3) << "Gaze update: (" << gaze->x << ", " << gaze->y
          << ") confidence: " << gaze->confidence;

  // Notify observers.
  for (Observer* observer : observers_) {
    observer->OnGazeUpdate(*gaze);
  }

  // Send to backend.
  SendGazeToBackend(*gaze);
}

void BlockedSessionHostImpl::OnGazeBatch(
    std::vector<mojom::GazeDataPtr> gazes) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  VLOG(2) << "Gaze batch received: " << gazes.size() << " points";

  for (const auto& gaze : gazes) {
    if (gaze) {
      gaze_events_received_++;
      SendGazeToBackend(*gaze);
    }
  }
}

void BlockedSessionHostImpl::OnCalibrationComplete(
    std::vector<mojom::CalibrationPointPtr> calibration_data) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(INFO) << "Calibration complete with " << calibration_data.size()
            << " points";

  // Notify observers.
  for (Observer* observer : observers_) {
    observer->OnCalibrationComplete();
  }

  // Move to active state.
  if (session_state_ == mojom::SessionState::CALIBRATING) {
    UpdateSessionState(mojom::SessionState::ACTIVE);
    StartActiveSession();
  }
}

void BlockedSessionHostImpl::OnEyeTrackingError(
    const std::string& error_message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(ERROR) << "Eye tracking error: " << error_message;

  // Report to backend.
  if (backend_connector_ && backend_connector_->IsConnected()) {
    backend_connector_->SendSecurityEvent("eye_tracking_error", "high",
                                          error_message, "{}");
  }
}

// mojom::AudioCaptureHost implementation.

void BlockedSessionHostImpl::OnAudioFrame(
    mojo_base::BigBuffer frame_data,
    mojom::AudioFrameMetadataPtr metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (session_state_ != mojom::SessionState::ACTIVE) {
    return;
  }

  audio_frames_received_++;

  VLOG(3) << "Audio frame received: " << frame_data.size() << " bytes";

  // Convert and send to backend.
  std::vector<uint8_t> data(frame_data.byte_span().begin(),
                            frame_data.byte_span().end());
  SendAudioToBackend(data, metadata->source_type);
}

void BlockedSessionHostImpl::OnEncodedAudioFrame(
    mojo_base::BigBuffer encoded_data,
    mojom::AudioFrameMetadataPtr metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (session_state_ != mojom::SessionState::ACTIVE) {
    return;
  }

  audio_frames_received_++;

  VLOG(3) << "Encoded audio frame received: " << encoded_data.size()
          << " bytes";

  // Convert and send to backend.
  std::vector<uint8_t> data(encoded_data.byte_span().begin(),
                            encoded_data.byte_span().end());
  SendAudioToBackend(data, metadata->source_type);
}

void BlockedSessionHostImpl::OnCaptureStarted(
    mojom::AudioCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(INFO) << "Audio capture started: " << settings->sample_rate << "Hz, "
            << settings->channels << " channels";
}

void BlockedSessionHostImpl::OnCaptureStopped() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "Audio capture stopped";
}

void BlockedSessionHostImpl::OnCaptureError(const std::string& error_message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(ERROR) << "Audio capture error: " << error_message;
}

void BlockedSessionHostImpl::OnAudioLevel(float level_db,
                                          mojom::AudioSourceType source_type) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  VLOG(3) << "Audio level: " << level_db << " dB from source "
          << static_cast<int>(source_type);
}

// Private methods.

void BlockedSessionHostImpl::UpdateSessionState(mojom::SessionState new_state) {
  if (session_state_ == new_state) {
    return;
  }

  LOG(INFO) << "Session state: " << static_cast<int>(session_state_)
            << " -> " << static_cast<int>(new_state);
  session_state_ = new_state;

  NotifyClientStateChanged(new_state);
}

void BlockedSessionHostImpl::NotifyClientStateChanged(
    mojom::SessionState state) {
  if (session_client_.is_bound()) {
    session_client_->OnSessionStateChanged(state);
  }
}

void BlockedSessionHostImpl::SendSessionConfig() {
  if (!session_client_.is_bound()) {
    return;
  }

  auto config = mojom::SessionConfig::New();
  config->session_id = session_id_;
  config->session_token = session_token_;
  config->enable_eye_tracking = eye_tracking_enabled_;
  config->enable_video_capture = video_capture_enabled_;
  config->enable_audio_capture = audio_capture_enabled_;
  config->enable_security_monitoring = true;

  // Calibration settings.
  config->calibration_settings = mojom::CalibrationSettings::New();
  config->calibration_settings->num_points = 9;
  config->calibration_settings->duration_per_point_ms = 2000;
  config->calibration_settings->samples_per_point = 60;

  // Video settings.
  config->video_settings = mojom::VideoCaptureSettings::New();
  config->video_settings->width = 640;
  config->video_settings->height = 480;
  config->video_settings->frame_rate = 30;
  config->video_settings->format = mojom::VideoFormat::I420;
  config->video_settings->enable_encoding = true;

  // Audio settings.
  config->audio_settings = mojom::AudioCaptureSettings::New();
  config->audio_settings->sample_rate = 48000;
  config->audio_settings->channels = 1;
  config->audio_settings->bits_per_sample = 16;
  config->audio_settings->codec = mojom::AudioCodec::OPUS;
  config->audio_settings->opus_bitrate = 64000;
  config->audio_settings->frame_duration_ms = 20;
  config->audio_settings->enable_microphone = true;
  config->audio_settings->enable_tab_audio = false;
  config->audio_settings->enable_noise_suppression = true;
  config->audio_settings->enable_echo_cancellation = true;
  config->audio_settings->enable_auto_gain_control = true;

  session_client_->OnSessionConfig(std::move(config));
  LOG(INFO) << "Session config sent to renderer";
}

void BlockedSessionHostImpl::OnSessionClientDisconnected() {
  LOG(WARNING) << "Session client disconnected";

  // Reset client bindings.
  session_client_.reset();
  eye_tracking_client_.reset();
  audio_capture_client_.reset();

  // If session was active, move to error state.
  if (session_state_ == mojom::SessionState::ACTIVE ||
      session_state_ == mojom::SessionState::CALIBRATING) {
    UpdateSessionState(mojom::SessionState::ERROR);
  }
}

void BlockedSessionHostImpl::SendGazeToBackend(const mojom::GazeData& gaze) {
  if (!backend_connector_ || !backend_connector_->IsConnected()) {
    return;
  }

  // Pack gaze data into a vector for transmission.
  std::vector<float> gaze_points = {gaze.x, gaze.y, gaze.confidence};
  backend_connector_->SendGazeData(gaze_points);
}

void BlockedSessionHostImpl::SendAudioToBackend(
    const std::vector<uint8_t>& audio_data,
    mojom::AudioSourceType source_type) {
  if (!backend_connector_ || !backend_connector_->IsConnected()) {
    return;
  }

  backend_connector_->SendAudioData(audio_data, session_id_,
                                    static_cast<int>(source_type));
}

void BlockedSessionHostImpl::StartActiveSession() {
  LOG(INFO) << "Starting active session: " << session_id_;

  // Start eye tracking.
  if (eye_tracking_enabled_ && eye_tracking_client_.is_bound()) {
    eye_tracking_client_->StartEyeTracking(session_id_);
  }

  // Start video capture.
  if (video_capture_enabled_ && video_capture_service_) {
    video_capture_service_->StartCapture(session_id_);
  }

  // Start audio capture.
  if (audio_capture_enabled_ && audio_capture_client_.is_bound()) {
    auto settings = mojom::AudioCaptureSettings::New();
    settings->sample_rate = 48000;
    settings->channels = 1;
    settings->bits_per_sample = 16;
    settings->codec = mojom::AudioCodec::OPUS;
    settings->opus_bitrate = 64000;
    settings->frame_duration_ms = 20;
    settings->enable_microphone = true;
    settings->enable_tab_audio = false;
    settings->enable_noise_suppression = true;
    settings->enable_echo_cancellation = true;
    settings->enable_auto_gain_control = true;

    audio_capture_client_->StartCapture(std::move(settings));
  }
}

}  // namespace blocked
