## Windows Build and Distribution Guide

This document describes the complete process for building, signing, and distributing Blockd Browser on Windows.

## Prerequisites

### Build Environment
- **OS**: Windows 10/11 (64-bit)
- **Disk Space**: 100+ GB SSD recommended
- **RAM**: 16-32 GB
- **CPU**: 8+ cores recommended
- **Visual Studio**: 2022 (v17.x) with C++ desktop development workload
- **Windows SDK**: 10.0.22621.0 or later
- **Python**: 3.11+ (for depot_tools)
- **Git**: 2.40+

### Tools
- **depot_tools**: Chromium build tools
- **NSIS**: 3.08+ for installer creation
- **SignTool**: Windows SDK code signing tool
- **Code Signing Certificate**: EV certificate from DigiCert/Sectigo

## Build Process

### Step 1: Set Up Chromium Build Environment

```batch
REM Install depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
set PATH=C:\path\to\depot_tools;%PATH%

REM Create build directory
mkdir C:\chromium
cd C:\chromium

REM Fetch Chromium source (50+ GB, 2-4 hours)
fetch --no-history chromium
cd src
```

### Step 2: Apply Blockd Modifications

```batch
REM Copy Blockd source files
xcopy /E /I /Y ..\Blockd\chromium\src\chrome\browser\blocked chrome\browser\blocked\
xcopy /E /I /Y ..\Blockd\chromium\src\content\renderer\blocked_eye_tracking content\renderer\blocked_eye_tracking\

REM Apply patches (if using patch files)
git apply ..\Blockd\chromium\patches\*.patch
```

### Step 3: Configure Build

Create `out\Release\args.gn`:

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

# Chrome branding
chrome_pgo_phase = 0
enable_nacl = false
proprietary_codecs = true
ffmpeg_branding = "Chrome"

# Performance
use_jumbo_build = true
enable_precompiled_headers = false
```

Generate build files:

```batch
gn gen out\Release
```

### Step 4: Build Chromium

```batch
REM Full build (4-8 hours on first run)
ninja -C out\Release chrome

REM Incremental builds (5-20 minutes)
ninja -C out\Release chrome
```

### Step 5: Build Installer

```batch
cd ..\Blockd\chromium\installer\windows
build_installer.bat
```

This creates: `out\Release\BlockedBrowser_Setup_v1.0.0.exe` (~85 MB)

### Step 6: Code Sign

```batch
REM Set certificate password (use secure method in production)
set BLOCKD_CERT_PASSWORD=your_password

REM Sign binaries and installer
sign.bat
```

### Step 7: Verify Signature

```batch
signtool verify /pa /v out\Release\blocked.exe
signtool verify /pa /v out\Release\BlockedBrowser_Setup_v1.0.0.exe
```

## Testing

### Local Testing

```batch
REM Run installer
out\Release\BlockedBrowser_Setup_v1.0.0.exe

REM Run browser directly
out\Release\blocked.exe --user-data-dir=test-profile
```

### VM Testing (Recommended)

1. Create clean Windows 10/11 VM
2. Install prerequisites (Visual C++ Redistributable)
3. Run installer
4. Test all features:
   - Launch browser
   - Join test session
   - Verify security monitoring works
   - Test auto-update (optional)

## Auto-Update Setup

### Google Omaha Integration

Blockd uses Google Omaha protocol for auto-updates.

1. **Update Server**: Host update manifest at `https://update.blockd.com/service/update2`

2. **Update Manifest** (`omaha_config.xml`):
```xml
<response protocol="3.0">
  <app appid="{BLOCKD-GUID}">
    <updatecheck status="ok">
      <urls>
        <url codebase="https://update.blockd.com/releases/windows/"/>
      </urls>
      <manifest version="1.0.0">
        <packages>
          <package name="BlockedBrowser_Setup_v1.0.0.exe"
                   size="85000000"
                   hash_sha256="SHA256_HERE"/>
        </packages>
      </manifest>
    </updatecheck>
  </app>
</response>
```

3. **Registry Entries** (created by installer):
```
HKLM\Software\Google\Update\Clients\{BLOCKD-GUID}
  pv = "1.0.0"
  name = "Blockd Browser"
  lang = "en"
```

4. **Update Check**: Browser checks for updates on startup (max once per day)

