// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_VIDEO_VIDEO_CAPTURE_CLIENT_IMPL_H_
#define CONTENT_RENDERER_BLOCKED_VIDEO_VIDEO_CAPTURE_CLIENT_IMPL_H_

#include <memory>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "content/public/common/blocked_mojom/video_capture.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace content {

// Renderer-side implementation of VideoCaptureClient Mojo interface.
// Receives capture commands from the browser process and controls the
// video capturer. Sends video frames back to the browser via VideoCaptureHost.
class VideoCaptureClientImpl : public blocked::mojom::VideoCaptureClient {
 public:
  // Delegate interface for the actual video capture implementation.
  class Delegate {
   public:
    virtual ~Delegate() = default;
    virtual void StartCapture(
        blocked::mojom::VideoCaptureSettingsPtr settings) = 0;
    virtual void StopCapture() = 0;
    virtual void UpdateSettings(
        blocked::mojom::VideoCaptureSettingsPtr settings) = 0;
  };

  explicit VideoCaptureClientImpl(Delegate* delegate);
  ~VideoCaptureClientImpl() override;

  VideoCaptureClientImpl(const VideoCaptureClientImpl&) = delete;
  VideoCaptureClientImpl& operator=(const VideoCaptureClientImpl&) = delete;

  // Bind this client to the Mojo receiver and connect to the host.
  void Bind(
      mojo::PendingReceiver<blocked::mojom::VideoCaptureClient> receiver,
      mojo::PendingRemote<blocked::mojom::VideoCaptureHost> host_remote);

  // Check if the client is bound and connected.
  bool IsBound() const;

  // Get the host interface for sending data to browser.
  blocked::mojom::VideoCaptureHost* GetHost();

  // Send video frame to browser (called by video capturer).
  void SendVideoFrame(mojo_base::BigBuffer frame_data,
                      blocked::mojom::VideoFrameMetadataPtr metadata);

  // Send encoded frame to browser.
  void SendEncodedFrame(mojo_base::BigBuffer encoded_data,
                        base::TimeTicks timestamp);

  // Notify browser that capture started.
  void NotifyCaptureStarted(blocked::mojom::VideoCaptureSettingsPtr settings);

  // Notify browser that capture stopped.
  void NotifyCaptureStopped();

  // Send error notification.
  void SendError(const std::string& error_message);

  // blocked::mojom::VideoCaptureClient implementation.
  void StartCapture(
      blocked::mojom::VideoCaptureSettingsPtr settings) override;
  void StopCapture() override;
  void UpdateSettings(
      blocked::mojom::VideoCaptureSettingsPtr settings) override;

 private:
  void OnDisconnected();

  raw_ptr<Delegate> delegate_;

  mojo::Receiver<blocked::mojom::VideoCaptureClient> receiver_{this};
  mojo::Remote<blocked::mojom::VideoCaptureHost> host_;

  bool is_capturing_ = false;
  blocked::mojom::VideoCaptureSettingsPtr current_settings_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<VideoCaptureClientImpl> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_VIDEO_VIDEO_CAPTURE_CLIENT_IMPL_H_
