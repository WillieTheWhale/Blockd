// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_video/video_capturer.h"

#include <cstring>
#include <vector>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "content/renderer/blocked_ipc/video_frame_sender.h"
#include "content/renderer/blocked_video/frame_processor.h"
#include "content/renderer/blocked_video/media_stream_video_sink_impl.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream_track.h"

namespace content {

VideoCapturer::VideoCapturer() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

VideoCapturer::~VideoCapturer() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  Stop();
}

void VideoCapturer::Initialize(const VideoConstraints& constraints) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  DCHECK_EQ(state_, State::kIdle);

  UpdateState(State::kInitializing);
  constraints_ = constraints;

  // Create frame processor.
  frame_processor_ = std::make_unique<FrameProcessor>();

  // Create video sink to receive frames from the media stream.
  video_sink_ = std::make_unique<MediaStreamVideoSinkImpl>(
      base::BindRepeating(&VideoCapturer::OnVideoFrameReceived,
                          weak_factory_.GetWeakPtr()));

  LOG(INFO) << "VideoCapturer initialized with constraints: "
            << constraints_.width << "x" << constraints_.height
            << " @ " << constraints_.frame_rate << " FPS";

  // Note: The actual media stream will be provided via SetMediaStream()
  // when getUserMedia() is called from JavaScript or when the session starts.
  // This allows the browser to control camera permissions through the normal
  // WebRTC permission flow rather than requesting them directly.
  UpdateState(State::kIdle);
}

void VideoCapturer::Start() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == State::kCapturing) {
    LOG(WARNING) << "VideoCapturer already capturing";
    return;
  }

  if (state_ != State::kIdle) {
    LOG(ERROR) << "Cannot start capturing from state: "
               << static_cast<int>(state_);
    return;
  }

  UpdateState(State::kCapturing);

  // Start frame processing.
  if (frame_processor_) {
    frame_processor_->Start(
        constraints_.frame_rate,
        base::BindRepeating(&VideoCapturer::OnFrameCaptured,
                            weak_factory_.GetWeakPtr()));
  }

  LOG(INFO) << "Video capture started";
}

void VideoCapturer::Stop() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ == State::kStopped || state_ == State::kIdle) {
    return;
  }

  // Stop frame processing.
  if (frame_processor_) {
    frame_processor_->Stop();
  }

  // Release media stream.
  media_stream_.Reset();

  UpdateState(State::kStopped);
  LOG(INFO) << "Video capture stopped";
}

void VideoCapturer::SetMediaStream(const blink::WebMediaStream& stream) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (stream.IsNull()) {
    LOG(ERROR) << "Cannot set null media stream";
    return;
  }

  // Disconnect from any existing stream.
  if (video_sink_ && video_sink_->IsConnected()) {
    video_sink_->DisconnectFromTrack();
  }

  media_stream_ = stream;

  // Get video tracks from the stream.
  blink::WebVector<blink::WebMediaStreamTrack> video_tracks =
      stream.VideoTracks();

  if (video_tracks.empty()) {
    LOG(ERROR) << "Media stream has no video tracks";
    OnStreamFailed("No video tracks in stream");
    return;
  }

  // Connect to the first video track.
  const blink::WebMediaStreamTrack& video_track = video_tracks[0];

  if (video_sink_ && video_sink_->ConnectToTrack(video_track)) {
    LOG(INFO) << "Connected to video track: " << video_track.Id().Utf8();
    UpdateState(State::kIdle);
  } else {
    LOG(ERROR) << "Failed to connect to video track";
    OnStreamFailed("Failed to connect to video track");
  }
}

void VideoCapturer::OnVideoFrameReceived(
    scoped_refptr<media::VideoFrame> frame,
    base::TimeTicks timestamp) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != State::kCapturing) {
    return;
  }

  if (!frame) {
    return;
  }

  // Get the full YUV420 frame data and send to browser process.
  int width = frame->visible_rect().width();
  int height = frame->visible_rect().height();

  // YUV420 format: Y plane is width*height, U and V planes are (width/2)*(height/2) each
  int y_size = width * height;
  int uv_size = (width / 2) * (height / 2);
  int total_size = y_size + uv_size * 2;  // Y + U + V

  // Get plane data pointers.
  const uint8_t* y_plane = frame->visible_data(media::VideoFrame::Plane::kY);
  const uint8_t* u_plane = frame->visible_data(media::VideoFrame::Plane::kU);
  const uint8_t* v_plane = frame->visible_data(media::VideoFrame::Plane::kV);

  int y_stride = frame->stride(media::VideoFrame::Plane::kY);
  int u_stride = frame->stride(media::VideoFrame::Plane::kU);
  int v_stride = frame->stride(media::VideoFrame::Plane::kV);

  // Copy planes into a contiguous buffer, handling stride.
  std::vector<uint8_t> yuv_buffer(total_size);
  uint8_t* dest = yuv_buffer.data();

  // Copy Y plane (row by row if stride != width).
  if (y_stride == width) {
    memcpy(dest, y_plane, y_size);
  } else {
    for (int row = 0; row < height; ++row) {
      memcpy(dest + row * width, y_plane + row * y_stride, width);
    }
  }
  dest += y_size;

  // Copy U plane.
  int uv_width = width / 2;
  int uv_height = height / 2;
  if (u_stride == uv_width) {
    memcpy(dest, u_plane, uv_size);
  } else {
    for (int row = 0; row < uv_height; ++row) {
      memcpy(dest + row * uv_width, u_plane + row * u_stride, uv_width);
    }
  }
  dest += uv_size;

  // Copy V plane.
  if (v_stride == uv_width) {
    memcpy(dest, v_plane, uv_size);
  } else {
    for (int row = 0; row < uv_height; ++row) {
      memcpy(dest + row * uv_width, v_plane + row * v_stride, uv_width);
    }
  }

  // Send the complete YUV420 frame to browser.
  SendFrameToBrowser(yuv_buffer.data(), total_size);

  VLOG(3) << "Video frame received: " << frame->visible_rect().width()
          << "x" << frame->visible_rect().height();
}

scoped_refptr<media::VideoFrame> VideoCapturer::GetLatestFrame() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!video_sink_) {
    return nullptr;
  }

  return video_sink_->GetLatestFrame();
}

void VideoCapturer::OnStreamAcquired(const blink::WebMediaStream& stream) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  // Delegate to SetMediaStream for actual connection.
  SetMediaStream(stream);
}

void VideoCapturer::OnStreamFailed(const std::string& error) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  LOG(ERROR) << "Failed to acquire video stream: " << error;
  UpdateState(State::kError);
}

void VideoCapturer::OnFrameCaptured(const void* frame_data, int size) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (state_ != State::kCapturing) {
    return;
  }

  // Send frame to browser process via Mojo IPC.
  SendFrameToBrowser(frame_data, size);
}

void VideoCapturer::SendFrameToBrowser(const void* frame_data, int size) {
  // Send via VideoFrameSender to browser process.
  VideoFrameSender::GetInstance()->SendFrame(
      static_cast<const uint8_t*>(frame_data),
      size,
      constraints_.width,
      constraints_.height);
}

void VideoCapturer::UpdateState(State new_state) {
  if (state_ == new_state) {
    return;
  }

  LOG(INFO) << "VideoCapturer state: " << static_cast<int>(state_)
            << " -> " << static_cast<int>(new_state);
  state_ = new_state;
}

}  // namespace content
