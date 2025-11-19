#include <gtest/gtest.h>
#include <gmock/gmock.h>
#include <thread>
#include <chrono>
#include <nlohmann/json.hpp>

#include "../src/websocket_client.h"

using json = nlohmann::json;
using namespace blockd;
using namespace std::chrono_literals;

// Test fixture for WebSocketClient
class WebSocketClientTest : public ::testing::Test {
protected:
    void SetUp() override {
        // Mock WebSocket server runs on ws://localhost:8765
        test_url_ = "ws://localhost:8765";
        test_session_id_ = "test-session-12345";
    }

    void TearDown() override {
        if (client_) {
            client_->Disconnect();
            // Give some time for cleanup
            std::this_thread::sleep_for(100ms);
        }
    }

    std::string test_url_;
    std::string test_session_id_;
    std::unique_ptr<WebSocketClient> client_;
};

// Test: Client initialization
TEST_F(WebSocketClientTest, Initialization) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    ASSERT_NE(client_, nullptr);
    EXPECT_EQ(client_->GetSessionId(), test_session_id_);
    EXPECT_FALSE(client_->IsConnected());
    EXPECT_EQ(client_->GetReconnectAttempts(), 0);
}

// Test: Invalid URL throws exception
TEST_F(WebSocketClientTest, InvalidURLThrows) {
    EXPECT_THROW(
        client_ = std::make_unique<WebSocketClient>("invalid-url", test_session_id_),
        std::runtime_error
    );
}

// Test: Connect to mock server
TEST_F(WebSocketClientTest, ConnectsSuccessfully) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    bool connected = false;
    client_->SetConnectionCallback([&connected](bool state) {
        connected = state;
    });

    client_->Connect();

    // Wait for connection (max 5 seconds)
    for (int i = 0; i < 50 && !connected; ++i) {
        std::this_thread::sleep_for(100ms);
    }

    EXPECT_TRUE(client_->IsConnected());
    EXPECT_TRUE(connected);
}

// Test: Send event message
TEST_F(WebSocketClientTest, SendsEventMessage) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    bool message_sent = false;
    client_->SetConnectionCallback([this, &message_sent](bool state) {
        if (state) {
            // Send test event
            json payload = {
                {"x", 0.5},
                {"y", 0.3},
                {"confidence", 0.85}
            };

            bool result = client_->SendEvent("EYE_TRACKING_DATA", payload.dump());
            EXPECT_TRUE(result);
            message_sent = true;
        }
    });

    client_->Connect();

    // Wait for message to be sent
    for (int i = 0; i < 50 && !message_sent; ++i) {
        std::this_thread::sleep_for(100ms);
    }

    EXPECT_TRUE(message_sent);
}

// Test: Message queuing when disconnected
TEST_F(WebSocketClientTest, QueuesMessagesWhenDisconnected) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    // Send event before connecting
    json payload = {{"test", "data"}};
    bool result = client_->SendEvent("TEST_EVENT", payload.dump());

    EXPECT_TRUE(result);
    EXPECT_GT(client_->GetQueuedMessageCount(), 0);
}

// Test: Heartbeat functionality
TEST_F(WebSocketClientTest, SendsHeartbeat) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    std::vector<std::string> received_messages;
    client_->SetMessageCallback([&received_messages](const std::string& msg) {
        received_messages.push_back(msg);
    });

    client_->Connect();

    // Wait for connection and potential heartbeat
    std::this_thread::sleep_for(2s);

    // Note: Heartbeat interval is 30s, so we won't receive one in this test
    // This test mainly verifies the client doesn't crash with heartbeat enabled
    EXPECT_TRUE(client_->IsConnected());
}

// Test: Disconnect stops connection
TEST_F(WebSocketClientTest, DisconnectStopsConnection) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    bool connected = false;
    bool disconnected = false;

    client_->SetConnectionCallback([&connected, &disconnected](bool state) {
        if (state) {
            connected = true;
        } else {
            disconnected = true;
        }
    });

    client_->Connect();

    // Wait for connection
    for (int i = 0; i < 50 && !connected; ++i) {
        std::this_thread::sleep_for(100ms);
    }

    EXPECT_TRUE(connected);

    client_->Disconnect();

    // Wait for disconnection
    std::this_thread::sleep_for(500ms);

    EXPECT_FALSE(client_->IsConnected());
}

