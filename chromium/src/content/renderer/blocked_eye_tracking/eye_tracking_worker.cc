// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/eye_tracking_worker.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/threading/thread.h"
#include "base/time/time.h"
#include "content/renderer/blocked_eye_tracking/face_detector.h"
#include "content/renderer/blocked_eye_tracking/gaze_estimator.h"
#include "third_party/blink/public/platform/web_media_stream_track.h"
#include "third_party/skia/include/core/SkBitmap.h"

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

  // Get video track from media stream.
  blink::WebVector<blink::WebMediaStreamTrack> video_tracks =
      media_stream_.VideoTracks();

  if (video_tracks.empty()) {
    VLOG(1) << "No video tracks in media stream";
    return false;
  }

  // Use first video track.
  blink::WebMediaStreamTrack video_track = video_tracks[0];

  if (video_track.IsNull()) {
    LOG(WARNING) << "Video track is null";
    return false;
  }

  // Check if track is enabled and has content.
  if (!video_track.IsEnabled()) {
    VLOG(2) << "Video track is disabled";
    return false;
  }

  // Get video frame from track.
  // In Chromium, we use MediaStreamVideoSink or VideoTrackAdapter.
  // For this implementation, we'll use the track's source capabilities.
  blink::WebMediaStreamSource source = video_track.Source();

  if (source.IsNull()) {
    LOG(WARNING) << "Video track source is null";
    return false;
  }

  // Check source readiness.
  if (source.GetReadyState() != blink::WebMediaStreamSource::kReadyStateLive) {
    VLOG(2) << "Video source not live";
    return false;
  }

  // Get frame dimensions from track settings (if available).
  int width = 640;   // Default width
  int height = 480;  // Default height

  // Allocate frame buffer.
  if (!frame->tryAllocN32Pixels(width, height)) {
    LOG(ERROR) << "Failed to allocate frame buffer";
    return false;
  }

  // In a full implementation, we would:
  // 1. Create a VideoTrackAdapter or MediaStreamVideoSink
  // 2. Register a callback to receive frames
  // 3. Copy the latest frame to the SkBitmap
  //
  // For now, we use a frame capture interface if available.
  // The actual frame data would come from WebRTC's video pipeline.

  // Try to get latest frame from video capture.
  if (video_frame_capture_) {
    scoped_refptr<media::VideoFrame> video_frame =
        video_frame_capture_->GetLatestFrame();
    if (video_frame) {
      // Convert VideoFrame to SkBitmap.
      ConvertVideoFrameToSkBitmap(video_frame, frame);
      return true;
    }
  }

  // Fallback: If we have a frame sink registered, use that.
  if (latest_video_frame_) {
    ConvertVideoFrameToSkBitmap(latest_video_frame_, frame);
    return true;
  }

  // No frame available yet - might be starting up.
  VLOG(2) << "No video frame available";
  return false;
}

void EyeTrackingWorker::ConvertVideoFrameToSkBitmap(
    scoped_refptr<media::VideoFrame> video_frame,
    SkBitmap* bitmap) {
  if (!video_frame || !bitmap) {
    return;
  }

  int width = video_frame->visible_rect().width();
  int height = video_frame->visible_rect().height();

  // Ensure bitmap is allocated.
  if (bitmap->width() != width || bitmap->height() != height) {
    bitmap->allocN32Pixels(width, height);
  }

  // Convert based on video frame format.
  switch (video_frame->format()) {
    case media::PIXEL_FORMAT_I420:
    case media::PIXEL_FORMAT_YV12: {
      // Convert YUV to RGBA.
      const uint8_t* y_plane = video_frame->visible_data(0);
      const uint8_t* u_plane = video_frame->visible_data(1);
      const uint8_t* v_plane = video_frame->visible_data(2);
      int y_stride = video_frame->stride(0);
      int u_stride = video_frame->stride(1);
      int v_stride = video_frame->stride(2);

      uint32_t* dst = static_cast<uint32_t*>(bitmap->getPixels());

      for (int row = 0; row < height; ++row) {
        for (int col = 0; col < width; ++col) {
          int y = y_plane[row * y_stride + col];
          int u = u_plane[(row / 2) * u_stride + (col / 2)];
          int v = v_plane[(row / 2) * v_stride + (col / 2)];

          // YUV to RGB conversion.
          int c = y - 16;
          int d = u - 128;
          int e = v - 128;

          int r = std::clamp((298 * c + 409 * e + 128) >> 8, 0, 255);
          int g = std::clamp((298 * c - 100 * d - 208 * e + 128) >> 8, 0, 255);
          int b = std::clamp((298 * c + 516 * d + 128) >> 8, 0, 255);

          dst[row * width + col] = SkColorSetARGB(255, r, g, b);
        }
      }
      break;
    }

    case media::PIXEL_FORMAT_ARGB:
    case media::PIXEL_FORMAT_XRGB: {
      // Direct copy for ARGB format.
      const uint8_t* src = video_frame->visible_data(0);
      int src_stride = video_frame->stride(0);
      uint8_t* dst = static_cast<uint8_t*>(bitmap->getPixels());
      int dst_stride = bitmap->rowBytes();

      for (int row = 0; row < height; ++row) {
        memcpy(dst + row * dst_stride, src + row * src_stride,
               width * 4);
      }
      break;
    }

    default:
      LOG(WARNING) << "Unsupported video frame format: "
                   << video_frame->format();
      bitmap->eraseColor(SK_ColorBLACK);
      break;
  }
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
