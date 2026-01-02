// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_TELEMETRY_BLOCKED_TELEMETRY_SERVICE_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_TELEMETRY_BLOCKED_TELEMETRY_SERVICE_H_

#include <memory>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/time/time.h"
#include "base/timer/timer.h"
#include "components/keyed_service/core/keyed_service.h"

namespace blocked {

struct TelemetryData {
  base::Time timestamp;
  double cpu_percent;
  int64_t memory_mb;
  int active_processes;
  bool window_focused;

  TelemetryData();
  ~TelemetryData();
};

class BlockedTelemetryService : public KeyedService {
 public:
  BlockedTelemetryService();
  ~BlockedTelemetryService() override;

  void Shutdown() override;

  void StartCollection();
  void StopCollection();
  bool IsCollecting() const { return is_collecting_; }

  std::vector<TelemetryData> GetRecentData(size_t max_count) const;

 private:
  void CollectTelemetry();
  double GetCPUUsage();
  int64_t GetMemoryUsage();
  int GetActiveProcessCount();
  bool IsWindowFocused();

  bool is_collecting_ = false;
  base::RepeatingTimer collection_timer_;
  std::vector<TelemetryData> recent_data_;
  size_t max_recent_data_ = 1000;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<BlockedTelemetryService> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_TELEMETRY_BLOCKED_TELEMETRY_SERVICE_H_