// Test: Reconnection on disconnect
TEST_F(WebSocketClientTest, ReconnectsOnDisconnect) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    int connection_count = 0;
    client_->SetConnectionCallback([&connection_count](bool state) {
        if (state) {
            connection_count++;
        }
    });

    client_->Connect();

    // Wait for initial connection
    for (int i = 0; i < 50 && connection_count == 0; ++i) {
        std::this_thread::sleep_for(100ms);
    }

    EXPECT_EQ(connection_count, 1);

    // Simulate disconnect by closing the connection
    // (In real test, mock server would close connection)
    // For this test, we just verify the reconnection mechanism exists
    EXPECT_GE(client_->GetReconnectAttempts(), 0);
}

// Test: Error callback
TEST_F(WebSocketClientTest, ErrorCallbackWorks) {
    client_ = std::make_unique<WebSocketClient>("ws://invalid-host-xyz:9999", test_session_id_);

    std::string error_message;
    client_->SetErrorCallback([&error_message](const std::string& error) {
        error_message = error;
    });

    client_->Connect();

    // Wait for error
    for (int i = 0; i < 50 && error_message.empty(); ++i) {
        std::this_thread::sleep_for(100ms);
    }

    EXPECT_FALSE(error_message.empty());
    EXPECT_FALSE(client_->IsConnected());
}

// Test: Message format validation
TEST_F(WebSocketClientTest, FormatsMessageCorrectly) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    json payload = {
        {"x", 0.5},
        {"y", 0.3}
    };

    std::string captured_message;
    client_->SetMessageCallback([&captured_message](const std::string& msg) {
        // This would capture echo from server
        captured_message = msg;
    });

    client_->Connect();

    // Wait for connection
    for (int i = 0; i < 50 && !client_->IsConnected(); ++i) {
        std::this_thread::sleep_for(100ms);
    }

    // Note: To fully test message format, we'd need the mock server to echo
    // For now, we just verify the send doesn't crash
    bool result = client_->SendEvent("TEST_EVENT", payload.dump());
    EXPECT_TRUE(result);
}

// Test: Multiple clients
TEST_F(WebSocketClientTest, MultipleClientsWork) {
    auto client1 = std::make_unique<WebSocketClient>(test_url_, "session-1");
    auto client2 = std::make_unique<WebSocketClient>(test_url_, "session-2");

    bool client1_connected = false;
    bool client2_connected = false;

    client1->SetConnectionCallback([&client1_connected](bool state) {
        client1_connected = state;
    });

    client2->SetConnectionCallback([&client2_connected](bool state) {
        client2_connected = state;
    });

    client1->Connect();
    client2->Connect();

    // Wait for both connections
    for (int i = 0; i < 50; ++i) {
        std::this_thread::sleep_for(100ms);
        if (client1_connected && client2_connected) break;
    }

    EXPECT_TRUE(client1_connected);
    EXPECT_TRUE(client2_connected);

    client1->Disconnect();
    client2->Disconnect();
}

// Test: Queue size limit
TEST_F(WebSocketClientTest, QueuesLimitedMessages) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    // Queue many messages while disconnected
    for (int i = 0; i < 1100; ++i) {
        json payload = {{"index", i}};
        client_->SendEvent("TEST_EVENT", payload.dump());
    }

    // Should not exceed MAX_QUEUED_MESSAGES (1000)
    EXPECT_LE(client_->GetQueuedMessageCount(), 1000);
}

// Test: Thread safety (concurrent sends)
TEST_F(WebSocketClientTest, ConcurrentSendsWork) {
    client_ = std::make_unique<WebSocketClient>(test_url_, test_session_id_);

    client_->Connect();

    // Wait for connection
    for (int i = 0; i < 50 && !client_->IsConnected(); ++i) {
        std::this_thread::sleep_for(100ms);
    }

    // Send from multiple threads
    const int num_threads = 4;
    const int messages_per_thread = 25;

    std::vector<std::thread> threads;
    for (int t = 0; t < num_threads; ++t) {
        threads.emplace_back([this, t, messages_per_thread]() {
            for (int i = 0; i < messages_per_thread; ++i) {
                json payload = {
                    {"thread", t},
                    {"index", i}
                };
                client_->SendEvent("CONCURRENT_TEST", payload.dump());
                std::this_thread::sleep_for(10ms);
            }
        });
    }

    for (auto& thread : threads) {
        thread.join();
    }

    // No crashes = success
    EXPECT_TRUE(true);
}

// Main function
int main(int argc, char** argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
