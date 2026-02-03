// Copyright 2024 Blockd Inc. All rights reserved.
// Meeting Stream Controller implementation

#include "chrome/browser/blocked/blocked_meeting/meeting_stream_controller.h"

#include "base/json/json_writer.h"
#include "base/logging.h"
#include "base/no_destructor.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/stringprintf.h"
#include "base/task/thread_pool.h"
#include "base/values.h"
#include "content/public/browser/web_contents.h"

namespace blocked {

MeetingStreamController::MeetingStreamController() {
  // Register as observer for meeting platform detection
  MeetingPlatformDetector::GetInstance()->AddObserver(this);

  // Create media capture instance
  media_capture_ = std::make_unique<MediaStreamCapture>();
  media_capture_->SetObserver(this);
}

MeetingStreamController::~MeetingStreamController() {
  MeetingPlatformDetector::GetInstance()->RemoveObserver(this);

  if (is_streaming_) {
    DoStopStream("controller_destroyed");
  }
}

// static
MeetingStreamController* MeetingStreamController::GetInstance() {
  static base::NoDestructor<MeetingStreamController> instance;
  return instance.get();
}

void MeetingStreamController::Initialize(const std::string& session_id,
                                         const std::string& user_id,
                                         const std::string& backend_url) {
  session_id_ = session_id;
  user_id_ = user_id;
  backend_url_ = backend_url;
  is_initialized_ = true;

  LOG(INFO) << "[Blockd] MeetingStreamController initialized"
            << " session_id=" << session_id_
            << " backend_url=" << backend_url_;
}

void MeetingStreamController::SetStreamConfig(
    const MeetingStreamConfig& config) {
  config_ = config;
}

void MeetingStreamController::SetStreamStartedCallback(
    StreamStartedCallback callback) {
  stream_started_callback_ = std::move(callback);
}

void MeetingStreamController::SetStreamStoppedCallback(
    StreamStoppedCallback callback) {
  stream_stopped_callback_ = std::move(callback);
}

void MeetingStreamController::SetStreamErrorCallback(
    StreamErrorCallback callback) {
  stream_error_callback_ = std::move(callback);
}

void MeetingStreamController::StartStream(const MeetingInfo& meeting) {
  if (!is_initialized_) {
    LOG(WARNING) << "[Blockd] Cannot start stream - not initialized";
    if (stream_error_callback_) {
      stream_error_callback_.Run("Controller not initialized");
    }
    return;
  }

  if (is_streaming_) {
    LOG(WARNING) << "[Blockd] Stream already active";
    return;
  }

  DoStartStream(meeting);
}

void MeetingStreamController::StopStream() {
  if (!is_streaming_) {
    return;
  }

  DoStopStream("manual_stop");
}

void MeetingStreamController::OnMeetingDetected(const MeetingInfo& meeting_info) {
  LOG(INFO) << "[Blockd] Meeting detected by controller: "
            << MeetingPlatformDetector::GetPlatformName(meeting_info.platform)
            << " - starting stream";

  if (is_initialized_ && !is_streaming_) {
    DoStartStream(meeting_info);
  }
}

void MeetingStreamController::OnMeetingEnded(const MeetingInfo& meeting_info) {
  LOG(INFO) << "[Blockd] Meeting ended - stopping stream";

  if (is_streaming_) {
    DoStopStream("meeting_ended");
  }
}

void MeetingStreamController::OnMeetingStateChanged(
    const MeetingInfo& meeting_info,
    bool in_call) {
  LOG(INFO) << "[Blockd] Meeting state changed: in_call=" << in_call;

  // Could use this to pause/resume streaming based on actual call state
  // For now, we stream whenever on a meeting platform page
}

void MeetingStreamController::DoStartStream(const MeetingInfo& meeting) {
  current_meeting_ = meeting;
  stats_ = MeetingStreamStats();
  stats_.stream_started_at = base::Time::Now();

  // Generate stream ID
  stream_id_ = base::StringPrintf(
      "%s_%s_%lld",
      session_id_.c_str(),
      MeetingPlatformDetector::GetPlatformName(meeting.platform).c_str(),
      base::Time::Now().ToTimeT());

  LOG(INFO) << "[Blockd] Starting meeting stream"
            << " stream_id=" << stream_id_
            << " platform=" << MeetingPlatformDetector::GetPlatformName(
                   meeting.platform);

  // Send start request to backend
  SendStartStreamRequest(meeting);
}

void MeetingStreamController::DoStopStream(const std::string& reason) {
  LOG(INFO) << "[Blockd] Stopping meeting stream"
            << " stream_id=" << stream_id_
            << " reason=" << reason
            << " frames_sent=" << stats_.video_frames_sent
            << " chunks_sent=" << stats_.audio_chunks_sent;

  // Stop capture
  StopVideoCapture();
  StopAudioCapture();

  // Stop heartbeat
  heartbeat_timer_.Stop();

  // Send stop request to backend
  SendStopStreamRequest(reason);

  // Notify callback
  if (stream_stopped_callback_) {
    stream_stopped_callback_.Run(current_meeting_, stats_);
  }

  is_streaming_ = false;
  stream_id_.clear();
  current_meeting_ = MeetingInfo();
}

void MeetingStreamController::SendStartStreamRequest(
    const MeetingInfo& meeting) {
  // Build request payload
  base::Value::Dict request;
  request.Set("session_id", session_id_);
  request.Set("user_id", user_id_);
  request.Set("meeting_platform",
              MeetingPlatformDetector::GetPlatformName(meeting.platform));
  request.Set("meeting_url", meeting.meeting_url);
  request.Set("meeting_id", meeting.meeting_id);
  request.Set("browser_fingerprint", "blockd-browser-v1");  // TODO: Real fingerprint
  request.Set("video_enabled", config_.enable_video);
  request.Set("audio_enabled", config_.enable_audio);

  std::string json;
  base::JSONWriter::Write(request, &json);

  LOG(INFO) << "[Blockd] Sending start stream request to backend";

  // TODO: Actually send HTTP request to backend
  // For now, simulate success
  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&MeetingStreamController::OnStartStreamResponse,
                     weak_factory_.GetWeakPtr(),
                     true,  // success
                     stream_id_,
                     ""),  // no error
      base::Milliseconds(100));
}

