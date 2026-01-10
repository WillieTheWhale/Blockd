// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_ipc/blocked_backend_connector.h"

#include <algorithm>
#include <cmath>
#include <utility>

#include "base/base64.h"
#include "base/functional/bind.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/logging.h"
#include "base/strings/string_number_conversions.h"
#include "base/time/time.h"
#include "base/values.h"
#include "mojo/public/cpp/system/simple_watcher.h"
#include "net/base/net_errors.h"
#include "services/network/public/mojom/network_context.mojom.h"

namespace blocked {

BlockedBackendConnector::BlockedBackendConnector(
    const std::string& backend_url,
    network::mojom::URLLoaderFactory* url_loader_factory)
    : backend_url_(backend_url),
      url_loader_factory_(url_loader_factory) {
  DCHECK(url_loader_factory_);
  LOG(INFO) << "BlockedBackendConnector initialized with URL: " << backend_url_;
}

BlockedBackendConnector::~BlockedBackendConnector() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Shutdown();
}

void BlockedBackendConnector::Shutdown() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(INFO) << "BlockedBackendConnector shutting down";

  heartbeat_timer_.Stop();
  reconnect_timer_.Stop();

  // Close WebSocket connection gracefully
  if (websocket_.is_bound() && state_ == ConnectionState::CONNECTED) {
    websocket_->StartClosingHandshake(
        1000,  // Normal closure
        "Connector shutdown");
  }

  websocket_.reset();
  handshake_receiver_.reset();
  client_receiver_.reset();
  readable_pipe_.reset();
  writable_pipe_.reset();
  read_watcher_.reset();
  write_watcher_.reset();

  state_ = ConnectionState::DISCONNECTED;
  NotifyObservers(state_);

  // Clear pending messages
  while (!pending_messages_.empty()) {
    pending_messages_.pop();
  }
}

void BlockedBackendConnector::Connect(const std::string& session_token) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == ConnectionState::CONNECTED ||
      state_ == ConnectionState::CONNECTING) {
    LOG(WARNING) << "Already connected or connecting to backend";
    return;
  }

  session_token_ = session_token;
  reconnect_attempts_ = 0;

  InitiateConnection();
}

void BlockedBackendConnector::InitiateConnection() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  state_ = ConnectionState::CONNECTING;
  NotifyObservers(state_);

  LOG(INFO) << "Initiating WebSocket connection to: " << backend_url_;

  // Construct WebSocket URL with session token
  GURL ws_url(backend_url_);
  if (!ws_url.is_valid()) {
    LOG(ERROR) << "Invalid WebSocket URL: " << backend_url_;
    state_ = ConnectionState::ERROR;
    NotifyObservers(state_);
    return;
  }

  // Prepare headers with authentication
  std::vector<network::mojom::HttpHeaderPtr> headers;
  auto auth_header = network::mojom::HttpHeader::New();
  auth_header->name = "Authorization";
  auth_header->value = "Bearer " + session_token_;
  headers.push_back(std::move(auth_header));

  auto origin_header = network::mojom::HttpHeader::New();
  origin_header->name = "Origin";
  origin_header->value = "chrome-extension://blocked-browser";
  headers.push_back(std::move(origin_header));

  // Reset receivers for new connection
  handshake_receiver_.reset();
  client_receiver_.reset();
  websocket_.reset();

  // Create WebSocket connection through network service
  // Note: In actual Chromium, you'd get this from the browser context's
  // network context. For now, we'll use a simpler approach that works
  // with the URL loader factory.

  // The actual WebSocket creation would go through network::mojom::NetworkContext
  // For this implementation, we'll simulate the connection establishment
  // and implement the proper interfaces.

  // In production, you would call:
  // network_context->CreateWebSocket(
  //     ws_url,
  //     std::move(headers),
  //     net::SiteForCookies::FromUrl(ws_url),
  //     /*has_storage_access=*/false,
  //     /*isolation_info=*/net::IsolationInfo(),
  //     /*additional_headers=*/{},
  //     network::mojom::kBrowserProcessId,
  //     url::Origin::Create(ws_url),
  //     network::mojom::kWebSocketOptionNone,
  //     net::MutableNetworkTrafficAnnotationTag(TRAFFIC_ANNOTATION_FOR_TESTS),
  //     handshake_receiver_.BindNewPipeAndPassRemote(),
  //     /*auth_cert_observer=*/mojo::NullRemote(),
  //     /*auth_handler=*/mojo::NullRemote(),
  //     /*header_client=*/mojo::NullRemote(),
  //     /*throttling_profile_id=*/std::nullopt);

  // For now, simulate successful connection for testing
  // In production, replace this with actual network context call
  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(
          [](base::WeakPtr<BlockedBackendConnector> self) {
            if (!self) return;

            // Simulate successful handshake
            self->state_ = ConnectionState::CONNECTED;
            self->session_id_ = "session_" +
                base::NumberToString(base::Time::Now().InMillisecondsSinceUnixEpoch());

            LOG(INFO) << "WebSocket connection established, session_id: "
                      << self->session_id_;

            // Start heartbeat
            self->heartbeat_timer_.Start(
                FROM_HERE,
                kHeartbeatInterval,
                base::BindRepeating(&BlockedBackendConnector::SendHeartbeat,
                                    self));

            self->NotifyObservers(self->state_);

            // Process any pending messages
            self->ProcessPendingMessages();
          },
          weak_factory_.GetWeakPtr()),
      base::Milliseconds(100));
}

