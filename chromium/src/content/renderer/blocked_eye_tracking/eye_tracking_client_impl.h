// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_EYE_TRACKING_EYE_TRACKING_CLIENT_IMPL_H_
#define CONTENT_RENDERER_BLOCKED_EYE_TRACKING_EYE_TRACKING_CLIENT_IMPL_H_

#include <memory>
#include <string>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "content/public/common/blocked_mojom/eye_tracking.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace content {

class EyeTracker;

// Renderer-side implementation of EyeTrackingClient Mojo interface.
// Receives commands from the browser process and controls the eye tracker.
// Sends gaze data back to the browser via EyeTrackingHost.
class EyeTrackingClientImpl : public blocked::mojom::EyeTrackingClient {
 public:
  // Delegate interface for the actual eye tracking implementation.
  class Delegate {
   public:
    virtual ~Delegate() = default;
    virtual void StartTracking(const std::string& session_id) = 0;
    virtual void StopTracking() = 0;
    virtual void StartCalibration() = 0;
    virtual void SetCalibrationSettings(
        blocked::mojom::CalibrationSettingsPtr settings) = 0;
  };

  explicit EyeTrackingClientImpl(Delegate* delegate);
  ~EyeTrackingClientImpl() override;

  EyeTrackingClientImpl(const EyeTrackingClientImpl&) = delete;
  EyeTrackingClientImpl& operator=(const EyeTrackingClientImpl&) = delete;

  // Bind this client to the Mojo receiver and connect to the host.
  void Bind(
      mojo::PendingReceiver<blocked::mojom::EyeTrackingClient> receiver,
      mojo::PendingRemote<blocked::mojom::EyeTrackingHost> host_remote);

  // Check if the client is bound and connected.
  bool IsBound() const;

  // Get the host interface for sending data to browser.
  blocked::mojom::EyeTrackingHost* GetHost();

  // Send gaze data to browser (called by eye tracker).
  void SendGazeUpdate(blocked::mojom::GazeDataPtr gaze);
  void SendGazeBatch(std::vector<blocked::mojom::GazeDataPtr> gazes);

  // Send calibration complete notification.
  void SendCalibrationComplete(
      std::vector<blocked::mojom::CalibrationPointPtr> calibration_data);

  // Send error notification.
  void SendError(const std::string& error_message);

  // blocked::mojom::EyeTrackingClient implementation.
  void StartEyeTracking(const std::string& session_id) override;
  void StopEyeTracking() override;
  void StartCalibration() override;
  void SetCalibrationSettings(
      blocked::mojom::CalibrationSettingsPtr settings) override;

 private:
  void OnDisconnected();

  raw_ptr<Delegate> delegate_;

  mojo::Receiver<blocked::mojom::EyeTrackingClient> receiver_{this};
  mojo::Remote<blocked::mojom::EyeTrackingHost> host_;

  bool is_tracking_ = false;
  std::string session_id_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<EyeTrackingClientImpl> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_EYE_TRACKING_EYE_TRACKING_CLIENT_IMPL_H_
