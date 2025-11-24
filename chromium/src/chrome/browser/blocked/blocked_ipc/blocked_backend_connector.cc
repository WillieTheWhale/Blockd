// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_ipc/blocked_backend_connector.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/json/json_writer.h"
#include "base/values.h"

namespace blocked {

namespace {
constexpr base::TimeDelta kHeartbeatInterval = base::Seconds(30);
}

BlockedBackendConnector::BlockedBackendConnector(const std::string& backend_url)
    : backend_url_(backend_url) {
  LOG(INFO) << "Backend connector initialized: " << backend_url_;
}

BlockedBackendConnector::~BlockedBackendConnector() {
  Disconnect();
}

void BlockedBackendConnector::Shutdown() {
  Disconnect();
}

void BlockedBackendConnector::Connect(const std::string& session_token) {
  if (state_ == ConnectionState::CONNECTED || state_ == ConnectionState::CONNECTING) {
    LOG(WARNING) << "Already connected or connecting";
    return;
  }

  session_token_ = session_token;
  state_ = ConnectionState::CONNECTING;

  LOG(INFO) << "Connecting to backend: " << backend_url_;

  // Simulate connection (actual implementation would use WebSocket library)
  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&BlockedBackendConnector::OnConnected,
                     weak_factory_.GetWeakPtr()),
      base::Seconds(1));
}

void BlockedBackendConnector::Disconnect() {
  if (state_ == ConnectionState::DISCONNECTED) {
    return;
  }

  LOG(INFO) << "Disconnecting from backend";
  heartbeat_timer_.Stop();
  state_ = ConnectionState::DISCONNECTED;

  for (auto* observer : observers_) {
    observer->OnConnectionStateChanged(state_);
  }
}

bool BlockedBackendConnector::SendSecurityEvent(
    const std::string& event_type,
    const std::string& severity,
    const std::string& description,
    const std::string& metadata) {
  if (state_ != ConnectionState::CONNECTED) {
    LOG(ERROR) << "Not connected, cannot send security event";
    return false;
  }

  base::Value::Dict message;
  message.Set("type", "security_event");
  message.Set("session_id", session_id_);
  message.Set("event_type", event_type);
  message.Set("severity", severity);
  message.Set("description", description);
  message.Set("metadata", metadata);

  std::string json;
  base::JSONWriter::Write(message, &json);

  VLOG(1) << "Sending security event: " << event_type;
  return true;
}

bool BlockedBackendConnector::SendGazeData(const std::vector<float>& gaze_points) {
  if (state_ != ConnectionState::CONNECTED) {
    return false;
  }

  // Implementation would serialize gaze data and send via WebSocket
  return true;
}

bool BlockedBackendConnector::SendTelemetry(double cpu_percent,
                                             int64_t memory_mb,
                                             int active_processes) {
  if (state_ != ConnectionState::CONNECTED) {
    return false;
  }

  base::Value::Dict message;
  message.Set("type", "telemetry");
  message.Set("session_id", session_id_);
  message.Set("cpu_percent", cpu_percent);
  message.Set("memory_mb", static_cast<int>(memory_mb));
  message.Set("active_processes", active_processes);

  std::string json;
  base::JSONWriter::Write(message, &json);

  VLOG(2) << "Sending telemetry data";
  return true;
}

void BlockedBackendConnector::AddObserver(Observer* observer) {
  observers_.push_back(observer);
}

void BlockedBackendConnector::RemoveObserver(Observer* observer) {
  observers_.erase(std::remove(observers_.begin(), observers_.end(), observer),
                   observers_.end());
}

void BlockedBackendConnector::OnConnected() {
  LOG(INFO) << "Connected to backend";
  state_ = ConnectionState::CONNECTED;
  session_id_ = "session_" + session_token_;  // Simplified

  // Start heartbeat
  heartbeat_timer_.Start(FROM_HERE, kHeartbeatInterval,
                         base::BindRepeating(
                             &BlockedBackendConnector::SendHeartbeat,
                             weak_factory_.GetWeakPtr()));

  for (auto* observer : observers_) {
    observer->OnConnectionStateChanged(state_);
  }
}

void BlockedBackendConnector::OnDisconnected() {
  LOG(WARNING) << "Disconnected from backend";
  heartbeat_timer_.Stop();
  state_ = ConnectionState::DISCONNECTED;

  for (auto* observer : observers_) {
    observer->OnConnectionStateChanged(state_);
  }
}

void BlockedBackendConnector::OnMessageReceived(const std::string& message) {
  VLOG(2) << "Received message: " << message;

  for (auto* observer : observers_) {
    observer->OnMessageReceived(message);
  }
}

void BlockedBackendConnector::SendHeartbeat() {
  if (state_ != ConnectionState::CONNECTED) {
    return;
  }

  VLOG(2) << "Sending heartbeat";
  // Implementation would send heartbeat message
}

}  // namespace blocked