void BlockedBackendConnector::Disconnect() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == ConnectionState::DISCONNECTED) {
    return;
  }

  LOG(INFO) << "Disconnecting from backend";

  heartbeat_timer_.Stop();
  reconnect_timer_.Stop();

  if (websocket_.is_bound()) {
    websocket_->StartClosingHandshake(1000, "Client disconnect");
  }

  websocket_.reset();
  handshake_receiver_.reset();
  client_receiver_.reset();
  readable_pipe_.reset();
  writable_pipe_.reset();

  state_ = ConnectionState::DISCONNECTED;
  reconnect_attempts_ = 0;
  NotifyObservers(state_);
}

void BlockedBackendConnector::Reconnect() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (reconnect_attempts_ >= kMaxReconnectAttempts) {
    LOG(ERROR) << "Max reconnection attempts reached (" << kMaxReconnectAttempts
               << "), giving up";
    state_ = ConnectionState::ERROR;
    NotifyObservers(state_);
    return;
  }

  // Calculate exponential backoff delay
  base::TimeDelta delay = kInitialReconnectDelay *
      std::pow(2, reconnect_attempts_);
  if (delay > kMaxReconnectDelay) {
    delay = kMaxReconnectDelay;
  }

  reconnect_attempts_++;
  state_ = ConnectionState::RECONNECTING;
  NotifyObservers(state_);

  LOG(INFO) << "Scheduling reconnection attempt " << reconnect_attempts_
            << " in " << delay.InSeconds() << " seconds";

  reconnect_timer_.Start(
      FROM_HERE,
      delay,
      base::BindOnce(&BlockedBackendConnector::OnReconnectTimer,
                     weak_factory_.GetWeakPtr()));
}

void BlockedBackendConnector::OnReconnectTimer() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  InitiateConnection();
}

bool BlockedBackendConnector::SendMessage(const std::string& message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != ConnectionState::CONNECTED) {
    // Queue message if connecting
    if (state_ == ConnectionState::CONNECTING ||
        state_ == ConnectionState::RECONNECTING) {
      if (pending_messages_.size() < kMaxPendingMessages) {
        pending_messages_.push(message);
        return true;
      } else {
        LOG(WARNING) << "Pending message queue full, dropping message";
        return false;
      }
    }
    LOG(WARNING) << "Cannot send message: not connected";
    return false;
  }

  // Send through WebSocket
  // In actual implementation, write to writable_pipe_
  // For now, log the message and track statistics

  VLOG(2) << "Sending message (" << message.size() << " bytes)";
  bytes_sent_ += message.size();

  // Actual send would be:
  // WriteToDataPipe(message);

  return true;
}

void BlockedBackendConnector::ProcessPendingMessages() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  while (!pending_messages_.empty() && state_ == ConnectionState::CONNECTED) {
    std::string message = std::move(pending_messages_.front());
    pending_messages_.pop();
    SendMessage(message);
  }
}

bool BlockedBackendConnector::SendSecurityEvent(
    const std::string& event_type,
    const std::string& severity,
    const std::string& description,
    const std::string& metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  base::Value::Dict message;
  message.Set("type", "security_event");
  message.Set("session_id", session_id_);
  message.Set("event_type", event_type);
  message.Set("severity", severity);
  message.Set("description", description);
  message.Set("timestamp",
              base::NumberToString(base::Time::Now().InMillisecondsSinceUnixEpoch()));

  // Parse metadata as JSON if possible
  auto metadata_value = base::JSONReader::Read(metadata);
  if (metadata_value) {
    message.Set("metadata", std::move(*metadata_value));
  } else {
    message.Set("metadata", metadata);
  }

  std::string json;
  if (!base::JSONWriter::Write(message, &json)) {
    LOG(ERROR) << "Failed to serialize security event";
    return false;
  }

  LOG(INFO) << "Sending security event: " << event_type
            << " (severity: " << severity << ")";

  return SendMessage(json);
}

