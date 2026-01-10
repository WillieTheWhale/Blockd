// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_VIDEO_MEDIA_STREAM_VIDEO_SINK_IMPL_H_
#define CONTENT_RENDERER_BLOCKED_VIDEO_MEDIA_STREAM_VIDEO_SINK_IMPL_H_

#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/synchronization/lock.h"
#include "media/base/video_frame.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream_track.h"
#include "third_party/blink/public/web/modules/mediastream/media_stream_video_sink.h"

namespace content {

// Implementation of MediaStreamVideoSink that receives video frames
// from a WebMediaStreamTrack and provides them to the VideoCapturer.
//
// This class bridges Blink's media stream API with our video capture
// pipeline, enabling access to camera frames for eye tracking and
// video recording.
class MediaStreamVideoSinkImpl : public blink::MediaStreamVideoSink {
 public:
  using FrameCallback =
      base::RepeatingCallback<void(scoped_refptr<media::VideoFrame>,
                                   base::TimeTicks)>;

  // |callback| is invoked for each video frame received from the track.
  explicit MediaStreamVideoSinkImpl(FrameCallback callback);
  ~MediaStreamVideoSinkImpl() override;

  MediaStreamVideoSinkImpl(const MediaStreamVideoSinkImpl&) = delete;
  MediaStreamVideoSinkImpl& operator=(const MediaStreamVideoSinkImpl&) = delete;

  // Connect to a video track to start receiving frames.
  // Returns true if successfully connected.
  bool ConnectToTrack(const blink::WebMediaStreamTrack& track);

  // Disconnect from the current track.
  void DisconnectFromTrack();

  // Check if currently connected to a track.
  bool IsConnected() const;

  // Get the latest captured frame.
  // Thread-safe, can be called from any thread.
  scoped_refptr<media::VideoFrame> GetLatestFrame();

 private:
  // MediaStreamVideoSink implementation.
  void OnVideoFrame(
      scoped_refptr<media::VideoFrame> frame,
      std::vector<scoped_refptr<media::VideoFrame>> scaled_frames,
      base::TimeTicks estimated_capture_time) override;

  void OnEncodedVideoFrame(
      scoped_refptr<EncodedVideoFrame> encoded_frame,
      base::TimeTicks estimated_capture_time) override;

  FrameCallback frame_callback_;
  blink::WebMediaStreamTrack connected_track_;

  // Protected by |frame_lock_| for thread-safe access.
  mutable base::Lock frame_lock_;
  scoped_refptr<media::VideoFrame> latest_frame_ GUARDED_BY(frame_lock_);

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<MediaStreamVideoSinkImpl> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_VIDEO_MEDIA_STREAM_VIDEO_SINK_IMPL_H_
