// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_security/blocked_security_service.h"

#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/logging.h"
#include "base/metrics/histogram_functions.h"
#include "base/task/sequenced_task_runner.h"
#include "base/values.h"

#if defined(OS_WIN)
#include "chrome/browser/blocked/blocked_security/platform/windows/windows_security_monitor.h"
#elif defined(OS_MAC)
#include "chrome/browser/blocked/blocked_security/platform/macos/macos_security_monitor.h"
#elif defined(OS_LINUX)
#include "chrome/browser/blocked/blocked_security/platform/linux/linux_security_monitor.h"
#endif

namespace blocked {

namespace {

// Monitoring interval (5 seconds)
constexpr base::TimeDelta kMonitoringInterval = base::Seconds(5);

// Risk level decay rate (per check)
constexpr double kRiskDecayRate = 0.05;

// Risk level increases by severity
constexpr double kRiskLevelLow = 0.1;
constexpr double kRiskLevelMedium = 0.3;
constexpr double kRiskLevelHigh = 0.5;
constexpr double kRiskLevelCritical = 0.8;

}  // namespace

// SecurityEvent implementation
SecurityEvent::SecurityEvent() = default;

SecurityEvent::SecurityEvent(SecurityEventType type,
                             SecurityEventSeverity severity,
                             const std::string& description,
                             const std::string& metadata)
    : type(type),
      severity(severity),
      timestamp(base::Time::Now()),
      description(description),
      metadata(metadata) {}

SecurityEvent::~SecurityEvent() = default;

// ProcessInfo implementation
ProcessInfo::ProcessInfo() = default;

ProcessInfo::ProcessInfo(const std::string& name,
                         const std::string& path,
                         int pid,
                         bool is_suspicious)
    : name(name), path(path), pid(pid), is_suspicious(is_suspicious) {}

ProcessInfo::~ProcessInfo() = default;

// BlockedSecurityService::PlatformMonitor (platform-specific interface)
class BlockedSecurityService::PlatformMonitor {
 public:
  virtual ~PlatformMonitor() = default;

  virtual std::vector<ProcessInfo> GetRunningProcesses() = 0;
  virtual bool IsVirtualMachineDetected() = 0;
  virtual bool IsScreenRecordingActive() = 0;
  virtual std::string GetFocusedWindowTitle() = 0;
  virtual void StartClipboardMonitoring() = 0;
  virtual void StopClipboardMonitoring() = 0;
};

// BlockedSecurityService implementation
BlockedSecurityService::BlockedSecurityService() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

#if defined(OS_WIN)
  platform_monitor_ = std::make_unique<WindowsSecurityMonitor>();
  LOG(INFO) << "Blocked security service initialized (Windows platform)";
#elif defined(OS_MAC)
  platform_monitor_ = std::make_unique<MacSecurityMonitor>();
  LOG(INFO) << "Blocked security service initialized (macOS platform)";
#elif defined(OS_LINUX)
  platform_monitor_ = std::make_unique<LinuxSecurityMonitor>();
  LOG(INFO) << "Blocked security service initialized (Linux platform)";
#else
#error "Unsupported platform"
#endif
}

BlockedSecurityService::~BlockedSecurityService() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  StopMonitoring();
}

void BlockedSecurityService::Shutdown() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  StopMonitoring();
}

void BlockedSecurityService::StartMonitoring() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (is_monitoring_) {
    LOG(WARNING) << "Security monitoring already started";
    return;
  }

  LOG(INFO) << "Starting security monitoring";

  is_monitoring_ = true;

  // Start clipboard monitoring
  if (platform_monitor_) {
    platform_monitor_->StartClipboardMonitoring();
  }

  // Perform initial security check
  PerformSecurityCheck();

  // Start periodic monitoring
  monitoring_timer_.Start(FROM_HERE, kMonitoringInterval,
                          base::BindRepeating(
                              &BlockedSecurityService::PerformSecurityCheck,
                              weak_factory_.GetWeakPtr()));

  // Notify observers
  for (auto& observer : observers_) {
    observer.OnMonitoringStateChanged(true);
  }

  // Record metric
  base::UmaHistogramBoolean("Blocked.Security.MonitoringStarted", true);
}

void BlockedSecurityService::StopMonitoring() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_monitoring_) {
    return;
  }

  LOG(INFO) << "Stopping security monitoring";

  is_monitoring_ = false;
  monitoring_timer_.Stop();

  // Stop clipboard monitoring
  if (platform_monitor_) {
    platform_monitor_->StopClipboardMonitoring();
  }

  // Notify observers
  for (auto& observer : observers_) {
    observer.OnMonitoringStateChanged(false);
  }
}

void BlockedSecurityService::AddObserver(BlockedSecurityObserver* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  observers_.AddObserver(observer);
}

void BlockedSecurityService::RemoveObserver(BlockedSecurityObserver* observer) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  observers_.RemoveObserver(observer);
}

std::vector<SecurityEvent> BlockedSecurityService::GetRecentEvents(
    size_t max_count) const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (max_count >= recent_events_.size()) {
    return recent_events_;
  }

  // Return most recent events
  return std::vector<SecurityEvent>(
      recent_events_.end() - max_count,
      recent_events_.end());
}

