// Copyright 2024 Blockd Inc. All rights reserved.
// Meeting Stream Controller - manages media streaming when on meeting platforms

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_STREAM_CONTROLLER_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_STREAM_CONTROLLER_H_

#include <memory>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/timer/timer.h"
#include "chrome/browser/blocked/blocked_meeting/meeting_platform_detector.h"
#include "chrome/browser/blocked/blocked_video/media_stream_capture.h"

namespace content {
class WebContents;
}  // namespace content

namespace blocked {

// Stream configuration
struct MeetingStreamConfig {
  bool enable_video = true;
  bool enable_audio = true;
  int video_width = 1280;
  int video_height = 720;
  int video_fps = 15;
  std::string video_format = "jpeg";
  int audio_sample_rate = 48000;
  int audio_channels = 1;
  int audio_chunk_duration_ms = 5000;
};

// Stream statistics
struct MeetingStreamStats {
  uint64_t video_frames_sent = 0;
  uint64_t audio_chunks_sent = 0;
  uint64_t bytes_sent = 0;
  base::Time stream_started_at;
  base::Time last_activity;
};

// Controls media streaming to backend when user is on a meeting platform
class MeetingStreamController : public MeetingPlatformObserver,
                                 public MediaStreamCaptureObserver {
 public:
  // Callback for stream events
  using StreamStartedCallback = base::RepeatingCallback<void(
      const MeetingInfo& meeting,
      const std::string& stream_id)>;
  using StreamStoppedCallback = base::RepeatingCallback<void(
      const MeetingInfo& meeting,
      const MeetingStreamStats& stats)>;
  using StreamErrorCallback = base::RepeatingCallback<void(
      const std::string& error)>;

  MeetingStreamController();
  ~MeetingStreamController() override;

  MeetingStreamController(const MeetingStreamController&) = delete;
  MeetingStreamController& operator=(const MeetingStreamController&) = delete;

  // Singleton access
  static MeetingStreamController* GetInstance();

  // Initialize with session info
  void Initialize(const std::string& session_id,
                  const std::string& user_id,
                  const std::string& backend_url);

  // Configure stream settings
  void SetStreamConfig(const MeetingStreamConfig& config);

  // Set callbacks
  void SetStreamStartedCallback(StreamStartedCallback callback);
  void SetStreamStoppedCallback(StreamStoppedCallback callback);
  void SetStreamErrorCallback(StreamErrorCallback callback);

  // Manual stream control (normally automatic via observer)
  void StartStream(const MeetingInfo& meeting);
  void StopStream();

  // Check if currently streaming
  bool IsStreaming() const { return is_streaming_; }

  // Get current stats
  const MeetingStreamStats& GetStats() const { return stats_; }

  // Get current stream ID
  const std::string& GetStreamId() const { return stream_id_; }

  // MeetingPlatformObserver implementation
  void OnMeetingDetected(const MeetingInfo& meeting_info) override;
  void OnMeetingEnded(const MeetingInfo& meeting_info) override;
  void OnMeetingStateChanged(const MeetingInfo& meeting_info,
                             bool in_call) override;

  // MediaStreamCaptureObserver implementation
  void OnFrameCaptured(const CapturedFrame& frame) override;
  void OnAudioCaptured(const CapturedAudio& audio) override;
  void OnCaptureStarted(StreamType type) override;
  void OnCaptureStopped(StreamType type, const std::string& reason) override;
  void OnCaptureError(StreamType type, const std::string& error) override;

  // Set the web contents for tab capture (interviewer screen/audio)
  void SetMeetingTabContents(content::WebContents* web_contents);

 private:
  // Internal stream management
  void DoStartStream(const MeetingInfo& meeting);
  void DoStopStream(const std::string& reason);

  // Backend communication
  void SendStartStreamRequest(const MeetingInfo& meeting);
  void SendStopStreamRequest(const std::string& reason);
  void SendHeartbeat();

  // Handle backend responses
  void OnStartStreamResponse(bool success,
                             const std::string& stream_id,
                             const std::string& error);
  void OnStopStreamResponse(bool success);

  // Video/audio capture control
  void StartVideoCapture();
  void StopVideoCapture();
  void StartAudioCapture();
  void StopAudioCapture();

  // Frame/chunk sending
  void OnVideoFrameCaptured(const uint8_t* data,
                            size_t size,
                            int width,
                            int height);
  void OnAudioChunkCaptured(const uint8_t* data,
                            size_t size,
                            int duration_ms);

  // Session info
  std::string session_id_;
  std::string user_id_;
  std::string backend_url_;

  // Stream state
  bool is_initialized_ = false;
  bool is_streaming_ = false;
  std::string stream_id_;
  MeetingInfo current_meeting_;
  MeetingStreamConfig config_;
  MeetingStreamStats stats_;

  // Heartbeat timer
  base::RepeatingTimer heartbeat_timer_;
  static constexpr base::TimeDelta kHeartbeatInterval = base::Seconds(10);

  // Callbacks
  StreamStartedCallback stream_started_callback_;
  StreamStoppedCallback stream_stopped_callback_;
  StreamErrorCallback stream_error_callback_;

  // Media capture
  std::unique_ptr<MediaStreamCapture> media_capture_;
  content::WebContents* meeting_tab_contents_ = nullptr;

  base::WeakPtrFactory<MeetingStreamController> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_MEETING_MEETING_STREAM_CONTROLLER_H_
