// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_IPC_VIDEO_FRAME_SENDER_H_
#define CONTENT_RENDERER_BLOCKED_IPC_VIDEO_FRAME_SENDER_H_

#include <cstdint>

#include "base/memory/weak_ptr.h"

namespace content {

// Sends video frames to browser process via Mojo IPC.
// Singleton class for efficient frame transmission.
class VideoFrameSender {
 public:
  static VideoFrameSender* GetInstance();

  VideoFrameSender(const VideoFrameSender&) = delete;
  VideoFrameSender& operator=(const VideoFrameSender&) = delete;

  // Send video frame to browser.
  void SendFrame(const uint8_t* frame_data,
                 int size,
                 int width,
                 int height);

  // Send encoded frame (H.264).
  void SendEncodedFrame(const uint8_t* encoded_data,
                         int size,
                         int64_t timestamp_us);

  // Get statistics.
  int GetTotalFramesSent() const { return total_sent_; }
  int64_t GetTotalBytesSent() const { return total_bytes_; }

 private:
  VideoFrameSender();
  ~VideoFrameSender();

  void SendToMojo(const uint8_t* data, int size, int width, int height);

  int total_sent_ = 0;
  int64_t total_bytes_ = 0;

  base::WeakPtrFactory<VideoFrameSender> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_IPC_VIDEO_FRAME_SENDER_H_
