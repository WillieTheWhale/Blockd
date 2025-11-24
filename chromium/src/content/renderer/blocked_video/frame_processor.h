// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_VIDEO_FRAME_PROCESSOR_H_
#define CONTENT_RENDERER_BLOCKED_VIDEO_FRAME_PROCESSOR_H_

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/time/time.h"

namespace content {

// Processes video frames and invokes callback at specified frame rate.
class FrameProcessor {
 public:
  using FrameCallback = base::RepeatingCallback<void(const void* data, int size)>;

  FrameProcessor();
  ~FrameProcessor();

  FrameProcessor(const FrameProcessor&) = delete;
  FrameProcessor& operator=(const FrameProcessor&) = delete;

  // Start processing frames at specified FPS.
  void Start(int frame_rate, FrameCallback callback);

  // Stop processing frames.
  void Stop();

  // Check if processing is active.
  bool IsProcessing() const { return is_processing_; }

 private:
  void ProcessNextFrame();
  void CaptureFrame();

  bool is_processing_ = false;
  int frame_rate_ = 30;
  FrameCallback frame_callback_;

  base::TimeTicks last_frame_time_;

  base::WeakPtrFactory<FrameProcessor> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_VIDEO_FRAME_PROCESSOR_H_
