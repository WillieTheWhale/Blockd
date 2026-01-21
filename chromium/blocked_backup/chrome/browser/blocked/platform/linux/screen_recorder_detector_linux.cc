// Copyright 2025 The Blockd Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/blocked/platform/linux/screen_recorder_detector_linux.h"

#include <dirent.h>
#include <unistd.h>
#include <algorithm>
#include <fstream>

#include "base/logging.h"
#include "base/strings/string_util.h"

namespace blocked {

const std::vector<std::string> ScreenRecorderDetectorLinux::kScreenRecorderProcesses = {
  "obs",
  "simplescreenrecorder",
  "kazam",
  "recordmydesktop",
  "vokoscreen",
  "vokoscreenng",
  "ffmpeg",
  "screenkey",
  "peek",
  "green-recorder",
  "blue-recorder",
  "kooha",
  "wf-recorder"  // Wayland recorder
};

ScreenRecorderDetectorLinux::ScreenRecorderDetectorLinux() = default;

ScreenRecorderDetectorLinux::~ScreenRecorderDetectorLinux() = default;

bool ScreenRecorderDetectorLinux::IsScreenBeingRecorded() {
  std::vector<RecordingApplication> recorders = GetActiveRecorders();
  return !recorders.empty();
}

std::vector<RecordingApplication> ScreenRecorderDetectorLinux::GetActiveRecorders() {
  return DetectKnownRecorders();
}

std::vector<RecordingApplication> ScreenRecorderDetectorLinux::DetectKnownRecorders() {
  std::vector<RecordingApplication> active_recorders;

  // Enumerate /proc to find processes
  DIR* proc_dir = opendir("/proc");
  if (!proc_dir) {
    LOG(ERROR) << "Failed to open /proc directory";
    return active_recorders;
  }

  struct dirent* entry;
  while ((entry = readdir(proc_dir)) != nullptr) {
    // Check if directory name is numeric (PID)
    if (entry->d_type != DT_DIR) {
      continue;
    }

    std::string dir_name = entry->d_name;
    if (dir_name.find_first_not_of("0123456789") != std::string::npos) {
      continue;
    }

    pid_t pid = std::stoi(dir_name);

    // Read /proc/[pid]/comm for process name
    std::string comm_path = "/proc/" + dir_name + "/comm";
    std::ifstream comm_file(comm_path);

    if (!comm_file.is_open()) {
      continue;
    }

    std::string process_name;
    std::getline(comm_file, process_name);
    comm_file.close();

    // Check if this is a known recorder
    bool is_recorder = false;
    for (const auto& recorder_name : kScreenRecorderProcesses) {
      if (process_name.find(recorder_name) != std::string::npos) {
        is_recorder = true;
        break;
      }
    }

    if (is_recorder) {
      RecordingApplication app;
      app.application_name = process_name;
      app.process_id = pid;
      app.is_recording = true;

      // Try to get full command line
      std::string cmdline_path = "/proc/" + dir_name + "/cmdline";
      std::ifstream cmdline_file(cmdline_path);

      if (cmdline_file.is_open()) {
        std::string cmdline;
        std::getline(cmdline_file, cmdline, '\0');
        app.command_line = cmdline;
        cmdline_file.close();
      }

      // Try to get executable path
      std::string exe_path = "/proc/" + dir_name + "/exe";
      char link_target[PATH_MAX];
      ssize_t len = readlink(exe_path.c_str(), link_target, sizeof(link_target) - 1);

      if (len != -1) {
        link_target[len] = '\0';
        app.executable_path = std::string(link_target);
      }

      active_recorders.push_back(app);

      LOG(WARNING) << "Screen recorder detected: " << process_name
                  << " (PID: " << pid << ")";
    }
  }

  closedir(proc_dir);
  return active_recorders;
}

bool ScreenRecorderDetectorLinux::CheckX11Recording() {
  // On X11, there's no direct way to detect screen recording
  // We rely on process detection
  // Wayland provides better isolation and makes this even harder

  return false;
}

}  // namespace blocked
