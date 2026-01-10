// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_video/media_stream_video_sink_impl.h"

#include "base/logging.h"

namespace content {

MediaStreamVideoSinkImpl::MediaStreamVideoSinkImpl(FrameCallback callback)
    : frame_callback_(std::move(callback)) {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

MediaStreamVideoSinkImpl::~MediaStreamVideoSinkImpl() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  DisconnectFromTrack();
}

bool MediaStreamVideoSinkImpl::ConnectToTrack(
    const blink::WebMediaStreamTrack& track) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (track.IsNull()) {
    LOG(ERROR) << "Cannot connect to null video track";
    return false;
  }

  if (track.Source().GetType() != blink::WebMediaStreamSource::kTypeVideo) {
    LOG(ERROR) << "Track is not a video track";
    return false;
  }

  // Disconnect from any existing track.
  if (!connected_track_.IsNull()) {
    DisconnectFromTrack();
  }

  // Connect to the new track.
  // This calls MediaStreamVideoSink::ConnectToTrack which registers
  // us to receive video frames via OnVideoFrame callback.
  blink::MediaStreamVideoSink::ConnectToTrack(
      track,
      // We want to receive encoded frames if available.
      blink::MediaStreamVideoSink::IsSecure::kNo,
      // Use_capture_config controls resolution adaptation.
      blink::MediaStreamVideoSink::UsesAlpha::kDefault);

  connected_track_ = track;

  LOG(INFO) << "Connected to video track: " << track.Id().Utf8();
  return true;
}

void MediaStreamVideoSinkImpl::DisconnectFromTrack() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (connected_track_.IsNull()) {
    return;
  }

  // Disconnect from the track.
  blink::MediaStreamVideoSink::DisconnectFromTrack();

  LOG(INFO) << "Disconnected from video track: " << connected_track_.Id().Utf8();
  connected_track_.Reset();

  // Clear the latest frame.
  {
    base::AutoLock lock(frame_lock_);
    latest_frame_ = nullptr;
  }
}

bool MediaStreamVideoSinkImpl::IsConnected() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  return !connected_track_.IsNull();
}

scoped_refptr<media::VideoFrame> MediaStreamVideoSinkImpl::GetLatestFrame() {
  base::AutoLock lock(frame_lock_);
  return latest_frame_;
}

void MediaStreamVideoSinkImpl::OnVideoFrame(
    scoped_refptr<media::VideoFrame> frame,
    std::vector<scoped_refptr<media::VideoFrame>> scaled_frames,
    base::TimeTicks estimated_capture_time) {
  if (!frame) {
    return;
  }

  // Store the latest frame for retrieval.
  {
    base::AutoLock lock(frame_lock_);
    latest_frame_ = frame;
  }

  // Invoke the callback with the frame.
  if (frame_callback_) {
    frame_callback_.Run(frame, estimated_capture_time);
  }

  VLOG(3) << "Received video frame: " << frame->visible_rect().width()
          << "x" << frame->visible_rect().height()
          << " format: " << static_cast<int>(frame->format());
}

void MediaStreamVideoSinkImpl::OnEncodedVideoFrame(
    scoped_refptr<EncodedVideoFrame> encoded_frame,
    base::TimeTicks estimated_capture_time) {
  // We primarily work with raw frames, so this is optional.
  // Encoded frames are useful for recording without re-encoding.
  VLOG(3) << "Received encoded video frame";
}

}  // namespace content
