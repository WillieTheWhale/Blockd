// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_AUDIO_OPUS_ENCODER_H_
#define CONTENT_RENDERER_BLOCKED_AUDIO_OPUS_ENCODER_H_

#include <cstdint>
#include <memory>
#include <vector>

#include "base/sequence_checker.h"

// Forward declaration of Opus encoder struct.
struct OpusEncoder;

namespace content {

// Wrapper for Opus audio encoder.
// Encodes raw PCM audio to Opus codec for efficient streaming.
class OpusEncoderWrapper {
 public:
  OpusEncoderWrapper();
  ~OpusEncoderWrapper();

  OpusEncoderWrapper(const OpusEncoderWrapper&) = delete;
  OpusEncoderWrapper& operator=(const OpusEncoderWrapper&) = delete;

  // Initialize the encoder.
  // sample_rate: Audio sample rate (48000 recommended for Opus)
  // channels: Number of audio channels (1 for mono, 2 for stereo)
  // bitrate: Target bitrate in bits per second (64000 for voice)
  // frame_duration_ms: Frame duration in milliseconds (20ms recommended)
  bool Initialize(int sample_rate, int channels, int bitrate,
                  int frame_duration_ms);

  // Encode a frame of audio.
  // input: Raw PCM samples as float32 (normalized -1.0 to 1.0)
  // num_samples: Number of samples in input
  // output: Encoded Opus data
  // Returns true on success.
  bool Encode(const float* input, int num_samples,
              std::vector<uint8_t>& output);

  // Get the required number of samples per frame.
  int GetSamplesPerFrame() const { return samples_per_frame_; }

  // Get encoder statistics.
  int GetTotalFramesEncoded() const { return total_frames_encoded_; }
  int64_t GetTotalBytesEncoded() const { return total_bytes_encoded_; }

  // Check if initialized.
  bool IsInitialized() const { return encoder_ != nullptr; }

 private:
  ::OpusEncoder* encoder_ = nullptr;

  int sample_rate_ = 48000;
  int channels_ = 1;
  int bitrate_ = 64000;
  int frame_duration_ms_ = 20;
  int samples_per_frame_ = 960;  // 48000 * 0.020 = 960

  // Statistics.
  int total_frames_encoded_ = 0;
  int64_t total_bytes_encoded_ = 0;

  // Temporary buffer for converting float to int16.
  std::vector<int16_t> pcm_buffer_;

  // Output buffer (Opus max frame size is 1275 bytes).
  static constexpr int kMaxOpusFrameSize = 1275;

  SEQUENCE_CHECKER(sequence_checker_);
};

// Alias for cleaner naming in other files.
using OpusEncoder = OpusEncoderWrapper;

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_AUDIO_OPUS_ENCODER_H_
