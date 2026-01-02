// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_IPC_RENDERER_HOST_CONNECTOR_H_
#define CONTENT_RENDERER_BLOCKED_IPC_RENDERER_HOST_CONNECTOR_H_

#include <memory>
#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "chrome/browser/blocked/public/mojom/eye_tracking.mojom.h"
#include "chrome/browser/blocked/public/mojom/session.mojom.h"
#include "chrome/browser/blocked/public/mojom/video_capture.mojom.h"
#include "mojo/public/cpp/bindings/pending_receiver.h"
#include "mojo/public/cpp/bindings/pending_remote.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace content {

// Manages Mojo IPC connection from renderer to browser process.
// Singleton class that provides access to browser-side Blocked services.
// Implements BlockedSessionClient to receive commands from browser.
class RendererHostConnector : public blocked::mojom::BlockedSessionClient {
 public:
  // Observer interface for session state changes.
  class Observer {
   public:
    virtual ~Observer() = default;
    virtual void OnSessionStateChanged(blocked::mojom::SessionState state) = 0;
    virtual void OnSessionConfigReceived(
        blocked::mojom::SessionConfigPtr config) = 0;
    virtual void OnSessionEnded() = 0;
  };

  static RendererHostConnector* GetInstance();

  RendererHostConnector(const RendererHostConnector&) = delete;
  RendererHostConnector& operator=(const RendererHostConnector&) = delete;

  // Initialize connection to browser process.
  // Takes a pending receiver from the browser-side session host.
  void Initialize(
      mojo::PendingRemote<blocked::mojom::BlockedSessionHost> session_host,
      mojo::PendingReceiver<blocked::mojom::BlockedSessionClient>
          client_receiver);

  // Initialize without pending receiver (gets it from RenderFrame).
  void Initialize();

  // Check if connected to browser.
  bool IsConnected() const { return is_connected_; }

  // Get session ID (if session is active).
  const std::string& GetSessionId() const { return session_id_; }

  // Get current session state.
  blocked::mojom::SessionState GetSessionState() const {
    return current_state_;
  }

  // Notify browser that renderer is ready.
  void NotifyRendererReady();

  // Send session event to browser.
  void SendSessionEvent(const std::string& event_type,
                        const std::string& data);

  // Eye tracking interface access.
  blocked::mojom::EyeTrackingHost* GetEyeTrackingHost();
  void BindEyeTracking(
      mojo::PendingReceiver<blocked::mojom::EyeTrackingClient> client_receiver);

  // Video capture interface access.
  blocked::mojom::VideoCaptureHost* GetVideoCaptureHost();
  void BindVideoCapture(
      mojo::PendingReceiver<blocked::mojom::VideoCaptureClient>
          client_receiver);

  // Observer management.
  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

  // blocked::mojom::BlockedSessionClient implementation.
  void OnSessionStateChanged(blocked::mojom::SessionState new_state) override;
  void OnSessionConfig(blocked::mojom::SessionConfigPtr config) override;
  void EndSession() override;

 private:
  RendererHostConnector();
  ~RendererHostConnector() override;

  void OnConnectionEstablished(const std::string& session_id);
  void OnConnectionFailed();
  void OnSessionHostDisconnected();
  void RequestSessionHostFromBrowser();
  void NotifyObserversStateChanged(blocked::mojom::SessionState state);

  bool is_connected_ = false;
  std::string session_id_;
  blocked::mojom::SessionState current_state_ =
      blocked::mojom::SessionState::IDLE;
  blocked::mojom::SessionConfigPtr session_config_;

  // Mojo connection to browser-side session host.
  mojo::Remote<blocked::mojom::BlockedSessionHost> session_host_;
  mojo::Receiver<blocked::mojom::BlockedSessionClient> client_receiver_{this};

  // Eye tracking interfaces.
  mojo::Remote<blocked::mojom::EyeTrackingHost> eye_tracking_host_;
  mojo::Receiver<blocked::mojom::EyeTrackingClient>* eye_tracking_client_ =
      nullptr;

  // Video capture interfaces.
  mojo::Remote<blocked::mojom::VideoCaptureHost> video_capture_host_;
  mojo::Receiver<blocked::mojom::VideoCaptureClient>* video_capture_client_ =
      nullptr;

  // Observers.
  std::vector<Observer*> observers_;

  base::WeakPtrFactory<RendererHostConnector> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_IPC_RENDERER_HOST_CONNECTOR_H_
