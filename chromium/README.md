# Blocked Browser - Chromium Build System

## Overview

This directory contains the build system and source modifications for the **Blocked Interview Browser**, a custom Chromium fork with embedded security monitoring, eye tracking, and anti-cheating capabilities.

**Base Version:** Chromium 142.0.7444.175 (stable branch)

## System Requirements

### Hardware Requirements
- **CPU:** 8+ cores (recommended 16+ for faster builds)
- **RAM:** 16 GB minimum (32 GB recommended)
- **Disk Space:** 100+ GB free space
  - 30 GB for Chromium source
  - 50 GB for build outputs
  - 20 GB for dependencies and cache

### Software Requirements

#### All Platforms
- **Python:** 3.11+
- **Git:** 2.40+
- **depot_tools:** Google's build tools (will be installed by setup script)

#### Windows
- **Visual Studio 2022:** Community/Professional/Enterprise with:
  - Desktop development with C++ workload
  - Windows 10/11 SDK (10.0.22621 or later)
  - ATL/MFC libraries
- **Windows 10 SDK:** Version 10.0.22621.0 or later

#### macOS
- **Xcode:** 14.0+ with Command Line Tools
- **macOS:** 12.0 (Monterey) or later

#### Linux
- **Ubuntu:** 20.04 LTS or later (or equivalent distro)
- **Packages:**
  ```bash
  sudo apt-get install -y \
    build-essential \
    libglib2.0-dev \
    libgtk-3-dev \
    libnss3-dev \
    libatk1.0-dev \
    libatk-bridge2.0-dev \
    libcups2-dev \
    libxcomposite-dev \
    libxdamage-dev \
    libxrandr-dev \
    libgbm-dev \
    libpango1.0-dev \
    libasound2-dev \
    libpulse-dev
  ```

## Quick Start

### 1. Initial Setup

```bash
# Clone the repository (if not already cloned)
git clone https://github.com/WillieTheWhale/Blockd.git
cd Blockd/chromium

# Run setup script (installs depot_tools, fetches Chromium)
./setup.sh
```

**Note:** Initial setup will download ~30 GB of Chromium source code and may take 1-3 hours depending on your internet connection.

### 2. Apply Blocked Modifications

```bash
# Apply our custom patches to Chromium
./patches/apply-patches.sh
```

### 3. Build

```bash
# Build the Blocked Browser (takes 4-8 hours on first build)
./build.sh
```

**Incremental builds:** After the first build, subsequent builds typically take 20-60 minutes.

### 4. Run

```bash
# Run the built browser
./out/Blocked/chrome
```

## Build Configuration

### Build Targets

- **chrome:** Main browser executable
- **chrome_sandbox:** Sandbox helper (Linux)
- **blocked_unittests:** Unit tests for Blocked modules
- **blocked_integration_tests:** Integration tests

### Build Types

#### Debug Build (default for development)
```bash
./build.sh --debug
```
- Full debugging symbols
- No optimizations
- Faster compilation
- Larger binary (~2 GB)

#### Release Build (production)
```bash
./build.sh --release
```
- Optimized code
- Minimal symbols
- Slower compilation
- Smaller binary (~150 MB compressed)

### Custom GN Arguments

Edit `args.gn` to customize the build:

```python
# Core configuration
is_component_build = false          # Monolithic build
is_official_build = true            # Release optimizations
is_debug = false                    # No debug assertions
symbol_level = 1                    # Minimal symbols

# Blocked features
blocked_enable_security_monitoring = true
blocked_enable_eye_tracking = true
blocked_enable_telemetry = true
blocked_backend_url = "wss://api.blockd.com"

# Codecs
proprietary_codecs = true           # H.264 support
ffmpeg_branding = "Chrome"          # Full codec support

# Disable unused features
enable_nacl = false                 # No NaCl support
```

## Project Structure

