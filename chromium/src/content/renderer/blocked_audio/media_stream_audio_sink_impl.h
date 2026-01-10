// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_AUDIO_MEDIA_STREAM_AUDIO_SINK_IMPL_H_
#define CONTENT_RENDERER_BLOCKED_AUDIO_MEDIA_STREAM_AUDIO_SINK_IMPL_H_

#include "base/functional/callback.h"
#include "base/memory/weak_ptr.h"
#include "base/sequence_checker.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream_audio_sink.h"
#include "third_party/blink/public/platform/modules/mediastream/web_media_stream_track.h"

namespace content {

// Implementation of WebMediaStreamAudioSink that receives audio data
// from a MediaStream audio track.
class MediaStreamAudioSinkImpl : public blink::WebMediaStreamAudioSink {
 public:
  using AudioDataCallback =
      base::RepeatingCallback<void(const float* data, int num_samples,
                                   int sample_rate, int num_channels)>;

  explicit MediaStreamAudioSinkImpl(AudioDataCallback callback);
  ~MediaStreamAudioSinkImpl() override;

  MediaStreamAudioSinkImpl(const MediaStreamAudioSinkImpl&) = delete;
  MediaStreamAudioSinkImpl& operator=(const MediaStreamAudioSinkImpl&) = delete;

  // Connect to an audio track.
  bool ConnectToTrack(const blink::WebMediaStreamTrack& track);

  // Disconnect from the current track.
  void DisconnectFromTrack();

  // Check if connected to a track.
  bool IsConnected() const { return is_connected_; }

  // blink::WebMediaStreamAudioSink implementation.
  void OnData(const media::AudioBus& audio_bus,
              base::TimeTicks estimated_capture_time) override;
  void OnSetFormat(const media::AudioParameters& params) override;

 private:
  AudioDataCallback audio_callback_;
  blink::WebMediaStreamTrack connected_track_;
  bool is_connected_ = false;

  // Audio format info.
  int sample_rate_ = 48000;
  int num_channels_ = 1;
  int frames_per_buffer_ = 480;

  // Buffer for converting AudioBus to float array.
  std::vector<float> interleaved_buffer_;

  SEQUENCE_CHECKER(sequence_checker_);
  base::WeakPtrFactory<MediaStreamAudioSinkImpl> weak_factory_{this};
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_AUDIO_MEDIA_STREAM_AUDIO_SINK_IMPL_H_
