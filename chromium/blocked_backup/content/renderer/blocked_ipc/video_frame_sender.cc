// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_ipc/video_frame_sender.h"

#include "base/logging.h"
#include "base/no_destructor.h"
#include "mojo/public/cpp/base/big_buffer.h"

namespace content {

// static
VideoFrameSender* VideoFrameSender::GetInstance() {
  static base::NoDestructor<VideoFrameSender> instance;
  return instance.get();
}

VideoFrameSender::VideoFrameSender() {
  DETACH_FROM_SEQUENCE(sequence_checker_);
}

VideoFrameSender::~VideoFrameSender() = default;

void VideoFrameSender::Initialize(blocked::mojom::VideoCaptureHost* host) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  video_capture_host_ = host;

  if (host) {
    LOG(INFO) << "VideoFrameSender initialized with VideoCaptureHost";
    ProcessPendingFrames();
  } else {
    LOG(WARNING) << "VideoFrameSender initialized with null host";
  }
}

void VideoFrameSender::SendFrame(const uint8_t* frame_data,
                                 int size,
                                 int width,
                                 int height) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!frame_data || size <= 0) {
    LOG(ERROR) << "Invalid frame data";
    return;
  }

  // Create metadata.
  auto metadata = blocked::mojom::VideoFrameMetadata::New();
  metadata->width = width;
  metadata->height = height;
  metadata->format = blocked::mojom::VideoFormat::I420;
  metadata->timestamp = base::TimeTicks::Now();
  metadata->frame_number = frame_number_++;

  SendFrame(frame_data, size, std::move(metadata));
}

void VideoFrameSender::SendFrame(const uint8_t* frame_data,
                                 int size,
                                 blocked::mojom::VideoFrameMetadataPtr metadata) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!frame_data || size <= 0) {
    LOG(ERROR) << "Invalid frame data";
    return;
  }

  if (!video_capture_host_) {
    // Queue frame for later if host not available.
    if (pending_frames_.size() >= max_pending_frames_) {
      DropOldestFrame();
    }

    PendingFrame pending;
    pending.data.assign(frame_data, frame_data + size);
    pending.metadata = std::move(metadata);
    pending.queued_at = base::TimeTicks::Now();
    pending_frames_.push(std::move(pending));

    VLOG(2) << "Frame queued (no host), queue size: " << pending_frames_.size();
    return;
  }

  // Send frame via Mojo.
  mojo_base::BigBuffer buffer(base::make_span(frame_data, size));
  video_capture_host_->OnVideoFrame(std::move(buffer), std::move(metadata));

  total_sent_++;
  total_bytes_ += size;

  VLOG(2) << "Video frame sent: " << metadata->width << "x" << metadata->height
          << " (" << size << " bytes)";
}

void VideoFrameSender::SendEncodedFrame(const uint8_t* encoded_data,
                                        int size,
                                        int64_t timestamp_us) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!encoded_data || size <= 0) {
    LOG(ERROR) << "Invalid encoded frame data";
    return;
  }

  if (!video_capture_host_) {
    LOG(WARNING) << "Cannot send encoded frame - host not available";
    dropped_frames_++;
    return;
  }

  // Convert timestamp from microseconds to TimeTicks.
  base::TimeTicks timestamp = base::TimeTicks() +
      base::Microseconds(timestamp_us);

  // Send encoded frame via Mojo.
  mojo_base::BigBuffer buffer(base::make_span(encoded_data, size));
  video_capture_host_->OnEncodedFrame(std::move(buffer), timestamp);

  total_sent_++;
  total_bytes_ += size;

  VLOG(2) << "Encoded frame sent: " << size << " bytes @ " << timestamp_us;
}

void VideoFrameSender::NotifyCaptureStarted(int width, int height,
                                            int frame_rate) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!video_capture_host_) {
    LOG(WARNING) << "Cannot notify capture started - host not available";
    return;
  }

  auto settings = blocked::mojom::VideoCaptureSettings::New();
  settings->width = width;
  settings->height = height;
  settings->frame_rate = frame_rate;
  settings->format = blocked::mojom::VideoFormat::I420;
  settings->enable_encoding = false;

  video_capture_host_->OnCaptureStarted(std::move(settings));

  LOG(INFO) << "Capture started notification sent: " << width << "x" << height
            << " @ " << frame_rate << " fps";
}

void VideoFrameSender::NotifyCaptureStopped() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!video_capture_host_) {
    LOG(WARNING) << "Cannot notify capture stopped - host not available";
    return;
  }

  video_capture_host_->OnCaptureStopped();
  LOG(INFO) << "Capture stopped notification sent";
}

void VideoFrameSender::NotifyCaptureError(const std::string& error_message) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!video_capture_host_) {
    LOG(ERROR) << "Capture error (no host): " << error_message;
    return;
  }

  video_capture_host_->OnCaptureError(error_message);
  LOG(ERROR) << "Capture error notification sent: " << error_message;
}

void VideoFrameSender::SendToMojo(const uint8_t* data,
                                  int size,
                                  int width,
                                  int height) {
  // Legacy method - redirect to new implementation.
  SendFrame(data, size, width, height);
}

void VideoFrameSender::ProcessPendingFrames() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (!video_capture_host_) {
    return;
  }

  int processed = 0;
  while (!pending_frames_.empty()) {
    PendingFrame& pending = pending_frames_.front();

    // Check if frame is too old (more than 1 second).
    base::TimeDelta age = base::TimeTicks::Now() - pending.queued_at;
    if (age > base::Seconds(1)) {
      dropped_frames_++;
      pending_frames_.pop();
      continue;
    }

    // Send frame.
    mojo_base::BigBuffer buffer(base::make_span(pending.data));
    video_capture_host_->OnVideoFrame(std::move(buffer),
                                      std::move(pending.metadata));

    total_sent_++;
    total_bytes_ += pending.data.size();
    processed++;

    pending_frames_.pop();
  }

  if (processed > 0) {
    LOG(INFO) << "Processed " << processed << " pending frames";
  }
}

void VideoFrameSender::DropOldestFrame() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);

  if (pending_frames_.empty()) {
    return;
  }

  pending_frames_.pop();
  dropped_frames_++;

  VLOG(1) << "Dropped oldest frame, total dropped: " << dropped_frames_;
}

}  // namespace content
