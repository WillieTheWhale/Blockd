# Chromium Fork Development Guide (January 2026)

> **Last Updated:** January 2026
> **Chromium Version:** 142.0.7444.175 (Blockd base) / 146.0.7652.0 (latest)

This document contains up-to-date reference material for building Chromium forks with custom branding and features.

---

## Table of Contents

1. [Building for Windows](#1-building-for-windows)
2. [Building for macOS](#2-building-for-macos)
3. [Custom Branding System](#3-custom-branding-system)
4. [GN Build Configuration](#4-gn-build-configuration)
5. [Custom Feature Flags](#5-custom-feature-flags)
6. [Mojo IPC Implementation](#6-mojo-ipc-implementation)
7. [Creating Installers](#7-creating-installers)
8. [Common Build Failures](#8-common-build-failures)

---

## 1. Building for Windows

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Visual Studio | 2022 or 2026 with C++ workload |
| Windows SDK | 10.0.22621.0 or later |
| RAM | 16 GB minimum (32 GB recommended) |
| Disk Space | 100+ GB free |
| Python | 3.11+ |

### Environment Setup

```batch
:: CRITICAL: Use local Visual Studio toolchain, not Google's
set DEPOT_TOOLS_WIN_TOOLCHAIN=0

:: Clone depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
set PATH=%cd%\depot_tools;%PATH%
```

### Fetch and Build

```batch
:: Create workspace
mkdir chromium && cd chromium

:: Fetch source (takes several hours)
fetch chromium

:: Sync dependencies
cd src
gclient sync

:: Generate build files
gn gen out/Release

:: Build (use -j6 on machines with <32GB RAM to avoid OOM)
autoninja -C out/Release chrome -j6
```

### Build Time Expectations
- **Initial build:** 10-20 hours depending on hardware
- **Incremental build:** 5-30 minutes depending on changes
- **Full rebuild:** Same as initial

### Output Location
```
out/Release/chrome.exe        # Main browser executable
out/Release/chrome.dll        # Core browser library
out/Release/*.dll             # Supporting libraries
out/Release/locales/          # Language packs
out/Release/resources/        # Web resources
```

---

## 2. Building for macOS

### Prerequisites

| Requirement | Version |
|-------------|---------|
| macOS | 12.0 (Monterey) or later |
| Xcode | 14.0+ with Command Line Tools |
| RAM | 16 GB minimum (32 GB recommended) |
| Disk Space | 100+ GB free |

### Critical Path Requirement

**The path to build directory must NOT contain spaces.**

```bash
# GOOD
mkdir ~/chromium && cd ~/chromium

# BAD - will cause build failures
mkdir ~/Mac OS X/chromium  # Spaces in path!
```

### Environment Setup

```bash
# Clone depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PWD/depot_tools:$PATH"

# Add to ~/.zshrc or ~/.bash_profile for persistence
echo 'export PATH="$HOME/chromium/depot_tools:$PATH"' >> ~/.zshrc
```

### Fetch and Build

```bash
# Create workspace
mkdir ~/chromium && cd ~/chromium

# Fetch source
fetch chromium

# Enter source directory
cd src

# Generate build files
gn gen out/Release

# Build
autoninja -C out/Release chrome
```

### Output Location
```
out/Release/Chromium.app/     # macOS application bundle
out/Release/ContentShell.app/ # Content shell (testing)
```

### Code Signing (Required for Distribution)

```bash
# Requires Apple Developer ID
python3 chrome/installer/mac/sign_chrome.py \
    --input out/Release/Chromium.app \
    --output out/Release/Chromium-signed.app
```

---

## 3. Custom Branding System

### BRANDING File Location

The primary branding configuration:
```
chrome/app/theme/<brand_name>/BRANDING
```

For Chromium: `chrome/app/theme/chromium/BRANDING`
For Blockd: `chrome/app/theme/blocked/BRANDING`

### BRANDING File Format

```ini
COMPANY_FULLNAME=Blockd Inc.
COMPANY_SHORTNAME=Blockd
PRODUCT_FULLNAME=Blockd
PRODUCT_SHORTNAME=Blockd
PRODUCT_INSTALLER_FULLNAME=Blockd Installer
PRODUCT_INSTALLER_SHORTNAME=Blockd Installer
COPYRIGHT=Copyright 2024-2026 Blockd Inc. All rights reserved.
MAC_BUNDLE_ID=com.blockd.browser
MAC_CREATOR_CODE=Blkd
MAC_TEAM_ID=XXXXXXXXXX
```

### Required Asset Files

| File | Purpose | Platform |
|------|---------|----------|
| `product_logo_16.png` | Small icons, favicons | All |
| `product_logo_32.png` | Taskbar, menus | All |
| `product_logo_48.png` | Application lists | All |
| `product_logo_64.png` | Medium displays | All |
| `product_logo_128.png` | Large displays | All |
| `product_logo_256.png` | High-DPI displays | All |
| `<brand>.ico` | Windows executable icon | Windows |
| `app.icns` | macOS app icon | macOS |
| `installer_logo.bmp` | Windows installer banner | Windows |

### Directory Structure

```
chrome/app/theme/
├── chromium/           # Default Chromium branding
├── google_chrome/      # Google Chrome branding (private)
└── blocked/            # Custom Blockd branding
    ├── BRANDING
    ├── blockd.ico
    ├── product_logo_16.png
    ├── product_logo_32.png
    ├── product_logo_48.png
    ├── product_logo_64.png
    ├── product_logo_128.png
    ├── product_logo_256.png
    ├── product_logo_512.png
    ├── product_logo_1024.png
    ├── installer_logo.bmp
    ├── linux/
    │   └── product_logo_*.png
    ├── mac/
    │   ├── app.icns
    │   └── document.icns
    └── win/
        ├── blockd.ico
        └── tiles/
            ├── Logo.png
            ├── SmallLogo.png
            └── ...
```

### Branding in GN Args

To use custom branding, you must either:

**Option A: Modify build system to recognize your brand**

Add to `build/config/chrome_build.gni`:
```gn
if (is_chrome_branded) {
  # Google Chrome
} else if (branding_path_component == "blocked") {
  # Blockd branding
}
```

**Option B: Override Chromium branding (simpler)**

Replace files in `chrome/app/theme/chromium/` with your brand assets.

### String Resources

Key string IDs to customize (in GRD files):

| ID | Purpose |
|----|---------|
| `IDS_PRODUCT_NAME` | Window title, taskbar |
| `IDS_SHORT_PRODUCT_NAME` | Short name |
| `IDS_PRODUCT_DESCRIPTION` | About dialog |
| `IDS_ABOUT_VERSION_TITLE` | Version page title |

---

## 4. GN Build Configuration

### Generate Build Directory

```bash
# Basic generation
gn gen out/Release

# With inline args
gn gen out/Release --args='is_debug=false is_component_build=false'

# Edit args interactively
gn args out/Release
```

### args.gn Reference

```gn
# ================================================
# BUILD TYPE
# ================================================
is_debug = false                    # Release build (optimized)
is_official_build = false           # Official build optimizations
# Note: is_official_build=true requires Google's internal tools

# ================================================
# LINKING
# ================================================
is_component_build = false          # Static linking (REQUIRED for distribution)
# Component builds create many small DLLs - good for development, bad for shipping

# ================================================
# DEBUG SYMBOLS
# ================================================
symbol_level = 0                    # No symbols (smallest binary)
# symbol_level = 1                  # Minimal symbols (crash reports)
# symbol_level = 2                  # Full symbols (debugging)

# ================================================
# BRANDING
# ================================================
is_chrome_branded = false           # Not Google Chrome

# ================================================
# CODECS (Required for video/audio)
# ================================================
proprietary_codecs = true           # H.264, AAC, MP3 support
ffmpeg_branding = "Chrome"          # Required with proprietary_codecs

# ================================================
# FEATURES
# ================================================
enable_nacl = false                 # NaCl is deprecated
enable_widevine = false             # DRM (requires license)
enable_pdf = true                   # PDF viewer
enable_print_preview = true         # Print preview
enable_extensions = true            # Chrome extensions

# ================================================
# PERFORMANCE
# ================================================
use_goma = false                    # Google internal build farm
use_remoteexec = false              # Remote execution
chrome_pgo_phase = 0                # Profile-guided optimization phase

# ================================================
# DISABLED FEATURES
# ================================================
enable_vr = false
enable_mdns = false

# ================================================
# FIELD TRIALS
# ================================================
disable_fieldtrial_testing_config = true  # Disable A/B experiments
```

### List All Available Args

```bash
gn args --list out/Release
gn args --list out/Release | grep -i "brand"  # Filter for branding
```

---

## 5. Custom Feature Flags

### Creating Feature Flags

**File: `build/config/features.gni` (or custom location)**

```gn
declare_args() {
  # Enable/disable your feature
  my_feature_enabled = true

  # Configuration values
  my_feature_backend_url = ""
  my_feature_debug = false
}
```

### Using Feature Flags in BUILD.gn

```gn
import("//build/config/features.gni")
# Or for custom location:
# import("//chrome/browser/blocked/blocked_features.gni")

source_set("my_feature") {
  sources = [
    "my_feature.cc",
    "my_feature.h",
  ]

  defines = []

  if (my_feature_enabled) {
    defines += [ "MY_FEATURE_ENABLED" ]
  }

  if (my_feature_backend_url != "") {
    defines += [ "MY_FEATURE_BACKEND_URL=\"$my_feature_backend_url\"" ]
  }
}
```

### Accessing in C++

```cpp
#if defined(MY_FEATURE_ENABLED)
  // Feature code here
#endif

#if defined(MY_FEATURE_BACKEND_URL)
  constexpr char kBackendUrl[] = MY_FEATURE_BACKEND_URL;
#endif
```

### Platform-Specific Flags

```gn
if (is_win) {
  defines += [ "PLATFORM_WINDOWS" ]
}
if (is_mac) {
  defines += [ "PLATFORM_MACOS" ]
}
if (is_linux) {
  defines += [ "PLATFORM_LINUX" ]
}
```

---

## 6. Mojo IPC Implementation

### Overview

Mojo is Chromium's modern IPC system for communication between processes:
- **Browser Process** ↔ **Renderer Process**
- Type-safe message definitions
- 3x faster than legacy Chrome IPC

### Creating a Mojom Interface

**File: `chrome/browser/my_feature/public/mojom/my_feature.mojom`**

```mojom
module my_feature.mojom;

// Data structure
struct MyData {
  string id;
  int32 value;
  array<uint8> payload;
};

// Service interface (browser side receives these calls)
interface MyFeatureHost {
  OnDataReceived(MyData data);
  OnError(string message);
};

// Client interface (renderer side receives these calls)
interface MyFeatureClient {
  StartFeature(string session_id);
  StopFeature();
  Configure(map<string, string> options);
};
```

### BUILD.gn for Mojom

```gn
import("//mojo/public/tools/bindings/mojom.gni")

mojom("mojom") {
  sources = [ "my_feature.mojom" ]

  public_deps = [
    "//mojo/public/mojom/base",
  ]
}
```

### C++ Implementation (Browser Side)

```cpp
// my_feature_host_impl.h
#include "chrome/browser/my_feature/public/mojom/my_feature.mojom.h"
#include "mojo/public/cpp/bindings/receiver_set.h"

class MyFeatureHostImpl : public my_feature::mojom::MyFeatureHost {
 public:
  void Bind(mojo::PendingReceiver<my_feature::mojom::MyFeatureHost> receiver);

  // mojom::MyFeatureHost implementation
  void OnDataReceived(my_feature::mojom::MyDataPtr data) override;
  void OnError(const std::string& message) override;

 private:
  mojo::ReceiverSet<my_feature::mojom::MyFeatureHost> receivers_;
};
```

### Binding Interfaces

**From Renderer to Browser:**
```cpp
// In renderer process
mojo::Remote<my_feature::mojom::MyFeatureHost> host;
render_frame->GetBrowserInterfaceBroker()->GetInterface(
    host.BindNewPipeAndPassReceiver());

// Now call methods
auto data = my_feature::mojom::MyData::New();
data->id = "test";
host->OnDataReceived(std::move(data));
```

**From Browser to Renderer:**
```cpp
// In browser process
mojo::AssociatedRemote<my_feature::mojom::MyFeatureClient> client;
render_frame_host->GetRemoteAssociatedInterfaces()->GetInterface(&client);

// Now call methods
client->StartFeature("session_123");
```

---

## 7. Creating Installers

### Windows: mini_installer (Built-in)

```bash
# Build the installer
autoninja -C out/Release mini_installer

# Output
out/Release/mini_installer.exe
```

**Usage:**
```batch
:: Per-user install (default)
mini_installer.exe --verbose-logging

:: System-wide install
mini_installer.exe --system-level --verbose-logging
```

### Windows: NSIS Alternative

**Example NSIS script:**

```nsis
!define PRODUCT_NAME "Blockd Interview Browser"
!define PRODUCT_VERSION "1.0.0"
!define PRODUCT_PUBLISHER "Blockd Inc."

Name "${PRODUCT_NAME}"
OutFile "BlockdSetup.exe"
InstallDir "$LOCALAPPDATA\Blockd"
RequestExecutionLevel user

Section "Install"
    SetOutPath "$INSTDIR"

    ; Copy all files from build output
    File /r "out\Release\*.*"

    ; Create shortcuts
    CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\chrome.exe"
    CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\chrome.exe"

    ; Write uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Registry for Add/Remove Programs
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Blockd" \
        "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Blockd" \
        "UninstallString" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
    RMDir /r "$INSTDIR"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Blockd"
SectionEnd
```

### macOS: DMG Creation

**Using create-dmg tool:**
```bash
# Install tool
brew install create-dmg

# Create DMG
create-dmg \
    --volname "Blockd Interview Browser" \
    --volicon "out/Release/Blockd.app/Contents/Resources/app.icns" \
    --window-pos 200 120 \
    --window-size 600 400 \
    --icon-size 100 \
    --icon "Blockd.app" 175 120 \
    --hide-extension "Blockd.app" \
    --app-drop-link 425 120 \
    "Blockd-Installer.dmg" \
    "out/Release/Blockd.app"
```

**Using Chromium's signing scripts:**
```bash
python3 chrome/installer/mac/sign_chrome.py \
    --input out/Release/Chromium.app \
    --output out/Release/Blockd.app \
    --identity "Developer ID Application: Your Name"
```

---

## 8. Common Build Failures

### Failure: "401 Anonymous caller"

**Cause:** Build system trying to download Google's internal toolchain.

**Fix:**
```batch
set DEPOT_TOOLS_WIN_TOOLCHAIN=0
```

### Failure: "LLVM ERROR: out of memory"

**Cause:** Too many parallel compile jobs.

**Fix:**
```bash
autoninja -C out/Release chrome -j6  # Reduce parallelism
```

### Failure: "components_blocked_strings.grd missing"

**Cause:** Custom branding not integrated properly.

**Fix:** Copy branding files to correct location:
```bash
cp -r blocked_backup/chrome/app/theme/blocked src/chrome/app/theme/
```

### Failure: "undefined reference to blocked::*"

**Cause:** Custom code not added to main BUILD.gn.

**Fix:** Add dependencies to `chrome/browser/BUILD.gn`:
```gn
deps += [ "//chrome/browser/blocked:blocked_browser_modules" ]
```

### Failure: Build produces "Chromium" not "Blockd"

**Cause:** Branding files not in correct location or not being read.

**Fixes:**
1. Ensure BRANDING file is at `chrome/app/theme/blocked/BRANDING`
2. Check that icons are in the same directory
3. May need to replace Chromium branding entirely:
   ```bash
   cp -r blocked/* chromium/  # Overwrite default branding
   ```

### Failure: No custom features in built browser

**Cause:** Feature code not compiled into browser.

**Fixes:**
1. Verify BUILD.gn includes your modules
2. Check args.gn has feature flags set
3. Ensure code is actually in src/ directory (not just backup)

---

## References

- [Chromium Build Instructions (Windows)](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md)
- [Chromium Build Instructions (macOS)](https://chromium.googlesource.com/chromium/src/+/main/docs/mac_build_instructions.md)
- [GN Build Configuration](https://www.chromium.org/developers/gn-build-configuration/)
- [Mojo Documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/mojo_and_services.md)
- [Google Chrome Branded Builds](https://chromium.googlesource.com/chromium/src/+/main/docs/google_chrome_branded_builds.md)
- [Chromium Updater (Omaha 4)](https://omaha-consulting.com/chromium-updater-omaha-4-tutorial)
