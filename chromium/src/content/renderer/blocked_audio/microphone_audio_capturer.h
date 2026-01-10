// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_AUDIO_MICROPHONE_AUDIO_CAPTURER_H_
#define CONTENT_RENDERER_BLOCKED_AUDIO_MICROPHONE_AUDIO_CAPTURER_H_

#include <memory>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream.h"

namespace blink {
class MediaStreamAudioTrack;
}

namespace content {

class MediaStreamAudioSinkImpl;

// Captures audio from the user's microphone via MediaStream API.
// Receives raw PCM audio data and forwards to callback.
class MicrophoneAudioCapturer {
 public:
  using AudioCallback =
      base::RepeatingCallback<void(const float* data, int num_samples)>;

  MicrophoneAudioCapturer();
  ~MicrophoneAudioCapturer();

  MicrophoneAudioCapturer(const MicrophoneAudioCapturer&) = delete;
  MicrophoneAudioCapturer& operator=(const MicrophoneAudioCapturer&) = delete;

  // Set the audio data callback.
  void SetAudioCallback(AudioCallback callback);

  // Set the media stream to capture from.
  void SetMediaStream(const blink::WebMediaStream& stream);

  // Start capturing.
  void Start();

  // Stop capturing.
  void Stop();

  // Check if capturing.
  bool IsCapturing() const { return is_capturing_; }

  // Audio processing settings.
  void SetNoiseSuppressionEnabled(bool enabled);
  void SetEchoCancellationEnabled(bool enabled);
  void SetAutoGainControlEnabled(bool enabled);

 private:
  void OnAudioData(const float* data, int num_samples, int sample_rate,
                   int num_channels);

  AudioCallback audio_callback_;
  blink::WebMediaStream media_stream_;
  std::unique_ptr<MediaStreamAudioSinkImpl> audio_sink_;

  bool is_capturing_ = false;
  bool noise_suppression_enabled_ = true;
  bool echo_cancellation_enabled_ = true;
  bool auto_gain_control_enabled_ = true;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<MicrophoneAudioCapturer> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_AUDIO_MICROPHONE_AUDIO_CAPTURER_H_