void MeetingStreamController::SendStopStreamRequest(const std::string& reason) {
  base::Value::Dict request;
  request.Set("session_id", session_id_);
  request.Set("stream_id", stream_id_);
  request.Set("reason", reason);

  std::string json;
  base::JSONWriter::Write(request, &json);

  LOG(INFO) << "[Blockd] Sending stop stream request to backend";

  // TODO: Actually send HTTP request to backend
  base::SequencedTaskRunner::GetCurrentDefault()->PostDelayedTask(
      FROM_HERE,
      base::BindOnce(&MeetingStreamController::OnStopStreamResponse,
                     weak_factory_.GetWeakPtr(),
                     true),  // success
      base::Milliseconds(100));
}

void MeetingStreamController::SendHeartbeat() {
  if (!is_streaming_) {
    return;
  }

  LOG(INFO) << "[Blockd] Sending stream heartbeat"
            << " frames=" << stats_.video_frames_sent
            << " chunks=" << stats_.audio_chunks_sent;

  // TODO: Send actual heartbeat to backend
  stats_.last_activity = base::Time::Now();
}

void MeetingStreamController::OnStartStreamResponse(bool success,
                                                    const std::string& stream_id,
                                                    const std::string& error) {
  if (!success) {
    LOG(ERROR) << "[Blockd] Failed to start stream: " << error;
    if (stream_error_callback_) {
      stream_error_callback_.Run(error);
    }
    return;
  }

  is_streaming_ = true;
  stream_id_ = stream_id;

  LOG(INFO) << "[Blockd] Stream started successfully"
            << " stream_id=" << stream_id_;

  // Start video/audio capture
  if (config_.enable_video) {
    StartVideoCapture();
  }
  if (config_.enable_audio) {
    StartAudioCapture();
  }

  // Start heartbeat timer
  heartbeat_timer_.Start(
      FROM_HERE,
      kHeartbeatInterval,
      base::BindRepeating(&MeetingStreamController::SendHeartbeat,
                          weak_factory_.GetWeakPtr()));

  // Notify callback
  if (stream_started_callback_) {
    stream_started_callback_.Run(current_meeting_, stream_id_);
  }
}

