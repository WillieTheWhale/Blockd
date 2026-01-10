// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_audio/media_stream_audio_sink_impl.h"

#include "base/logging.h"
#include "media/base/audio_bus.h"

namespace content {

MediaStreamAudioSinkImpl::MediaStreamAudioSinkImpl(AudioDataCallback callback)
    : audio_callback_(std::move(callback)) {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

MediaStreamAudioSinkImpl::~MediaStreamAudioSinkImpl() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  DisconnectFromTrack();
}

bool MediaStreamAudioSinkImpl::ConnectToTrack(
    const blink::WebMediaStreamTrack& track) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (is_connected_) {
    DisconnectFromTrack();
  }

  if (track.IsNull()) {
    LOG(ERROR) << "Cannot connect to null audio track";
    return false;
  }

  connected_track_ = track;

  // Register as a sink on the track.
  blink::WebMediaStreamAudioSink::AddToAudioTrack(this, connected_track_);
  is_connected_ = true;

  LOG(INFO) << "Connected to audio track: " << track.Id().Utf8();
  return true;
}

void MediaStreamAudioSinkImpl::DisconnectFromTrack() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_connected_) {
    return;
  }

  if (!connected_track_.IsNull()) {
    blink::WebMediaStreamAudioSink::RemoveFromAudioTrack(this,
                                                          connected_track_);
    connected_track_.Reset();
  }

  is_connected_ = false;
  LOG(INFO) << "Disconnected from audio track";
}

void MediaStreamAudioSinkImpl::OnData(const media::AudioBus& audio_bus,
                                       base::TimeTicks estimated_capture_time) {
  // Note: OnData may be called on a different thread (audio thread).
  // In production, we'd need proper thread synchronization.

  if (!is_connected_ || !audio_callback_) {
    return;
  }

  int num_frames = audio_bus.frames();
  int num_channels = audio_bus.channels();
  int total_samples = num_frames * num_channels;

  // Resize interleaved buffer if needed.
  if (interleaved_buffer_.size() != static_cast<size_t>(total_samples)) {
    interleaved_buffer_.resize(total_samples);
  }

  // Convert from planar to interleaved format.
  // AudioBus stores audio in planar format (one array per channel).
  // We need interleaved format (samples from all channels alternating).
  for (int frame = 0; frame < num_frames; ++frame) {
    for (int channel = 0; channel < num_channels; ++channel) {
      interleaved_buffer_[frame * num_channels + channel] =
          audio_bus.channel(channel)[frame];
    }
  }

  // Call the callback with the audio data.
  audio_callback_.Run(interleaved_buffer_.data(), total_samples, sample_rate_,
                      num_channels);
}

void MediaStreamAudioSinkImpl::OnSetFormat(
    const media::AudioParameters& params) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  sample_rate_ = params.sample_rate();
  num_channels_ = params.channels();
  frames_per_buffer_ = params.frames_per_buffer();

  LOG(INFO) << "Audio format set: " << sample_rate_ << "Hz, " << num_channels_
            << " channels, " << frames_per_buffer_ << " frames/buffer";
}

}  // namespace content
