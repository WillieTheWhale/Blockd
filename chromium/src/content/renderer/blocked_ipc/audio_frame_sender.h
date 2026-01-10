// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_IPC_AUDIO_FRAME_SENDER_H_
#define CONTENT_RENDERER_BLOCKED_IPC_AUDIO_FRAME_SENDER_H_

#include <cstdint>
#include <queue>
#include <vector>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "base/sequence_checker.h"
#include "base/time/time.h"
#include "content/public/common/blocked_mojom/audio_capture.mojom.h"
#include "content/public/common/blocked_mojom/blocked_mojom_traits.h"

namespace content {

// Sends audio frames to browser process via Mojo IPC.
// Singleton class for efficient audio transmission.
class AudioFrameSender {
 public:
  struct PendingAudioFrame {
    PendingAudioFrame();
    ~PendingAudioFrame();
    PendingAudioFrame(PendingAudioFrame&&) noexcept;
    PendingAudioFrame& operator=(PendingAudioFrame&&) noexcept;

    std::vector<uint8_t> data;
    blocked::AudioFrameMetadata metadata;
    base::TimeTicks queued_at;
  };

  static AudioFrameSender* GetInstance();

  AudioFrameSender(const AudioFrameSender&) = delete;
  AudioFrameSender& operator=(const AudioFrameSender&) = delete;

  // Initialize with audio capture host.
  void Initialize(blocked::mojom::AudioCaptureHost* host);

  // Check if initialized.
  bool IsInitialized() const { return audio_capture_host_ != nullptr; }

  // Send raw audio frame to browser.
  void SendFrame(const uint8_t* frame_data, int size,
                 const blocked::AudioFrameMetadata& metadata);

  // Send encoded audio frame (Opus).
  void SendEncodedFrame(const uint8_t* encoded_data, int size,
                        const blocked::AudioFrameMetadata& metadata);

  // Send audio level update.
  void SendAudioLevel(float level_db,
                      blocked::mojom::AudioSourceType source_type);

  // Notify capture started/stopped.
  void NotifyCaptureStarted(blocked::mojom::AudioCaptureSettingsPtr settings);
  void NotifyCaptureStopped();
  void NotifyCaptureError(const std::string& error_message);

  // Get statistics.
  int GetTotalFramesSent() const { return total_sent_; }
  int64_t GetTotalBytesSent() const { return total_bytes_; }
  int GetDroppedFrames() const { return dropped_frames_; }
  int GetPendingFrames() const {
    return static_cast<int>(pending_frames_.size());
  }

  // Configuration.
  void SetMaxPendingFrames(size_t max) { max_pending_frames_ = max; }

 private:
  friend class base::NoDestructor<AudioFrameSender>;

  AudioFrameSender();
  ~AudioFrameSender();

  void ProcessPendingFrames();
  void DropOldestFrame();

  raw_ptr<blocked::mojom::AudioCaptureHost> audio_capture_host_ = nullptr;

  // Frame queue for when host is temporarily unavailable.
  std::queue<PendingAudioFrame> pending_frames_;
  size_t max_pending_frames_ = 50;  // ~1 second at 20ms frames

  // Statistics.
  int total_sent_ = 0;
  int64_t total_bytes_ = 0;
  int dropped_frames_ = 0;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<AudioFrameSender> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_IPC_AUDIO_FRAME_SENDER_H_
