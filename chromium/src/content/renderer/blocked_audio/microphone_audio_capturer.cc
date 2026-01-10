// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_audio/microphone_audio_capturer.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "content/renderer/blocked_audio/media_stream_audio_sink_impl.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream_track.h"

namespace content {

MicrophoneAudioCapturer::MicrophoneAudioCapturer() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

MicrophoneAudioCapturer::~MicrophoneAudioCapturer() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Stop();
}

void MicrophoneAudioCapturer::SetAudioCallback(AudioCallback callback) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  audio_callback_ = std::move(callback);
}

void MicrophoneAudioCapturer::SetMediaStream(
    const blink::WebMediaStream& stream) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (stream.IsNull()) {
    LOG(ERROR) << "Cannot set null media stream";
    return;
  }

  // Disconnect from any existing stream.
  if (audio_sink_ && audio_sink_->IsConnected()) {
    audio_sink_->DisconnectFromTrack();
  }

  media_stream_ = stream;

  // Create audio sink if needed.
  if (!audio_sink_) {
    audio_sink_ = std::make_unique<MediaStreamAudioSinkImpl>(
        base::BindRepeating(&MicrophoneAudioCapturer::OnAudioData,
                            weak_factory_.GetWeakPtr()));
  }

  // Get audio tracks from the stream.
  blink::WebVector<blink::WebMediaStreamTrack> audio_tracks =
      stream.AudioTracks();

  if (audio_tracks.empty()) {
    LOG(ERROR) << "Media stream has no audio tracks";
    return;
  }

  // Connect to the first audio track.
  const blink::WebMediaStreamTrack& audio_track = audio_tracks[0];

  if (audio_sink_->ConnectToTrack(audio_track)) {
    LOG(INFO) << "Connected to audio track: " << audio_track.Id().Utf8();
  } else {
    LOG(ERROR) << "Failed to connect to audio track";
  }
}

void MicrophoneAudioCapturer::Start() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (is_capturing_) {
    LOG(WARNING) << "MicrophoneAudioCapturer already capturing";
    return;
  }

  is_capturing_ = true;
  LOG(INFO) << "Microphone capture started";
}

void MicrophoneAudioCapturer::Stop() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_capturing_) {
    return;
  }

  if (audio_sink_) {
    audio_sink_->DisconnectFromTrack();
  }

  is_capturing_ = false;
  LOG(INFO) << "Microphone capture stopped";
}

void MicrophoneAudioCapturer::SetNoiseSuppressionEnabled(bool enabled) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  noise_suppression_enabled_ = enabled;
  // Note: Actual noise suppression is typically configured via
  // MediaTrackConstraints when requesting getUserMedia.
  LOG(INFO) << "Noise suppression " << (enabled ? "enabled" : "disabled");
}

void MicrophoneAudioCapturer::SetEchoCancellationEnabled(bool enabled) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  echo_cancellation_enabled_ = enabled;
  LOG(INFO) << "Echo cancellation " << (enabled ? "enabled" : "disabled");
}

void MicrophoneAudioCapturer::SetAutoGainControlEnabled(bool enabled) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  auto_gain_control_enabled_ = enabled;
  LOG(INFO) << "Auto gain control " << (enabled ? "enabled" : "disabled");
}

void MicrophoneAudioCapturer::OnAudioData(const float* data, int num_samples,
                                          int sample_rate, int num_channels) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_capturing_ || !audio_callback_) {
    return;
  }

  // Forward to callback.
  audio_callback_.Run(data, num_samples);
}

}  // namespace content
