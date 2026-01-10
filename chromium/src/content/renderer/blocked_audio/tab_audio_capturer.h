// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_AUDIO_TAB_AUDIO_CAPTURER_H_
#define CONTENT_RENDERER_BLOCKED_AUDIO_TAB_AUDIO_CAPTURER_H_

#include <memory>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/timer/timer.h"

namespace content {

class WebContentsAudioCapture;

// Captures audio from the current tab/page (system audio).
// Uses Chromium's tab audio capture APIs to get audio playing in the tab.
class TabAudioCapturer {
 public:
  using AudioCallback =
      base::RepeatingCallback<void(const float* data, int num_samples)>;

  TabAudioCapturer();
  ~TabAudioCapturer();

  TabAudioCapturer(const TabAudioCapturer&) = delete;
  TabAudioCapturer& operator=(const TabAudioCapturer&) = delete;

  // Set the audio data callback.
  void SetAudioCallback(AudioCallback callback);

  // Start capturing tab audio.
  void Start();

  // Stop capturing tab audio.
  void Stop();

  // Check if capturing.
  bool IsCapturing() const { return is_capturing_; }

  // Get the sample rate.
  int GetSampleRate() const { return sample_rate_; }

  // Get the number of channels.
  int GetChannels() const { return channels_; }

 private:
  void OnAudioData(const float* data, int num_samples);
  void SetupCapture();

  AudioCallback audio_callback_;
  std::unique_ptr<WebContentsAudioCapture> audio_capture_;

  bool is_capturing_ = false;
  int sample_rate_ = 48000;
  int channels_ = 1;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<TabAudioCapturer> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_AUDIO_TAB_AUDIO_CAPTURER_H_
