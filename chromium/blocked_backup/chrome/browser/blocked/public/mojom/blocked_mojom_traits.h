// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_BLOCKED_PUBLIC_MOJOM_BLOCKED_MOJOM_TRAITS_H_
#define CHROME_BROWSER_BLOCKED_PUBLIC_MOJOM_BLOCKED_MOJOM_TRAITS_H_

#include <string>
#include <vector>

#include "base/time/time.h"
#include "chrome/browser/blocked/public/mojom/eye_tracking.mojom.h"
#include "chrome/browser/blocked/public/mojom/video_capture.mojom.h"
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

// Native C++ representation of CalibrationPoint.
struct CalibrationPoint {
  float screen_x = 0.0f;
  float screen_y = 0.0f;
  std::vector<GazeData> samples;

  CalibrationPoint();
  CalibrationPoint(float x, float y);
  ~CalibrationPoint();
  CalibrationPoint(const CalibrationPoint& other);
  CalibrationPoint& operator=(const CalibrationPoint& other);
  CalibrationPoint(CalibrationPoint&& other) noexcept;
  CalibrationPoint& operator=(CalibrationPoint&& other) noexcept;
};

// Native C++ representation of CalibrationSettings.
struct CalibrationSettings {
  int32_t num_points = 9;              // 9 for 3x3 grid
  int32_t duration_per_point_ms = 2000;
  int32_t samples_per_point = 60;

  CalibrationSettings();
  CalibrationSettings(int32_t points, int32_t duration, int32_t samples);
  ~CalibrationSettings();
  CalibrationSettings(const CalibrationSettings& other);
  CalibrationSettings& operator=(const CalibrationSettings& other);
};

// Native C++ representation of VideoFrameMetadata.
struct VideoFrameMetadata {
  int32_t width = 0;
  int32_t height = 0;
  blocked::mojom::VideoFormat format = blocked::mojom::VideoFormat::kI420;
  base::TimeTicks timestamp;
  int64_t frame_number = 0;

  VideoFrameMetadata();
  VideoFrameMetadata(int32_t w, int32_t h, blocked::mojom::VideoFormat fmt,
                     base::TimeTicks ts, int64_t frame_num);
  ~VideoFrameMetadata();
  VideoFrameMetadata(const VideoFrameMetadata& other);
  VideoFrameMetadata& operator=(const VideoFrameMetadata& other);
};

// Native C++ representation of VideoCaptureSettings.
struct VideoCaptureSettings {
  int32_t width = 640;
  int32_t height = 480;
  int32_t frame_rate = 30;
  blocked::mojom::VideoFormat format = blocked::mojom::VideoFormat::kI420;
  std::string device_id;
  bool enable_encoding = false;

  VideoCaptureSettings();
  VideoCaptureSettings(int32_t w, int32_t h, int32_t fps,
                       blocked::mojom::VideoFormat fmt,
                       const std::string& device, bool encoding);
  ~VideoCaptureSettings();
  VideoCaptureSettings(const VideoCaptureSettings& other);
  VideoCaptureSettings& operator=(const VideoCaptureSettings& other);
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

// Type mapping for blocked.mojom.CalibrationPoint <-> blocked::CalibrationPoint
template <>
struct StructTraits<blocked::mojom::CalibrationPointDataView,
                    ::blocked::CalibrationPoint> {
  static float screen_x(const ::blocked::CalibrationPoint& data) {
    return data.screen_x;
  }
  static float screen_y(const ::blocked::CalibrationPoint& data) {
    return data.screen_y;
  }
  static const std::vector<::blocked::GazeData>& samples(
      const ::blocked::CalibrationPoint& data) {
    return data.samples;
  }

  static bool Read(blocked::mojom::CalibrationPointDataView data,
                   ::blocked::CalibrationPoint* out);
};

// Type mapping for blocked.mojom.CalibrationSettings <-> blocked::CalibrationSettings
template <>
struct StructTraits<blocked::mojom::CalibrationSettingsDataView,
                    ::blocked::CalibrationSettings> {
  static int32_t num_points(const ::blocked::CalibrationSettings& data) {
    return data.num_points;
  }
  static int32_t duration_per_point_ms(
      const ::blocked::CalibrationSettings& data) {
    return data.duration_per_point_ms;
  }
  static int32_t samples_per_point(const ::blocked::CalibrationSettings& data) {
    return data.samples_per_point;
  }

  static bool Read(blocked::mojom::CalibrationSettingsDataView data,
                   ::blocked::CalibrationSettings* out);
};

// Type mapping for blocked.mojom.VideoFrameMetadata <-> blocked::VideoFrameMetadata
template <>
struct StructTraits<blocked::mojom::VideoFrameMetadataDataView,
                    ::blocked::VideoFrameMetadata> {
  static int32_t width(const ::blocked::VideoFrameMetadata& data) {
    return data.width;
  }
  static int32_t height(const ::blocked::VideoFrameMetadata& data) {
    return data.height;
  }
  static blocked::mojom::VideoFormat format(
      const ::blocked::VideoFrameMetadata& data) {
    return data.format;
  }
  static base::TimeTicks timestamp(const ::blocked::VideoFrameMetadata& data) {
    return data.timestamp;
  }
  static int64_t frame_number(const ::blocked::VideoFrameMetadata& data) {
    return data.frame_number;
  }

  static bool Read(blocked::mojom::VideoFrameMetadataDataView data,
                   ::blocked::VideoFrameMetadata* out);
};

// Type mapping for blocked.mojom.VideoCaptureSettings <-> blocked::VideoCaptureSettings
template <>
struct StructTraits<blocked::mojom::VideoCaptureSettingsDataView,
                    ::blocked::VideoCaptureSettings> {
  static int32_t width(const ::blocked::VideoCaptureSettings& data) {
    return data.width;
  }
  static int32_t height(const ::blocked::VideoCaptureSettings& data) {
    return data.height;
  }
  static int32_t frame_rate(const ::blocked::VideoCaptureSettings& data) {
    return data.frame_rate;
  }
  static blocked::mojom::VideoFormat format(
      const ::blocked::VideoCaptureSettings& data) {
    return data.format;
  }
  static const std::string& device_id(
      const ::blocked::VideoCaptureSettings& data) {
    return data.device_id;
  }
  static bool enable_encoding(const ::blocked::VideoCaptureSettings& data) {
    return data.enable_encoding;
  }

  static bool Read(blocked::mojom::VideoCaptureSettingsDataView data,
                   ::blocked::VideoCaptureSettings* out);
};

}  // namespace mojo

#endif  // CHROME_BROWSER_BLOCKED_PUBLIC_MOJOM_BLOCKED_MOJOM_TRAITS_H_
