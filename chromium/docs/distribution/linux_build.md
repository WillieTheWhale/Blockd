# Linux Build and Distribution Guide

This document describes the complete process for building and distributing Blockd Browser on Linux (Debian, Ubuntu, Fedora, Arch, AppImage).

## Prerequisites

### Build Environment
- **OS**: Ubuntu 22.04 LTS or Debian 12 (recommended)
- **Disk Space**: 100+ GB SSD
- **RAM**: 16-32 GB
- **CPU**: 8+ cores
- **Python**: 3.11+
- **Git**: 2.40+

### Required Packages

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
    build-essential \
    git \
    python3 \
    curl \
    wget \
    libglib2.0-dev \
    libnss3-dev \
    libatk1.0-dev \
    libatk-bridge2.0-dev \
    libcups2-dev \
    libdrm-dev \
    libgtk-3-dev \
    libgbm-dev \
    libasound2-dev \
    libpulse-dev \
    libxcomposite-dev \
    libxrandr-dev \
    libpango1.0-dev \
    libxss-dev \
    libxtst-dev \
    libxkbcommon-dev \
    ninja-build

# Fedora/RHEL
sudo dnf install -y \
    gcc-c++ \
    git \
    python3 \
    curl \
    wget \
    glib2-devel \
    nss-devel \
    atk-devel \
    at-spi2-atk-devel \
    cups-devel \
    libdrm-devel \
    gtk3-devel \
    mesa-libgbm-devel \
    alsa-lib-devel \
    pulseaudio-libs-devel \
    libXcomposite-devel \
    libXrandr-devel \
    pango-devel \
    libXScrnSaver-devel \
    libXtst-devel \
    libxkbcommon-devel \
    ninja-build
```

## Build Process

### Step 1: Set Up Chromium Build Environment

```bash
# Install depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:$HOME/depot_tools"

# Add to ~/.bashrc
echo 'export PATH="$PATH:$HOME/depot_tools"' >> ~/.bashrc

# Create build directory
mkdir ~/chromium
cd ~/chromium

# Fetch Chromium source (50+ GB, 2-4 hours)
fetch --no-history chromium
cd src
```

### Step 2: Install Build Dependencies

```bash
# Chromium build dependencies
./build/install-build-deps.sh

# This installs all required development packages
```

### Step 3: Apply Blockd Modifications

```bash
# Copy Blockd source files
cp -R ../Blockd/chromium/src/chrome/browser/blocked chrome/browser/
cp -R ../Blockd/chromium/src/content/renderer/blocked_eye_tracking content/renderer/

