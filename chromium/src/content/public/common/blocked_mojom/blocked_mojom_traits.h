// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_PUBLIC_COMMON_BLOCKED_MOJOM_BLOCKED_MOJOM_TRAITS_H_
#define CONTENT_PUBLIC_COMMON_BLOCKED_MOJOM_BLOCKED_MOJOM_TRAITS_H_

#include <cstdint>
#include <string>

#include "base/time/time.h"
#include "content/public/common/blocked_mojom/audio_capture.mojom.h"
#include "content/public/common/blocked_mojom/eye_tracking.mojom.h"
#include "content/public/common/blocked_mojom/video_capture.mojom.h"

namespace blocked {

// C++ representation of GazeData for use in renderer/browser code.
struct GazeData {
  GazeData();
  GazeData(float x, float y, float confidence, bool is_off_screen,
           const std::string& off_screen_direction, base::TimeTicks timestamp);
  ~GazeData();
  GazeData(const GazeData&);
  GazeData& operator=(const GazeData&);
  GazeData(GazeData&&) noexcept;
  GazeData& operator=(GazeData&&) noexcept;

  float x = 0.0f;
  float y = 0.0f;
  float confidence = 0.0f;
  bool is_off_screen = false;
  std::string off_screen_direction;
  base::TimeTicks timestamp;
};

// C++ representation of VideoFrameMetadata for use in renderer/browser code.
struct VideoFrameMetadata {
  VideoFrameMetadata();
  ~VideoFrameMetadata();
  VideoFrameMetadata(const VideoFrameMetadata&);
  VideoFrameMetadata& operator=(const VideoFrameMetadata&);
  VideoFrameMetadata(VideoFrameMetadata&&) noexcept;
  VideoFrameMetadata& operator=(VideoFrameMetadata&&) noexcept;

  int32_t width = 0;
  int32_t height = 0;
  blocked::mojom::VideoFormat format = blocked::mojom::VideoFormat::I420;
  base::TimeTicks timestamp;
  int64_t frame_number = 0;
};

// C++ representation of AudioFrameMetadata for use in renderer/browser code.
struct AudioFrameMetadata {
  AudioFrameMetadata();
  ~AudioFrameMetadata();
  AudioFrameMetadata(const AudioFrameMetadata&);
  AudioFrameMetadata& operator=(const AudioFrameMetadata&);
  AudioFrameMetadata(AudioFrameMetadata&&) noexcept;
  AudioFrameMetadata& operator=(AudioFrameMetadata&&) noexcept;

  blocked::mojom::AudioCodec codec = blocked::mojom::AudioCodec::OPUS;
  blocked::mojom::AudioSourceType source_type =
      blocked::mojom::AudioSourceType::MICROPHONE;
  int32_t sample_rate = 48000;
  int32_t channels = 1;
  int32_t bits_per_sample = 16;
  int64_t frame_number = 0;
  base::TimeTicks timestamp;
  int32_t duration_ms = 20;
};

}  // namespace blocked

namespace mojo {

// VideoFrameMetadata traits.
template <>
struct StructTraits<blocked::mojom::VideoFrameMetadataDataView,
                    blocked::VideoFrameMetadata> {
  static int32_t width(const blocked::VideoFrameMetadata& m) { return m.width; }
  static int32_t height(const blocked::VideoFrameMetadata& m) {
    return m.height;
  }
  static blocked::mojom::VideoFormat format(
      const blocked::VideoFrameMetadata& m) {
    return m.format;
  }
  static base::TimeTicks timestamp(const blocked::VideoFrameMetadata& m) {
    return m.timestamp;
  }
  static int64_t frame_number(const blocked::VideoFrameMetadata& m) {
    return m.frame_number;
  }

  static bool Read(blocked::mojom::VideoFrameMetadataDataView data,
                   blocked::VideoFrameMetadata* out);
};

// AudioFrameMetadata traits.
template <>
struct StructTraits<blocked::mojom::AudioFrameMetadataDataView,
                    blocked::AudioFrameMetadata> {
  static blocked::mojom::AudioCodec codec(
      const blocked::AudioFrameMetadata& m) {
    return m.codec;
  }
  static blocked::mojom::AudioSourceType source_type(
      const blocked::AudioFrameMetadata& m) {
    return m.source_type;
  }
  static int32_t sample_rate(const blocked::AudioFrameMetadata& m) {
    return m.sample_rate;
  }
  static int32_t channels(const blocked::AudioFrameMetadata& m) {
    return m.channels;
  }
  static int32_t bits_per_sample(const blocked::AudioFrameMetadata& m) {
    return m.bits_per_sample;
  }
  static int64_t frame_number(const blocked::AudioFrameMetadata& m) {
    return m.frame_number;
  }
  static base::TimeTicks timestamp(const blocked::AudioFrameMetadata& m) {
    return m.timestamp;
  }
  static int32_t duration_ms(const blocked::AudioFrameMetadata& m) {
    return m.duration_ms;
  }

  static bool Read(blocked::mojom::AudioFrameMetadataDataView data,
                   blocked::AudioFrameMetadata* out);
};

// GazeData traits.
template <>
struct StructTraits<blocked::mojom::GazeDataDataView, blocked::GazeData> {
  static float x(const blocked::GazeData& g) { return g.x; }
  static float y(const blocked::GazeData& g) { return g.y; }
  static float confidence(const blocked::GazeData& g) { return g.confidence; }
  static bool is_off_screen(const blocked::GazeData& g) {
    return g.is_off_screen;
  }
  static const std::string& off_screen_direction(const blocked::GazeData& g) {
    return g.off_screen_direction;
  }
  static base::TimeTicks timestamp(const blocked::GazeData& g) {
    return g.timestamp;
  }

  static bool Read(blocked::mojom::GazeDataDataView data,
                   blocked::GazeData* out);
};

}  // namespace mojo

#endif  // CONTENT_PUBLIC_COMMON_BLOCKED_MOJOM_BLOCKED_MOJOM_TRAITS_H_
