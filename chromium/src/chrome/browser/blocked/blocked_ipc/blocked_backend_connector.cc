// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_ipc/blocked_backend_connector.h"

#include <algorithm>
#include <cmath>
#include <utility>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/strings/string_number_conversions.h"
#include "base/time/time.h"
#include "mojo/public/cpp/system/simple_watcher.h"
#include "net/base/io_buffer.h"
#include "net/base/isolation_info.h"
#include "net/base/net_errors.h"
#include "net/cookies/site_for_cookies.h"
#include "services/network/public/mojom/network_context.mojom.h"
#include "url/origin.h"

namespace blocked {

namespace {

// Traffic annotation for WebSocket connection to Blocked backend.
constexpr net::NetworkTrafficAnnotationTag kTrafficAnnotation =
    net::DefineNetworkTrafficAnnotation("blocked_backend_websocket", R"(
      semantics {
        sender: "Blocked Browser"
        description:
          "WebSocket connection to Blocked backend for real-time "
          "session monitoring including security events, gaze tracking, "
          "telemetry, and audio data."
        trigger:
          "When an interview session is started in the Blocked browser."
        data:
          "Session authentication token, security events (process detection, "
          "window focus changes), gaze tracking coordinates, system telemetry "
          "(CPU, memory usage), and encoded audio data."
        destination: OTHER
        destination_other: "Blocked interview platform backend"
      }
      policy {
        cookies_allowed: NO
        setting:
          "This feature is required for Blocked interview sessions and "
          "cannot be disabled while using the Blocked browser."
        policy_exception_justification:
          "Essential for the core functionality of the Blocked interview "
          "security platform."
      }
    )");

}  // namespace

BlockedBackendConnector::BlockedBackendConnector(
    const std::string& backend_url,
    network::mojom::NetworkContext* network_context)
    : backend_url_(backend_url),
      network_context_(network_context),
      read_buffer_(base::MakeRefCounted<net::IOBufferWithSize>(kReadBufferSize)) {
  DCHECK(network_context_);
  VLOG(1) << "BlockedBackendConnector initialized with URL: " << backend_url_;
}

BlockedBackendConnector::~BlockedBackendConnector() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Shutdown();
}

void BlockedBackendConnector::Shutdown() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  VLOG(1) << "BlockedBackendConnector shutting down";

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

  // Clear pending messages - circular_deque has clear()
  pending_messages_.clear();
}

void BlockedBackendConnector::Connect(const std::string& session_token) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == ConnectionState::CONNECTED ||
      state_ == ConnectionState::CONNECTING) {
    VLOG(1) << "Already connected or connecting to backend";
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

  VLOG(1) << "Initiating WebSocket connection to: " << backend_url_;

  // Construct WebSocket URL with session token
  GURL ws_url(backend_url_);
  if (!ws_url.is_valid()) {
    LOG(ERROR) << "Invalid WebSocket URL: " << backend_url_;
    state_ = ConnectionState::ERROR;
    NotifyObservers(state_);
    return;
  }

  // Ensure we have a network context
  if (!network_context_) {
    LOG(ERROR) << "No network context available for WebSocket connection";
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
  readable_pipe_.reset();
  writable_pipe_.reset();
  read_watcher_.reset();
  write_watcher_.reset();

  // Create the WebSocket connection through the network context.
  // This is the proper Chromium way to establish WebSocket connections
  // from the browser process.
  url::Origin origin = url::Origin::Create(ws_url);

  network_context_->CreateWebSocket(
      ws_url,
      std::move(headers),
      net::SiteForCookies::FromUrl(ws_url),
      /*has_storage_access=*/false,
      net::IsolationInfo::CreateTransient(),
      /*additional_headers=*/{},
      network::mojom::kBrowserProcessId,
      origin,
      network::mojom::kWebSocketOptionNone,
      net::MutableNetworkTrafficAnnotationTag(kTrafficAnnotation),
      handshake_receiver_.BindNewPipeAndPassRemote(),
      /*url_loader_network_observer=*/mojo::NullRemote(),
      /*auth_handler=*/mojo::NullRemote(),
      /*header_client=*/mojo::NullRemote(),
      /*throttling_profile_id=*/std::nullopt);

  VLOG(1) << "WebSocket connection request sent to network context";
}

void BlockedBackendConnector::Disconnect() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == ConnectionState::DISCONNECTED) {
    return;
  }

  VLOG(1) << "Disconnecting from backend";

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

  VLOG(1) << "Scheduling reconnection attempt " << reconnect_attempts_
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
        pending_messages_.push_back(message);
        VLOG(2) << "Message queued (pending connection): " << message.size()
                << " bytes";
        return true;
      } else {
        VLOG(1) << "Pending message queue full, dropping message";
        return false;
      }
    }
    VLOG(1) << "Cannot send message: not connected";
    return false;
  }

  // Send through WebSocket data pipe
  WriteToDataPipe(message);

  VLOG(2) << "Sending message (" << message.size() << " bytes)";

  return true;
}

