// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_IPC_GAZE_DATA_SENDER_H_
#define CONTENT_RENDERER_BLOCKED_IPC_GAZE_DATA_SENDER_H_

#include <string>

#include "base/memory/weak_ptr.h"
#include "base/time/time.h"

namespace content {

// Sends gaze tracking data to browser process via Mojo IPC.
// Singleton class for sending eye tracking events.
class GazeDataSender {
 public:
  static GazeDataSender* GetInstance();

  GazeDataSender(const GazeDataSender&) = delete;
  GazeDataSender& operator=(const GazeDataSender&) = delete;

  // Send gaze coordinate to browser.
  void SendGaze(float x,
                float y,
                float confidence,
                bool is_off_screen,
                const std::string& off_screen_direction,
                base::TimeTicks timestamp);

  // Batch send multiple gaze points (more efficient).
  void SendGazeBatch(const void* gaze_data, int count);

  // Get statistics.
  int GetTotalGazesSent() const { return total_sent_; }

 private:
  GazeDataSender();
  ~GazeDataSender();

  void SendToMojo(float x, float y, float confidence, bool is_off_screen,
                  const std::string& direction, int64_t timestamp_us);

  int total_sent_ = 0;

  base::WeakPtrFactory<GazeDataSender> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_IPC_GAZE_DATA_SENDER_H_
