// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_IPC_VIDEO_FRAME_SENDER_H_
#define CONTENT_RENDERER_BLOCKED_IPC_VIDEO_FRAME_SENDER_H_

#include <cstdint>
#include <queue>

#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/time/time.h"
#include "content/common/blocked/mojom/video_capture.mojom.h"

namespace content {

// Sends video frames to browser process via Mojo IPC.
// Singleton class for efficient frame transmission.
class VideoFrameSender {
 public:
  struct PendingFrame {
    std::vector<uint8_t> data;
    blocked::mojom::VideoFrameMetadataPtr metadata;
    base::TimeTicks queued_at;
  };

  static VideoFrameSender* GetInstance();

  VideoFrameSender(const VideoFrameSender&) = delete;
  VideoFrameSender& operator=(const VideoFrameSender&) = delete;

  // Initialize with video capture host.
  void Initialize(blocked::mojom::VideoCaptureHost* host);

  // Check if initialized.
  bool IsInitialized() const { return video_capture_host_ != nullptr; }

  // Send video frame to browser.
  void SendFrame(const uint8_t* frame_data,
                 int size,
                 int width,
                 int height);

  // Send video frame with full metadata.
  void SendFrame(const uint8_t* frame_data,
                 int size,
                 blocked::mojom::VideoFrameMetadataPtr metadata);

  // Send encoded frame (H.264).
  void SendEncodedFrame(const uint8_t* encoded_data,
                        int size,
                        int64_t timestamp_us);

  // Notify capture started/stopped.
  void NotifyCaptureStarted(int width, int height, int frame_rate);
  void NotifyCaptureStopped();
  void NotifyCaptureError(const std::string& error_message);

  // Get statistics.
  int GetTotalFramesSent() const { return total_sent_; }
  int64_t GetTotalBytesSent() const { return total_bytes_; }
  int GetDroppedFrames() const { return dropped_frames_; }
  int GetPendingFrames() const { return static_cast<int>(pending_frames_.size()); }

  // Configuration.
  void SetMaxPendingFrames(size_t max) { max_pending_frames_ = max; }

 private:
  VideoFrameSender();
  ~VideoFrameSender();

  void SendToMojo(const uint8_t* data, int size, int width, int height);
  void ProcessPendingFrames();
  void DropOldestFrame();

  blocked::mojom::VideoCaptureHost* video_capture_host_ = nullptr;

  // Frame queue for when host is temporarily unavailable.
  std::queue<PendingFrame> pending_frames_;
  size_t max_pending_frames_ = 30;  // ~1 second at 30fps

  // Statistics.
  int total_sent_ = 0;
  int64_t total_bytes_ = 0;
  int dropped_frames_ = 0;
  int64_t frame_number_ = 0;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<VideoFrameSender> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_IPC_VIDEO_FRAME_SENDER_H_
