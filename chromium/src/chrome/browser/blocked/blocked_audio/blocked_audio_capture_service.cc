// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_audio/blocked_audio_capture_service.h"

#include "base/logging.h"
#include "chrome/browser/blocked/blocked_ipc/blocked_backend_connector.h"

namespace blocked {

BlockedAudioCaptureService::BlockedAudioCaptureService() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

BlockedAudioCaptureService::~BlockedAudioCaptureService() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
}

void BlockedAudioCaptureService::Shutdown() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  StopCapture();
}

void BlockedAudioCaptureService::StartCapture(const std::string& session_id) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == CaptureState::CAPTURING) {
    LOG(WARNING) << "Audio capture already running for session: "
                 << session_id_;
    return;
  }

  session_id_ = session_id;
  UpdateState(CaptureState::STARTING);

  LOG(INFO) << "Audio capture starting for session: " << session_id;
}

void BlockedAudioCaptureService::StopCapture() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == CaptureState::STOPPED) {
    return;
  }

  UpdateState(CaptureState::STOPPED);
  session_id_.clear();

  LOG(INFO) << "Audio capture stopped. Total frames: " << total_frames_received_
            << ", bytes: " << total_bytes_received_;
}

mojo::PendingReceiver<blocked::mojom::AudioCaptureHost>
BlockedAudioCaptureService::GetReceiver() {
  return receiver_.BindNewPipeAndPassReceiver();
}

void BlockedAudioCaptureService::SetSampleRate(int sample_rate) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  sample_rate_ = sample_rate;
}

void BlockedAudioCaptureService::SetChannels(int channels) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  channels_ = channels;
}

void BlockedAudioCaptureService::OnAudioFrame(
    mojo_base::BigBuffer frame_data,
    blocked::mojom::AudioFrameMetadataPtr metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != CaptureState::CAPTURING) {
    return;
  }

  // Convert BigBuffer to vector.
  std::vector<uint8_t> data(frame_data.data(),
                            frame_data.data() + frame_data.size());

  total_frames_received_++;
  total_bytes_received_ += data.size();

  // Forward to backend.
  ForwardAudioToBackend(data, *metadata);

  VLOG(3) << "Received audio frame: " << data.size() << " bytes, frame "
          << metadata->frame_number;
}

void BlockedAudioCaptureService::OnEncodedAudioFrame(
    mojo_base::BigBuffer encoded_data,
    blocked::mojom::AudioFrameMetadataPtr metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != CaptureState::CAPTURING) {
    return;
  }

  // Convert BigBuffer to vector.
  std::vector<uint8_t> data(encoded_data.data(),
                            encoded_data.data() + encoded_data.size());

  total_frames_received_++;
  total_bytes_received_ += data.size();

  // Forward to backend.
  ForwardAudioToBackend(data, *metadata);

  VLOG(3) << "Received encoded audio frame: " << data.size() << " bytes, frame "
          << metadata->frame_number;
}

void BlockedAudioCaptureService::OnCaptureStarted(
    blocked::mojom::AudioCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  sample_rate_ = settings->sample_rate;
  channels_ = settings->channels;

  UpdateState(CaptureState::CAPTURING);

  LOG(INFO) << "Audio capture started: " << sample_rate_ << "Hz, " << channels_
            << " channels, codec: "
            << static_cast<int>(settings->codec);
}

void BlockedAudioCaptureService::OnCaptureStopped() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  UpdateState(CaptureState::STOPPED);
  LOG(INFO) << "Audio capture stopped by renderer";
}

void BlockedAudioCaptureService::OnCaptureError(
    const std::string& error_message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(ERROR) << "Audio capture error: " << error_message;
  UpdateState(CaptureState::ERROR);
}

void BlockedAudioCaptureService::OnAudioLevel(
    float level_db, blocked::mojom::AudioSourceType source_type) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  switch (source_type) {
    case blocked::mojom::AudioSourceType::MICROPHONE:
      microphone_level_db_ = level_db;
      break;
    case blocked::mojom::AudioSourceType::TAB_AUDIO:
      tab_audio_level_db_ = level_db;
      break;
    case blocked::mojom::AudioSourceType::MIXED:
      // For mixed audio, update both levels.
      microphone_level_db_ = level_db;
      tab_audio_level_db_ = level_db;
      break;
  }

  VLOG(4) << "Audio level update: " << level_db << " dB for source "
          << static_cast<int>(source_type);
}

void BlockedAudioCaptureService::ForwardAudioToBackend(
    const std::vector<uint8_t>& audio_data,
    const blocked::mojom::AudioFrameMetadata& metadata) {
  // Get backend connector and send audio data.
  auto* connector = BlockedBackendConnector::GetInstance();
  if (!connector || !connector->IsConnected()) {
    VLOG(2) << "Backend not connected, audio frame dropped";
    return;
  }

  // Send audio data to backend.
  // The backend connector needs a SendAudioData method.
  connector->SendAudioData(audio_data, session_id_,
                           static_cast<int>(metadata.source_type));
}

void BlockedAudioCaptureService::UpdateState(CaptureState new_state) {
  if (state_ == new_state) {
    return;
  }

  LOG(INFO) << "Audio capture state: " << static_cast<int>(state_) << " -> "
            << static_cast<int>(new_state);
  state_ = new_state;
}

}  // namespace blocked