```
/chromium
├── README.md                      # This file
├── setup.sh                       # Setup script
├── build.sh                       # Build script
├── .gclient                       # Chromium dependencies config
├── BUILD.gn                       # Custom build targets
├── args.gn                        # Build arguments
│
├── src/                           # Chromium source (fetched by setup)
│   ├── chrome/browser/blocked/    # Blocked browser modules
│   │   ├── blocked_security/      # Security monitoring
│   │   ├── blocked_telemetry/     # System telemetry
│   │   ├── blocked_ipc/           # Backend communication
│   │   └── blocked_video/         # Video capture
│   │
│   ├── chrome/browser/ui/         # Browser UI modifications
│   │   ├── blocked_browser.h/.cc  # Custom browser class
│   │   └── blocked_fullscreen_controller.h/.cc
│   │
│   └── content/renderer/blocked_eye_tracking/  # Eye tracking (renderer)
│
├── patches/                       # Chromium modification patches
│   ├── 0001-add-blocked-security-module.patch
│   ├── 0002-modify-browser-ui.patch
│   ├── 0003-add-blocked-branding.patch
│   └── apply-patches.sh
│
└── out/                           # Build outputs
    └── Blocked/                   # Release build
        ├── chrome                 # Browser executable
        └── blocked_unittests      # Unit tests
```

## Blocked Browser Features

### Security Monitoring
- **Process Detection:** Detects screen recording software (OBS, Camtasia, etc.)
- **Window Monitoring:** Tracks application focus changes
- **VM Detection:** Identifies virtual machine environments
- **Clipboard Monitoring:** Logs clipboard operations
- **Platform Support:** Windows, macOS, Linux

### Session Lockdown
- **Fullscreen Enforcement:** Cannot exit fullscreen during session
- **Tab Restrictions:** No new tabs or windows
- **Keyboard Filtering:** Blocks Ctrl+T, Ctrl+N, Alt+Tab, etc.
- **Navigation Control:** Restricts to interview URLs only

### Eye Tracking (Renderer Process)
- **MediaPipe Integration:** 468-point facial landmark detection
- **Gaze Calculation:** Real-time gaze vector computation
- **Off-Screen Detection:** Detects when user looks away
- **30 FPS Processing:** Low-latency eye tracking

### Backend Communication
- **WebSocket Protocol:** Secure connection to backend
- **Protocol Buffers:** Efficient binary serialization
- **Real-time Events:** Security events, gaze data, telemetry

### Video Capture
- **Webcam Stream:** Continuous webcam monitoring
- **Backend Streaming:** Sends video to backend for recording
- **Automatic Permission:** Bypasses normal permission dialogs

## Development Workflow

### Making Changes

1. **Edit Source Files:** Modify files in `src/chrome/browser/blocked/`
2. **Rebuild:** Run `./build.sh` (incremental build)
3. **Test:** Run `./out/Blocked/chrome --enable-logging --v=1`
4. **Debug:** Use `gdb` (Linux), `lldb` (macOS), or Visual Studio (Windows)

### Adding New Files

1. Edit the appropriate `BUILD.gn` file
2. Add your source files
3. Run `gn gen out/Blocked` to regenerate build files
4. Build with `ninja`

Example:
```python
# chrome/browser/blocked_security/BUILD.gn
source_set("blocked_security") {
  sources = [
    "blocked_security_service.h",
    "blocked_security_service.cc",
    "new_feature.h",           # NEW FILE
    "new_feature.cc",          # NEW FILE
  ]
}
```

### Running Tests

```bash
# Unit tests
./out/Blocked/blocked_unittests

# Specific test suite
./out/Blocked/blocked_unittests --gtest_filter=BlockedSecurityServiceTest.*

# Integration tests
./out/Blocked/blocked_integration_tests
```

### Code Style

