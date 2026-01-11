// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_IPC_BLOCKED_SESSION_HOST_IMPL_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_IPC_BLOCKED_SESSION_HOST_IMPL_H_

#include <memory>
#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "components/keyed_service/core/keyed_service.h"
#include "content/public/common/blocked_mojom/audio_capture.mojom.h"
#include "content/public/common/blocked_mojom/eye_tracking.mojom.h"
#include "content/public/common/blocked_mojom/session.mojom.h"
#include "content/public/common/blocked_mojom/video_capture.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace blocked {

class BlockedBackendConnector;
class BlockedVideoCaptureService;

// Browser-side implementation of the BlockedSessionHost interface.
// Manages communication with the renderer process for Blocked sessions.
// Coordinates eye tracking, video capture, audio capture, and session state.
class BlockedSessionHostImpl : public KeyedService,
                                public mojom::BlockedSessionHost,
                                public mojom::EyeTrackingHost,
                                public mojom::AudioCaptureHost {
 public:
  // Observer interface for session events.
  class Observer {
   public:
    virtual ~Observer() = default;
    virtual void OnRendererReady() = 0;
    virtual void OnSessionEvent(const std::string& event_type,
                                const std::string& data) = 0;
    virtual void OnGazeUpdate(const mojom::GazeData& gaze) = 0;
    virtual void OnCalibrationComplete() = 0;
  };

  BlockedSessionHostImpl();
  ~BlockedSessionHostImpl() override;

  // KeyedService implementation.
  void Shutdown() override;

  // Initialize with required services.
  void Initialize(BlockedBackendConnector* backend_connector,
                  BlockedVideoCaptureService* video_capture_service);

  // Session management.
  void StartSession(const std::string& session_id,
                    const std::string& session_token);
  void EndSession();
  void PauseSession();
  void ResumeSession();

  mojom::SessionState GetSessionState() const { return session_state_; }
  const std::string& GetSessionId() const { return session_id_; }
  bool IsSessionActive() const {
    return session_state_ == mojom::SessionState::ACTIVE;
  }

  // Configure session features.
  void SetEyeTrackingEnabled(bool enabled);
  void SetVideoCaptureEnabled(bool enabled);
  void SetAudioCaptureEnabled(bool enabled);

  // Bind the Mojo interface for a new renderer connection.
  void BindSessionHost(
      mojo::PendingReceiver<mojom::BlockedSessionHost> receiver,
      mojo::PendingRemote<mojom::BlockedSessionClient> client);

  // Observer management.
  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

  // mojom::BlockedSessionHost implementation.
  void OnRendererReady() override;
  void OnSessionEvent(const std::string& event_type,
                      const std::string& data) override;
  void GetSessionState(GetSessionStateCallback callback) override;
  void BindEyeTracking(
      mojo::PendingReceiver<mojom::EyeTrackingHost> eye_tracking_host,
      mojo::PendingRemote<mojom::EyeTrackingClient> eye_tracking_client)
      override;
  void BindVideoCapture(
      mojo::PendingReceiver<mojom::VideoCaptureHost> video_capture_host,
      mojo::PendingRemote<mojom::VideoCaptureClient> video_capture_client)
      override;
  void BindAudioCapture(
      mojo::PendingReceiver<mojom::AudioCaptureHost> audio_capture_host,
      mojo::PendingRemote<mojom::AudioCaptureClient> audio_capture_client)
      override;

  // mojom::EyeTrackingHost implementation.
  void OnGazeUpdate(mojom::GazeDataPtr gaze) override;
  void OnGazeBatch(std::vector<mojom::GazeDataPtr> gazes) override;
  void OnCalibrationComplete(
      std::vector<mojom::CalibrationPointPtr> calibration_data) override;
  void OnEyeTrackingError(const std::string& error_message) override;

  // mojom::AudioCaptureHost implementation.
  void OnAudioFrame(mojo_base::BigBuffer frame_data,
                    mojom::AudioFrameMetadataPtr metadata) override;
  void OnEncodedAudioFrame(mojo_base::BigBuffer encoded_data,
                           mojom::AudioFrameMetadataPtr metadata) override;
  void OnCaptureStarted(mojom::AudioCaptureSettingsPtr settings) override;
  void OnCaptureStopped() override;
  void OnCaptureError(const std::string& error_message) override;
  void OnAudioLevel(float level_db,
                    mojom::AudioSourceType source_type) override;

 private:
  void UpdateSessionState(mojom::SessionState new_state);
  void NotifyClientStateChanged(mojom::SessionState state);
  void SendSessionConfig();
  void OnSessionClientDisconnected();
  void SendGazeToBackend(const mojom::GazeData& gaze);
  void SendAudioToBackend(const std::vector<uint8_t>& audio_data,
                          mojom::AudioSourceType source_type);
  void StartActiveSession();

  // Session state.
  std::string session_id_;
  std::string session_token_;
  mojom::SessionState session_state_ = mojom::SessionState::IDLE;

  // Feature flags.
  bool eye_tracking_enabled_ = true;
  bool video_capture_enabled_ = true;
  bool audio_capture_enabled_ = true;

  // Session host Mojo bindings.
  mojo::Receiver<mojom::BlockedSessionHost> session_receiver_{this};
  mojo::Remote<mojom::BlockedSessionClient> session_client_;

  // Eye tracking Mojo bindings.
  mojo::Receiver<mojom::EyeTrackingHost> eye_tracking_receiver_{this};
  mojo::Remote<mojom::EyeTrackingClient> eye_tracking_client_;

  // Audio capture Mojo bindings.
  mojo::Receiver<mojom::AudioCaptureHost> audio_capture_receiver_{this};
  mojo::Remote<mojom::AudioCaptureClient> audio_capture_client_;

  // Connected services (not owned).
  raw_ptr<BlockedBackendConnector> backend_connector_ = nullptr;
  raw_ptr<BlockedVideoCaptureService> video_capture_service_ = nullptr;

  // Statistics.
  int64_t gaze_events_received_ = 0;
  int64_t audio_frames_received_ = 0;

  // Observers.
  std::vector<Observer*> observers_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<BlockedSessionHostImpl> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_IPC_BLOCKED_SESSION_HOST_IMPL_H_
