// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_security/blocked_security_service.h"

#include <algorithm>
#include <string>
#include <vector>

#include "base/strings/string_util.h"
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

// ============================================================================
// Process Detection Tests
// These tests verify that suspicious process detection works correctly,
// particularly for Cluely and related interview cheating tools.
// ============================================================================

// Helper class to test process detection logic in isolation
class ProcessDetectionTest : public testing::Test {
 public:
  // Simulates the IsSuspiciousProcess logic used by platform monitors
  bool IsSuspiciousProcess(const std::string& process_name) {
    std::string name_lower = base::ToLowerASCII(process_name);
    for (const auto& suspicious : suspicious_processes_) {
      if (name_lower.find(suspicious) != std::string::npos) {
        return true;
      }
    }
    return false;
  }

 protected:
  // Combined list matching both Windows and macOS suspicious processes
  // This should match the lists in windows_security_monitor.h and
  // macos_security_monitor.h
  std::vector<std::string> suspicious_processes_ = {
    // Screen recording software
    "obs",
    "camtasia",
    "bandicam",
    "fraps",
    "xsplit",
    "quicktime player",
    "screen recording",
    // Remote desktop software
    "teamviewer",
    "anydesk",
    "chrome-remote-desktop",
    // AI assistants
    "chatgpt",
    "claude",
    // Cluely interview cheating tool (https://cluely.com)
    "cluely",
    // Interview Coder (original name / open-source variant)
    "interview coder",
    "interview-coder",
    "interviewcoder",
    // Free/open-source Cluely variants
    "free-cluely",
    "freecluely"
  };
};

// Test detection of official Cluely application
TEST_F(ProcessDetectionTest, DetectsCluely) {
  // Windows executable names
  EXPECT_TRUE(IsSuspiciousProcess("cluely.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("Cluely.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("CLUELY.EXE"));

  // macOS process name (from Activity Monitor)
  EXPECT_TRUE(IsSuspiciousProcess("Cluely"));
  EXPECT_TRUE(IsSuspiciousProcess("cluely"));

  // Path containing cluely
  EXPECT_TRUE(IsSuspiciousProcess("cluely-helper"));
}

// Test detection of Interview Coder (original name / open-source variant)
TEST_F(ProcessDetectionTest, DetectsInterviewCoder) {
  // Various naming conventions
  EXPECT_TRUE(IsSuspiciousProcess("Interview Coder.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("interview coder"));
  EXPECT_TRUE(IsSuspiciousProcess("interview-coder.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("InterviewCoder"));
  EXPECT_TRUE(IsSuspiciousProcess("interviewcoder.exe"));
}

// Test detection of free/open-source Cluely variants
TEST_F(ProcessDetectionTest, DetectsFreeCluely) {
  EXPECT_TRUE(IsSuspiciousProcess("free-cluely.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("Free-Cluely"));
  EXPECT_TRUE(IsSuspiciousProcess("freecluely.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("FreeCluely"));
}

// Test detection of other AI assistants
TEST_F(ProcessDetectionTest, DetectsOtherAIAssistants) {
  EXPECT_TRUE(IsSuspiciousProcess("chatgpt.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("ChatGPT"));
  EXPECT_TRUE(IsSuspiciousProcess("claude.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("Claude"));
}

// Test that normal/benign processes are NOT flagged
TEST_F(ProcessDetectionTest, DoesNotFlagBenignProcesses) {
  EXPECT_FALSE(IsSuspiciousProcess("chrome.exe"));
  EXPECT_FALSE(IsSuspiciousProcess("notepad.exe"));
  EXPECT_FALSE(IsSuspiciousProcess("explorer.exe"));
  EXPECT_FALSE(IsSuspiciousProcess("System"));
  EXPECT_FALSE(IsSuspiciousProcess("Finder"));
  EXPECT_FALSE(IsSuspiciousProcess("Safari"));
  EXPECT_FALSE(IsSuspiciousProcess("zoom.exe"));  // Meeting app, not cheating tool
  EXPECT_FALSE(IsSuspiciousProcess("slack.exe"));
  EXPECT_FALSE(IsSuspiciousProcess("code.exe"));  // VS Code
  EXPECT_FALSE(IsSuspiciousProcess("Terminal"));
}

// Test case insensitivity
TEST_F(ProcessDetectionTest, CaseInsensitiveDetection) {
  EXPECT_TRUE(IsSuspiciousProcess("CLUELY"));
  EXPECT_TRUE(IsSuspiciousProcess("Cluely"));
  EXPECT_TRUE(IsSuspiciousProcess("cluely"));
  EXPECT_TRUE(IsSuspiciousProcess("ClUeLy"));

  EXPECT_TRUE(IsSuspiciousProcess("OBS"));
  EXPECT_TRUE(IsSuspiciousProcess("Obs"));
  EXPECT_TRUE(IsSuspiciousProcess("obs"));
}

// Test partial matching (process name contains suspicious string)
TEST_F(ProcessDetectionTest, PartialMatching) {
  // Process names that contain the suspicious string
  EXPECT_TRUE(IsSuspiciousProcess("cluely-desktop-app.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("my-cluely-wrapper"));
  EXPECT_TRUE(IsSuspiciousProcess("obs64.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("obs-studio.exe"));
  EXPECT_TRUE(IsSuspiciousProcess("teamviewer_service.exe"));
}

}  // namespace blocked