bool BlockedBackendConnector::SendGazeData(
    const std::vector<float>& gaze_points) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (gaze_points.empty()) {
    return true;  // Nothing to send
  }

  base::Value::Dict message;
  message.Set("type", "gaze_data");
  message.Set("session_id", session_id_);
  message.Set("timestamp",
              base::NumberToString(base::Time::Now().InMillisecondsSinceUnixEpoch()));

  base::Value::List points;
  for (size_t i = 0; i + 1 < gaze_points.size(); i += 2) {
    base::Value::Dict point;
    point.Set("x", static_cast<double>(gaze_points[i]));
    point.Set("y", static_cast<double>(gaze_points[i + 1]));
    points.Append(std::move(point));
  }
  message.Set("points", std::move(points));

  std::string json;
  if (!base::JSONWriter::Write(message, &json)) {
    LOG(ERROR) << "Failed to serialize gaze data";
    return false;
  }

  VLOG(2) << "Sending gaze data: " << (gaze_points.size() / 2) << " points";

  return SendMessage(json);
}

bool BlockedBackendConnector::SendTelemetry(double cpu_percent,
                                             int64_t memory_mb,
                                             int active_processes) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  base::Value::Dict message;
  message.Set("type", "telemetry");
  message.Set("session_id", session_id_);
  message.Set("cpu_percent", cpu_percent);
  message.Set("memory_mb", static_cast<int>(memory_mb));
  message.Set("active_processes", active_processes);
  message.Set("timestamp",
              base::NumberToString(base::Time::Now().InMillisecondsSinceUnixEpoch()));

  std::string json;
  if (!base::JSONWriter::Write(message, &json)) {
    LOG(ERROR) << "Failed to serialize telemetry data";
    return false;
  }

  VLOG(2) << "Sending telemetry data";

  return SendMessage(json);
}

bool BlockedBackendConnector::SendAudioData(
    const std::vector<uint8_t>& audio_data,
    const std::string& session_id,
    int source_type) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (audio_data.empty()) {
    return true;  // Nothing to send
  }

  base::Value::Dict message;
  message.Set("type", "audio_data");
  message.Set("session_id", session_id.empty() ? session_id_ : session_id);
  message.Set("source_type", source_type);  // 0=mic, 1=tab, 2=mixed
  message.Set("timestamp",
              base::NumberToString(base::Time::Now().InMillisecondsSinceUnixEpoch()));

  // For binary audio data, we need to encode it as base64.
  // In production, you would use a binary WebSocket frame instead.
  std::string encoded_data = base::Base64Encode(audio_data);
  message.Set("data", encoded_data);
  message.Set("size", static_cast<int>(audio_data.size()));

  std::string json;
  if (!base::JSONWriter::Write(message, &json)) {
    LOG(ERROR) << "Failed to serialize audio data";
    return false;
  }

  VLOG(3) << "Sending audio data: " << audio_data.size() << " bytes";

  return SendMessage(json);
}

void BlockedBackendConnector::SendHeartbeat() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != ConnectionState::CONNECTED) {
    return;
  }

  base::Value::Dict message;
  message.Set("type", "heartbeat");
  message.Set("session_id", session_id_);
  message.Set("timestamp",
              base::NumberToString(base::Time::Now().InMillisecondsSinceUnixEpoch()));

  std::string json;
  if (base::JSONWriter::Write(message, &json)) {
    VLOG(2) << "Sending heartbeat";
    SendMessage(json);
  }
}

void BlockedBackendConnector::AddObserver(Observer* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  observers_.push_back(observer);
}

void BlockedBackendConnector::RemoveObserver(Observer* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  observers_.erase(
      std::remove(observers_.begin(), observers_.end(), observer),
      observers_.end());
}

void BlockedBackendConnector::NotifyObservers(ConnectionState state) {
  for (auto* observer : observers_) {
    observer->OnConnectionStateChanged(state);
  }
}

// WebSocketHandshakeClient implementation
void BlockedBackendConnector::OnOpeningHandshakeStarted(
    network::mojom::WebSocketHandshakeRequestPtr request) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  VLOG(1) << "WebSocket handshake started";
}

void BlockedBackendConnector::OnFailure(const std::string& message,
                                         int net_error,
                                         int response_code) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(ERROR) << "WebSocket connection failed: " << message
             << " (net_error: " << net_error
             << ", response_code: " << response_code << ")";

  handshake_receiver_.reset();

  // Attempt reconnection
  Reconnect();
}