# Apply patches
git apply ../Blockd/chromium/patches/*.patch
```

### Step 4: Configure Build

Create `out/Release/args.gn`:

```gn
is_component_build = false
is_official_build = true
is_debug = false
target_cpu = "x64"
symbol_level = 1

# Blockd-specific flags
blocked_enable_security_monitoring = true
blocked_enable_eye_tracking = true
blocked_enable_telemetry = true
blocked_backend_url = "wss://api.blockd.com"

# Linux-specific
use_sysroot = true
use_custom_libcxx = true
clang_use_chrome_plugins = false

# Chrome branding
enable_nacl = false
proprietary_codecs = true
ffmpeg_branding = "Chrome"

# Performance
use_jumbo_build = true
enable_precompiled_headers = false
```

Generate build files:

```bash
gn gen out/Release
```

### Step 5: Build Chromium

```bash
# Full build (3-6 hours on first run)
ninja -C out/Release chrome

# Build output: out/Release/chrome (executable)
```

## Packaging

### Debian/Ubuntu Package (.deb)

#### Step 1: Prepare Package Structure

```bash
cd ../Blockd/chromium/installer/linux

# Create package directory
mkdir -p blockd-browser_1.0.0_amd64
cd blockd-browser_1.0.0_amd64

# Create DEBIAN directory
mkdir -p DEBIAN

# Copy control file
cp ../debian/control DEBIAN/
cp ../debian/postinst DEBIAN/
cp ../debian/postrm DEBIAN/

# Make scripts executable
chmod 755 DEBIAN/postinst DEBIAN/postrm
```

#### Step 2: Copy Browser Files

```bash
# Create directory structure
mkdir -p opt/blockd-browser
mkdir -p usr/share/applications
mkdir -p usr/share/icons/hicolor/256x256/apps
mkdir -p usr/bin

# Copy browser files
cp -r ~/chromium/src/out/Release/* opt/blockd-browser/

# Copy desktop file
cp ../blocked.desktop usr/share/applications/

# Copy icon
cp ~/chromium/src/resources/app_icon_256.png \
   usr/share/icons/hicolor/256x256/apps/blockd-browser.png

# Create symlink
ln -s /opt/blockd-browser/chrome usr/bin/blockd-browser
```

#### Step 3: Build Package

```bash
cd ..
dpkg-deb --build blockd-browser_1.0.0_amd64

# Output: blockd-browser_1.0.0_amd64.deb (~85 MB)
```

#### Step 4: Sign Package

```bash
# Sign with GPG
dpkg-sig --sign builder blockd-browser_1.0.0_amd64.deb

# Verify signature
dpkg-sig --verify blockd-browser_1.0.0_amd64.deb
```

#### Step 5: Test Installation

```bash
# Install
sudo dpkg -i blockd-browser_1.0.0_amd64.deb
sudo apt-get install -f  # Fix dependencies if needed

# Run
blockd-browser

# Uninstall
sudo apt-get remove blockd-browser
```

### Fedora/RHEL Package (.rpm)

#### Step 1: Setup RPM Build Environment

```bash
# Install rpm-build tools
sudo dnf install -y rpm-build rpmdevtools

# Create RPM build directories
rpmdev-setuptree
```

#### Step 2: Prepare Source Archive

```bash
cd ~/chromium/src
tar czf ~/rpmbuild/SOURCES/blockd-browser-1.0.0.tar.gz out/Release
```

#### Step 3: Build RPM

```bash
cd ../Blockd/chromium/installer/linux/rpm

# Build package
rpmbuild -ba blockd-browser.spec

# Output: ~/rpmbuild/RPMS/x86_64/blockd-browser-1.0.0-1.x86_64.rpm
```

#### Step 4: Sign RPM

```bash
# Import GPG key
rpm --import blockd-signing-key.asc

# Sign package
rpm --addsign ~/rpmbuild/RPMS/x86_64/blockd-browser-1.0.0-1.x86_64.rpm

# Verify signature
rpm --checksig ~/rpmbuild/RPMS/x86_64/blockd-browser-1.0.0-1.x86_64.rpm
```

#### Step 5: Test Installation

```bash
# Install
sudo dnf install ~/rpmbuild/RPMS/x86_64/blockd-browser-1.0.0-1.x86_64.rpm

# Run
blockd-browser

# Uninstall
sudo dnf remove blockd-browser
```

### AppImage (Universal)

#### Step 1: Install appimagetool

```bash
wget https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
chmod +x appimagetool-x86_64.AppImage
sudo mv appimagetool-x86_64.AppImage /usr/local/bin/appimagetool
```

#### Step 2: Build AppImage

```bash
cd ../Blockd/chromium/installer/linux/appimage

# Run build script
chmod +x build_appimage.sh
./build_appimage.sh

# Output: BlockedBrowser-v1.0.0.AppImage (~85 MB)
```

#### Step 3: Test AppImage

```bash
# Make executable
chmod +x BlockedBrowser-v1.0.0.AppImage

# Run
./BlockedBrowser-v1.0.0.AppImage

# Test on different distros (Ubuntu, Fedora, Arch, etc.)
```

## Auto-Update Setup

Linux auto-updates use custom updater built into browser.

### Update Server

Host update manifest at `https://update.blockd.com/linux/latest.json`:

```json
{
  "version": "1.0.0",
  "release_date": "2025-11-24",
  "formats": {
    "deb": {
      "url": "https://update.blockd.com/linux/blockd-browser_1.0.0_amd64.deb",
      "sha256": "abc123...",
      "size": 85000000
    },
    "rpm": {
      "url": "https://update.blockd.com/linux/blockd-browser-1.0.0-1.x86_64.rpm",
      "sha256": "def456...",
      "size": 85000000
    },
    "appimage": {
      "url": "https://update.blockd.com/linux/BlockedBrowser-v1.0.0.AppImage",
      "sha256": "ghi789...",
      "size": 85000000
    }
  },
  "release_notes": "https://blockd.com/release-notes/1.0.0.html"
}
```

### Update Client Implementation

Browser checks for updates on startup:

```cpp
// chrome/browser/blocked/update_checker_linux.cc
void UpdateChecker::CheckForUpdates() {
  // Fetch latest.json
  // Compare versions
  // Download new package if available
  // Verify SHA-256
  // Notify user to install update
}
```

## Distribution

### Package Repositories

#### Debian/Ubuntu Repository

1. **Create repository structure**:
```bash
mkdir -p repo/dists/stable/main/binary-amd64
cp blockd-browser_1.0.0_amd64.deb repo/
```

2. **Generate Packages file**:
```bash
cd repo
dpkg-scanpackages . /dev/null | gzip -9c > Packages.gz
```

3. **Sign repository**:
```bash
apt-ftparchive release . > Release
gpg --default-key blockd@blockd.com -abs -o Release.gpg Release
```

4. **Host repository**:
```bash
aws s3 sync repo/ s3://apt.blockd.com/ --acl public-read
```

5. **User installation**:
```bash
# Add repository
echo "deb https://apt.blockd.com stable main" | \
    sudo tee /etc/apt/sources.list.d/blockd.list

# Add GPG key
wget -O - https://apt.blockd.com/blockd-signing-key.asc | \
    sudo apt-key add -

# Install
sudo apt-get update
sudo apt-get install blockd-browser
```

#### Fedora/RHEL Repository

1. **Create repository**:
```bash
mkdir -p repo/x86_64
cp blockd-browser-1.0.0-1.x86_64.rpm repo/x86_64/
createrepo repo/
```

2. **Sign repository**:
```bash
gpg --detach-sign --armor repo/repodata/repomd.xml
```

3. **Host repository**:
```bash
aws s3 sync repo/ s3://yum.blockd.com/ --acl public-read
```

4. **User installation**:
```bash
# Add repository
sudo tee /etc/yum.repos.d/blockd.repo <<EOF
[blockd]
name=Blockd Browser
baseurl=https://yum.blockd.com
enabled=1
gpgcheck=1
gpgkey=https://yum.blockd.com/blockd-signing-key.asc
EOF

# Install
sudo dnf install blockd-browser
```

### Direct Downloads

```bash
# Upload to CDN
aws s3 cp blockd-browser_1.0.0_amd64.deb \
    s3://downloads.blockd.com/linux/blockd-browser_1.0.0_amd64.deb \
    --acl public-read

aws s3 cp BlockedBrowser-v1.0.0.AppImage \
    s3://downloads.blockd.com/linux/BlockedBrowser-v1.0.0.AppImage \
    --acl public-read

# Generate checksums
sha256sum blockd-browser_1.0.0_amd64.deb > SHA256SUMS
sha256sum BlockedBrowser-v1.0.0.AppImage >> SHA256SUMS
```

## Troubleshooting

### Build Failures

**Error: "No usable sysroot found"**
```bash
./build/linux/sysroot_scripts/install-sysroot.py --arch=amd64
```

**Error: "clang++: command not found"**
```bash
# Chromium downloads clang automatically
tools/clang/scripts/update.py
```

**Error: "Out of memory"**
```bash
# Reduce parallel jobs
ninja -C out/Release -j4 chrome
```

### Packaging Issues

**Error: "dpkg-deb: error: control directory has bad permissions"**
```bash
chmod 755 DEBIAN
chmod 644 DEBIAN/control
chmod 755 DEBIAN/postinst DEBIAN/postrm
```

**Error: "chrome-sandbox must be owned by root"**
- Fixed automatically by postinst script

### Runtime Issues

**Error: "error while loading shared libraries: libffmpeg.so"**
```bash
# Install ffmpeg libraries
sudo apt-get install libavcodec-dev libavformat-dev
```

**User reports: "App won't start"**
- Check dependencies: `ldd /opt/blockd-browser/chrome`
- Install missing libraries

## Performance Optimization

### Build Times

- **16-core CPU, 32GB RAM**: 2-4 hours (full), 5-15 min (incremental)
- **8-core CPU, 16GB RAM**: 4-6 hours (full), 10-30 min (incremental)

### Package Size

- DEB/RPM: ~85 MB
- AppImage: ~85 MB (self-contained)

## Maintenance

### Regular Updates

- **Chromium Rebases**: Every 6 weeks
- **Security Patches**: Apply within 48 hours
- **Dependency Updates**: Monthly check for updated libraries

### Monitoring

- Track package downloads
- Monitor update success rates
- Collect crash reports

## Contact

For Linux build issues:
- Email: build@blockd.com
- Slack: #engineering
- Wiki: https://wiki.blockd.com/linux-build
