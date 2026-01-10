// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_VIDEO_VIDEO_CAPTURER_H_
#define CONTENT_RENDERER_BLOCKED_VIDEO_VIDEO_CAPTURER_H_

#include <memory>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/time/time.h"
#include "media/base/video_frame.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream.h"

namespace content {

class FrameProcessor;
class MediaStreamVideoSinkImpl;

// Captures video frames from webcam and sends to browser process.
// Manages video stream lifecycle and frame processing.
class VideoCapturer {
 public:
  enum class State {
    kIdle,
    kInitializing,
    kCapturing,
    kStopped,
    kError
  };

  struct VideoConstraints {
    int width = 640;
    int height = 480;
    int frame_rate = 30;
    std::string device_id;  // Empty = default device
  };

  VideoCapturer();
  ~VideoCapturer();

  VideoCapturer(const VideoCapturer&) = delete;
  VideoCapturer& operator=(const VideoCapturer&) = delete;

  // Initialize video capture with constraints.
  void Initialize(const VideoConstraints& constraints);

  // Start capturing video frames.
  void Start();

  // Stop capturing video frames.
  void Stop();

  // Get current state.
  State GetState() const { return state_; }

  // Set a media stream to capture from.
  // This connects the video sink to the stream's video track.
  void SetMediaStream(const blink::WebMediaStream& stream);

  // Get media stream (for use with eye tracking).
  const blink::WebMediaStream& GetMediaStream() const {
    return media_stream_;
  }

  // Get the latest captured video frame.
  // This can be used by the eye tracking module to get frames.
  scoped_refptr<media::VideoFrame> GetLatestFrame() const;

  // Check if capturing is active.
  bool IsCapturing() const { return state_ == State::kCapturing; }

 private:
  void OnStreamAcquired(const blink::WebMediaStream& stream);
  void OnStreamFailed(const std::string& error);
  void OnFrameCaptured(const void* frame_data, int size);
  void OnVideoFrameReceived(scoped_refptr<media::VideoFrame> frame,
                            base::TimeTicks timestamp);
  void SendFrameToBrowser(const void* frame_data, int size);
  void UpdateState(State new_state);

  State state_ = State::kIdle;
  VideoConstraints constraints_;

  blink::WebMediaStream media_stream_;
  std::unique_ptr<FrameProcessor> frame_processor_;
  std::unique_ptr<MediaStreamVideoSinkImpl> video_sink_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<VideoCapturer> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_VIDEO_VIDEO_CAPTURER_H_
