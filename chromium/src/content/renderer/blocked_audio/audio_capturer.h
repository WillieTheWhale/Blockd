// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_AUDIO_AUDIO_CAPTURER_H_
#define CONTENT_RENDERER_BLOCKED_AUDIO_AUDIO_CAPTURER_H_

#include <memory>
#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/time/time.h"
#include "content/public/common/blocked_mojom/audio_capture.mojom.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream.h"

namespace content {

class OpusEncoder;
class TabAudioCapturer;
class MicrophoneAudioCapturer;

// Main coordinator for audio capture in the renderer process.
// Captures from microphone and/or tab audio, encodes to Opus, and sends to IPC.
class AudioCapturer {
 public:
  enum class State {
    kIdle,
    kInitializing,
    kCapturing,
    kStopped,
    kError
  };

  struct AudioConfig {
    int sample_rate = 48000;
    int channels = 1;
    int bits_per_sample = 16;
    blocked::mojom::AudioCodec codec = blocked::mojom::AudioCodec::OPUS;
    int opus_bitrate = 64000;
    int frame_duration_ms = 20;
    bool enable_microphone = true;
    bool enable_tab_audio = true;
    bool enable_noise_suppression = true;
    bool enable_echo_cancellation = true;
    bool enable_auto_gain_control = true;
  };

  AudioCapturer();
  ~AudioCapturer();

  AudioCapturer(const AudioCapturer&) = delete;
  AudioCapturer& operator=(const AudioCapturer&) = delete;

  // Initialize audio capture with configuration.
  void Initialize(const AudioConfig& config);

  // Start capturing audio.
  void Start();

  // Stop capturing audio.
  void Stop();

  // Get current state.
  State GetState() const { return state_; }

  // Check if capturing.
  bool IsCapturing() const { return state_ == State::kCapturing; }

  // Set the media stream for microphone capture.
  void SetMicrophoneStream(const blink::WebMediaStream& stream);

  // Enable/disable individual sources.
  void SetMicrophoneMuted(bool muted);
  void SetTabAudioMuted(bool muted);

  // Get current audio levels (dB).
  float GetMicrophoneLevel() const { return microphone_level_db_; }
  float GetTabAudioLevel() const { return tab_audio_level_db_; }

 private:
  // Audio processing callbacks.
  void OnMicrophoneAudioData(const float* data, int num_samples);
  void OnTabAudioData(const float* data, int num_samples);

  // Mix and encode audio.
  void ProcessAudioFrame();
  void MixAudioSources(std::vector<float>& output);
  void EncodeAndSend(const std::vector<float>& audio_data,
                     blocked::mojom::AudioSourceType source_type);

  // Calculate audio level in dB.
  static float CalculateLevelDb(const float* data, int num_samples);

  // Send to browser process.
  void SendEncodedFrame(const std::vector<uint8_t>& encoded_data,
                        const blocked::AudioFrameMetadata& metadata);
  void SendAudioLevel(float level_db,
                      blocked::mojom::AudioSourceType source_type);

  void UpdateState(State new_state);

  State state_ = State::kIdle;
  AudioConfig config_;

  // Audio sources.
  std::unique_ptr<MicrophoneAudioCapturer> microphone_capturer_;
  std::unique_ptr<TabAudioCapturer> tab_audio_capturer_;

  // Encoder.
  std::unique_ptr<OpusEncoder> opus_encoder_;

  // Audio buffers.
  std::vector<float> microphone_buffer_;
  std::vector<float> tab_audio_buffer_;
  std::vector<float> mixed_buffer_;

  // Samples needed for one frame (e.g., 960 for 20ms at 48kHz).
  int samples_per_frame_ = 0;

  // Mute states.
  bool microphone_muted_ = false;
  bool tab_audio_muted_ = false;

  // Current audio levels.
  float microphone_level_db_ = -100.0f;
  float tab_audio_level_db_ = -100.0f;

  // Frame counter.
  int64_t frame_number_ = 0;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<AudioCapturer> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_AUDIO_AUDIO_CAPTURER_H_
