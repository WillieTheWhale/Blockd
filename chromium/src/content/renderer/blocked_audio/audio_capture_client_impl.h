// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_AUDIO_AUDIO_CAPTURE_CLIENT_IMPL_H_
#define CONTENT_RENDERER_BLOCKED_AUDIO_AUDIO_CAPTURE_CLIENT_IMPL_H_

#include <memory>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "content/public/common/blocked_mojom/audio_capture.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace content {

// Renderer-side implementation of AudioCaptureClient Mojo interface.
// Receives capture commands from the browser process and controls the
// audio capturer. Sends audio frames back to the browser via AudioCaptureHost.
class AudioCaptureClientImpl : public blocked::mojom::AudioCaptureClient {
 public:
  // Delegate interface for the actual audio capture implementation.
  class Delegate {
   public:
    virtual ~Delegate() = default;
    virtual void StartCapture(
        blocked::mojom::AudioCaptureSettingsPtr settings) = 0;
    virtual void StopCapture() = 0;
    virtual void UpdateSettings(
        blocked::mojom::AudioCaptureSettingsPtr settings) = 0;
    virtual void SetSourceMuted(blocked::mojom::AudioSourceType source_type,
                                bool muted) = 0;
  };

  explicit AudioCaptureClientImpl(Delegate* delegate);
  ~AudioCaptureClientImpl() override;

  AudioCaptureClientImpl(const AudioCaptureClientImpl&) = delete;
  AudioCaptureClientImpl& operator=(const AudioCaptureClientImpl&) = delete;

  // Bind this client to the Mojo receiver and connect to the host.
  void Bind(
      mojo::PendingReceiver<blocked::mojom::AudioCaptureClient> receiver,
      mojo::PendingRemote<blocked::mojom::AudioCaptureHost> host_remote);

  // Check if the client is bound and connected.
  bool IsBound() const;

  // Get the host interface for sending data to browser.
  blocked::mojom::AudioCaptureHost* GetHost();

  // Send audio frame to browser (called by audio capturer).
  void SendAudioFrame(mojo_base::BigBuffer frame_data,
                      blocked::mojom::AudioFrameMetadataPtr metadata);

  // Send encoded audio frame to browser.
  void SendEncodedAudioFrame(mojo_base::BigBuffer encoded_data,
                             blocked::mojom::AudioFrameMetadataPtr metadata);

  // Notify browser that capture started.
  void NotifyCaptureStarted(blocked::mojom::AudioCaptureSettingsPtr settings);

  // Notify browser that capture stopped.
  void NotifyCaptureStopped();

  // Send audio level update.
  void SendAudioLevel(float level_db,
                      blocked::mojom::AudioSourceType source_type);

  // Send error notification.
  void SendError(const std::string& error_message);

  // blocked::mojom::AudioCaptureClient implementation.
  void StartCapture(
      blocked::mojom::AudioCaptureSettingsPtr settings) override;
  void StopCapture() override;
  void UpdateSettings(
      blocked::mojom::AudioCaptureSettingsPtr settings) override;
  void SetSourceMuted(blocked::mojom::AudioSourceType source_type,
                      bool muted) override;

 private:
  void OnDisconnected();

  raw_ptr<Delegate> delegate_;

  mojo::Receiver<blocked::mojom::AudioCaptureClient> receiver_{this};
  mojo::Remote<blocked::mojom::AudioCaptureHost> host_;

  bool is_capturing_ = false;
  blocked::mojom::AudioCaptureSettingsPtr current_settings_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<AudioCaptureClientImpl> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_AUDIO_AUDIO_CAPTURE_CLIENT_IMPL_H_
