// Copyright 2025 The Blocked Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/public/mojom/blocked_mojom_traits.h"

#include <utility>

namespace blocked {

// GazeData implementation
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

// CalibrationPoint implementation
CalibrationPoint::CalibrationPoint() = default;

CalibrationPoint::CalibrationPoint(float x, float y)
    : screen_x(x), screen_y(y) {}

CalibrationPoint::~CalibrationPoint() = default;

CalibrationPoint::CalibrationPoint(const CalibrationPoint& other) = default;

CalibrationPoint& CalibrationPoint::operator=(const CalibrationPoint& other) =
    default;

CalibrationPoint::CalibrationPoint(CalibrationPoint&& other) noexcept = default;

CalibrationPoint& CalibrationPoint::operator=(CalibrationPoint&& other) noexcept
    = default;

// CalibrationSettings implementation
CalibrationSettings::CalibrationSettings() = default;

CalibrationSettings::CalibrationSettings(int32_t points,
                                         int32_t duration,
                                         int32_t samples)
    : num_points(points),
      duration_per_point_ms(duration),
      samples_per_point(samples) {}

CalibrationSettings::~CalibrationSettings() = default;

CalibrationSettings::CalibrationSettings(const CalibrationSettings& other) =
    default;

CalibrationSettings& CalibrationSettings::operator=(
    const CalibrationSettings& other) = default;

// VideoFrameMetadata implementation
VideoFrameMetadata::VideoFrameMetadata() = default;

VideoFrameMetadata::VideoFrameMetadata(int32_t w,
                                       int32_t h,
                                       blocked::mojom::VideoFormat fmt,
                                       base::TimeTicks ts,
                                       int64_t frame_num)
    : width(w), height(h), format(fmt), timestamp(ts), frame_number(frame_num) {}

VideoFrameMetadata::~VideoFrameMetadata() = default;

VideoFrameMetadata::VideoFrameMetadata(const VideoFrameMetadata& other) =
    default;

VideoFrameMetadata& VideoFrameMetadata::operator=(
    const VideoFrameMetadata& other) = default;

// VideoCaptureSettings implementation
VideoCaptureSettings::VideoCaptureSettings() = default;

VideoCaptureSettings::VideoCaptureSettings(int32_t w,
                                           int32_t h,
                                           int32_t fps,
                                           blocked::mojom::VideoFormat fmt,
                                           const std::string& device,
                                           bool encoding)
    : width(w),
      height(h),
      frame_rate(fps),
      format(fmt),
      device_id(device),
      enable_encoding(encoding) {}

VideoCaptureSettings::~VideoCaptureSettings() = default;

VideoCaptureSettings::VideoCaptureSettings(const VideoCaptureSettings& other) =
    default;

VideoCaptureSettings& VideoCaptureSettings::operator=(
    const VideoCaptureSettings& other) = default;

}  // namespace blocked

namespace mojo {

// GazeData Read implementation
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

// CalibrationPoint Read implementation
bool StructTraits<blocked::mojom::CalibrationPointDataView,
                  ::blocked::CalibrationPoint>::
    Read(blocked::mojom::CalibrationPointDataView data,
         ::blocked::CalibrationPoint* out) {
  out->screen_x = data.screen_x();
  out->screen_y = data.screen_y();

  if (!data.ReadSamples(&out->samples)) {
    return false;
  }

  // Validate screen coordinates (should be normalized 0-1)
  if (out->screen_x < 0.0f || out->screen_x > 1.0f ||
      out->screen_y < 0.0f || out->screen_y > 1.0f) {
    return false;
  }

  return true;
}

// CalibrationSettings Read implementation
bool StructTraits<blocked::mojom::CalibrationSettingsDataView,
                  ::blocked::CalibrationSettings>::
    Read(blocked::mojom::CalibrationSettingsDataView data,
         ::blocked::CalibrationSettings* out) {
  out->num_points = data.num_points();
  out->duration_per_point_ms = data.duration_per_point_ms();
  out->samples_per_point = data.samples_per_point();

  // Validate calibration settings
  if (out->num_points <= 0 || out->num_points > 25) {
    // Max 25 calibration points (5x5 grid)
    return false;
  }

  if (out->duration_per_point_ms <= 0 || out->duration_per_point_ms > 30000) {
    // Max 30 seconds per point
    return false;
  }

  if (out->samples_per_point <= 0 || out->samples_per_point > 300) {
    // Max 300 samples per point (10 seconds at 30 FPS)
    return false;
  }

  return true;
}

// VideoFrameMetadata Read implementation
bool StructTraits<blocked::mojom::VideoFrameMetadataDataView,
                  ::blocked::VideoFrameMetadata>::
    Read(blocked::mojom::VideoFrameMetadataDataView data,
         ::blocked::VideoFrameMetadata* out) {
  out->width = data.width();
  out->height = data.height();
  out->format = data.format();
  out->frame_number = data.frame_number();

  if (!data.ReadTimestamp(&out->timestamp)) {
    return false;
  }

  // Validate video dimensions
  if (out->width <= 0 || out->width > 7680) {  // Max 8K width
    return false;
  }

  if (out->height <= 0 || out->height > 4320) {  // Max 8K height
    return false;
  }

  if (out->frame_number < 0) {
    return false;
  }

  return true;
}

// VideoCaptureSettings Read implementation
bool StructTraits<blocked::mojom::VideoCaptureSettingsDataView,
                  ::blocked::VideoCaptureSettings>::
    Read(blocked::mojom::VideoCaptureSettingsDataView data,
         ::blocked::VideoCaptureSettings* out) {
  out->width = data.width();
  out->height = data.height();
  out->frame_rate = data.frame_rate();
  out->format = data.format();
  out->enable_encoding = data.enable_encoding();

  if (!data.ReadDeviceId(&out->device_id)) {
    return false;
  }

  // Validate capture settings
  if (out->width <= 0 || out->width > 7680) {  // Max 8K width
    return false;
  }

  if (out->height <= 0 || out->height > 4320) {  // Max 8K height
    return false;
  }

  if (out->frame_rate <= 0 || out->frame_rate > 240) {  // Max 240 FPS
    return false;
  }

  return true;
}

}  // namespace mojo
