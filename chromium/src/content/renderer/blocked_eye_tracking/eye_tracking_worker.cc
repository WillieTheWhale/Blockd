// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/eye_tracking_worker.h"

#include <algorithm>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/synchronization/lock.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/threading/thread.h"
#include "base/time/time.h"
#include "content/renderer/blocked_eye_tracking/face_detector.h"
#include "content/renderer/blocked_eye_tracking/gaze_estimator.h"
#include "content/renderer/blocked_video/media_stream_video_sink_impl.h"
#include "media/base/video_frame.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream_track.h"
#include "third_party/libyuv/include/libyuv.h"
#include "third_party/skia/include/core/SkBitmap.h"
#include "ui/gfx/geometry/rect.h"

namespace content {

namespace {

// Target frame rate for eye tracking.
constexpr int kTargetFPS = 30;
constexpr base::TimeDelta kFrameInterval = base::Milliseconds(1000 / kTargetFPS);

}  // namespace

EyeTrackingWorker::EyeTrackingWorker(
    const blink::WebMediaStream& stream,
    GazeCallback gaze_callback,
    FailureCallback failure_callback)
    : media_stream_(stream),
      gaze_callback_(std::move(gaze_callback)),
      failure_callback_(std::move(failure_callback)),
      worker_thread_("EyeTrackingWorker") {

  DETACH_FROM_SEQUENCE(main_sequence_checker_);
  main_task_runner_ = base::SequencedTaskRunner::GetCurrentDefault();

  // Start worker thread.
  base::Thread::Options options;
  options.message_pump_type = base::MessagePumpType::IO;
  worker_thread_.StartWithOptions(std::move(options));
  worker_task_runner_ = worker_thread_.task_runner();

  // Create video sink to receive frames from the media stream.
  video_sink_ = std::make_unique<MediaStreamVideoSinkImpl>(
      base::BindRepeating(&EyeTrackingWorker::OnVideoFrameReceived,
                          base::Unretained(this)));

  // Connect to the video track from the media stream.
  ConnectToVideoTrack();

  // Create face detector and gaze estimator on worker thread.
  worker_task_runner_->PostTask(
      FROM_HERE,
      base::BindOnce(
          [](EyeTrackingWorker* self) {
            self->face_detector_ = std::make_unique<FaceDetector>();
            self->gaze_estimator_ = std::make_unique<GazeEstimator>();
            self->face_detector_->Initialize();
          },
          base::Unretained(this)));
}

EyeTrackingWorker::~EyeTrackingWorker() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(main_sequence_checker_);
  Stop();

  // Disconnect from video track.
  if (video_sink_) {
    video_sink_->DisconnectFromTrack();
  }
}

void EyeTrackingWorker::Start() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(main_sequence_checker_);

  if (is_running_) {
    return;
  }

  is_running_ = true;

  // Start frame processing loop on worker thread.
  worker_task_runner_->PostTask(
      FROM_HERE,
      base::BindOnce(&EyeTrackingWorker::ProcessFrames,
                     base::Unretained(this)));

  LOG(INFO) << "EyeTrackingWorker started";
}

void EyeTrackingWorker::Stop() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(main_sequence_checker_);

  if (!is_running_) {
    return;
  }

  is_running_ = false;

  // Stop worker thread.
  worker_thread_.Stop();

  LOG(INFO) << "EyeTrackingWorker stopped";
}

void EyeTrackingWorker::ProcessFrames() {
  // This runs on worker thread.
  if (!is_running_) {
    return;
  }

  base::TimeTicks start_time = base::TimeTicks::Now();

  // Process single frame.
  ProcessSingleFrame();

  // Calculate time to next frame.
  base::TimeDelta elapsed = base::TimeTicks::Now() - start_time;
  base::TimeDelta delay = kFrameInterval - elapsed;
  if (delay < base::TimeDelta()) {
    delay = base::TimeDelta();
  }

  // Schedule next frame.
  worker_task_runner_->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&EyeTrackingWorker::ProcessFrames,
                     base::Unretained(this)),
      delay);
}

