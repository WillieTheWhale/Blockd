// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_IPC_GAZE_DATA_SENDER_H_
#define CONTENT_RENDERER_BLOCKED_IPC_GAZE_DATA_SENDER_H_

#include <string>
#include <vector>

#include "base/memory/weak_ptr.h"
#include "base/time/time.h"
#include "content/common/blocked/mojom/eye_tracking.mojom.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace content {

// Gaze data point for buffering.
struct GazeDataPoint {
  float x;
  float y;
  float confidence;
  bool is_off_screen;
  std::string off_screen_direction;
  base::TimeTicks timestamp;
};

// Sends gaze tracking data to browser process via Mojo IPC.
// Singleton class for sending eye tracking events.
class GazeDataSender {
 public:
  static GazeDataSender* GetInstance();

  GazeDataSender(const GazeDataSender&) = delete;
  GazeDataSender& operator=(const GazeDataSender&) = delete;

  // Initialize Mojo connection to browser.
  void Initialize(mojo::PendingRemote<blocked::mojom::EyeTrackingHost> host);

  // Check if connected to browser.
  bool IsConnected() const { return host_.is_bound(); }

  // Send gaze coordinate to browser.
  void SendGaze(float x,
                float y,
                float confidence,
                bool is_off_screen,
                const std::string& off_screen_direction,
                base::TimeTicks timestamp);

  // Batch send multiple gaze points (more efficient).
  void SendGazeBatch(const std::vector<GazeDataPoint>& gaze_points);

  // Flush pending gaze data to browser.
  void FlushBuffer();

  // Report error to browser.
  void ReportError(const std::string& error_message);

  // Get statistics.
  int GetTotalGazesSent() const { return total_sent_; }
  int GetBufferedCount() const { return static_cast<int>(gaze_buffer_.size()); }

 private:
  GazeDataSender();
  ~GazeDataSender();

  void BufferGazeData(const GazeDataPoint& point);
  void SendBufferedData();
  blocked::mojom::GazeDataPtr CreateMojoGazeData(const GazeDataPoint& point);

  mojo::Remote<blocked::mojom::EyeTrackingHost> host_;

  // Buffer for batching gaze data (more efficient IPC).
  std::vector<GazeDataPoint> gaze_buffer_;
  static constexpr size_t kMaxBufferSize = 30;  // 1 second at 30 FPS

  int total_sent_ = 0;

  base::WeakPtrFactory<GazeDataSender> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_IPC_GAZE_DATA_SENDER_H_