void MeetingStreamController::OnStopStreamResponse(bool success) {
  if (!success) {
    LOG(WARNING) << "[Blockd] Stop stream request failed (non-critical)";
  }
}

void MeetingStreamController::StartVideoCapture() {
  LOG(INFO) << "[Blockd] Starting video capture"
            << " resolution=" << config_.video_width << "x" << config_.video_height
            << " fps=" << config_.video_fps;

  if (!media_capture_) {
    LOG(ERROR) << "[Blockd] MediaStreamCapture not initialized";
    return;
  }

  // Configure media capture
  MediaCaptureConfig capture_config;
  capture_config.capture_video = true;
  capture_config.capture_audio = config_.enable_audio;
  capture_config.video_width = config_.video_width;
  capture_config.video_height = config_.video_height;
  capture_config.video_fps = config_.video_fps;
  capture_config.video_format = config_.video_format;
  capture_config.audio_sample_rate = config_.audio_sample_rate;
  capture_config.audio_channels = config_.audio_channels;
  capture_config.audio_chunk_ms = config_.audio_chunk_duration_ms;

  // Tab capture settings for interviewer screen/audio
  capture_config.capture_tab_video = true;
  capture_config.capture_tab_audio = true;
  capture_config.tab_video_width = 1280;
  capture_config.tab_video_height = 720;
  capture_config.tab_video_fps = 5;

  media_capture_->Initialize(capture_config);

  // Start camera capture (interviewee)
  media_capture_->StartCameraCapture();

  // Start tab capture (interviewer screen/audio for Mode Collapse)
  if (meeting_tab_contents_) {
    media_capture_->StartTabCapture(meeting_tab_contents_);
  }
}

void MeetingStreamController::StopVideoCapture() {
  LOG(INFO) << "[Blockd] Stopping video capture";

  if (media_capture_) {
    media_capture_->StopCameraCapture();
    media_capture_->StopTabCapture();
  }
}

void MeetingStreamController::StartAudioCapture() {
  LOG(INFO) << "[Blockd] Starting audio capture"
            << " sample_rate=" << config_.audio_sample_rate
            << " channels=" << config_.audio_channels;

  // Audio capture is started along with video capture in StartVideoCapture()
  // Both camera audio and tab audio are captured via MediaStreamCapture
}

void MeetingStreamController::StopAudioCapture() {
  LOG(INFO) << "[Blockd] Stopping audio capture";
  // Audio capture is stopped along with video capture in StopVideoCapture()
}

void MeetingStreamController::OnVideoFrameCaptured(const uint8_t* data,
                                                   size_t size,
                                                   int width,
                                                   int height) {
  if (!is_streaming_) {
    return;
  }

  stats_.video_frames_sent++;
  stats_.bytes_sent += size;
  stats_.last_activity = base::Time::Now();

  // TODO: Send frame to backend via HTTP or WebSocket
  LOG(INFO) << "[Blockd] Video frame captured"
            << " size=" << size
            << " dimensions=" << width << "x" << height
            << " total_frames=" << stats_.video_frames_sent;
}

void MeetingStreamController::OnAudioChunkCaptured(const uint8_t* data,
                                                   size_t size,
                                                   int duration_ms) {
  if (!is_streaming_) {
    return;
  }

  stats_.audio_chunks_sent++;
  stats_.bytes_sent += size;
  stats_.last_activity = base::Time::Now();

  // TODO: Send audio chunk to backend
  LOG(INFO) << "[Blockd] Audio chunk captured"
            << " size=" << size
            << " duration_ms=" << duration_ms
            << " total_chunks=" << stats_.audio_chunks_sent;
}

