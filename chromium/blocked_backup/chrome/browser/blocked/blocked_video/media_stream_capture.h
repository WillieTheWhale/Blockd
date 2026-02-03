// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_VIDEO_MEDIA_STREAM_CAPTURE_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_VIDEO_MEDIA_STREAM_CAPTURE_H_

#include <memory>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/time/time.h"

namespace content {
class WebContents;
}  // namespace content

namespace blocked {

// Stream types for different capture scenarios
enum class StreamType {
  kIntervieweeCamera,    // User's webcam for security monitoring
  kInterviewerScreen,    // Meeting screen capture for Mode Collapse
  kInterviewerAudio,     // Meeting audio for question extraction
};

// Captured frame data
struct CapturedFrame {
  StreamType type;
  std::vector<uint8_t> data;
  int width = 0;
  int height = 0;
  int64_t timestamp_ms = 0;
  std::string format;  // "i420", "nv12", "jpeg", "h264"
};

// Captured audio chunk data
struct CapturedAudio {
  StreamType type;
  std::vector<uint8_t> data;
  int sample_rate = 0;
  int channels = 0;
  int duration_ms = 0;
  int64_t timestamp_ms = 0;
  std::string format;  // "pcm16", "opus"
};

// Configuration for media capture
struct MediaCaptureConfig {
  // Video settings
  bool capture_video = true;
  int video_width = 640;
  int video_height = 480;
  int video_fps = 15;
  std::string video_format = "jpeg";  // jpeg for bandwidth, i420 for processing

  // Audio settings
  bool capture_audio = true;
  int audio_sample_rate = 16000;  // 16kHz for speech recognition
  int audio_channels = 1;
  int audio_chunk_ms = 1000;  // Send audio in 1-second chunks
  std::string audio_format = "opus";

  // Tab capture settings (for interviewer screen/audio)
  bool capture_tab_video = true;
  bool capture_tab_audio = true;
  int tab_video_width = 1280;
  int tab_video_height = 720;
  int tab_video_fps = 5;  // Lower FPS for screen capture
};

// Observer interface for captured media
class MediaStreamCaptureObserver {
 public:
  virtual ~MediaStreamCaptureObserver() = default;

  // Called when a video frame is captured
  virtual void OnFrameCaptured(const CapturedFrame& frame) = 0;

  // Called when an audio chunk is captured
  virtual void OnAudioCaptured(const CapturedAudio& audio) = 0;

  // Called when capture starts
  virtual void OnCaptureStarted(StreamType type) = 0;

  // Called when capture stops
  virtual void OnCaptureStopped(StreamType type, const std::string& reason) = 0;

  // Called on capture error
  virtual void OnCaptureError(StreamType type, const std::string& error) = 0;
};

// Manages media capture from webcam and meeting tab
class MediaStreamCapture {
 public:
  MediaStreamCapture();
  ~MediaStreamCapture();

  MediaStreamCapture(const MediaStreamCapture&) = delete;
  MediaStreamCapture& operator=(const MediaStreamCapture&) = delete;

  // Singleton access
  static MediaStreamCapture* GetInstance();

  // Initialize with configuration
  void Initialize(const MediaCaptureConfig& config);

  // Set observer for captured media
  void SetObserver(MediaStreamCaptureObserver* observer);

  // Start capturing interviewee's webcam
  void StartCameraCapture();
  void StopCameraCapture();
  bool IsCameraCapturing() const { return is_camera_capturing_; }

  // Start capturing meeting tab (screen and audio)
  // This captures what the interviewer is showing/saying
  void StartTabCapture(content::WebContents* web_contents);
  void StopTabCapture();
  bool IsTabCapturing() const { return is_tab_capturing_; }

  // Get current configuration
  const MediaCaptureConfig& GetConfig() const { return config_; }

  // Statistics
  struct CaptureStats {
    uint64_t camera_frames_captured = 0;
    uint64_t tab_frames_captured = 0;
    uint64_t audio_chunks_captured = 0;
    uint64_t total_bytes_captured = 0;
    base::Time capture_started;
  };
  const CaptureStats& GetStats() const { return stats_; }

 private:
  // Internal capture implementation
  void DoCameraCapture();
  void DoTabCapture();
  void ProcessCameraFrame(const uint8_t* data, size_t size, int width, int height);
  void ProcessTabFrame(const uint8_t* data, size_t size, int width, int height);
  void ProcessAudioChunk(const uint8_t* data, size_t size, int sample_rate, int channels, StreamType type);

  // Frame encoding helpers
  std::vector<uint8_t> EncodeFrameAsJpeg(const uint8_t* data, int width, int height);
  std::vector<uint8_t> EncodeAudioAsOpus(const uint8_t* data, size_t size, int sample_rate, int channels);

  // State
  bool is_initialized_ = false;
  bool is_camera_capturing_ = false;
  bool is_tab_capturing_ = false;
  MediaCaptureConfig config_;
  CaptureStats stats_;

  // Observer
  MediaStreamCaptureObserver* observer_ = nullptr;

  // Reference to captured tab
  content::WebContents* captured_tab_ = nullptr;

  base::WeakPtrFactory<MediaStreamCapture> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_VIDEO_MEDIA_STREAM_CAPTURE_H_
