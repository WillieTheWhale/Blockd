// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_audio/tab_audio_capturer.h"

#include "base/functional/bind.h"
#include "base/logging.h"

namespace content {

// Forward declaration - WebContentsAudioCapture would be a wrapper around
// Chromium's audio capture APIs. For now, this is a stub.
class WebContentsAudioCapture {
 public:
  using AudioCallback =
      base::RepeatingCallback<void(const float* data, int num_samples)>;

  WebContentsAudioCapture() = default;
  ~WebContentsAudioCapture() = default;

  void SetCallback(AudioCallback callback) { callback_ = std::move(callback); }

  bool Start(int sample_rate, int channels) {
    sample_rate_ = sample_rate;
    channels_ = channels;
    is_capturing_ = true;
    LOG(INFO) << "WebContentsAudioCapture started: " << sample_rate << "Hz, "
              << channels << " channels";
    return true;
  }

  void Stop() {
    is_capturing_ = false;
    LOG(INFO) << "WebContentsAudioCapture stopped";
  }

  bool IsCapturing() const { return is_capturing_; }

 private:
  AudioCallback callback_;
  int sample_rate_ = 48000;
  int channels_ = 1;
  bool is_capturing_ = false;
};

TabAudioCapturer::TabAudioCapturer() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

TabAudioCapturer::~TabAudioCapturer() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Stop();
}

void TabAudioCapturer::SetAudioCallback(AudioCallback callback) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  audio_callback_ = std::move(callback);
}

void TabAudioCapturer::Start() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (is_capturing_) {
    LOG(WARNING) << "TabAudioCapturer already capturing";
    return;
  }

  SetupCapture();

  if (audio_capture_) {
    audio_capture_->SetCallback(base::BindRepeating(
        &TabAudioCapturer::OnAudioData, weak_factory_.GetWeakPtr()));

    if (audio_capture_->Start(sample_rate_, channels_)) {
      is_capturing_ = true;
      LOG(INFO) << "Tab audio capture started";
    } else {
      LOG(ERROR) << "Failed to start tab audio capture";
    }
  }
}

void TabAudioCapturer::Stop() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_capturing_) {
    return;
  }

  if (audio_capture_) {
    audio_capture_->Stop();
  }

  is_capturing_ = false;
  LOG(INFO) << "Tab audio capture stopped";
}

void TabAudioCapturer::OnAudioData(const float* data, int num_samples) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_capturing_ || !audio_callback_) {
    return;
  }

  audio_callback_.Run(data, num_samples);
}

void TabAudioCapturer::SetupCapture() {
  if (audio_capture_) {
    return;
  }

  // Create the audio capture wrapper.
  // In a full implementation, this would use RenderFrameImpl to get
  // the WebContentsMediaCaptureId and create a proper audio capture device.
  audio_capture_ = std::make_unique<WebContentsAudioCapture>();
  LOG(INFO) << "Tab audio capture setup complete";
}

}  // namespace content
