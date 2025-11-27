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

void GazeDataSender::SendGaze(float x,
                                float y,
                                float confidence,
                                bool is_off_screen,
                                const std::string& off_screen_direction,
                                base::TimeTicks timestamp) {
  int64_t timestamp_us = timestamp.since_origin().InMicroseconds();

  SendToMojo(x, y, confidence, is_off_screen, off_screen_direction,
             timestamp_us);

  total_sent_++;
}

void GazeDataSender::SendGazeBatch(const void* gaze_data, int count) {
  // Send batch of gaze points for efficiency.
  // In production, this would serialize all points and send via Mojo.

  LOG(INFO) << "Sending batch of " << count << " gaze points";
  total_sent_ += count;
}

void GazeDataSender::SendToMojo(float x,
                                 float y,
                                 float confidence,
                                 bool is_off_screen,
                                 const std::string& direction,
                                 int64_t timestamp_us) {
  // Send gaze data via Mojo IPC to browser process.
  // Browser process will forward to backend via WebSocket.

  // In production, this would call:
  // blocked_session_host_->OnGazeUpdate(x, y, confidence, is_off_screen,
  //                                      direction, timestamp_us);

  // For now, just log.
  VLOG(2) << "Gaze: (" << x << ", " << y << ") conf=" << confidence
          << " off_screen=" << is_off_screen;
}

}  // namespace content
