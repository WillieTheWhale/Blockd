// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/public/common/blocked_mojom/blocked_mojom_traits.h"

namespace blocked {

// VideoFrameMetadata implementation.
VideoFrameMetadata::VideoFrameMetadata() = default;
VideoFrameMetadata::~VideoFrameMetadata() = default;
VideoFrameMetadata::VideoFrameMetadata(const VideoFrameMetadata&) = default;
VideoFrameMetadata& VideoFrameMetadata::operator=(const VideoFrameMetadata&) =
    default;
VideoFrameMetadata::VideoFrameMetadata(VideoFrameMetadata&&) noexcept = default;
VideoFrameMetadata& VideoFrameMetadata::operator=(VideoFrameMetadata&&) noexcept
    = default;

// AudioFrameMetadata implementation.
AudioFrameMetadata::AudioFrameMetadata() = default;
AudioFrameMetadata::~AudioFrameMetadata() = default;
AudioFrameMetadata::AudioFrameMetadata(const AudioFrameMetadata&) = default;
AudioFrameMetadata& AudioFrameMetadata::operator=(const AudioFrameMetadata&) =
    default;
AudioFrameMetadata::AudioFrameMetadata(AudioFrameMetadata&&) noexcept = default;
AudioFrameMetadata& AudioFrameMetadata::operator=(AudioFrameMetadata&&) noexcept
    = default;

}  // namespace blocked

namespace mojo {

// VideoFrameMetadata Read implementation.
bool StructTraits<blocked::mojom::VideoFrameMetadataDataView,
                  blocked::VideoFrameMetadata>::
    Read(blocked::mojom::VideoFrameMetadataDataView data,
         blocked::VideoFrameMetadata* out) {
  out->width = data.width();
  out->height = data.height();
  out->format = data.format();
  out->frame_number = data.frame_number();
  return data.ReadTimestamp(&out->timestamp);
}

// AudioFrameMetadata Read implementation.
bool StructTraits<blocked::mojom::AudioFrameMetadataDataView,
                  blocked::AudioFrameMetadata>::
    Read(blocked::mojom::AudioFrameMetadataDataView data,
         blocked::AudioFrameMetadata* out) {
  out->codec = data.codec();
  out->source_type = data.source_type();
  out->sample_rate = data.sample_rate();
  out->channels = data.channels();
  out->bits_per_sample = data.bits_per_sample();
  out->frame_number = data.frame_number();
  out->duration_ms = data.duration_ms();
  return data.ReadTimestamp(&out->timestamp);
}

}  // namespace mojo