void BlockedBackendConnector::ProcessPendingMessages() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  while (!pending_messages_.empty() && state_ == ConnectionState::CONNECTED) {
    std::string message = std::move(pending_messages_.front());
    pending_messages_.pop_front();

    // All queued messages are binary protobuf - send as binary frames
    std::vector<uint8_t> binary_data(message.begin(), message.end());
    WriteBinaryToDataPipe(binary_data);
  }
}

bool BlockedBackendConnector::SendSecurityEvent(
    const std::string& event_type,
    const std::string& severity,
    const std::string& description,
    const std::string& metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  proto::BlockedMessage message;
  message.set_type(proto::SECURITY_EVENT);

  auto* security_event = message.mutable_security_event();
  security_event->set_session_id(session_id_);
  security_event->set_event_type(event_type);
  security_event->set_severity(severity);
  security_event->set_description(description);
  security_event->set_timestamp(base::Time::Now().InMillisecondsSinceUnixEpoch());
  security_event->set_metadata_json(metadata);

  VLOG(1) << "Sending security event: " << event_type
          << " (severity: " << severity << ")";

  return SendProtobufMessage(message);
}

bool BlockedBackendConnector::SendGazeData(
    const std::vector<float>& gaze_points) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (gaze_points.empty()) {
    return true;  // Nothing to send
  }

  proto::BlockedMessage message;
  message.set_type(proto::GAZE_DATA);

  auto* gaze_batch = message.mutable_gaze_data();
  gaze_batch->set_session_id(session_id_);

  // Gaze points come in pairs (x, y)
  int64_t timestamp = base::Time::Now().InMillisecondsSinceUnixEpoch();
  for (size_t i = 0; i + 1 < gaze_points.size(); i += 2) {
    auto* point = gaze_batch->add_points();
    point->set_gaze_x(gaze_points[i]);
    point->set_gaze_y(gaze_points[i + 1]);
    point->set_confidence(1.0f);  // Default confidence
    point->set_timestamp(timestamp);
    point->set_is_off_screen(false);  // Caller should set this if needed
  }

  VLOG(2) << "Sending gaze data: " << gaze_batch->points_size() << " points";

  return SendProtobufMessage(message);
}

bool BlockedBackendConnector::SendTelemetry(double cpu_percent,
                                             int64_t memory_mb,
                                             int active_processes) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  proto::BlockedMessage message;
  message.set_type(proto::TELEMETRY_DATA);

  auto* telemetry = message.mutable_telemetry();
  telemetry->set_session_id(session_id_);
  telemetry->set_timestamp(base::Time::Now().InMillisecondsSinceUnixEpoch());
  telemetry->set_cpu_percent(cpu_percent);
  telemetry->set_memory_mb(memory_mb);
  telemetry->set_active_processes(active_processes);
  telemetry->set_window_focused(true);  // Can be enhanced to track focus

  VLOG(2) << "Sending telemetry data";

  return SendProtobufMessage(message);
}

bool BlockedBackendConnector::SendAudioData(
    const std::vector<uint8_t>& audio_data,
    const std::string& session_id,
    int source_type) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (audio_data.empty()) {
    return true;  // Nothing to send
  }

  // Audio data is sent as binary WebSocket frames for efficiency.
  // Format: 4-byte header (type=0x01, source_type, reserved, reserved)
  //         followed by raw audio bytes.
  // This avoids the 33% overhead of base64 encoding.

  std::vector<uint8_t> binary_frame;
  binary_frame.reserve(4 + audio_data.size());

  // Header: [0x01=audio, source_type, 0x00, 0x00]
  binary_frame.push_back(0x01);  // Message type: audio
  binary_frame.push_back(static_cast<uint8_t>(source_type));  // 0=mic, 1=tab, 2=mixed
  binary_frame.push_back(0x00);  // Reserved
  binary_frame.push_back(0x00);  // Reserved

  // Append audio data
  binary_frame.insert(binary_frame.end(), audio_data.begin(), audio_data.end());

  VLOG(3) << "Sending audio data: " << audio_data.size() << " bytes (binary)";

  return SendBinaryMessage(binary_frame);
}

void BlockedBackendConnector::SendHeartbeat() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != ConnectionState::CONNECTED) {
    return;
  }

  proto::BlockedMessage message;
  message.set_type(proto::HEARTBEAT);

  auto* heartbeat = message.mutable_heartbeat();
  heartbeat->set_timestamp(base::Time::Now().InMillisecondsSinceUnixEpoch());

  VLOG(2) << "Sending heartbeat";
  SendProtobufMessage(message);
}

void BlockedBackendConnector::AddObserver(Observer* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  observers_.AddObserver(observer);
}