void MeetingStreamController::SetMeetingTabContents(
    content::WebContents* web_contents) {
  meeting_tab_contents_ = web_contents;

  if (is_streaming_ && web_contents && media_capture_) {
    // If already streaming, start tab capture for the new tab
    media_capture_->StartTabCapture(web_contents);
  }
}

// MediaStreamCaptureObserver implementation
void MeetingStreamController::OnFrameCaptured(const CapturedFrame& frame) {
  if (!is_streaming_) {
    return;
  }

  if (frame.type == StreamType::kIntervieweeCamera) {
    // Camera frame - send to backend for security analysis
    stats_.video_frames_sent++;
    stats_.bytes_sent += frame.data.size();
    stats_.last_activity = base::Time::Now();

    LOG(INFO) << "[Blockd] Camera frame captured"
              << " size=" << frame.data.size()
              << " dimensions=" << frame.width << "x" << frame.height
              << " format=" << frame.format;

    // TODO: Send to backend via BlockedBackendConnector
    // BlockedBackendConnector::GetInstance()->SendVideoFrame(
    //     stream_id_, frame.data, frame.width, frame.height,
    //     frame.timestamp_ms, StreamType::kIntervieweeCamera);
  } else if (frame.type == StreamType::kInterviewerScreen) {
    // Tab/screen frame - send to backend for Mode Collapse analysis
    stats_.video_frames_sent++;
    stats_.bytes_sent += frame.data.size();
    stats_.last_activity = base::Time::Now();

    LOG(INFO) << "[Blockd] Meeting screen captured"
              << " size=" << frame.data.size()
              << " dimensions=" << frame.width << "x" << frame.height
              << " format=" << frame.format;

    // TODO: Send to backend for Mode Collapse question extraction
    // This captures what the interviewer is showing
  }
}

void MeetingStreamController::OnAudioCaptured(const CapturedAudio& audio) {
  if (!is_streaming_) {
    return;
  }

  stats_.audio_chunks_sent++;
  stats_.bytes_sent += audio.data.size();
  stats_.last_activity = base::Time::Now();

  if (audio.type == StreamType::kInterviewerAudio) {
    // Interviewer audio - send to backend for question extraction
    LOG(INFO) << "[Blockd] Interviewer audio captured"
              << " size=" << audio.data.size()
              << " duration_ms=" << audio.duration_ms
              << " format=" << audio.format;

    // TODO: Send to backend for Mode Collapse transcription
    // This captures what the interviewer is saying (questions)
  }
}

void MeetingStreamController::OnCaptureStarted(StreamType type) {
  std::string type_name;
  switch (type) {
    case StreamType::kIntervieweeCamera:
      type_name = "interviewee_camera";
      break;
    case StreamType::kInterviewerScreen:
      type_name = "interviewer_screen";
      break;
    case StreamType::kInterviewerAudio:
      type_name = "interviewer_audio";
      break;
  }

  LOG(INFO) << "[Blockd] Capture started: " << type_name;
}

void MeetingStreamController::OnCaptureStopped(StreamType type,
                                                const std::string& reason) {
  std::string type_name;
  switch (type) {
    case StreamType::kIntervieweeCamera:
      type_name = "interviewee_camera";
      break;
    case StreamType::kInterviewerScreen:
      type_name = "interviewer_screen";
      break;
    case StreamType::kInterviewerAudio:
      type_name = "interviewer_audio";
      break;
  }

  LOG(INFO) << "[Blockd] Capture stopped: " << type_name
            << " reason=" << reason;
}

void MeetingStreamController::OnCaptureError(StreamType type,
                                              const std::string& error) {
  LOG(ERROR) << "[Blockd] Capture error: " << error;

  if (stream_error_callback_) {
    stream_error_callback_.Run(error);
  }
}

}  // namespace blocked
