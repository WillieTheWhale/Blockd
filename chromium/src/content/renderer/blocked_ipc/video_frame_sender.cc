// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_ipc/video_frame_sender.h"

#include <cstring>
#include <vector>

#include "base/logging.h"
#include "base/no_destructor.h"
#include "content/public/common/blocked_mojom/blocked_mojom_traits.h"
#include "mojo/public/cpp/base/big_buffer.h"

// SAFETY: memcpy operations in CopyFrameData are safe because:
// 1. Size is validated to be > 0 before any copy
// 2. Source pointers come from video capture APIs and are guaranteed valid
// 3. Destination vectors are sized appropriately before copy
namespace {
// NOLINTNEXTLINE(bugprone-suspicious-include)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunsafe-buffer-usage-in-libc-call"
void CopyFrameData(std::vector<uint8_t>& dest, const uint8_t* src, size_t size) {
  dest.resize(size);
  std::memcpy(dest.data(), src, size);
}
#pragma clang diagnostic pop
}  // namespace

namespace content {

// PendingFrame implementation.
VideoFrameSender::PendingFrame::PendingFrame() = default;
VideoFrameSender::PendingFrame::~PendingFrame() = default;
VideoFrameSender::PendingFrame::PendingFrame(PendingFrame&&) noexcept = default;
VideoFrameSender::PendingFrame& VideoFrameSender::PendingFrame::operator=(
    PendingFrame&&) noexcept = default;

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

  // Create metadata using native type.
  blocked::VideoFrameMetadata metadata(
      width,
      height,
      static_cast<int32_t>(blocked::mojom::VideoFormat::I420),
      base::TimeTicks::Now(),
      frame_number_++);

  SendFrame(frame_data, size, metadata);
}

void VideoFrameSender::SendFrame(const uint8_t* frame_data,
                                 int size,
                                 const blocked::VideoFrameMetadata& metadata) {
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
    CopyFrameData(pending.data, frame_data, static_cast<size_t>(size));
    pending.metadata = metadata;
    pending.queued_at = base::TimeTicks::Now();
    pending_frames_.push(std::move(pending));

    VLOG(2) << "Frame queued (no host), queue size: " << pending_frames_.size();
    return;
  }

  // Send frame via Mojo.
  std::vector<uint8_t> frame_vec;
  CopyFrameData(frame_vec, frame_data, static_cast<size_t>(size));
  mojo_base::BigBuffer buffer(std::move(frame_vec));
  video_capture_host_->OnVideoFrame(std::move(buffer), metadata);

  total_sent_++;
  total_bytes_ += size;

  VLOG(2) << "Video frame sent: " << metadata.width << "x" << metadata.height
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
  std::vector<uint8_t> encoded_vec;
  CopyFrameData(encoded_vec, encoded_data, static_cast<size_t>(size));
  mojo_base::BigBuffer buffer(std::move(encoded_vec));
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

  // Create settings using native type.
  blocked::VideoCaptureSettings settings(
      width,
      height,
      frame_rate,
      static_cast<int32_t>(blocked::mojom::VideoFormat::I420),
      "",  // device_id
      false);  // enable_encoding

  video_capture_host_->OnCaptureStarted(settings);

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
    size_t data_size = pending.data.size();
    mojo_base::BigBuffer buffer(std::move(pending.data));
    video_capture_host_->OnVideoFrame(std::move(buffer), pending.metadata);

    total_sent_++;
    total_bytes_ += data_size;
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
