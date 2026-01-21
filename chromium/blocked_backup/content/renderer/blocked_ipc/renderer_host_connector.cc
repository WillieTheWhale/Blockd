// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_ipc/renderer_host_connector.h"

#include <algorithm>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/no_destructor.h"
#include "content/public/renderer/render_frame.h"
#include "third_party/blink/public/common/associated_interfaces/associated_interface_provider.h"
#include "third_party/blink/public/web/web_local_frame.h"

namespace content {

// static
RendererHostConnector* RendererHostConnector::GetInstance() {
  static base::NoDestructor<RendererHostConnector> instance;
  return instance.get();
}

RendererHostConnector::RendererHostConnector() = default;

RendererHostConnector::~RendererHostConnector() = default;

void RendererHostConnector::Initialize(
    mojo::PendingRemote<blocked::mojom::BlockedSessionHost> session_host,
    mojo::PendingReceiver<blocked::mojom::BlockedSessionClient>
        client_receiver) {
  if (is_connected_) {
    LOG(WARNING) << "RendererHostConnector already initialized";
    return;
  }

  // Bind the session host remote.
  session_host_.Bind(std::move(session_host));
  session_host_.set_disconnect_handler(base::BindOnce(
      &RendererHostConnector::OnSessionHostDisconnected,
      weak_factory_.GetWeakPtr()));

  // Bind the client receiver.
  if (client_receiver_.is_bound()) {
    client_receiver_.reset();
  }
  client_receiver_.Bind(std::move(client_receiver));

  is_connected_ = true;
  current_state_ = blocked::mojom::SessionState::INITIALIZING;

  LOG(INFO) << "RendererHostConnector initialized with Mojo connection";

  // Notify browser that renderer is ready.
  NotifyRendererReady();
}

void RendererHostConnector::Initialize() {
  if (is_connected_) {
    LOG(WARNING) << "RendererHostConnector already initialized";
    return;
  }

  // Request session host from browser via BrowserInterfaceBroker.
  RequestSessionHostFromBrowser();

  LOG(INFO) << "RendererHostConnector initialization requested";
}

void RendererHostConnector::RequestSessionHostFromBrowser() {
  // In Chromium, the renderer gets Mojo interfaces through the RenderFrame.
  // The browser process exposes BlockedSessionHost through the frame's
  // BrowserInterfaceBroker.
  //
  // For this to work, the browser side must register the interface:
  // 1. In browser process: Implement a BrowserInterfaceBrokerRegistry
  // 2. Register blocked::mojom::BlockedSessionHost
  // 3. Handle interface requests in the frame host

  // For now, we'll create a pending remote/receiver pair and wait
  // for the browser to bind them. This requires the browser to
  // initiate the connection.

  LOG(INFO) << "Waiting for browser to establish session connection...";

  // The browser process should call Initialize() with proper endpoints
  // when it's ready to start a Blocked session.
}

void RendererHostConnector::NotifyRendererReady() {
  if (!is_connected_ || !session_host_.is_bound()) {
    LOG(ERROR) << "Cannot notify - not connected to browser";
    return;
  }

  session_host_->OnRendererReady();
  LOG(INFO) << "Renderer ready notification sent to browser";
}

void RendererHostConnector::SendSessionEvent(const std::string& event_type,
                                             const std::string& data) {
  if (!is_connected_ || !session_host_.is_bound()) {
    LOG(WARNING) << "Cannot send event - not connected to browser";
    return;
  }

  session_host_->OnSessionEvent(event_type, data);
  VLOG(1) << "Session event sent: " << event_type;
}

blocked::mojom::EyeTrackingHost* RendererHostConnector::GetEyeTrackingHost() {
  if (!is_connected_ || !session_host_.is_bound()) {
    LOG(WARNING) << "Cannot get eye tracking host - not connected";
    return nullptr;
  }

  // Bind eye tracking interfaces if not already bound.
  if (!eye_tracking_host_.is_bound()) {
    mojo::PendingRemote<blocked::mojom::EyeTrackingClient> client_remote;
    auto client_receiver = client_remote.InitWithNewPipeAndPassReceiver();

    session_host_->BindEyeTracking(
        eye_tracking_host_.BindNewPipeAndPassReceiver(),
        std::move(client_remote));

    LOG(INFO) << "Eye tracking interface bound";
  }

  return eye_tracking_host_.get();
}

void RendererHostConnector::BindEyeTracking(
    mojo::PendingReceiver<blocked::mojom::EyeTrackingClient> client_receiver) {
  // This allows external code to provide the client implementation.
  // The receiver will be bound by the caller.
  LOG(INFO) << "Eye tracking client receiver provided for binding";
}

blocked::mojom::VideoCaptureHost* RendererHostConnector::GetVideoCaptureHost() {
  if (!is_connected_ || !session_host_.is_bound()) {
    LOG(WARNING) << "Cannot get video capture host - not connected";
    return nullptr;
  }

  // Bind video capture interfaces if not already bound.
  if (!video_capture_host_.is_bound()) {
    mojo::PendingRemote<blocked::mojom::VideoCaptureClient> client_remote;
    auto client_receiver = client_remote.InitWithNewPipeAndPassReceiver();

    session_host_->BindVideoCapture(
        video_capture_host_.BindNewPipeAndPassReceiver(),
        std::move(client_remote));

    LOG(INFO) << "Video capture interface bound";
  }

  return video_capture_host_.get();
}

void RendererHostConnector::BindVideoCapture(
    mojo::PendingReceiver<blocked::mojom::VideoCaptureClient> client_receiver) {
  // This allows external code to provide the client implementation.
  // The receiver will be bound by the caller.
  LOG(INFO) << "Video capture client receiver provided for binding";
}

void RendererHostConnector::AddObserver(Observer* observer) {
  if (std::find(observers_.begin(), observers_.end(), observer) ==
      observers_.end()) {
    observers_.push_back(observer);
  }
}

void RendererHostConnector::RemoveObserver(Observer* observer) {
  auto it = std::find(observers_.begin(), observers_.end(), observer);
  if (it != observers_.end()) {
    observers_.erase(it);
  }
}

// blocked::mojom::BlockedSessionClient implementation.

void RendererHostConnector::OnSessionStateChanged(
    blocked::mojom::SessionState new_state) {
  blocked::mojom::SessionState old_state = current_state_;
  current_state_ = new_state;

  LOG(INFO) << "Session state changed from " << static_cast<int>(old_state)
            << " to " << static_cast<int>(new_state);

  NotifyObserversStateChanged(new_state);

  // Handle state-specific logic.
  switch (new_state) {
    case blocked::mojom::SessionState::ACTIVE:
      LOG(INFO) << "Session is now active";
      break;
    case blocked::mojom::SessionState::ENDED:
      LOG(INFO) << "Session has ended";
      break;
    case blocked::mojom::SessionState::ERROR:
      LOG(ERROR) << "Session entered error state";
      break;
    default:
      break;
  }
}

void RendererHostConnector::OnSessionConfig(
    blocked::mojom::SessionConfigPtr config) {
  if (!config) {
    LOG(WARNING) << "Received null session config";
    return;
  }

  session_id_ = config->session_id;
  session_config_ = std::move(config);

  LOG(INFO) << "Session config received, session_id: " << session_id_;

  // Notify observers.
  for (Observer* observer : observers_) {
    observer->OnSessionConfigReceived(session_config_.Clone());
  }

  OnConnectionEstablished(session_id_);
}

void RendererHostConnector::EndSession() {
  LOG(INFO) << "EndSession command received from browser";

  current_state_ = blocked::mojom::SessionState::ENDED;

  // Notify observers.
  for (Observer* observer : observers_) {
    observer->OnSessionEnded();
  }

  // Clean up.
  eye_tracking_host_.reset();
  video_capture_host_.reset();
  session_config_.reset();
  session_id_.clear();
}

void RendererHostConnector::OnConnectionEstablished(
    const std::string& session_id) {
  is_connected_ = true;
  session_id_ = session_id;

  LOG(INFO) << "Connection established to browser, session: " << session_id;
}

void RendererHostConnector::OnConnectionFailed() {
  is_connected_ = false;
  session_id_.clear();
  current_state_ = blocked::mojom::SessionState::ERROR;

  LOG(ERROR) << "Failed to connect to browser process";

  // Notify observers.
  NotifyObserversStateChanged(blocked::mojom::SessionState::ERROR);
}

void RendererHostConnector::OnSessionHostDisconnected() {
  LOG(WARNING) << "Session host disconnected";

  is_connected_ = false;
  current_state_ = blocked::mojom::SessionState::ENDED;

  // Reset all interfaces.
  session_host_.reset();
  eye_tracking_host_.reset();
  video_capture_host_.reset();

  // Notify observers.
  for (Observer* observer : observers_) {
    observer->OnSessionEnded();
  }
}

void RendererHostConnector::NotifyObserversStateChanged(
    blocked::mojom::SessionState state) {
  for (Observer* observer : observers_) {
    observer->OnSessionStateChanged(state);
  }
}

}  // namespace content
