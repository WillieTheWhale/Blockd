// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_IPC_BLOCKED_BACKEND_CONNECTOR_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_IPC_BLOCKED_BACKEND_CONNECTOR_H_

#include <memory>
#include <string>
#include <vector>

#include "base/containers/circular_deque.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/observer_list.h"
#include "base/sequence_checker.h"
#include "base/timer/timer.h"
#include "chrome/browser/blocked/blocked_ipc/blocked_protocol.pb.h"
#include "components/keyed_service/core/keyed_service.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"
#include "net/base/io_buffer.h"
#include "net/traffic_annotation/network_traffic_annotation.h"
#include "services/network/public/mojom/network_context.mojom.h"
#include "services/network/public/mojom/websocket.mojom.h"
#include "url/gurl.h"

namespace blocked {

// WebSocket client for backend communication.
// Implements actual WebSocket connection using Chromium's network service.
class BlockedBackendConnector : public KeyedService,
                                 public network::mojom::WebSocketHandshakeClient,
                                 public network::mojom::WebSocketClient {
 public:
  enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    ERROR
  };

  class Observer : public base::CheckedObserver {
   public:
    virtual void OnConnectionStateChanged(ConnectionState state) = 0;
    virtual void OnMessageReceived(const std::string& message) = 0;
  };

  // Constructs a connector with the backend WebSocket URL and network context.
  // The network_context must outlive this object and is used to create the
  // WebSocket connection.
  BlockedBackendConnector(
      const std::string& backend_url,
      network::mojom::NetworkContext* network_context);
  ~BlockedBackendConnector() override;

  // KeyedService implementation
  void Shutdown() override;

  // Connection management
  void Connect(const std::string& session_token);
  void Disconnect();
  void Reconnect();
  ConnectionState GetState() const { return state_; }
  bool IsConnected() const { return state_ == ConnectionState::CONNECTED; }

  // Message sending - returns false if not connected or send fails
  bool SendSecurityEvent(const std::string& event_type,
                         const std::string& severity,
                         const std::string& description,
                         const std::string& metadata);
  bool SendGazeData(const std::vector<float>& gaze_points);
  bool SendTelemetry(double cpu_percent, int64_t memory_mb, int active_processes);
  bool SendAudioData(const std::vector<uint8_t>& audio_data,
                     const std::string& session_id,
                     int source_type);

  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

  // Statistics
  int64_t GetBytesSent() const { return bytes_sent_; }
  int64_t GetBytesReceived() const { return bytes_received_; }
  int GetReconnectAttempts() const { return reconnect_attempts_; }

 private:
  // network::mojom::WebSocketHandshakeClient implementation
  void OnOpeningHandshakeStarted(
      network::mojom::WebSocketHandshakeRequestPtr request) override;
  void OnFailure(const std::string& message,
                 int net_error,
                 int response_code) override;
  void OnConnectionEstablished(
      mojo::PendingRemote<network::mojom::WebSocket> socket,
      mojo::PendingReceiver<network::mojom::WebSocketClient> client_receiver,
      network::mojom::WebSocketHandshakeResponsePtr response,
      mojo::ScopedDataPipeConsumerHandle readable,
      mojo::ScopedDataPipeProducerHandle writable) override;

  // network::mojom::WebSocketClient implementation
  void OnDataFrame(bool fin,
                   network::mojom::WebSocketMessageType type,
                   uint64_t data_length) override;
  void OnDropChannel(bool was_clean,
                     uint16_t code,
                     const std::string& reason) override;
  void OnClosingHandshake() override;

  // Internal methods
  void InitiateConnection();
  bool SendMessage(const std::string& message);
  bool SendBinaryMessage(const std::vector<uint8_t>& data);
  void ProcessPendingMessages();
  void SendHeartbeat();
  void OnReconnectTimer();
  void NotifyObservers(ConnectionState state);
  void ReadFromDataPipe(MojoResult result,
                        const mojo::HandleSignalsState& state);
  void WriteToDataPipe(const std::string& message);
  void WriteBinaryToDataPipe(const std::vector<uint8_t>& data);

  // Protobuf serialization helpers
  bool SendProtobufMessage(const proto::BlockedMessage& message);
  std::vector<uint8_t> SerializeProtobuf(const proto::BlockedMessage& message);

  std::string backend_url_;
  std::string session_token_;
  std::string session_id_;
  ConnectionState state_ = ConnectionState::DISCONNECTED;

  // Network service interfaces
  raw_ptr<network::mojom::NetworkContext> network_context_;
  mojo::Remote<network::mojom::WebSocket> websocket_;
  mojo::Receiver<network::mojom::WebSocketHandshakeClient> handshake_receiver_{
      this};
  mojo::Receiver<network::mojom::WebSocketClient> client_receiver_{this};

  // Data pipe handles for reading/writing
  mojo::ScopedDataPipeConsumerHandle readable_pipe_;
  mojo::ScopedDataPipeProducerHandle writable_pipe_;
  std::unique_ptr<mojo::SimpleWatcher> read_watcher_;
  std::unique_ptr<mojo::SimpleWatcher> write_watcher_;

  // Message queue for when connection is pending (binary protobuf data).
  // Uses circular_deque for better cache locality and O(1) pop_front.
  // Buffer size handles high-frequency gaze data streaming at 30 FPS.
  // At 30 FPS for 5+ minutes of network interruption: 30 * 60 * 5 = 9,000 messages.
  // Note: std::string is used as a byte container (not text) for binary protobuf.
  base::circular_deque<std::string> pending_messages_;
  static constexpr size_t kMaxPendingMessages = 10000;

  // Persistent read buffer to avoid allocations on every read.
  // 8KB covers most WebSocket frames with room for growth.
  scoped_refptr<net::IOBufferWithSize> read_buffer_;
  static constexpr size_t kReadBufferSize = 8192;

  // Reconnection logic
  base::OneShotTimer reconnect_timer_;
  int reconnect_attempts_ = 0;
  static constexpr int kMaxReconnectAttempts = 5;
  static constexpr base::TimeDelta kInitialReconnectDelay = base::Seconds(1);
  static constexpr base::TimeDelta kMaxReconnectDelay = base::Seconds(30);

  // Heartbeat timer
  base::RepeatingTimer heartbeat_timer_;
  static constexpr base::TimeDelta kHeartbeatInterval = base::Seconds(30);

  // Statistics
  int64_t bytes_sent_ = 0;
  int64_t bytes_received_ = 0;

  // Incoming message buffer
  std::string incoming_message_;
  uint64_t expected_data_length_ = 0;

  base::ObserverList<Observer> observers_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<BlockedBackendConnector> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_IPC_BLOCKED_BACKEND_CONNECTOR_H_
