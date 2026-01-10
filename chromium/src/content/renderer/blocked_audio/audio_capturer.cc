// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_audio/audio_capturer.h"

#include <algorithm>
#include <cmath>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "content/renderer/blocked_audio/microphone_audio_capturer.h"
#include "content/renderer/blocked_audio/opus_encoder.h"
#include "content/renderer/blocked_audio/tab_audio_capturer.h"
#include "content/renderer/blocked_ipc/audio_frame_sender.h"

namespace content {

namespace {
// Minimum dB level (silence).
constexpr float kMinLevelDb = -100.0f;
// Reference level for dB calculation.
constexpr float kReferenceLevel = 1.0f;
}  // namespace

AudioCapturer::AudioCapturer() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

AudioCapturer::~AudioCapturer() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Stop();
}

void AudioCapturer::Initialize(const AudioConfig& config) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  DCHECK_EQ(state_, State::kIdle);

  UpdateState(State::kInitializing);
  config_ = config;

  // Calculate samples per frame.
  // For 20ms at 48kHz: 48000 * 0.020 = 960 samples
  samples_per_frame_ =
      (config_.sample_rate * config_.frame_duration_ms) / 1000;

  // Reserve buffer space.
  microphone_buffer_.reserve(samples_per_frame_ * 4);
  tab_audio_buffer_.reserve(samples_per_frame_ * 4);
  mixed_buffer_.resize(samples_per_frame_);

  // Create Opus encoder.
  opus_encoder_ = std::make_unique<OpusEncoder>();
  if (!opus_encoder_->Initialize(config_.sample_rate, config_.channels,
                                  config_.opus_bitrate,
                                  config_.frame_duration_ms)) {
    LOG(ERROR) << "Failed to initialize Opus encoder";
    UpdateState(State::kError);
    return;
  }

  // Create microphone capturer if enabled.
  if (config_.enable_microphone) {
    microphone_capturer_ = std::make_unique<MicrophoneAudioCapturer>();
    microphone_capturer_->SetAudioCallback(
        base::BindRepeating(&AudioCapturer::OnMicrophoneAudioData,
                            weak_factory_.GetWeakPtr()));
    microphone_capturer_->SetNoiseSuppressionEnabled(
        config_.enable_noise_suppression);
    microphone_capturer_->SetEchoCancellationEnabled(
        config_.enable_echo_cancellation);
    microphone_capturer_->SetAutoGainControlEnabled(
        config_.enable_auto_gain_control);
  }

  // Create tab audio capturer if enabled.
  if (config_.enable_tab_audio) {
    tab_audio_capturer_ = std::make_unique<TabAudioCapturer>();
    tab_audio_capturer_->SetAudioCallback(
        base::BindRepeating(&AudioCapturer::OnTabAudioData,
                            weak_factory_.GetWeakPtr()));
  }

  LOG(INFO) << "AudioCapturer initialized: " << config_.sample_rate << "Hz, "
            << config_.channels << " channels, " << config_.opus_bitrate
            << " bps, " << config_.frame_duration_ms << "ms frames";

  UpdateState(State::kIdle);
}

void AudioCapturer::Start() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == State::kCapturing) {
    LOG(WARNING) << "AudioCapturer already capturing";
    return;
  }

  if (state_ != State::kIdle) {
    LOG(ERROR) << "Cannot start capturing from state: "
               << static_cast<int>(state_);
    return;
  }

  // Start microphone capture.
  if (microphone_capturer_) {
    microphone_capturer_->Start();
  }

  // Start tab audio capture.
  if (tab_audio_capturer_) {
    tab_audio_capturer_->Start();
  }

  UpdateState(State::kCapturing);
  LOG(INFO) << "Audio capture started";

  // Notify browser that capture has started.
  blocked::mojom::AudioCaptureSettingsPtr settings =
      blocked::mojom::AudioCaptureSettings::New();
  settings->sample_rate = config_.sample_rate;
  settings->channels = config_.channels;
  settings->bits_per_sample = config_.bits_per_sample;
  settings->codec = config_.codec;
  settings->opus_bitrate = config_.opus_bitrate;
  settings->frame_duration_ms = config_.frame_duration_ms;
  settings->enable_microphone = config_.enable_microphone;
  settings->enable_tab_audio = config_.enable_tab_audio;
  settings->enable_noise_suppression = config_.enable_noise_suppression;
  settings->enable_echo_cancellation = config_.enable_echo_cancellation;
  settings->enable_auto_gain_control = config_.enable_auto_gain_control;

  AudioFrameSender::GetInstance()->NotifyCaptureStarted(std::move(settings));
}

