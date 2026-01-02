// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_IPC_BLOCKED_BACKEND_CONNECTOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_IPC_BLOCKED_BACKEND_CONNECTOR_H_

#include <memory>
#include <string>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/timer/timer.h"
#include "components/keyed_service/core/keyed_service.h"

namespace blocked {

class BlockedBackendConnector : public KeyedService {
 public:
  enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    ERROR
  };

  class Observer {
   public:
    virtual ~Observer() = default;
    virtual void OnConnectionStateChanged(ConnectionState state) = 0;
    virtual void OnMessageReceived(const std::string& message) = 0;
  };

  explicit BlockedBackendConnector(const std::string& backend_url);
  ~BlockedBackendConnector() override;

  void Shutdown() override;

  // Connection management
  void Connect(const std::string& session_token);
  void Disconnect();
  ConnectionState GetState() const { return state_; }

  // Message sending
  bool SendSecurityEvent(const std::string& event_type,
                         const std::string& severity,
                         const std::string& description,
                         const std::string& metadata);
  bool SendGazeData(const std::vector<float>& gaze_points);
  bool SendTelemetry(double cpu_percent, int64_t memory_mb, int active_processes);

  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

 private:
  void OnConnected();
  void OnDisconnected();
  void OnMessageReceived(const std::string& message);
  void SendHeartbeat();

  std::string backend_url_;
  std::string session_token_;
  std::string session_id_;
  ConnectionState state_ = ConnectionState::DISCONNECTED;

  base::RepeatingTimer heartbeat_timer_;
  std::vector<Observer*> observers_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<BlockedBackendConnector> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_IPC_BLOCKED_BACKEND_CONNECTOR_H_