void EyeTrackingWorker::ProcessSingleFrame() {
  // This runs on worker thread.

  // Extract video frame from WebMediaStream using WebRTC frame capture.
  SkBitmap frame;
  if (!CaptureFrameFromStream(&frame)) {
    // Frame capture failed - likely no video track available.
    consecutive_failures_++;
    if (consecutive_failures_ >= kMaxConsecutiveFailures) {
      LOG(ERROR) << "Too many consecutive frame capture failures ("
                 << consecutive_failures_ << "), reporting error";
      main_task_runner_->PostTask(
          FROM_HERE,
          base::BindOnce(&EyeTrackingWorker::OnProcessingFailed,
                         base::Unretained(this)));
    }
    return;
  }

  // Reset failure counter on successful capture.
  consecutive_failures_ = 0;

  // Detect face.
  FaceDetector::FaceLandmarks landmarks;
  if (!face_detector_->DetectFace(frame, &landmarks)) {
    // Face detection failed - this is normal if user looks away.
    VLOG(2) << "Face detection failed - no face in frame";
    return;
  }

  // Estimate gaze.
  auto gaze_vector = gaze_estimator_->EstimateGaze(landmarks);

  // Convert to GazePoint.
  EyeTracker::GazePoint gaze;
  gaze.x = gaze_vector.x;
  gaze.y = gaze_vector.y;
  gaze.confidence = gaze_vector.confidence;
  gaze.timestamp = base::TimeTicks::Now();
  gaze.is_off_screen = gaze_vector.is_off_screen;
  gaze.off_screen_direction = gaze_vector.off_screen_direction;

  // Send result to main thread.
  main_task_runner_->PostTask(
      FROM_HERE,
      base::BindOnce(&EyeTrackingWorker::OnGazeComputed,
                     base::Unretained(this),
                     gaze));
}

bool EyeTrackingWorker::CaptureFrameFromStream(SkBitmap* frame) {
  if (!frame) {
    return false;
  }

  // Get the latest frame from our video sink (thread-safe).
  scoped_refptr<media::VideoFrame> video_frame;
  {
    base::AutoLock lock(frame_lock_);
    video_frame = latest_video_frame_;
  }

  if (video_frame) {
    // Convert VideoFrame to SkBitmap.
    ConvertVideoFrameToSkBitmap(video_frame, frame);
    return true;
  }

  // Alternatively, try getting from the video sink directly.
  if (video_sink_) {
    video_frame = video_sink_->GetLatestFrame();
    if (video_frame) {
      ConvertVideoFrameToSkBitmap(video_frame, frame);
      return true;
    }
  }

  // No frame available yet.
  VLOG(2) << "No video frame available from media stream";
  return false;
}

void EyeTrackingWorker::ConnectToVideoTrack() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(main_sequence_checker_);

  if (media_stream_.IsNull()) {
    LOG(ERROR) << "Cannot connect to video track: media stream is null";
    return;
  }

  // Get video tracks from the stream.
  blink::WebVector<blink::WebMediaStreamTrack> video_tracks =
      media_stream_.VideoTracks();

  if (video_tracks.empty()) {
    LOG(ERROR) << "Media stream has no video tracks";
    return;
  }

  // Connect to the first video track.
  const blink::WebMediaStreamTrack& video_track = video_tracks[0];

  if (video_sink_ && video_sink_->ConnectToTrack(video_track)) {
    LOG(INFO) << "Eye tracking connected to video track: "
              << video_track.Id().Utf8();
  } else {
    LOG(ERROR) << "Failed to connect eye tracking to video track";
  }
}

void EyeTrackingWorker::OnVideoFrameReceived(
    scoped_refptr<media::VideoFrame> frame,
    base::TimeTicks timestamp) {
  if (!frame) {
    return;
  }

  // Store the frame for the worker thread to pick up.
  // This is called on the main thread, so we need thread-safe access.
  {
    base::AutoLock lock(frame_lock_);
    latest_video_frame_ = frame;
  }

  VLOG(3) << "Eye tracking received video frame: "
          << frame->visible_rect().width() << "x"
          << frame->visible_rect().height();
}

