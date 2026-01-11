// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_audio/audio_capture_client_impl.h"

#include "base/functional/bind.h"
#include "base/logging.h"

namespace content {

AudioCaptureClientImpl::AudioCaptureClientImpl(Delegate* delegate)
    : delegate_(delegate) {
  DCHECK(delegate_);
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

AudioCaptureClientImpl::~AudioCaptureClientImpl() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
}

void AudioCaptureClientImpl::Bind(
    mojo::PendingReceiver<blocked::mojom::AudioCaptureClient> receiver,
    mojo::PendingRemote<blocked::mojom::AudioCaptureHost> host_remote) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (receiver_.is_bound()) {
    LOG(WARNING) << "AudioCaptureClientImpl: Resetting existing binding";
    receiver_.reset();
  }

  receiver_.Bind(std::move(receiver));
  receiver_.set_disconnect_handler(
      base::BindOnce(&AudioCaptureClientImpl::OnDisconnected,
                     weak_factory_.GetWeakPtr()));

  host_.Bind(std::move(host_remote));

  LOG(INFO) << "AudioCaptureClientImpl: Bound to Mojo interfaces";
}

bool AudioCaptureClientImpl::IsBound() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return receiver_.is_bound() && host_.is_bound();
}

blocked::mojom::AudioCaptureHost* AudioCaptureClientImpl::GetHost() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return nullptr;
  }
  return host_.get();
}

void AudioCaptureClientImpl::SendAudioFrame(
    mojo_base::BigBuffer frame_data,
    blocked::mojom::AudioFrameMetadataPtr metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return;
  }
  host_->OnAudioFrame(std::move(frame_data), std::move(metadata));
}

void AudioCaptureClientImpl::SendEncodedAudioFrame(
    mojo_base::BigBuffer encoded_data,
    blocked::mojom::AudioFrameMetadataPtr metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return;
  }
  host_->OnEncodedAudioFrame(std::move(encoded_data), std::move(metadata));
}

void AudioCaptureClientImpl::NotifyCaptureStarted(
    blocked::mojom::AudioCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    LOG(WARNING) << "AudioCaptureClientImpl: Cannot notify start - not connected";
    return;
  }
  host_->OnCaptureStarted(std::move(settings));
  LOG(INFO) << "AudioCaptureClientImpl: Capture started notification sent";
}

void AudioCaptureClientImpl::NotifyCaptureStopped() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return;
  }
  host_->OnCaptureStopped();
  LOG(INFO) << "AudioCaptureClientImpl: Capture stopped notification sent";
}

void AudioCaptureClientImpl::SendAudioLevel(
    float level_db,
    blocked::mojom::AudioSourceType source_type) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return;
  }
  host_->OnAudioLevel(level_db, source_type);
}

void AudioCaptureClientImpl::SendError(const std::string& error_message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!host_.is_bound()) {
    return;
  }
  host_->OnCaptureError(error_message);
  LOG(ERROR) << "AudioCaptureClientImpl: Error sent: " << error_message;
}

// blocked::mojom::AudioCaptureClient implementation

void AudioCaptureClientImpl::StartCapture(
    blocked::mojom::AudioCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "AudioCaptureClientImpl: StartCapture - "
            << "sample_rate=" << settings->sample_rate
            << ", channels=" << settings->channels
            << ", mic=" << settings->enable_microphone
            << ", tab=" << settings->enable_tab_audio;

  if (is_capturing_) {
    LOG(WARNING) << "AudioCaptureClientImpl: Already capturing, updating settings";
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

void AudioCaptureClientImpl::StopCapture() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "AudioCaptureClientImpl: StopCapture";

  if (!is_capturing_) {
    LOG(WARNING) << "AudioCaptureClientImpl: Not capturing, ignoring stop";
    return;
  }

  is_capturing_ = false;
  current_settings_.reset();

  if (delegate_) {
    delegate_->StopCapture();
  }
}

void AudioCaptureClientImpl::UpdateSettings(
    blocked::mojom::AudioCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "AudioCaptureClientImpl: UpdateSettings";

  current_settings_ = settings.Clone();

  if (delegate_) {
    delegate_->UpdateSettings(std::move(settings));
  }
}

void AudioCaptureClientImpl::SetSourceMuted(
    blocked::mojom::AudioSourceType source_type,
    bool muted) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(INFO) << "AudioCaptureClientImpl: SetSourceMuted - "
            << "source=" << static_cast<int>(source_type)
            << ", muted=" << muted;

  if (delegate_) {
    delegate_->SetSourceMuted(source_type, muted);
  }
}

void AudioCaptureClientImpl::OnDisconnected() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  LOG(WARNING) << "AudioCaptureClientImpl: Disconnected from browser";

  if (is_capturing_ && delegate_) {
    delegate_->StopCapture();
  }

  is_capturing_ = false;
  current_settings_.reset();

  receiver_.reset();
  host_.reset();
}

}  // namespace content
