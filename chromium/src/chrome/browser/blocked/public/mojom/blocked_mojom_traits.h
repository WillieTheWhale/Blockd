// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PUBLIC_MOJOM_BLOCKED_MOJOM_TRAITS_H_
#define CHROME_BROWSER_BLOCKED_PUBLIC_MOJOM_BLOCKED_MOJOM_TRAITS_H_

#include <string>

#include "base/time/time.h"
#include "chrome/browser/blocked/public/mojom/eye_tracking.mojom.h"
#include "mojo/public/cpp/bindings/struct_traits.h"

namespace blocked {

// Native C++ representation of GazeData.
// Used by browser-side code for gaze tracking.
struct GazeData {
  float x = 0.0f;              // Normalized screen X (0-1)
  float y = 0.0f;              // Normalized screen Y (0-1)
  float confidence = 0.0f;     // Tracking quality (0-1)
  bool is_off_screen = false;
  std::string off_screen_direction;  // "left", "right", "up", "down", ""
  base::TimeTicks timestamp;

  GazeData();
  GazeData(float x, float y, float confidence, bool is_off_screen,
           const std::string& direction, base::TimeTicks timestamp);
  ~GazeData();
  GazeData(const GazeData& other);
  GazeData& operator=(const GazeData& other);
};

}  // namespace blocked

namespace mojo {

// Type mapping for blocked.mojom.GazeData <-> blocked::GazeData
template <>
struct StructTraits<blocked::mojom::GazeDataDataView, ::blocked::GazeData> {
  static float x(const ::blocked::GazeData& data) { return data.x; }
  static float y(const ::blocked::GazeData& data) { return data.y; }
  static float confidence(const ::blocked::GazeData& data) {
    return data.confidence;
  }
  static bool is_off_screen(const ::blocked::GazeData& data) {
    return data.is_off_screen;
  }
  static const std::string& off_screen_direction(
      const ::blocked::GazeData& data) {
    return data.off_screen_direction;
  }
  static base::TimeTicks timestamp(const ::blocked::GazeData& data) {
    return data.timestamp;
  }

  static bool Read(blocked::mojom::GazeDataDataView data,
                   ::blocked::GazeData* out);
};

}  // namespace mojo

#endif  // CHROME_BROWSER_BLOCKED_PUBLIC_MOJOM_BLOCKED_MOJOM_TRAITS_H_
