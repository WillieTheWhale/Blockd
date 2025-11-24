// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_EYE_TRACKING_EYE_TRACKING_WORKER_H_
#define CONTENT_RENDERER_BLOCKED_EYE_TRACKING_EYE_TRACKING_WORKER_H_

#include <memory>

#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "base/sequence_checker.h"
#include "base/thread_annotations.h"
#include "base/threading/thread.h"
#include "content/renderer/blocked_eye_tracking/eye_tracker.h"
#include "third_party/blink/public/platform/web_media_stream.h"

namespace base {
class SequencedTaskRunner;
}  // namespace base

namespace content {

class FaceDetector;
class GazeEstimator;

// Background worker thread for eye tracking processing.
// Captures video frames, runs face detection, and computes gaze on background thread.
// Sends results back to main thread via callbacks.
class EyeTrackingWorker {
 public:
  using GazeCallback = base::RepeatingCallback<void(const EyeTracker::GazePoint&)>;
  using FailureCallback = base::RepeatingCallback<void()>;

  EyeTrackingWorker(const blink::WebMediaStream& stream,
                     GazeCallback gaze_callback,
                     FailureCallback failure_callback);
  ~EyeTrackingWorker();

  EyeTrackingWorker(const EyeTrackingWorker&) = delete;
  EyeTrackingWorker& operator=(const EyeTrackingWorker&) = delete;

  // Start processing frames.
  void Start();

  // Stop processing frames.
  void Stop();

  // Check if worker is running.
  bool IsRunning() const { return is_running_; }

 private:
  void ProcessFrames();
  void ProcessSingleFrame();
  void OnGazeComputed(const EyeTracker::GazePoint& gaze);
  void OnProcessingFailed();

  blink::WebMediaStream media_stream_;
  GazeCallback gaze_callback_;
  FailureCallback failure_callback_;

  std::unique_ptr<FaceDetector> face_detector_;
  std::unique_ptr<GazeEstimator> gaze_estimator_;

  bool is_running_ = false;
  base::Thread worker_thread_;

  scoped_refptr<base::SequencedTaskRunner> main_task_runner_;
  scoped_refptr<base::SequencedTaskRunner> worker_task_runner_;

  SEQUENCE_CHECKER(main_sequence_checker_);
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_EYE_TRACKING_EYE_TRACKING_WORKER_H_
