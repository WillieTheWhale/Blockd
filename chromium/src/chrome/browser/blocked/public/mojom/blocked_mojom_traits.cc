// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/public/mojom/blocked_mojom_traits.h"

namespace blocked {

GazeData::GazeData() = default;

GazeData::GazeData(float x,
                   float y,
                   float confidence,
                   bool is_off_screen,
                   const std::string& direction,
                   base::TimeTicks timestamp)
    : x(x),
      y(y),
      confidence(confidence),
      is_off_screen(is_off_screen),
      off_screen_direction(direction),
      timestamp(timestamp) {}

GazeData::~GazeData() = default;

GazeData::GazeData(const GazeData& other) = default;

GazeData& GazeData::operator=(const GazeData& other) = default;

}  // namespace blocked

namespace mojo {

bool StructTraits<blocked::mojom::GazeDataDataView, ::blocked::GazeData>::Read(
    blocked::mojom::GazeDataDataView data,
    ::blocked::GazeData* out) {
  out->x = data.x();
  out->y = data.y();
  out->confidence = data.confidence();
  out->is_off_screen = data.is_off_screen();

  if (!data.ReadOffScreenDirection(&out->off_screen_direction)) {
    return false;
  }

  if (!data.ReadTimestamp(&out->timestamp)) {
    return false;
  }

  // Validate ranges
  if (out->x < 0.0f || out->x > 1.0f || out->y < 0.0f || out->y > 1.0f) {
    // Out of bounds coordinates - could be off-screen
    if (!out->is_off_screen) {
      return false;
    }
  }

  if (out->confidence < 0.0f || out->confidence > 1.0f) {
    return false;
  }

  return true;
}

}  // namespace mojo
