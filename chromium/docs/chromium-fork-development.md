# Chromium Fork Development Guide

> **Last Updated:** January 2026
> **Target:** Blockd Interview Browser

This comprehensive guide covers all aspects of developing and maintaining a Chromium fork.

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Source Code Management](#source-code-management)
3. [Build System Overview](#build-system-overview)
4. [Custom Feature Development](#custom-feature-development)
5. [Mojo IPC Architecture](#mojo-ipc-architecture)
6. [Testing](#testing)
7. [Upstream Updates](#upstream-updates)
8. [Distribution](#distribution)

---

## Environment Setup

### System Requirements

| Platform | Minimum RAM | Recommended RAM | Disk Space | Build Time |
|----------|-------------|-----------------|------------|------------|
| Windows | 16 GB | 32+ GB | 150+ GB | 3-6 hours |
| macOS | 16 GB | 32+ GB | 150+ GB | 2-4 hours |
| Linux | 16 GB | 32+ GB | 150+ GB | 2-4 hours |

### Windows Prerequisites

```powershell
# Install Visual Studio 2022 with C++ workload
# Required components:
# - MSVC v143 - VS 2022 C++ x64/x86 build tools
# - Windows 11 SDK (10.0.22621.0)
# - C++ ATL for latest v143 build tools

# Set environment variables
[Environment]::SetEnvironmentVariable("DEPOT_TOOLS_WIN_TOOLCHAIN", "0", "User")
[Environment]::SetEnvironmentVariable("vs2022_install", "C:\Program Files\Microsoft Visual Studio\2022\Professional", "User")
```

### depot_tools Setup

```bash
# Clone depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git

# Add to PATH (Windows)
set PATH=%PATH%;C:\path\to\depot_tools

# Add to PATH (Linux/macOS)
export PATH="$PATH:/path/to/depot_tools"
```

### Fetching Chromium Source

```bash
mkdir chromium && cd chromium
fetch --no-history chromium

# Or with full history for development
fetch chromium

# Sync to specific version
cd src
git checkout 142.0.7444.175
gclient sync --with_branch_heads --with_tags
```

---

## Source Code Management

### Recommended Fork Strategy

Rather than maintaining a traditional Git fork, use a **patch-based approach**:

1. Keep Chromium source as-is
2. Maintain modifications as patch files
3. Apply patches programmatically during build
4. Minimize merge conflicts during upstream updates

### Patch Organization

```
chromium/
├── patches/
│   ├── 0001-add-blocked-security-module.patch
│   ├── 0002-modify-browser-ui.patch
│   ├── 0003-add-blocked-branding.patch
│   ├── 0004-add-blocked-webui-and-startup.patch
│   ├── 0005-block-devtools-and-context-menu.patch
│   └── apply-patches.sh
└── blocked_backup/
    └── [all custom source files]
```

### Creating Patches

```bash
# After making changes
cd src
git diff > ../patches/00XX-description.patch

# Or for specific files
git diff -- chrome/browser/blocked/ > ../patches/00XX-blocked-module.patch
```

### Applying Patches

```bash
#!/bin/bash
# apply-patches.sh

cd src

for patch in ../patches/*.patch; do
    echo "Applying $patch..."
    git apply --check "$patch" && git apply "$patch" || {
        echo "Failed to apply $patch"
        exit 1
    }
done
```

---

## Build System Overview

### GN (Generate Ninja)

GN is Chromium's meta-build system that generates Ninja build files.

```bash
# Generate build files
gn gen out/Blockd

# Open args editor
gn args out/Blockd

# List all available arguments
gn args --list out/Blockd

# Check for errors
gn gen --check out/Blockd
```

### Essential args.gn Configuration

```gn
# Build type
is_debug = false
is_official_build = true
is_component_build = false

# Branding
is_chrome_branded = false
branding_path_component = "blocked"
branding_file_path = "//chrome/app/theme/blocked/BRANDING"

# Optimization
symbol_level = 1
use_thin_lto = true

# Media codecs
proprietary_codecs = true
ffmpeg_branding = "Chrome"

# Security
use_safe_libcxx = true
is_asan = false
is_msan = false
is_tsan = false

# Platform features
enable_nacl = false
enable_extensions = true
```

### Ninja Build

```bash
# Build Chrome
autoninja -C out/Blockd chrome

# Build specific target
autoninja -C out/Blockd blocked_unittests

# Limit parallel jobs (for low memory)
autoninja -C out/Blockd chrome -j6
```

### Build Targets Reference

| Target | Description |
|--------|-------------|
| `chrome` | Main browser executable |
| `chrome_sandbox` | Sandbox helper (Linux) |
| `mini_installer` | Windows installer |
| `unit_tests` | Core unit tests |
| `browser_tests` | Browser integration tests |

---

## Custom Feature Development

### Adding a New Browser Process Service

1. **Create header file** (`chrome/browser/blocked/my_service/my_service.h`):

```cpp
#ifndef CHROME_BROWSER_BLOCKED_MY_SERVICE_MY_SERVICE_H_
#define CHROME_BROWSER_BLOCKED_MY_SERVICE_MY_SERVICE_H_

#include "components/keyed_service/core/keyed_service.h"

namespace blocked {

class MyService : public KeyedService {
 public:
  MyService();
  ~MyService() override;

  // KeyedService implementation
  void Shutdown() override;

  // Service methods
  void Initialize();

 private:
  bool initialized_ = false;
};

}  // namespace blocked

#endif  // CHROME_BROWSER_BLOCKED_MY_SERVICE_MY_SERVICE_H_
```

2. **Create implementation** (`my_service.cc`):

```cpp
#include "chrome/browser/blocked/my_service/my_service.h"

#include "base/logging.h"

namespace blocked {

MyService::MyService() = default;
MyService::~MyService() = default;

void MyService::Shutdown() {
  // Cleanup
}

void MyService::Initialize() {
  if (initialized_) return;
  LOG(INFO) << "MyService initialized";
  initialized_ = true;
}

}  // namespace blocked
```

3. **Create BUILD.gn**:

```gn
source_set("my_service") {
  sources = [
    "my_service.cc",
    "my_service.h",
  ]

  deps = [
    "//base",
    "//components/keyed_service/core",
  ]
}
```

4. **Register with browser**:

Add to `chrome/browser/blocked/BUILD.gn`:
```gn
deps += [ "//chrome/browser/blocked/my_service" ]
```

### Adding Renderer Process Code

Renderer code lives in `content/renderer/` and runs in sandboxed processes:

```cpp
// content/renderer/blocked_feature/feature_impl.h
#ifndef CONTENT_RENDERER_BLOCKED_FEATURE_FEATURE_IMPL_H_
#define CONTENT_RENDERER_BLOCKED_FEATURE_FEATURE_IMPL_H_

#include "third_party/blink/public/web/web_local_frame.h"

namespace blocked {

class FeatureImpl {
 public:
  static void Initialize(blink::WebLocalFrame* frame);
  static void ProcessFrame(const base::TimeTicks& timestamp);
};

}  // namespace blocked

#endif
```

---

## Mojo IPC Architecture

### Overview

Mojo is Chromium's IPC system for communication between processes:

```
Browser Process        Renderer Process
     |                      |
     |  Mojo Interface      |
     |<-------------------->|
     |                      |
 Host (receiver)     Client (sender)
```

### Defining a Mojo Interface

Create `chrome/browser/blocked/public/mojom/my_interface.mojom`:

```mojom
module blocked.mojom;

// Data structure
struct MyData {
  float value;
  string label;
  int64 timestamp;
};

// Browser-side interface (receives from renderer)
interface MyServiceHost {
  // Async method
  SendData(MyData data);

  // Sync method with response
  GetConfig() => (string config);
};

// Renderer-side interface (receives from browser)
interface MyServiceClient {
  OnConfigChanged(string new_config);
  OnError(string message);
};
```

### Implementing Host (Browser Side)

```cpp
// my_service_host_impl.h
#include "chrome/browser/blocked/public/mojom/my_interface.mojom.h"

class MyServiceHostImpl : public blocked::mojom::MyServiceHost {
 public:
  explicit MyServiceHostImpl(
      mojo::PendingReceiver<blocked::mojom::MyServiceHost> receiver);

  // mojom::MyServiceHost implementation
  void SendData(blocked::mojom::MyDataPtr data) override;
  void GetConfig(GetConfigCallback callback) override;

 private:
  mojo::Receiver<blocked::mojom::MyServiceHost> receiver_;
};
```

### Implementing Client (Renderer Side)

```cpp
// my_service_client_impl.h
#include "chrome/browser/blocked/public/mojom/my_interface.mojom.h"

class MyServiceClientImpl : public blocked::mojom::MyServiceClient {
 public:
  void Bind(mojo::PendingReceiver<blocked::mojom::MyServiceClient> receiver);

  // mojom::MyServiceClient implementation
  void OnConfigChanged(const std::string& new_config) override;
  void OnError(const std::string& message) override;

 private:
  mojo::Receiver<blocked::mojom::MyServiceClient> receiver_{this};
};
```

### BUILD.gn for Mojo

```gn
import("//mojo/public/tools/bindings/mojom.gni")

mojom("mojom") {
  sources = [
    "my_interface.mojom",
  ]

  public_deps = [
    "//mojo/public/mojom/base",
  ]
}
```

---

## Testing

### Unit Tests

```cpp
// my_service_unittest.cc
#include "chrome/browser/blocked/my_service/my_service.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace blocked {

class MyServiceTest : public testing::Test {
 protected:
  void SetUp() override {
    service_ = std::make_unique<MyService>();
  }

  std::unique_ptr<MyService> service_;
};

TEST_F(MyServiceTest, InitializesCorrectly) {
  service_->Initialize();
  EXPECT_TRUE(service_->IsInitialized());
}

}  // namespace blocked
```

### Running Tests

```bash
# Build and run unit tests
autoninja -C out/Blockd blocked_unittests
./out/Blockd/blocked_unittests

# Run specific test
./out/Blockd/blocked_unittests --gtest_filter=MyServiceTest.*

# Run with verbose output
./out/Blockd/blocked_unittests --gtest_output=xml:test_results.xml
```

### Browser Tests

```cpp
// my_feature_browsertest.cc
#include "chrome/test/base/in_process_browser_test.h"

class MyFeatureBrowserTest : public InProcessBrowserTest {
 protected:
  void SetUpOnMainThread() override {
    InProcessBrowserTest::SetUpOnMainThread();
    // Setup code
  }
};

IN_PROC_BROWSER_TEST_F(MyFeatureBrowserTest, FeatureWorks) {
  // Navigate to test page
  ASSERT_TRUE(ui_test_utils::NavigateToURL(
      browser(), GURL("https://example.com")));

  // Verify feature behavior
  EXPECT_TRUE(/* condition */);
}
```

---

## Upstream Updates

### Version Update Process

1. **Prepare environment**:
```bash
cd chromium/src
git fetch origin
git checkout tags/142.0.7445.0  # New version
gclient sync
```

2. **Test patch application**:
```bash
for patch in ../patches/*.patch; do
    git apply --check "$patch" || echo "CONFLICT: $patch"
done
```

3. **Resolve conflicts**:
```bash
# For each conflicting patch
git apply --3way ../patches/conflicting.patch
# Manually resolve conflicts
git add .
```

4. **Regenerate patches**:
```bash
# After resolving conflicts, recreate patch
git diff HEAD~1 > ../patches/updated.patch
```

### Automation Script

```python
#!/usr/bin/env python3
"""update_chromium.py - Automate Chromium version updates"""

import subprocess
import sys

def update_to_version(version):
    # Checkout new version
    subprocess.run(["git", "fetch", "origin"], check=True)
    subprocess.run(["git", "checkout", f"tags/{version}"], check=True)
    subprocess.run(["gclient", "sync"], check=True)

    # Apply patches
    failed = []
    for patch in sorted(Path("../patches").glob("*.patch")):
        result = subprocess.run(
            ["git", "apply", "--check", str(patch)],
            capture_output=True
        )
        if result.returncode != 0:
            failed.append(patch)

    if failed:
        print(f"Failed patches: {failed}")
        return 1

    # All patches apply cleanly
    for patch in sorted(Path("../patches").glob("*.patch")):
        subprocess.run(["git", "apply", str(patch)], check=True)

    return 0

if __name__ == "__main__":
    sys.exit(update_to_version(sys.argv[1]))
```

---

## Distribution

### Windows Distribution

1. **Build installer**:
```bash
autoninja -C out/Blockd mini_installer
```

2. **Sign executables**:
```powershell
signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com out/Blockd/chrome.exe
```

3. **Create NSIS installer** (see `installer/windows/blocked_installer.nsi`)

### macOS Distribution

1. **Create DMG**:
```bash
autoninja -C out/Blockd chrome
# Package into .app bundle
# Create DMG
hdiutil create -volname "Blockd" -srcfolder out/Blockd/Blockd.app -ov Blockd.dmg
```

2. **Code sign**:
```bash
codesign --deep --force --verify --verbose --sign "Developer ID Application: Company Name" out/Blockd/Blockd.app
```

3. **Notarize**:
```bash
xcrun notarytool submit Blockd.dmg --apple-id user@example.com --team-id XXXXX --wait
```

### Linux Distribution

1. **Create DEB package**:
```bash
# Build
autoninja -C out/Blockd chrome chrome_sandbox

# Package
dpkg-deb --build blockd-browser_1.0.0_amd64
```

2. **Create AppImage**:
```bash
# Use linuxdeploy
./linuxdeploy-x86_64.AppImage --appdir AppDir --executable out/Blockd/chrome --desktop-file blockd.desktop --icon-file blockd.png --output appimage
```

---

## Best Practices

### Code Style

- Follow [Google C++ Style Guide](https://google.github.io/styleguide/cppguide.html)
- Use `base::` utilities instead of STL where available
- Prefer smart pointers (`std::unique_ptr`, `base::WeakPtr`)
- Never block the main thread

### Memory Safety

- Use `base::WeakPtr` for pointers that may outlive their referents
- Use `base::SequenceChecker` to verify thread safety
- Avoid raw pointers in member variables

### Performance

- Use `base::PostTask` for async operations
- Batch IPC messages when possible
- Profile with `chrome://tracing`

---

*Document maintained by Blockd Engineering Team*
