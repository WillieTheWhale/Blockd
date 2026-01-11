// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_ipc/gaze_data_sender.h"

#include "base/logging.h"
#include "base/no_destructor.h"

namespace content {

// static
GazeDataSender* GazeDataSender::GetInstance() {
  static base::NoDestructor<GazeDataSender> instance;
  return instance.get();
}

GazeDataSender::GazeDataSender() = default;

GazeDataSender::~GazeDataSender() = default;

void GazeDataSender::Initialize(
    mojo::PendingRemote<blocked::mojom::EyeTrackingHost> host) {
  host_.Bind(std::move(host));
  LOG(INFO) << "GazeDataSender initialized with Mojo connection";
}

void GazeDataSender::SendGaze(float x,
                               float y,
                               float confidence,
                               bool is_off_screen,
                               const std::string& off_screen_direction,
                               base::TimeTicks timestamp) {
  GazeDataPoint point;
  point.x = x;
  point.y = y;
  point.confidence = confidence;
  point.is_off_screen = is_off_screen;
  point.off_screen_direction = off_screen_direction;
  point.timestamp = timestamp;

  BufferGazeData(point);
}

void GazeDataSender::SendGazeBatch(
    const std::vector<GazeDataPoint>& gaze_points) {
  if (!host_.is_bound()) {
    LOG(WARNING) << "Cannot send gaze batch: Mojo not connected";
    return;
  }

  // Convert to mojom GazeData pointers for IPC.
  std::vector<blocked::mojom::GazeDataPtr> gazes;
  gazes.reserve(gaze_points.size());

  for (const auto& point : gaze_points) {
    auto gaze = blocked::mojom::GazeData::New();
    gaze->x = point.x;
    gaze->y = point.y;
    gaze->confidence = point.confidence;
    gaze->is_off_screen = point.is_off_screen;
    gaze->off_screen_direction = point.off_screen_direction;
    gaze->timestamp = point.timestamp;
    gazes.push_back(std::move(gaze));
  }

  host_->OnGazeBatch(std::move(gazes));
  total_sent_ += static_cast<int>(gaze_points.size());

  VLOG(1) << "Sent batch of " << gaze_points.size() << " gaze points";
}

void GazeDataSender::FlushBuffer() {
  if (gaze_buffer_.empty()) {
    return;
  }

  SendBufferedData();
}

void GazeDataSender::ReportError(const std::string& error_message) {
  if (!host_.is_bound()) {
    LOG(ERROR) << "Cannot report error: Mojo not connected. Error: "
               << error_message;
    return;
  }

  host_->OnEyeTrackingError(error_message);
  LOG(ERROR) << "Reported eye tracking error: " << error_message;
}

void GazeDataSender::BufferGazeData(const GazeDataPoint& point) {
  gaze_buffer_.push_back(point);

  // Send when buffer is full.
  if (gaze_buffer_.size() >= kMaxBufferSize) {
    SendBufferedData();
  }
}

void GazeDataSender::SendBufferedData() {
  if (gaze_buffer_.empty()) {
    return;
  }

  if (!host_.is_bound()) {
    // Not connected - log and discard.
    VLOG(2) << "Discarding " << gaze_buffer_.size()
            << " gaze points (not connected)";
    gaze_buffer_.clear();
    return;
  }

  // Send as batch for efficiency using mojom types.
  std::vector<blocked::mojom::GazeDataPtr> gazes;
  gazes.reserve(gaze_buffer_.size());

  for (const auto& point : gaze_buffer_) {
    auto gaze = blocked::mojom::GazeData::New();
    gaze->x = point.x;
    gaze->y = point.y;
    gaze->confidence = point.confidence;
    gaze->is_off_screen = point.is_off_screen;
    gaze->off_screen_direction = point.off_screen_direction;
    gaze->timestamp = point.timestamp;
    gazes.push_back(std::move(gaze));
  }

  host_->OnGazeBatch(std::move(gazes));
  total_sent_ += static_cast<int>(gaze_buffer_.size());

  VLOG(2) << "Sent buffered " << gaze_buffer_.size() << " gaze points";
  gaze_buffer_.clear();
}

}  // namespace content
