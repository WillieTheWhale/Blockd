// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_IPC_RENDERER_HOST_CONNECTOR_H_
#define CONTENT_RENDERER_BLOCKED_IPC_RENDERER_HOST_CONNECTOR_H_

#include <memory>
#include <string>

#include "base/memory/weak_ptr.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace content {

// Manages Mojo IPC connection from renderer to browser process.
// Singleton class that provides access to browser-side Blocked services.
class RendererHostConnector {
 public:
  static RendererHostConnector* GetInstance();

  RendererHostConnector(const RendererHostConnector&) = delete;
  RendererHostConnector& operator=(const RendererHostConnector&) = delete;

  // Initialize connection to browser process.
  void Initialize();

  // Check if connected to browser.
  bool IsConnected() const { return is_connected_; }

  // Get session ID (if session is active).
  const std::string& GetSessionId() const { return session_id_; }

  // Notify browser that renderer is ready.
  void NotifyRendererReady();

  // Send session event to browser.
  void SendSessionEvent(const std::string& event_type,
                         const std::string& data);

 private:
  RendererHostConnector();
  ~RendererHostConnector();

  void OnConnectionEstablished(const std::string& session_id);
  void OnConnectionFailed();

  bool is_connected_ = false;
  std::string session_id_;

  // Mojo remote for IPC to browser.
  // In production, this would be a proper Mojo interface.
  // For now, it's a placeholder.
  // mojo::Remote<blocked::mojom::BlockedSessionHost> session_host_;

  base::WeakPtrFactory<RendererHostConnector> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_IPC_RENDERER_HOST_CONNECTOR_H_