5. **Update Server Implementation**:
   - Serve XML manifest with latest version info
   - Host installer files with correct SHA-256 hashes
   - Implement rate limiting and CDN caching
   - Log update requests for analytics

## Distribution

### Direct Download

Upload to CDN:
```batch
aws s3 cp out\Release\BlockedBrowser_Setup_v1.0.0.exe ^
    s3://downloads.blockd.com/windows/BlockedBrowser_Setup_v1.0.0.exe ^
    --acl public-read
```

Update download page:
```html
<a href="https://downloads.blockd.com/windows/BlockedBrowser_Setup_v1.0.0.exe">
  Download Blockd Browser for Windows
</a>
```

### Enterprise Deployment (MSI)

For enterprise customers, create MSI installer using WiX Toolset:

```batch
cd installer\windows
candle blocked_installer.wxs
light blocked_installer.wixobj -out BlockedBrowser_v1.0.0.msi
```

MSI supports:
- Silent installation: `msiexec /i BlockedBrowser_v1.0.0.msi /quiet`
- Group Policy deployment
- SCCM/Intune deployment
- Centralized configuration

## Troubleshooting

### Build Failures

**Error: "Python 2.7 required"**
- Solution: depot_tools includes Python 2.7, ensure depot_tools is first in PATH

**Error: "Out of disk space"**
- Solution: Chromium build requires 100+ GB. Clear unnecessary files or expand disk

**Error: "ninja: build stopped: subcommand failed"**
- Solution: Check error messages above. Usually missing dependencies or syntax errors

### Signing Failures

**Error: "No certificates were found"**
- Solution: Verify PFX path is correct and password is set

**Error: "SignTool error: SignerSign() failed"**
- Solution: Certificate may be expired or revoked. Check certificate validity

### Installer Failures

**Error: "NSIS Error: Error opening file for writing"**
- Solution: Close any running instances of Blockd Browser

**User reports: "Windows SmartScreen blocked this app"**
- Solution: Ensure installer is signed with EV certificate. EV certificates bypass SmartScreen

## Performance Optimization

### Build Times

- **Use SSD**: 2-3x faster than HDD
- **Incremental Builds**: Only rebuild changed files (5-20 min vs 4-8 hours)
- **Jumbo Builds**: Reduce compilation time by 20-30%
- **ccache**: Cache compiled objects for faster rebuilds

### Installer Size

Current size: ~85 MB

Reduction techniques:
- Strip debug symbols: `symbol_level = 0` (reduces to ~70 MB)
- Compress installer with LZMA (NSIS default)
- Remove unused components (PDF viewer, print preview, etc.)

## Maintenance

### Regular Updates

- **Chromium Rebases**: Every 6 weeks (follow Chromium stable releases)
- **Security Patches**: Apply within 48 hours of disclosure
- **Certificate Renewal**: 30 days before expiration

### Monitoring

- Track installer download counts
- Monitor update success/failure rates
- Collect crash reports (Breakpad/Crashpad)
- Track browser version distribution

## Appendix

### GN Build Arguments Reference

```gn
# Performance
is_component_build = false        # Faster startup, required for distribution
use_jumbo_build = true           # Faster compilation
enable_precompiled_headers = false  # Sometimes faster without

# Debugging
is_debug = false                 # Release build
symbol_level = 1                 # Minimal symbols (0 = none, 2 = full)
is_official_build = true         # Enables optimizations

# Features
enable_nacl = false              # Disable Native Client (deprecated)
proprietary_codecs = true        # Enable H.264, AAC for media playback
ffmpeg_branding = "Chrome"       # Include proprietary codecs

# Platform
target_cpu = "x64"               # 64-bit build
```

### Directory Structure

```
chromium/
├── src/                         # Chromium source code
│   ├── chrome/browser/blocked/  # Blockd browser code
│   ├── content/renderer/blocked_eye_tracking/
│   └── out/Release/             # Build output
├── installer/windows/           # Windows installer files
│   ├── blocked_installer.nsi
│   ├── sign.bat
│   └── build_installer.bat
└── docs/distribution/           # Documentation
```

## Contact

For build issues:
- Email: build@blockd.com
- Slack: #engineering
- Wiki: https://wiki.blockd.com/windows-build