void EyeTrackingWorker::ConvertVideoFrameToSkBitmap(
    scoped_refptr<media::VideoFrame> video_frame,
    SkBitmap* bitmap) {
  if (!video_frame || !bitmap) {
    return;
  }

  const gfx::Rect visible_rect = video_frame->visible_rect();
  int width = visible_rect.width();
  int height = visible_rect.height();

  // Ensure bitmap is allocated with ARGB (N32) format.
  if (bitmap->width() != width || bitmap->height() != height ||
      bitmap->colorType() != kN32_SkColorType) {
    if (!bitmap->tryAllocN32Pixels(width, height)) {
      LOG(ERROR) << "Failed to allocate bitmap for video frame conversion";
      return;
    }
  }

  // Get destination buffer pointer and stride.
  uint8_t* dst_argb = static_cast<uint8_t*>(bitmap->getPixels());
  int dst_stride = static_cast<int>(bitmap->rowBytes());

  const media::VideoPixelFormat format = video_frame->format();
  int result = -1;

  switch (format) {
    case media::PIXEL_FORMAT_I420: {
      // I420 format: planar Y, U, V with 4:2:0 subsampling.
      const uint8_t* src_y = video_frame->visible_data(media::VideoFrame::Plane::kY);
      const uint8_t* src_u = video_frame->visible_data(media::VideoFrame::Plane::kU);
      const uint8_t* src_v = video_frame->visible_data(media::VideoFrame::Plane::kV);
      int src_stride_y = video_frame->stride(media::VideoFrame::Plane::kY);
      int src_stride_u = video_frame->stride(media::VideoFrame::Plane::kU);
      int src_stride_v = video_frame->stride(media::VideoFrame::Plane::kV);

      result = libyuv::I420ToARGB(
          src_y, src_stride_y,
          src_u, src_stride_u,
          src_v, src_stride_v,
          dst_argb, dst_stride,
          width, height);
      break;
    }

    case media::PIXEL_FORMAT_NV12: {
      // NV12 format: planar Y, interleaved UV with 4:2:0 subsampling.
      const uint8_t* src_y = video_frame->visible_data(media::VideoFrame::Plane::kY);
      const uint8_t* src_uv = video_frame->visible_data(media::VideoFrame::Plane::kUV);
      int src_stride_y = video_frame->stride(media::VideoFrame::Plane::kY);
      int src_stride_uv = video_frame->stride(media::VideoFrame::Plane::kUV);

      result = libyuv::NV12ToARGB(
          src_y, src_stride_y,
          src_uv, src_stride_uv,
          dst_argb, dst_stride,
          width, height);
      break;
    }

    case media::PIXEL_FORMAT_YV12: {
      // YV12 format: like I420 but V and U planes are swapped.
      // Use I420ToARGB with U and V swapped.
      const uint8_t* src_y = video_frame->visible_data(media::VideoFrame::Plane::kY);
      const uint8_t* src_u = video_frame->visible_data(media::VideoFrame::Plane::kV);  // V in YV12
      const uint8_t* src_v = video_frame->visible_data(media::VideoFrame::Plane::kU);  // U in YV12
      int src_stride_y = video_frame->stride(media::VideoFrame::Plane::kY);
      int src_stride_u = video_frame->stride(media::VideoFrame::Plane::kV);
      int src_stride_v = video_frame->stride(media::VideoFrame::Plane::kU);

      result = libyuv::I420ToARGB(
          src_y, src_stride_y,
          src_u, src_stride_u,
          src_v, src_stride_v,
          dst_argb, dst_stride,
          width, height);
      break;
    }

    case media::PIXEL_FORMAT_ARGB: {
      // Already ARGB, just copy.
      const uint8_t* src_argb = video_frame->visible_data(media::VideoFrame::Plane::kARGB);
      int src_stride = video_frame->stride(media::VideoFrame::Plane::kARGB);

      result = libyuv::ARGBCopy(
          src_argb, src_stride,
          dst_argb, dst_stride,
          width, height);
      break;
    }

    default:
      LOG(WARNING) << "Unsupported video frame format: " << static_cast<int>(format)
                   << ". Attempting I420 conversion.";
      // Fall back to trying I420 for unknown formats (may fail).
      if (video_frame->NumPlanes(format) >= 3) {
        const uint8_t* src_y = video_frame->visible_data(media::VideoFrame::Plane::kY);
        const uint8_t* src_u = video_frame->visible_data(media::VideoFrame::Plane::kU);
        const uint8_t* src_v = video_frame->visible_data(media::VideoFrame::Plane::kV);
        int src_stride_y = video_frame->stride(media::VideoFrame::Plane::kY);
        int src_stride_u = video_frame->stride(media::VideoFrame::Plane::kU);
        int src_stride_v = video_frame->stride(media::VideoFrame::Plane::kV);

        result = libyuv::I420ToARGB(
            src_y, src_stride_y,
            src_u, src_stride_u,
            src_v, src_stride_v,
            dst_argb, dst_stride,
            width, height);
      }
      break;
  }

  if (result != 0) {
    LOG(ERROR) << "Video frame conversion failed with error: " << result
               << " for format: " << static_cast<int>(format);
    bitmap->eraseColor(SK_ColorBLACK);
  }

  VLOG(2) << "Video frame converted, size: " << width << "x" << height
          << ", format: " << static_cast<int>(format);
}

void EyeTrackingWorker::OnGazeComputed(const EyeTracker::GazePoint& gaze) {
  DCHECK_CALLED_ON_VALID_SEQUENCE(main_sequence_checker_);

  if (!is_running_) {
    return;
  }

  // Invoke callback.
  gaze_callback_.Run(gaze);
}

void EyeTrackingWorker::OnProcessingFailed() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(main_sequence_checker_);

  if (!is_running_) {
    return;
  }

  // Invoke failure callback.
  failure_callback_.Run();
}

}  // namespace content
