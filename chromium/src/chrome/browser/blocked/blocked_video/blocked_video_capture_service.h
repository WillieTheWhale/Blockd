// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_BLOCKED_VIDEO_BLOCKED_VIDEO_CAPTURE_SERVICE_H_
#define CHROME_BROWSER_BLOCKED_BLOCKED_VIDEO_BLOCKED_VIDEO_CAPTURE_SERVICE_H_

#include <memory>
#include <string>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "base/time/time.h"
#include "content/public/common/blocked_mojom/video_capture.mojom.h"
#include "components/keyed_service/core/keyed_service.h"
#include "mojo/public/cpp/bindings/receiver.h"
#include "mojo/public/cpp/bindings/remote.h"

namespace blocked {

class BlockedBackendConnector;

// Video capture service that receives video frames from the renderer process
// via Mojo IPC and forwards them to the backend for recording/streaming.
// Implements the VideoCaptureHost interface to receive frames.
class BlockedVideoCaptureService : public KeyedService,
                                    public mojom::VideoCaptureHost {
 public:
  enum class CaptureState {
    STOPPED,
    STARTING,
    CAPTURING,
    ERROR
  };

  // Observer interface for capture events.
  class Observer {
   public:
    virtual ~Observer() = default;
    virtual void OnCaptureStateChanged(CaptureState state) = 0;
    virtual void OnFrameReceived(int width, int height, int64_t frame_number) {}
    virtual void OnCaptureError(const std::string& error) = 0;
  };

  BlockedVideoCaptureService();
  ~BlockedVideoCaptureService() override;

  // KeyedService implementation
  void Shutdown() override;

  // Bind the Mojo interface and store the client remote.
  void BindInterface(
      mojo::PendingReceiver<mojom::VideoCaptureHost> receiver,
      mojo::PendingRemote<mojom::VideoCaptureClient> client);

  // Start/stop video capture by sending commands to renderer.
  void StartCapture(const std::string& session_id);
  void StopCapture();
  CaptureState GetState() const { return state_; }
  bool IsCapturing() const { return state_ == CaptureState::CAPTURING; }

  // Video stream settings (applied on next StartCapture).
  void SetResolution(int width, int height);
  void SetFrameRate(int fps);
  void SetDeviceId(const std::string& device_id);
  void SetEnableEncoding(bool enable);

  // Set the backend connector for sending frames.
  void SetBackendConnector(BlockedBackendConnector* connector);

  // Observer management.
  void AddObserver(Observer* observer);
  void RemoveObserver(Observer* observer);

  // Statistics.
  int64_t GetFramesReceived() const { return frames_received_; }
  int64_t GetBytesReceived() const { return bytes_received_; }
  base::TimeDelta GetCaptureUptime() const;

  // mojom::VideoCaptureHost implementation
  void OnVideoFrame(mojo_base::BigBuffer frame_data,
                    mojom::VideoFrameMetadataPtr metadata) override;
  void OnEncodedFrame(mojo_base::BigBuffer encoded_data,
                      base::TimeTicks timestamp) override;
  void OnCaptureStarted(mojom::VideoCaptureSettingsPtr settings) override;
  void OnCaptureStopped() override;
  void OnCaptureError(const std::string& error_message) override;

 private:
  void UpdateState(CaptureState new_state);
  void NotifyObservers(CaptureState state);
  void NotifyObserversError(const std::string& error);
  void SendFrameToBackend(const std::vector<uint8_t>& frame_data,
                          int width, int height);

  std::string session_id_;
  CaptureState state_ = CaptureState::STOPPED;

  // Capture settings.
  int capture_width_ = 640;
  int capture_height_ = 480;
  int capture_fps_ = 30;
  std::string device_id_;
  bool enable_encoding_ = false;

  // Mojo bindings.
  mojo::Receiver<mojom::VideoCaptureHost> receiver_{this};
  mojo::Remote<mojom::VideoCaptureClient> client_;

  // Backend connector for sending video data (not owned).
  raw_ptr<BlockedBackendConnector> backend_connector_ = nullptr;

  // Statistics.
  int64_t frames_received_ = 0;
  int64_t bytes_received_ = 0;
  base::TimeTicks capture_start_time_;

  // Observers.
  std::vector<Observer*> observers_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<BlockedVideoCaptureService> weak_factory_{this};
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_BLOCKED_VIDEO_BLOCKED_VIDEO_CAPTURE_SERVICE_H_