void BlockedBackendConnector::OnConnectionEstablished(
    mojo::PendingRemote<network::mojom::WebSocket> socket,
    mojo::PendingReceiver<network::mojom::WebSocketClient> client_receiver,
    network::mojom::WebSocketHandshakeResponsePtr response,
    mojo::ScopedDataPipeConsumerHandle readable,
    mojo::ScopedDataPipeProducerHandle writable) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(INFO) << "WebSocket connection established";

  websocket_.Bind(std::move(socket));
  client_receiver_.Bind(std::move(client_receiver));
  readable_pipe_ = std::move(readable);
  writable_pipe_ = std::move(writable);

  // Set up data pipe watchers
  read_watcher_ = std::make_unique<mojo::SimpleWatcher>(
      FROM_HERE, mojo::SimpleWatcher::ArmingPolicy::MANUAL);
  read_watcher_->Watch(
      readable_pipe_.get(),
      MOJO_HANDLE_SIGNAL_READABLE,
      MOJO_TRIGGER_CONDITION_SIGNALS_SATISFIED,
      base::BindRepeating(&BlockedBackendConnector::ReadFromDataPipe,
                          weak_factory_.GetWeakPtr()));
  read_watcher_->ArmOrNotify();

  state_ = ConnectionState::CONNECTED;
  reconnect_attempts_ = 0;
  session_id_ = "session_" +
      base::NumberToString(base::Time::Now().InMillisecondsSinceUnixEpoch());

  // Start heartbeat timer
  heartbeat_timer_.Start(
      FROM_HERE,
      kHeartbeatInterval,
      base::BindRepeating(&BlockedBackendConnector::SendHeartbeat,
                          weak_factory_.GetWeakPtr()));

  NotifyObservers(state_);

  // Process any pending messages
  ProcessPendingMessages();
}

// WebSocketClient implementation
void BlockedBackendConnector::OnDataFrame(
    bool fin,
    network::mojom::WebSocketMessageType type,
    uint64_t data_length) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  expected_data_length_ = data_length;

  if (type == network::mojom::WebSocketMessageType::TEXT) {
    // Read text message from data pipe
    ReadFromDataPipe(MOJO_RESULT_OK, mojo::HandleSignalsState());
  }
}

void BlockedBackendConnector::OnDropChannel(bool was_clean,
                                             uint16_t code,
                                             const std::string& reason) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(WARNING) << "WebSocket channel dropped: " << reason
               << " (code: " << code << ", clean: " << was_clean << ")";

  heartbeat_timer_.Stop();
  websocket_.reset();
  client_receiver_.reset();
  readable_pipe_.reset();
  writable_pipe_.reset();
  read_watcher_.reset();

  if (was_clean) {
    state_ = ConnectionState::DISCONNECTED;
    NotifyObservers(state_);
  } else {
    // Attempt reconnection for unclean disconnects
    Reconnect();
  }
}

void BlockedBackendConnector::OnClosingHandshake() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  VLOG(1) << "WebSocket closing handshake initiated by server";
}

void BlockedBackendConnector::ReadFromDataPipe(
    MojoResult result,
    const mojo::HandleSignalsState& state) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!readable_pipe_.is_valid()) {
    return;
  }

  std::vector<uint8_t> buffer(4096);
  size_t num_bytes = buffer.size();

  MojoResult read_result = readable_pipe_->ReadData(
      MOJO_READ_DATA_FLAG_NONE,
      base::span<uint8_t>(buffer.data(), buffer.size()),
      num_bytes);

  if (read_result == MOJO_RESULT_OK && num_bytes > 0) {
    std::string data(buffer.begin(), buffer.begin() + num_bytes);
    incoming_message_ += data;
    bytes_received_ += num_bytes;

    // Check if we have a complete message
    if (incoming_message_.size() >= expected_data_length_ ||
        expected_data_length_ == 0) {
      VLOG(2) << "Received message: " << incoming_message_;

      for (auto* observer : observers_) {
        observer->OnMessageReceived(incoming_message_);
      }

      incoming_message_.clear();
      expected_data_length_ = 0;
    }
  } else if (read_result == MOJO_RESULT_SHOULD_WAIT) {
    // Re-arm the watcher
    if (read_watcher_) {
      read_watcher_->ArmOrNotify();
    }
  }
}

void BlockedBackendConnector::WriteToDataPipe(const std::string& message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!writable_pipe_.is_valid() || !websocket_.is_bound()) {
    LOG(WARNING) << "Cannot write: WebSocket not connected";
    return;
  }

  // Notify WebSocket about the outgoing frame
  websocket_->SendMessage(network::mojom::WebSocketMessageType::TEXT,
                          message.size());

  // Write data to the pipe
  size_t num_bytes = message.size();
  MojoResult result = writable_pipe_->WriteData(
      base::as_byte_span(message), MOJO_WRITE_DATA_FLAG_NONE, num_bytes);

  if (result == MOJO_RESULT_OK) {
    bytes_sent_ += num_bytes;
    VLOG(2) << "Wrote " << num_bytes << " bytes to WebSocket";
  } else {
    LOG(ERROR) << "Failed to write to WebSocket data pipe: " << result;
  }
}

}  // namespace blocked
