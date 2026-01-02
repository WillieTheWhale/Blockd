// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/blocked_telemetry/blocked_telemetry_service.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/process/process_metrics.h"
#include "base/system/sys_info.h"

namespace blocked {

namespace {
constexpr base::TimeDelta kCollectionInterval = base::Seconds(5);
}

TelemetryData::TelemetryData() = default;
TelemetryData::~TelemetryData() = default;

BlockedTelemetryService::BlockedTelemetryService() {
  LOG(INFO) << "Telemetry service initialized";
}

BlockedTelemetryService::~BlockedTelemetryService() {
  StopCollection();
}

void BlockedTelemetryService::Shutdown() {
  StopCollection();
}

void BlockedTelemetryService::StartCollection() {
  if (is_collecting_)
    return;

  LOG(INFO) << "Starting telemetry collection";
  is_collecting_ = true;

  CollectTelemetry();
  collection_timer_.Start(FROM_HERE, kCollectionInterval,
                          base::BindRepeating(
                              &BlockedTelemetryService::CollectTelemetry,
                              weak_factory_.GetWeakPtr()));
}

void BlockedTelemetryService::StopCollection() {
  if (!is_collecting_)
    return;

  LOG(INFO) << "Stopping telemetry collection";
  is_collecting_ = false;
  collection_timer_.Stop();
}

std::vector<TelemetryData> BlockedTelemetryService::GetRecentData(
    size_t max_count) const {
  if (max_count >= recent_data_.size())
    return recent_data_;

  return std::vector<TelemetryData>(recent_data_.end() - max_count,
                                    recent_data_.end());
}

void BlockedTelemetryService::CollectTelemetry() {
  TelemetryData data;
  data.timestamp = base::Time::Now();
  data.cpu_percent = GetCPUUsage();
  data.memory_mb = GetMemoryUsage();
  data.active_processes = GetActiveProcessCount();
  data.window_focused = IsWindowFocused();

  recent_data_.push_back(data);
  if (recent_data_.size() > max_recent_data_) {
    recent_data_.erase(recent_data_.begin());
  }

  VLOG(2) << "Telemetry: CPU=" << data.cpu_percent << "% Memory="
          << data.memory_mb << "MB Processes=" << data.active_processes;
}

double BlockedTelemetryService::GetCPUUsage() {
  std::unique_ptr<base::ProcessMetrics> metrics(
      base::ProcessMetrics::CreateCurrentProcessMetrics());
  return metrics->GetPlatformIndependentCPUUsage();
}

int64_t BlockedTelemetryService::GetMemoryUsage() {
  std::unique_ptr<base::ProcessMetrics> metrics(
      base::ProcessMetrics::CreateCurrentProcessMetrics());
  return metrics->GetWorkingSetSize() / (1024 * 1024);  // Convert to MB
}

int BlockedTelemetryService::GetActiveProcessCount() {
  // Platform-specific implementation would go here
  return 0;  // Placeholder
}

bool BlockedTelemetryService::IsWindowFocused() {
  // Platform-specific implementation would go here
  return true;  // Placeholder
}

}  // namespace blocked