void AudioCapturer::Stop() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == State::kStopped || state_ == State::kIdle) {
    return;
  }

  // Stop microphone capture.
  if (microphone_capturer_) {
    microphone_capturer_->Stop();
  }

  // Stop tab audio capture.
  if (tab_audio_capturer_) {
    tab_audio_capturer_->Stop();
  }

  // Clear buffers.
  microphone_buffer_.clear();
  tab_audio_buffer_.clear();

  UpdateState(State::kStopped);
  LOG(INFO) << "Audio capture stopped";

  AudioFrameSender::GetInstance()->NotifyCaptureStopped();
}

void AudioCapturer::SetMicrophoneStream(const blink::WebMediaStream& stream) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (microphone_capturer_) {
    microphone_capturer_->SetMediaStream(stream);
  }
}

void AudioCapturer::SetMicrophoneMuted(bool muted) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  microphone_muted_ = muted;
  LOG(INFO) << "Microphone " << (muted ? "muted" : "unmuted");
}

void AudioCapturer::SetTabAudioMuted(bool muted) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  tab_audio_muted_ = muted;
  LOG(INFO) << "Tab audio " << (muted ? "muted" : "unmuted");
}

void AudioCapturer::OnMicrophoneAudioData(const float* data, int num_samples) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != State::kCapturing || microphone_muted_) {
    return;
  }

  // Update audio level.
  microphone_level_db_ = CalculateLevelDb(data, num_samples);
  SendAudioLevel(microphone_level_db_,
                 blocked::mojom::AudioSourceType::MICROPHONE);

  // Add to buffer.
  microphone_buffer_.insert(microphone_buffer_.end(), data,
                            data + num_samples);

  // Process when we have enough samples.
  ProcessAudioFrame();
}

void AudioCapturer::OnTabAudioData(const float* data, int num_samples) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != State::kCapturing || tab_audio_muted_) {
    return;
  }

  // Update audio level.
  tab_audio_level_db_ = CalculateLevelDb(data, num_samples);
  SendAudioLevel(tab_audio_level_db_,
                 blocked::mojom::AudioSourceType::TAB_AUDIO);

  // Add to buffer.
  tab_audio_buffer_.insert(tab_audio_buffer_.end(), data, data + num_samples);

  // Process when we have enough samples.
  ProcessAudioFrame();
}

void AudioCapturer::ProcessAudioFrame() {
  // Check if we have enough samples from either source.
  bool has_mic_frame =
      microphone_buffer_.size() >= static_cast<size_t>(samples_per_frame_);
  bool has_tab_frame =
      tab_audio_buffer_.size() >= static_cast<size_t>(samples_per_frame_);

  // Need at least one source with a full frame.
  if (!has_mic_frame && !has_tab_frame) {
    return;
  }

  // Determine source type based on what we're capturing.
  blocked::mojom::AudioSourceType source_type;
  if (has_mic_frame && has_tab_frame) {
    source_type = blocked::mojom::AudioSourceType::MIXED;
    MixAudioSources(mixed_buffer_);
  } else if (has_mic_frame) {
    source_type = blocked::mojom::AudioSourceType::MICROPHONE;
    std::copy_n(microphone_buffer_.begin(), samples_per_frame_,
                mixed_buffer_.begin());
    microphone_buffer_.erase(microphone_buffer_.begin(),
                             microphone_buffer_.begin() + samples_per_frame_);
  } else {
    source_type = blocked::mojom::AudioSourceType::TAB_AUDIO;
    std::copy_n(tab_audio_buffer_.begin(), samples_per_frame_,
                mixed_buffer_.begin());
    tab_audio_buffer_.erase(tab_audio_buffer_.begin(),
                            tab_audio_buffer_.begin() + samples_per_frame_);
  }

  EncodeAndSend(mixed_buffer_, source_type);
}

