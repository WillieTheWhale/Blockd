// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_AUDIO_BLOCKED_AUDIO_CAPTURE_SERVICE_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_AUDIO_BLOCKED_AUDIO_CAPTURE_SERVICE_H_

#include <memory>
#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "components/keyed_service/core/keyed_service.h"
#include "content/public/common/blocked_mojom/audio_capture.mojom.h"
#include "mojo/public/cpp/bindings/receiver.h"

namespace blocked {

// Browser-side service for receiving and processing audio data from renderer.
// Implements AudioCaptureHost mojo interface.
class BlockedAudioCaptureService : public KeyedService,
                                    public blocked::mojom::AudioCaptureHost {
 public:
  enum class CaptureState {
    STOPPED,
    STARTING,
    CAPTURING,
    ERROR
  };

  BlockedAudioCaptureService();
  ~BlockedAudioCaptureService() override;

  BlockedAudioCaptureService(const BlockedAudioCaptureService&) = delete;
  BlockedAudioCaptureService& operator=(const BlockedAudioCaptureService&) =
      delete;

  // KeyedService implementation.
  void Shutdown() override;

  // Start/stop audio capture.
  void StartCapture(const std::string& session_id);
  void StopCapture();
  CaptureState GetState() const { return state_; }

  // Get the receiver for binding.
  mojo::PendingReceiver<blocked::mojom::AudioCaptureHost> GetReceiver();

  // Get session statistics.
  int64_t GetTotalFramesReceived() const { return total_frames_received_; }
  int64_t GetTotalBytesReceived() const { return total_bytes_received_; }

  // Audio settings.
  void SetSampleRate(int sample_rate);
  void SetChannels(int channels);

  // blocked::mojom::AudioCaptureHost implementation.
  void OnAudioFrame(mojo_base::BigBuffer frame_data,
                    blocked::mojom::AudioFrameMetadataPtr metadata) override;
  void OnEncodedAudioFrame(
      mojo_base::BigBuffer encoded_data,
      blocked::mojom::AudioFrameMetadataPtr metadata) override;
  void OnCaptureStarted(
      blocked::mojom::AudioCaptureSettingsPtr settings) override;
  void OnCaptureStopped() override;
  void OnCaptureError(const std::string& error_message) override;
  void OnAudioLevel(float level_db,
                    blocked::mojom::AudioSourceType source_type) override;

 private:
  void ForwardAudioToBackend(const std::vector<uint8_t>& audio_data,
                             const blocked::mojom::AudioFrameMetadata& metadata);
  void UpdateState(CaptureState new_state);

  std::string session_id_;
  CaptureState state_ = CaptureState::STOPPED;

  // Audio settings.
  int sample_rate_ = 48000;
  int channels_ = 1;

  // Statistics.
  int64_t total_frames_received_ = 0;
  int64_t total_bytes_received_ = 0;

  // Current audio levels.
  float microphone_level_db_ = -100.0f;
  float tab_audio_level_db_ = -100.0f;

  // Mojo receiver.
  mojo::Receiver<blocked::mojom::AudioCaptureHost> receiver_{this};

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<BlockedAudioCaptureService> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_AUDIO_BLOCKED_AUDIO_CAPTURE_SERVICE_H_