double BlockedSecurityService::GetCurrentRiskLevel() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return current_risk_level_;
}

std::vector<ProcessInfo> BlockedSecurityService::GetRunningProcesses() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!platform_monitor_) {
    return std::vector<ProcessInfo>();
  }

  return platform_monitor_->GetRunningProcesses();
}

bool BlockedSecurityService::IsVirtualMachineDetected() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!platform_monitor_) {
    return false;
  }

  return platform_monitor_->IsVirtualMachineDetected();
}

bool BlockedSecurityService::IsScreenRecordingActive() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!platform_monitor_) {
    return false;
  }

  return platform_monitor_->IsScreenRecordingActive();
}

std::string BlockedSecurityService::GetFocusedWindowTitle() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!platform_monitor_) {
    return std::string();
  }

  return platform_monitor_->GetFocusedWindowTitle();
}

void BlockedSecurityService::PerformSecurityCheck() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!is_monitoring_) {
    return;
  }

  VLOG(2) << "Performing security check";

  CheckRunningProcesses();
  CheckWindowFocus();
  CheckClipboard();
  UpdateRiskLevel();
}

void BlockedSecurityService::CheckRunningProcesses() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  std::vector<ProcessInfo> processes = GetRunningProcesses();

  for (const auto& process : processes) {
    if (process.is_suspicious) {
      base::Value::Dict metadata;
      metadata.Set("process_name", process.name);
      metadata.Set("process_path", process.path);
      metadata.Set("process_pid", process.pid);

      std::string metadata_json;
      base::JSONWriter::Write(metadata, &metadata_json);

      SecurityEvent event(
          SecurityEventType::SUSPICIOUS_PROCESS_DETECTED,
          SecurityEventSeverity::HIGH,
          "Suspicious process detected: " + process.name,
          metadata_json);

      ReportSecurityEvent(event);
    }
  }

  // Check for virtual machine
  static bool vm_checked = false;
  if (!vm_checked) {
    vm_checked = true;
    if (IsVirtualMachineDetected()) {
      SecurityEvent event(
          SecurityEventType::VIRTUAL_MACHINE_DETECTED,
          SecurityEventSeverity::CRITICAL,
          "Virtual machine environment detected",
          "{}");

      ReportSecurityEvent(event);
    }
  }

  // Check for screen recording
  if (IsScreenRecordingActive()) {
    SecurityEvent event(
        SecurityEventType::SCREEN_RECORDING_DETECTED,
        SecurityEventSeverity::HIGH,
        "Screen recording software detected",
        "{}");

    ReportSecurityEvent(event);
  }
}

void BlockedSecurityService::CheckWindowFocus() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  std::string focused_window = GetFocusedWindowTitle();

  if (!focused_window.empty() && focused_window != last_focused_window_) {
    // Check if focus moved away from our browser
    if (focused_window.find("Blocked") == std::string::npos) {
      base::Value::Dict metadata;
      metadata.Set("focused_window", focused_window);
      metadata.Set("previous_window", last_focused_window_);

      std::string metadata_json;
      base::JSONWriter::Write(metadata, &metadata_json);

      SecurityEvent event(
          SecurityEventType::WINDOW_FOCUS_LOST,
          SecurityEventSeverity::MEDIUM,
          "Browser lost focus: " + focused_window,
          metadata_json);

      ReportSecurityEvent(event);
    }

    last_focused_window_ = focused_window;
  }
}

void BlockedSecurityService::CheckClipboard() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  // Clipboard monitoring is handled by platform-specific code
  // Events are reported via callbacks
}

void BlockedSecurityService::ReportSecurityEvent(const SecurityEvent& event) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(WARNING) << "Security event: " << event.description;

  // Add to recent events
  recent_events_.push_back(event);
  if (recent_events_.size() > max_recent_events_) {
    recent_events_.erase(recent_events_.begin());
  }

  // Update risk level
  double risk_increase = 0.0;
  switch (event.severity) {
    case SecurityEventSeverity::LOW:
      risk_increase = kRiskLevelLow;
      break;
    case SecurityEventSeverity::MEDIUM:
      risk_increase = kRiskLevelMedium;
      break;
    case SecurityEventSeverity::HIGH:
      risk_increase = kRiskLevelHigh;
      break;
    case SecurityEventSeverity::CRITICAL:
      risk_increase = kRiskLevelCritical;
      break;
  }

  current_risk_level_ = std::min(1.0, current_risk_level_ + risk_increase);

  // Notify observers
  for (auto& observer : observers_) {
    observer.OnSecurityEvent(event);
  }

  // Record metric
  base::UmaHistogramEnumeration("Blocked.Security.EventType",
                                static_cast<int>(event.type));
  base::UmaHistogramEnumeration("Blocked.Security.EventSeverity",
                                static_cast<int>(event.severity));
}

void BlockedSecurityService::UpdateRiskLevel() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  // Decay risk level over time
  current_risk_level_ = std::max(0.0, current_risk_level_ - kRiskDecayRate);

  // Record current risk level
  base::UmaHistogramPercentage("Blocked.Security.RiskLevel",
                               static_cast<int>(current_risk_level_ * 100));
}

}  // namespace blocked
