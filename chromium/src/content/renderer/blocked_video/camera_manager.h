// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CONTENT_RENDERER_BLOCKED_VIDEO_CAMERA_MANAGER_H_
#define CONTENT_RENDERER_BLOCKED_VIDEO_CAMERA_MANAGER_H_

#include <string>
#include <vector>

#include "base/functional/callback.h"

namespace content {

// Manages camera device enumeration and selection.
class CameraManager {
 public:
  struct CameraDevice {
    std::string device_id;
    std::string label;
    bool is_default;
  };

  using DevicesCallback =
      base::OnceCallback<void(std::vector<CameraDevice> devices)>;

  CameraManager();
  ~CameraManager();

  CameraManager(const CameraManager&) = delete;
  CameraManager& operator=(const CameraManager&) = delete;

  // Enumerate available camera devices.
  void EnumerateDevices(DevicesCallback callback);

  // Get default camera device ID.
  std::string GetDefaultDeviceId() const;

  // Check if camera permissions are granted.
  bool HasCameraPermissions() const;

  // Request camera permissions (auto-granted for Blocked sessions).
  void RequestCameraPermissions();

 private:
  void OnDevicesEnumerated(DevicesCallback callback,
                            std::vector<CameraDevice> devices);

  bool has_permissions_ = false;
};

}  // namespace content

#endif  // CONTENT_RENDERER_BLOCKED_VIDEO_CAMERA_MANAGER_H_
