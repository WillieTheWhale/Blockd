// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/process_monitor.h"
#include "chrome/browser/blocked/platform/vm_detector.h"
#include "chrome/browser/blocked/platform/screen_recorder_detector.h"

#include "build/build_config.h"

#if BUILDFLAG(IS_WIN)
#include "chrome/browser/blocked/platform/windows/process_monitor_win.h"
#include "chrome/browser/blocked/platform/windows/vm_detector_win.h"
#include "chrome/browser/blocked/platform/windows/screen_recorder_detector_win.h"
#elif BUILDFLAG(IS_MAC)
#include "chrome/browser/blocked/platform/mac/process_monitor_mac.h"
#include "chrome/browser/blocked/platform/mac/vm_detector_mac.h"
#include "chrome/browser/blocked/platform/mac/screen_recorder_detector_mac.h"
#elif BUILDFLAG(IS_LINUX)
#include "chrome/browser/blocked/platform/linux/process_monitor_linux.h"
#include "chrome/browser/blocked/platform/linux/vm_detector_linux.h"
#include "chrome/browser/blocked/platform/linux/screen_recorder_detector_linux.h"
#endif

namespace blocked {

std::unique_ptr<ProcessMonitor> CreateProcessMonitor() {
#if BUILDFLAG(IS_WIN)
  return std::make_unique<ProcessMonitorWindows>();
#elif BUILDFLAG(IS_MAC)
  return std::make_unique<ProcessMonitorMac>();
#elif BUILDFLAG(IS_LINUX)
  return std::make_unique<ProcessMonitorLinux>();
#else
  return nullptr;
#endif
}

std::unique_ptr<VMDetector> CreateVMDetector() {
#if BUILDFLAG(IS_WIN)
  return std::make_unique<VMDetectorWindows>();
#elif BUILDFLAG(IS_MAC)
  return std::make_unique<VMDetectorMac>();
#elif BUILDFLAG(IS_LINUX)
  return std::make_unique<VMDetectorLinux>();
#else
  return nullptr;
#endif
}

std::unique_ptr<ScreenRecorderDetector> CreateScreenRecorderDetector() {
#if BUILDFLAG(IS_WIN)
  return std::make_unique<ScreenRecorderDetectorWindows>();
#elif BUILDFLAG(IS_MAC)
  return std::make_unique<ScreenRecorderDetectorMac>();
#elif BUILDFLAG(IS_LINUX)
  return std::make_unique<ScreenRecorderDetectorLinux>();
#else
  return nullptr;
#endif
}

}  // namespace blocked
