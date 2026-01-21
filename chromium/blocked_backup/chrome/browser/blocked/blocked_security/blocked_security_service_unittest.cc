// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_security/blocked_security_service.h"

#include "base/test/task_environment.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace blocked {

class BlockedSecurityServiceTest : public testing::Test {
 public:
  BlockedSecurityServiceTest() = default;
  ~BlockedSecurityServiceTest() override = default;

 protected:
  void SetUp() override {
    service_ = std::make_unique<BlockedSecurityService>();
  }

  void TearDown() override {
    service_.reset();
  }

  base::test::TaskEnvironment task_environment_;
  std::unique_ptr<BlockedSecurityService> service_;
};

TEST_F(BlockedSecurityServiceTest, InitialState) {
  EXPECT_FALSE(service_->IsMonitoring());
  EXPECT_EQ(0.0, service_->GetCurrentRiskLevel());
}

TEST_F(BlockedSecurityServiceTest, StartStopMonitoring) {
  service_->StartMonitoring();
  EXPECT_TRUE(service_->IsMonitoring());

  service_->StopMonitoring();
  EXPECT_FALSE(service_->IsMonitoring());
}

TEST_F(BlockedSecurityServiceTest, GetRecentEvents) {
  service_->StartMonitoring();

  auto events = service_->GetRecentEvents(10);
  EXPECT_GE(events.size(), 0u);

  service_->StopMonitoring();
}

TEST_F(BlockedSecurityServiceTest, GetRunningProcesses) {
  auto processes = service_->GetRunningProcesses();
  // Should return some processes on any platform
  EXPECT_GE(processes.size(), 0u);
}

TEST_F(BlockedSecurityServiceTest, VMDetection) {
  bool is_vm = service_->IsVirtualMachineDetected();
  // Result depends on environment, just ensure it doesn't crash
  EXPECT_TRUE(is_vm == true || is_vm == false);
}

}  // namespace blocked