Follow the [Chromium C++ Style Guide](https://chromium.googlesource.com/chromium/src/+/main/styleguide/c++/c++.md):

- **Naming:** `ClassName`, `MethodName()`, `variable_name`, `kConstantName`
- **Indentation:** 2 spaces (no tabs)
- **Line Length:** 80 characters
- **Headers:** Use include guards `#ifndef CHROME_BROWSER_BLOCKED_FILE_H_`
- **Pointers:** Use smart pointers (`std::unique_ptr`, `std::shared_ptr`)
- **Async:** Use `base::SequencedTaskRunner` for async operations

### Debugging

#### Enable Verbose Logging
```bash
./out/Blocked/chrome --enable-logging --v=1 --vmodule=blocked_security*=2
```

#### Log Files
- **Windows:** `%LOCALAPPDATA%\Blocked\User Data\chrome_debug.log`
- **macOS:** `~/Library/Application Support/Blocked/chrome_debug.log`
- **Linux:** `~/.config/blocked/chrome_debug.log`

#### Debugging Symbols
```bash
# Generate debug build
gn args out/Debug
# Set: is_debug = true, symbol_level = 2

ninja -C out/Debug chrome

# Debug with GDB (Linux)
gdb ./out/Debug/chrome
```

## Build Times

| Configuration | Initial Build | Incremental Build |
|---------------|---------------|-------------------|
| Debug (8 cores) | 6-8 hours | 30-60 minutes |
| Release (8 cores) | 4-6 hours | 20-40 minutes |
| Debug (16 cores) | 3-4 hours | 15-30 minutes |
| Release (16 cores) | 2-3 hours | 10-20 minutes |

**Tips to Speed Up Builds:**
- Use `is_component_build = true` for development (faster linking)
- Use `ccache` or `sccache` for build caching
- Build on SSD (not HDD)
- Disable antivirus scanning on build directory
- Use `ninja -j N` where N = CPU cores + 2

## Packaging & Distribution

### Quick Start - Build All Installers

```bash
# Build installers for all platforms (uses existing browser build)
./build_installers.sh --skip-build

# Build with specific version
./build_installers.sh --skip-build --version 1.2.0

# Build for specific platform only
./build_installers.sh --skip-build --platform macos
./build_installers.sh --skip-build --platform windows
./build_installers.sh --skip-build --platform linux

# Full build with Chromium compilation
./build_installers.sh --release
```

**Output Location:** All installers are placed in `dist/` directory.

### Platform-Specific Details

#### macOS DMG
```bash
# Creates: dist/BlockedBrowser-v1.0.0-macOS.dmg
./build_installers.sh --skip-build --platform macos
```

The macOS installer:
- Creates a DMG with app bundle and Applications symlink
- Includes the app.icns icon
- Requires macOS with `hdiutil` (built-in)

For signed and notarized builds:
```bash
# After building, sign and notarize
./installer/mac/sign_and_notarize.sh
```

#### Windows NSIS Installer
```bash
# Creates: dist/BlockedBrowser_Setup_v1.0.0.exe (with NSIS)
# Creates: dist/BlockedBrowser-v1.0.0-Windows.zip (without NSIS)
./build_installers.sh --skip-build --platform windows
```

The Windows installer:
- Uses NSIS (Nullsoft Scriptable Install System)
- Creates Start Menu and Desktop shortcuts
- Includes uninstaller
- Supports silent installation: `BlockedBrowser_Setup.exe /S`

**Requirements:**
- NSIS: `brew install nsis` (macOS) or `choco install nsis` (Windows)
- ImageMagick: `brew install imagemagick` (for icon generation)

#### Linux Packages
```bash
# Creates: DEB, RPM, and AppImage packages
./build_installers.sh --skip-build --platform linux
```

**DEB Package** (Debian/Ubuntu):
```bash
# Creates: dist/blockd-browser_1.0.0_amd64.deb
# Install: sudo dpkg -i dist/blockd-browser_1.0.0_amd64.deb
```
Requires: `dpkg-deb`

**RPM Package** (Fedora/RHEL/CentOS):
```bash
# Creates: dist/blockd-browser-1.0.0-1.x86_64.rpm
# Install: sudo rpm -i dist/blockd-browser-1.0.0-1.x86_64.rpm
```
Requires: `rpmbuild`

**AppImage** (Universal):
```bash
# Creates: dist/BlockedBrowser-v1.0.0.AppImage
# Run: chmod +x BlockedBrowser-v1.0.0.AppImage && ./BlockedBrowser-v1.0.0.AppImage
```
Requires: `appimagetool` from [AppImageKit](https://github.com/AppImage/AppImageKit/releases)

### Installer Resources

Resources are automatically generated. To regenerate icons:

```bash
# Windows icons (.ico)
magick src/chrome/app/theme/blocked/product_logo_*.png installer/windows/resources/app_icon.ico

# macOS icon (.icns)
./src/chrome/app/theme/blocked/generate_platform_icons.sh

# Linux icon
cp src/chrome/app/theme/blocked/product_logo_256.png resources/app_icon_256.png
```

### Build Outputs

| Platform | File | Size (Mock) | Size (Real) |
|----------|------|-------------|-------------|
| macOS | BlockedBrowser-v1.0.0-macOS.dmg | ~2.4 MB | ~150 MB |
| Windows | BlockedBrowser_Setup_v1.0.0.exe | ~19 KB | ~80 MB |
| Linux DEB | blockd-browser_1.0.0_amd64.deb | ~18 KB | ~120 MB |
| Linux RPM | blockd-browser-1.0.0-1.x86_64.rpm | ~18 KB | ~120 MB |
| Linux AppImage | BlockedBrowser-v1.0.0.AppImage | ~18 KB | ~150 MB |

### Manual Packaging (Legacy)

#### Windows NSIS Manual Build
```bash
cd installer/windows
makensis blocked_installer.nsi
```

#### macOS DMG Manual Build
```bash
cd installer/mac
./create_dmg.sh
```

#### Linux DEB Manual Build
```bash
cd installer/linux
dpkg-buildpackage -us -uc
```

## Updating Chromium

To update to a newer Chromium version:

```bash
# Fetch latest stable branch
cd src
git fetch origin
git checkout branch-heads/6312  # Replace with target branch

# Sync dependencies
gclient sync --with_branch_heads --with_tags

# Reapply Blocked patches
cd ..
./patches/apply-patches.sh

# Rebuild
./build.sh
```

**Note:** Major Chromium updates may require patch adjustments due to API changes.

## Troubleshooting

### Build Fails with "Python not found"
Ensure Python 3.11+ is in your PATH:
```bash
python3 --version
```

### Out of Disk Space
Chromium builds require 100+ GB. Free up space or use a larger disk.

### Linker Errors
Increase system memory or reduce parallelism:
```bash
ninja -C out/Blocked -j 4 chrome
```

### "depot_tools not found"
Run setup script again:
```bash
./setup.sh
```

### Patch Apply Fails
Patches may need manual adjustment:
```bash
cd src
git apply --reject ../patches/0001-*.patch
# Manually resolve .rej files
```

## Performance Optimization

### Build Performance
- **Use ccache:** `export CCACHE_DIR=/path/to/cache`
- **Distributed builds:** Use `distcc` or `goma` (Google internal)
- **RAM disk:** Build on tmpfs for faster I/O

### Runtime Performance
- **Profile-guided optimization (PGO):** Generate profile with `instrumented_build`, then rebuild with PGO
- **Link-time optimization (LTO):** Enabled in release builds

## Security Considerations

### Code Signing

#### Windows
```bash
signtool sign /f cert.pfx /p password /t http://timestamp.digicert.com mini_installer.exe
```

#### macOS
```bash
codesign --force --deep --sign "Developer ID Application: Your Name" Blocked.app
spctl --assess --verbose=4 Blocked.app
```

### Sandboxing
The browser uses Chromium's multi-process sandbox architecture:
- **Browser Process:** Privileged (security monitoring, IPC)
- **Renderer Process:** Sandboxed (eye tracking, page rendering)
- **GPU Process:** Sandboxed
- **Network Process:** Sandboxed

### Update Mechanism
- **Windows:** Omaha update framework
- **macOS:** Sparkle update framework
- **Linux:** AppImage delta updates

## Contributing

### Chromium Modifications

When modifying Chromium source:

1. **Minimize Changes:** Only modify what's necessary
2. **Use Namespaces:** Prefix all new code with `blocked::`
3. **Add Comments:** Explain why changes were made
4. **Create Patches:** Generate patches for all modifications
5. **Test Thoroughly:** Run unit tests and integration tests

### Patch Generation
```bash
cd src
git add chrome/browser/blocked_security/
git commit -m "Add security monitoring"
git format-patch HEAD~1 -o ../patches/
```

## Resources

### Chromium Documentation
- **Main Docs:** https://www.chromium.org/developers/
- **Build Instructions:** https://chromium.googlesource.com/chromium/src/+/main/docs/
- **Style Guide:** https://chromium.googlesource.com/chromium/src/+/main/styleguide/c++/c++.md

### Blocked Browser
- **Backend API:** https://github.com/WillieTheWhale/Blockd/tree/main/backend
- **Frontend:** https://github.com/WillieTheWhale/Blockd/tree/main/frontend
- **Documentation:** https://github.com/WillieTheWhale/Blockd/tree/main/docs

## License

Blocked Browser is based on Chromium and inherits its open-source license (BSD-style). Custom Blocked modules are proprietary.

**Chromium License:** [BSD 3-Clause License](https://chromium.googlesource.com/chromium/src/+/main/LICENSE)

## Support

For build issues or questions:
- **GitHub Issues:** https://github.com/WillieTheWhale/Blockd/issues
- **Documentation:** `/home/user/Blockd/docs/agents16-18-chromium-architecture.json`

---

**Last Updated:** 2025-11-24
**Chromium Version:** 142.0.7444.175
**Agent:** Agent 16 (Chromium Build System & Browser Process Developer)