void AudioCapturer::MixAudioSources(std::vector<float>& output) {
  // Simple mixing: average the two sources.
  for (int i = 0; i < samples_per_frame_; ++i) {
    float mic_sample = microphone_buffer_[i];
    float tab_sample = tab_audio_buffer_[i];
    // Mix with equal weight and clamp.
    output[i] = std::clamp((mic_sample + tab_sample) * 0.5f, -1.0f, 1.0f);
  }

  // Remove used samples from buffers.
  microphone_buffer_.erase(microphone_buffer_.begin(),
                           microphone_buffer_.begin() + samples_per_frame_);
  tab_audio_buffer_.erase(tab_audio_buffer_.begin(),
                          tab_audio_buffer_.begin() + samples_per_frame_);
}

void AudioCapturer::EncodeAndSend(
    const std::vector<float>& audio_data,
    blocked::mojom::AudioSourceType source_type) {
  if (!opus_encoder_) {
    return;
  }

  // Encode with Opus.
  std::vector<uint8_t> encoded_data;
  if (!opus_encoder_->Encode(audio_data.data(),
                              static_cast<int>(audio_data.size()),
                              encoded_data)) {
    LOG(ERROR) << "Opus encoding failed";
    return;
  }

  // Create metadata.
  blocked::AudioFrameMetadata metadata;
  metadata.codec = blocked::mojom::AudioCodec::OPUS;
  metadata.source_type = source_type;
  metadata.sample_rate = config_.sample_rate;
  metadata.channels = config_.channels;
  metadata.bits_per_sample = config_.bits_per_sample;
  metadata.frame_number = frame_number_++;
  metadata.timestamp = base::TimeTicks::Now();
  metadata.duration_ms = config_.frame_duration_ms;

  SendEncodedFrame(encoded_data, metadata);
}

float AudioCapturer::CalculateLevelDb(const float* data, int num_samples) {
  if (num_samples == 0) {
    return kMinLevelDb;
  }

  // Calculate RMS.
  float sum_squares = 0.0f;
  for (int i = 0; i < num_samples; ++i) {
    sum_squares += data[i] * data[i];
  }
  float rms = std::sqrt(sum_squares / num_samples);

  // Convert to dB.
  if (rms < 1e-10f) {
    return kMinLevelDb;
  }
  return 20.0f * std::log10(rms / kReferenceLevel);
}

void AudioCapturer::SendEncodedFrame(
    const std::vector<uint8_t>& encoded_data,
    const blocked::AudioFrameMetadata& metadata) {
  AudioFrameSender::GetInstance()->SendEncodedFrame(encoded_data.data(),
                                                     encoded_data.size(),
                                                     metadata);
}

void AudioCapturer::SendAudioLevel(float level_db,
                                   blocked::mojom::AudioSourceType source_type) {
  AudioFrameSender::GetInstance()->SendAudioLevel(level_db, source_type);
}

void AudioCapturer::UpdateState(State new_state) {
  if (state_ == new_state) {
    return;
  }

  LOG(INFO) << "AudioCapturer state: " << static_cast<int>(state_) << " -> "
            << static_cast<int>(new_state);
  state_ = new_state;
}

}  // namespace content
