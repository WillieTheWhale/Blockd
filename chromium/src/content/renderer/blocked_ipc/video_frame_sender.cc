// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_ipc/video_frame_sender.h"

#include "base/logging.h"
#include "base/no_destructor.h"

namespace content {

// static
VideoFrameSender* VideoFrameSender::GetInstance() {
  static base::NoDestructor<VideoFrameSender> instance;
  return instance.get();
}

VideoFrameSender::VideoFrameSender() = default;

VideoFrameSender::~VideoFrameSender() = default;

void VideoFrameSender::SendFrame(const uint8_t* frame_data,
                                   int size,
                                   int width,
                                   int height) {
  if (!frame_data || size <= 0) {
    LOG(ERROR) << "Invalid frame data";
    return;
  }

  SendToMojo(frame_data, size, width, height);

  total_sent_++;
  total_bytes_ += size;
}

void VideoFrameSender::SendEncodedFrame(const uint8_t* encoded_data,
                                         int size,
                                         int64_t timestamp_us) {
  if (!encoded_data || size <= 0) {
    LOG(ERROR) << "Invalid encoded frame data";
    return;
  }

  // Send encoded frame via Mojo.
  // In production: blocked_video_host_->OnEncodedFrame(data, size, timestamp);

  VLOG(2) << "Sending encoded frame: " << size << " bytes @ " << timestamp_us;

  total_sent_++;
  total_bytes_ += size;
}

void VideoFrameSender::SendToMojo(const uint8_t* data,
                                   int size,
                                   int width,
                                   int height) {
  // Send video frame via Mojo IPC to browser process.
  // Browser process will forward to backend via WebSocket.

  // In production, this would call:
  // blocked_video_host_->OnVideoFrame(mojo_base::BigBuffer(data, size),
  //                                    width, height, timestamp);

  // For now, just log frame receipt.
  VLOG(2) << "Video frame: " << width << "x" << height
          << " (" << size << " bytes)";
}

}  // namespace content
