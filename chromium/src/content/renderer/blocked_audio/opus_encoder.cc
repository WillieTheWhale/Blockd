// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_audio/opus_encoder.h"

#include <algorithm>
#include <cmath>

#include "base/logging.h"
#include "third_party/opus/src/include/opus.h"

namespace content {

OpusEncoderWrapper::OpusEncoderWrapper() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

OpusEncoderWrapper::~OpusEncoderWrapper() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (encoder_) {
    opus_encoder_destroy(encoder_);
    encoder_ = nullptr;
  }
}

bool OpusEncoderWrapper::Initialize(int sample_rate, int channels, int bitrate,
                                     int frame_duration_ms) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  // Validate parameters.
  if (sample_rate != 8000 && sample_rate != 12000 && sample_rate != 16000 &&
      sample_rate != 24000 && sample_rate != 48000) {
    LOG(ERROR) << "Invalid sample rate: " << sample_rate
               << ". Opus supports 8000, 12000, 16000, 24000, 48000 Hz.";
    return false;
  }

  if (channels != 1 && channels != 2) {
    LOG(ERROR) << "Invalid channels: " << channels
               << ". Opus supports 1 or 2 channels.";
    return false;
  }

  if (frame_duration_ms != 5 && frame_duration_ms != 10 &&
      frame_duration_ms != 20 && frame_duration_ms != 40 &&
      frame_duration_ms != 60) {
    LOG(ERROR) << "Invalid frame duration: " << frame_duration_ms
               << "ms. Opus supports 5, 10, 20, 40, 60 ms.";
    return false;
  }

  sample_rate_ = sample_rate;
  channels_ = channels;
  bitrate_ = bitrate;
  frame_duration_ms_ = frame_duration_ms;
  samples_per_frame_ = (sample_rate * frame_duration_ms) / 1000;

  // Create Opus encoder.
  int error;
  encoder_ = opus_encoder_create(sample_rate, channels, OPUS_APPLICATION_VOIP,
                                  &error);
  if (error != OPUS_OK || !encoder_) {
    LOG(ERROR) << "Failed to create Opus encoder: " << opus_strerror(error);
    return false;
  }

  // Set bitrate.
  error = opus_encoder_ctl(encoder_, OPUS_SET_BITRATE(bitrate));
  if (error != OPUS_OK) {
    LOG(WARNING) << "Failed to set Opus bitrate: " << opus_strerror(error);
  }

  // Enable VBR for better quality at target bitrate.
  opus_encoder_ctl(encoder_, OPUS_SET_VBR(1));

  // Set complexity (0-10, higher = better quality but more CPU).
  opus_encoder_ctl(encoder_, OPUS_SET_COMPLEXITY(5));

  // Enable inband FEC for packet loss resilience.
  opus_encoder_ctl(encoder_, OPUS_SET_INBAND_FEC(1));

  // Set expected packet loss percentage (5% is a reasonable default).
  opus_encoder_ctl(encoder_, OPUS_SET_PACKET_LOSS_PERC(5));

  // Reserve PCM buffer.
  pcm_buffer_.resize(samples_per_frame_ * channels_);

  LOG(INFO) << "Opus encoder initialized: " << sample_rate_ << "Hz, "
            << channels_ << " channels, " << bitrate_ << " bps, "
            << frame_duration_ms_ << "ms frames (" << samples_per_frame_
            << " samples/frame)";

  return true;
}

bool OpusEncoderWrapper::Encode(const float* input, int num_samples,
                                 std::vector<uint8_t>& output) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!encoder_) {
    LOG(ERROR) << "Opus encoder not initialized";
    return false;
  }

  if (num_samples != samples_per_frame_) {
    LOG(ERROR) << "Invalid number of samples: " << num_samples
               << ", expected: " << samples_per_frame_;
    return false;
  }

  // Convert float32 to int16.
  // Float range: -1.0 to 1.0
  // Int16 range: -32768 to 32767
  for (int i = 0; i < num_samples; ++i) {
    float sample = input[i];
    // Clamp to valid range.
    sample = std::clamp(sample, -1.0f, 1.0f);
    // Convert to int16.
    pcm_buffer_[i] = static_cast<int16_t>(sample * 32767.0f);
  }

  // Prepare output buffer.
  output.resize(kMaxOpusFrameSize);

  // Encode.
  int encoded_bytes =
      opus_encode(encoder_, pcm_buffer_.data(), samples_per_frame_,
                  output.data(), kMaxOpusFrameSize);

  if (encoded_bytes < 0) {
    LOG(ERROR) << "Opus encoding failed: " << opus_strerror(encoded_bytes);
    return false;
  }

  // Resize output to actual size.
  output.resize(encoded_bytes);

  // Update statistics.
  total_frames_encoded_++;
  total_bytes_encoded_ += encoded_bytes;

  VLOG(3) << "Encoded " << num_samples << " samples to " << encoded_bytes
          << " bytes";

  return true;
}

}  // namespace content
