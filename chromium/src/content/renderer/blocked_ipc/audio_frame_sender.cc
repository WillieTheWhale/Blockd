// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_ipc/audio_frame_sender.h"

#include "base/logging.h"
#include "mojo/public/cpp/base/big_buffer.h"

namespace content {

// PendingAudioFrame implementation.
AudioFrameSender::PendingAudioFrame::PendingAudioFrame() = default;
AudioFrameSender::PendingAudioFrame::~PendingAudioFrame() = default;
AudioFrameSender::PendingAudioFrame::PendingAudioFrame(
    PendingAudioFrame&&) noexcept = default;
AudioFrameSender::PendingAudioFrame&
AudioFrameSender::PendingAudioFrame::operator=(PendingAudioFrame&&) noexcept =
    default;

// static
AudioFrameSender* AudioFrameSender::GetInstance() {
  static base::NoDestructor<AudioFrameSender> instance;
  return instance.get();
}

AudioFrameSender::AudioFrameSender() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

AudioFrameSender::~AudioFrameSender() = default;

void AudioFrameSender::Initialize(blocked::mojom::AudioCaptureHost* host) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  audio_capture_host_ = host;

  if (host) {
    LOG(INFO) << "AudioFrameSender initialized with host";
    ProcessPendingFrames();
  } else {
    LOG(WARNING) << "AudioFrameSender initialized with null host";
  }
}

void AudioFrameSender::SendFrame(const uint8_t* frame_data, int size,
                                  const blocked::AudioFrameMetadata& metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!audio_capture_host_) {
    // Queue the frame if host is not ready.
    if (pending_frames_.size() >= max_pending_frames_) {
      DropOldestFrame();
    }

    PendingAudioFrame pending;
    pending.data.assign(frame_data, frame_data + size);
    pending.metadata = metadata;
    pending.queued_at = base::TimeTicks::Now();
    pending_frames_.push(std::move(pending));
    return;
  }

  // Create mojom metadata.
  auto mojom_metadata = blocked::mojom::AudioFrameMetadata::New();
  mojom_metadata->codec = metadata.codec;
  mojom_metadata->source_type = metadata.source_type;
  mojom_metadata->sample_rate = metadata.sample_rate;
  mojom_metadata->channels = metadata.channels;
  mojom_metadata->bits_per_sample = metadata.bits_per_sample;
  mojom_metadata->frame_number = metadata.frame_number;
  mojom_metadata->timestamp = metadata.timestamp;
  mojom_metadata->duration_ms = metadata.duration_ms;

  // Send via Mojo.
  mojo_base::BigBuffer buffer(
      base::make_span(frame_data, static_cast<size_t>(size)));
  audio_capture_host_->OnAudioFrame(std::move(buffer),
                                     std::move(mojom_metadata));

  total_sent_++;
  total_bytes_ += size;

  VLOG(3) << "Sent audio frame: " << size << " bytes, frame "
          << metadata.frame_number;
}

void AudioFrameSender::SendEncodedFrame(
    const uint8_t* encoded_data, int size,
    const blocked::AudioFrameMetadata& metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!audio_capture_host_) {
    // Queue the frame if host is not ready.
    if (pending_frames_.size() >= max_pending_frames_) {
      DropOldestFrame();
    }

    PendingAudioFrame pending;
    pending.data.assign(encoded_data, encoded_data + size);
    pending.metadata = metadata;
    pending.queued_at = base::TimeTicks::Now();
    pending_frames_.push(std::move(pending));
    return;
  }

  // Create mojom metadata.
  auto mojom_metadata = blocked::mojom::AudioFrameMetadata::New();
  mojom_metadata->codec = metadata.codec;
  mojom_metadata->source_type = metadata.source_type;
  mojom_metadata->sample_rate = metadata.sample_rate;
  mojom_metadata->channels = metadata.channels;
  mojom_metadata->bits_per_sample = metadata.bits_per_sample;
  mojom_metadata->frame_number = metadata.frame_number;
  mojom_metadata->timestamp = metadata.timestamp;
  mojom_metadata->duration_ms = metadata.duration_ms;

  // Send via Mojo.
  mojo_base::BigBuffer buffer(
      base::make_span(encoded_data, static_cast<size_t>(size)));
  audio_capture_host_->OnEncodedAudioFrame(std::move(buffer),
                                            std::move(mojom_metadata));

  total_sent_++;
  total_bytes_ += size;

  VLOG(3) << "Sent encoded audio frame: " << size << " bytes, frame "
          << metadata.frame_number;
}

void AudioFrameSender::SendAudioLevel(
    float level_db, blocked::mojom::AudioSourceType source_type) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!audio_capture_host_) {
    return;
  }

  audio_capture_host_->OnAudioLevel(level_db, source_type);
}

void AudioFrameSender::NotifyCaptureStarted(
    blocked::mojom::AudioCaptureSettingsPtr settings) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!audio_capture_host_) {
    LOG(WARNING) << "Cannot notify capture started: host not available";
    return;
  }

  audio_capture_host_->OnCaptureStarted(std::move(settings));
  LOG(INFO) << "Notified browser: audio capture started";
}

void AudioFrameSender::NotifyCaptureStopped() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!audio_capture_host_) {
    return;
  }

  audio_capture_host_->OnCaptureStopped();
  LOG(INFO) << "Notified browser: audio capture stopped";
}

void AudioFrameSender::NotifyCaptureError(const std::string& error_message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!audio_capture_host_) {
    LOG(ERROR) << "Cannot notify capture error: host not available";
    return;
  }

  audio_capture_host_->OnCaptureError(error_message);
  LOG(ERROR) << "Notified browser: audio capture error: " << error_message;
}

void AudioFrameSender::ProcessPendingFrames() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!audio_capture_host_) {
    return;
  }

  while (!pending_frames_.empty()) {
    PendingAudioFrame& frame = pending_frames_.front();

    // Check if frame is too old (>500ms).
    if (base::TimeTicks::Now() - frame.queued_at >
        base::Milliseconds(500)) {
      dropped_frames_++;
      pending_frames_.pop();
      continue;
    }

    // Send the frame.
    SendEncodedFrame(frame.data.data(), static_cast<int>(frame.data.size()),
                     frame.metadata);
    pending_frames_.pop();
  }

  LOG(INFO) << "Processed pending audio frames, dropped: " << dropped_frames_;
}

void AudioFrameSender::DropOldestFrame() {
  if (pending_frames_.empty()) {
    return;
  }

  pending_frames_.pop();
  dropped_frames_++;

  VLOG(2) << "Dropped oldest audio frame, total dropped: " << dropped_frames_;
}

}  // namespace content