void BlockedBackendConnector::RemoveObserver(Observer* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  observers_.RemoveObserver(observer);
}

void BlockedBackendConnector::NotifyObservers(ConnectionState state) {
  // ObserverList handles safe iteration even if observers modify the list
  for (Observer& observer : observers_) {
    observer.OnConnectionStateChanged(state);
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

  VLOG(1) << "WebSocket connection established";

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

  // Use persistent read buffer to avoid allocation per read
  size_t num_bytes = read_buffer_->size();

  MojoResult read_result = readable_pipe_->ReadData(
      MOJO_READ_DATA_FLAG_NONE,
      base::span<uint8_t>(reinterpret_cast<uint8_t*>(read_buffer_->data()),
                          read_buffer_->size()),
      num_bytes);

  if (read_result == MOJO_RESULT_OK && num_bytes > 0) {
    incoming_message_.append(read_buffer_->data(), num_bytes);
    bytes_received_ += num_bytes;

    // Check if we have a complete message
    if (incoming_message_.size() >= expected_data_length_ ||
        expected_data_length_ == 0) {
      VLOG(2) << "Received message: " << incoming_message_.size() << " bytes";

      // ObserverList handles safe iteration
      for (Observer& observer : observers_) {
        observer.OnMessageReceived(incoming_message_);
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
    VLOG(1) << "Cannot write: WebSocket not connected";
    return;
  }

  // Notify WebSocket about the outgoing text frame
  websocket_->SendMessage(network::mojom::WebSocketMessageType::TEXT,
                          message.size());

  // Write data to the pipe
  size_t num_bytes = message.size();
  MojoResult result = writable_pipe_->WriteData(
      base::as_byte_span(message), MOJO_WRITE_DATA_FLAG_NONE, num_bytes);

  if (result == MOJO_RESULT_OK) {
    bytes_sent_ += num_bytes;
    VLOG(2) << "Wrote " << num_bytes << " bytes to WebSocket (text)";
  } else {
    LOG(ERROR) << "Failed to write to WebSocket data pipe: " << result;
  }
}

void BlockedBackendConnector::WriteBinaryToDataPipe(
    const std::vector<uint8_t>& data) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!writable_pipe_.is_valid() || !websocket_.is_bound()) {
    VLOG(1) << "Cannot write: WebSocket not connected";
    return;
  }

  // Notify WebSocket about the outgoing BINARY frame
  websocket_->SendMessage(network::mojom::WebSocketMessageType::BINARY,
                          data.size());

  // Write binary data to the pipe
  size_t num_bytes = data.size();
  MojoResult result = writable_pipe_->WriteData(
      base::span<const uint8_t>(data), MOJO_WRITE_DATA_FLAG_NONE, num_bytes);

  if (result == MOJO_RESULT_OK) {
    bytes_sent_ += num_bytes;
    VLOG(2) << "Wrote " << num_bytes << " bytes to WebSocket (binary)";
  } else {
    LOG(ERROR) << "Failed to write binary to WebSocket data pipe: " << result;
  }
}

bool BlockedBackendConnector::SendBinaryMessage(
    const std::vector<uint8_t>& data) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != ConnectionState::CONNECTED) {
    VLOG(1) << "Cannot send binary message: not connected";
    return false;
  }

  WriteBinaryToDataPipe(data);
  return true;
}

bool BlockedBackendConnector::SendProtobufMessage(
    const proto::BlockedMessage& message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  std::vector<uint8_t> serialized = SerializeProtobuf(message);
  if (serialized.empty()) {
    LOG(ERROR) << "Failed to serialize protobuf message";
    return false;
  }

  if (state_ != ConnectionState::CONNECTED) {
    // Queue as string for compatibility with pending_messages_
    // In a more complete implementation, we'd have a binary queue
    if (state_ == ConnectionState::CONNECTING ||
        state_ == ConnectionState::RECONNECTING) {
      if (pending_messages_.size() < kMaxPendingMessages) {
        std::string serialized_str(serialized.begin(), serialized.end());
        pending_messages_.push_back(std::move(serialized_str));
        VLOG(2) << "Protobuf message queued: " << serialized.size() << " bytes";
        return true;
      } else {
        VLOG(1) << "Pending message queue full, dropping protobuf message";
        return false;
      }
    }
    VLOG(1) << "Cannot send protobuf message: not connected";
    return false;
  }

  WriteBinaryToDataPipe(serialized);
  VLOG(2) << "Sent protobuf message: " << serialized.size() << " bytes";
  return true;
}

std::vector<uint8_t> BlockedBackendConnector::SerializeProtobuf(
    const proto::BlockedMessage& message) {
  std::vector<uint8_t> buffer(message.ByteSizeLong());
  if (!message.SerializeToArray(buffer.data(), buffer.size())) {
    return {};
  }
  return buffer;
}

}  // namespace blocked
