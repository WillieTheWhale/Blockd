// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_eye_tracking/eye_tracking_worker.h"

#include <algorithm>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/task/sequenced_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/threading/thread.h"
#include "base/time/time.h"
#include "content/renderer/blocked_eye_tracking/face_detector.h"
#include "content/renderer/blocked_eye_tracking/gaze_estimator.h"
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

  // Default frame dimensions.
  constexpr int kDefaultWidth = 640;
  constexpr int kDefaultHeight = 480;

  // Try to get latest frame from video capture interface.
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

  // No frame available yet.
  // In a full implementation, this would integrate with Chromium's
  // MediaStreamVideoSink or VideoTrackAdapter to receive frames
  // from the WebMediaStream. For now, we allocate an empty frame
  // to allow the rest of the pipeline to initialize.

  // Allocate frame buffer.
  if (!frame->tryAllocN32Pixels(kDefaultWidth, kDefaultHeight)) {
    LOG(ERROR) << "Failed to allocate frame buffer";
    return false;
  }

  // Clear to black - indicates no real frame data available.
  frame->eraseColor(SK_ColorBLACK);

  VLOG(2) << "No video frame available, using placeholder";
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

  // TODO(blocked): Use libyuv or Chromium's video frame conversion utilities
  // for proper YUV to RGB conversion. For now, use a placeholder.
  //
  // In a production implementation, this would use:
  // - media::PaintCanvasVideoRenderer for GPU-accelerated conversion
  // - libyuv::I420ToARGB for CPU-based conversion
  // - Or integrate with Chromium's existing frame conversion pipeline
  //
  // The actual conversion requires careful buffer handling with base::span
  // or raw_ptr<> to satisfy Chromium's unsafe buffer checks.

  // For now, fill with a placeholder color to indicate the frame exists
  // but conversion is not yet implemented.
  bitmap->eraseColor(SK_ColorDKGRAY);

  VLOG(2) << "Video frame received, size: " << width << "x" << height
          << ", format: " << static_cast<int>(video_frame->format());
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
