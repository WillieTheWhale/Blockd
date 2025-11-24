// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "content/renderer/blocked_video/camera_manager.h"

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/task/sequenced_task_runner.h"

namespace content {

CameraManager::CameraManager() = default;

CameraManager::~CameraManager() = default;

void CameraManager::EnumerateDevices(DevicesCallback callback) {
  // In production, this would use MediaDevices.enumerateDevices() API.
  // For now, return a mock camera device.

  std::vector<CameraDevice> devices;

  CameraDevice default_device;
  default_device.device_id = "default_camera_0";
  default_device.label = "Default Camera";
  default_device.is_default = true;
  devices.push_back(default_device);

  // Simulate async device enumeration.
  base::SequencedTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE,
      base::BindOnce(&CameraManager::OnDevicesEnumerated,
                     base::Unretained(this),
                     std::move(callback),
                     std::move(devices)));
}

std::string CameraManager::GetDefaultDeviceId() const {
  return "default_camera_0";
}

bool CameraManager::HasCameraPermissions() const {
  return has_permissions_;
}

void CameraManager::RequestCameraPermissions() {
  // For Blocked sessions, camera permission is automatically granted.
  // No user prompt required.
  has_permissions_ = true;
  LOG(INFO) << "Camera permissions granted (Blocked session)";
}

void CameraManager::OnDevicesEnumerated(DevicesCallback callback,
                                         std::vector<CameraDevice> devices) {
  LOG(INFO) << "Found " << devices.size() << " camera device(s)";
  std::move(callback).Run(std::move(devices));
}

}  // namespace content
