# macOS Build and Distribution Guide

This document describes the complete process for building, signing, notarizing, and distributing Blockd Browser on macOS.

## Prerequisites

### Build Environment
- **OS**: macOS 12.0+ (Monterey or later)
- **Xcode**: 14.0+ with Command Line Tools
- **Disk Space**: 100+ GB SSD
- **RAM**: 16-32 GB (32 GB recommended)
- **CPU**: Apple Silicon (M1/M2/M3) or Intel 8+ cores

### Developer Account
- **Apple Developer Program**: $99/year enrollment
- **Developer ID Certificate**: "Developer ID Application"
- **App-Specific Password**: For notarization

### Tools
- **depot_tools**: Chromium build tools
- **create-dmg**: For DMG creation (optional)
- **Sparkle**: Auto-update framework

## Build Process

### Step 1: Set Up Chromium Build Environment

```bash
# Install depot_tools
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$PATH:$HOME/depot_tools"

# Add to ~/.zshrc or ~/.bash_profile
echo 'export PATH="$PATH:$HOME/depot_tools"' >> ~/.zshrc

# Create build directory
mkdir ~/chromium
cd ~/chromium

# Fetch Chromium source (50+ GB, 2-4 hours)
fetch --no-history chromium
cd src
```

### Step 2: Install Build Dependencies

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install build dependencies
build/install-build-deps.sh

# For Apple Silicon, install Rosetta 2
softwareupdate --install-rosetta
```

### Step 3: Apply Blockd Modifications

```bash
# Copy Blockd source files
cp -R ../Blockd/chromium/src/chrome/browser/blocked chrome/browser/
cp -R ../Blockd/chromium/src/content/renderer/blocked_eye_tracking content/renderer/

# Apply patches (if using patch files)
git apply ../Blockd/chromium/patches/*.patch
```

### Step 4: Configure Build

Create `out/Release/args.gn`:

```gn
is_component_build = false
is_official_build = true
is_debug = false
target_cpu = "arm64"  # or "x64" for Intel
symbol_level = 1

# Blockd-specific flags
blocked_enable_security_monitoring = true
blocked_enable_eye_tracking = true
blocked_enable_telemetry = true
blocked_backend_url = "wss://api.blockd.site"

# macOS-specific
mac_deployment_target = "11.0"
mac_bundle_id = "com.blockd.browser"

# Chrome branding
enable_nacl = false
proprietary_codecs = true
ffmpeg_branding = "Chrome"

# Signing (will sign manually later)
is_official_build = true
```

Generate build files:

```bash
gn gen out/Release
```

### Step 5: Build Chromium

```bash
# Full build (3-6 hours on first run)
ninja -C out/Release chrome

# Build creates: out/Release/Blockd Browser.app
```

### Step 6: Configure App Bundle

```bash
# Copy Info.plist
cp ../Blockd/chromium/installer/mac/Info.plist \
   "out/Release/Blockd Browser.app/Contents/"

# Copy icons
cp resources/app_icon.icns \
   "out/Release/Blockd Browser.app/Contents/Resources/app.icns"

# Integrate Sparkle framework
cp -R Sparkle.framework \
   "out/Release/Blockd Browser.app/Contents/Frameworks/"
```

### Step 7: Code Sign and Notarize

```bash
cd ../Blockd/chromium/installer/mac

# Set environment variables
export BLOCKD_APPLE_ID="your@email.com"
export BLOCKD_TEAM_ID="ABCD123456"
export BLOCKD_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"

# Run signing script
chmod +x sign_and_notarize.sh
./sign_and_notarize.sh
```

This process:
1. Signs all binaries with Developer ID
2. Applies hardened runtime
3. Submits to Apple for notarization (15-30 minutes)
4. Staples notarization ticket to app bundle

### Step 8: Create DMG

```bash
chmod +x create_dmg.sh
./create_dmg.sh
```

Output: `out/Release/BlockedBrowser-v1.0.0.dmg` (~85 MB)

### Step 9: Verify Signatures

```bash
# Verify code signature
codesign --verify --deep --strict --verbose=2 "out/Release/Blockd Browser.app"

# Verify notarization
spctl --assess --type execute --verbose=4 "out/Release/Blockd Browser.app"

# Verify stapled ticket
xcrun stapler validate "out/Release/Blockd Browser.app"
```

## Testing

### Local Testing

```bash
# Run from build directory
open "out/Release/Blockd Browser.app"

# Run with test profile
open "out/Release/Blockd Browser.app" --args --user-data-dir=/tmp/test-profile
```

### Fresh Install Testing

1. Mount DMG
2. Drag app to Applications
3. Launch from Applications folder
4. Verify Gatekeeper doesn't block
5. Test all features

## Auto-Update Setup (Sparkle)

### Step 1: Generate EdDSA Key Pair

```bash
# Generate private key (keep secure!)
openssl genpkey -algorithm Ed25519 -out sparkle_private.pem

# Extract public key
openssl pkey -in sparkle_private.pem -pubout -out sparkle_public.pem

# Get base64-encoded public key for Info.plist
openssl pkey -in sparkle_private.pem -pubout -outform DER | tail -c 32 | base64
```

Add public key to `Info.plist`:
```xml
<key>SUPublicEDKey</key>
<string>BASE64_PUBLIC_KEY_HERE</string>
```

### Step 2: Create Appcast XML

Host at `https://update.blockd.com/macos/appcast.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Blockd Browser Updates</title>
    <item>
      <title>Version 1.0.0</title>
      <pubDate>Mon, 24 Nov 2025 12:00:00 +0000</pubDate>
      <sparkle:minimumSystemVersion>11.0</sparkle:minimumSystemVersion>
      <enclosure
        url="https://update.blockd.com/macos/BlockedBrowser-v1.0.0.dmg"
        sparkle:version="1.0.0"
        sparkle:shortVersionString="1.0.0"
        length="85000000"
        type="application/octet-stream"
        sparkle:edSignature="EDDSA_SIGNATURE_HERE" />
    </item>
  </channel>
</rss>
```

### Step 3: Sign Updates

```bash
# Sign DMG with Sparkle
./Pods/Sparkle/bin/sign_update \
    BlockedBrowser-v1.0.0.dmg \
    sparkle_private.pem

# Output: EdDSA signature for appcast.xml
```

### Step 4: Update Server

- Host appcast.xml and DMG files
- Serve over HTTPS
- Set appropriate cache headers
- Monitor download analytics

## Distribution

### Direct Download

```bash
# Upload to CDN
aws s3 cp out/Release/BlockedBrowser-v1.0.0.dmg \
    s3://downloads.blockd.com/macos/BlockedBrowser-v1.0.0.dmg \
    --acl public-read

# Generate SHA-256 for verification
shasum -a 256 out/Release/BlockedBrowser-v1.0.0.dmg
```

Website download link:
```html
<a href="https://downloads.blockd.com/macos/BlockedBrowser-v1.0.0.dmg">
  Download Blockd Browser for macOS
</a>
<p>SHA-256: <code>abc123...</code></p>
```

### Mac App Store (Future Consideration)

Requirements:
- Apple Developer Program
- App Store distribution certificate
- App Store submission process
- App Store Review Guidelines compliance

Considerations:
- Sandbox restrictions (may limit security monitoring)
- Review process (1-7 days)
- 30% revenue share
- Easier distribution and updates

## Troubleshooting

### Build Failures

**Error: "Xcode license agreement not accepted"**
```bash
sudo xcodebuild -license accept
```

**Error: "Python 2.7 required"**
- depot_tools includes Python 2.7, ensure it's in PATH

**Error: "gn: command not found"**
```bash
cd ~/depot_tools
./update_depot_tools
```

### Signing Failures

**Error: "No identity found"**
```bash
# List available identities
security find-identity -v -p codesigning

# Import certificate if missing
# Download from Apple Developer portal
```

**Error: "User interaction is not allowed"**
- Unlock keychain: `security unlock-keychain ~/Library/Keychains/login.keychain`

### Notarization Failures

**Error: "The binary is not signed"**
- Ensure all binaries are signed before submitting
- Check with: `codesign --verify --deep --strict app.app`

**Error: "The signature does not include a secure timestamp"**
- Add `--timestamp` flag to codesign command

**Error: "Notarization failed with status 'invalid'"**
- Check notarization log: `xcrun notarytool log SUBMISSION_ID`
- Common issues: missing entitlements, unsigned binaries, hardened runtime not enabled

### Gatekeeper Issues

**User reports: "App is damaged and can't be opened"**
- App wasn't properly notarized
- Download was corrupted (check SHA-256)

**User reports: "App can't be opened because Apple cannot check it for malicious software"**
- App wasn't notarized
- Notarization ticket not stapled

## Universal Binary (Apple Silicon + Intel)

To build for both architectures:

```gn
# Build for arm64
gn gen out/Release-arm64 --args='target_cpu="arm64" ...'
ninja -C out/Release-arm64 chrome

# Build for x64
gn gen out/Release-x64 --args='target_cpu="x64" ...'
ninja -C out/Release-x64 chrome

# Create universal binary
lipo -create \
    out/Release-arm64/Blockd\ Browser.app/Contents/MacOS/Blockd\ Browser \
    out/Release-x64/Blockd\ Browser.app/Contents/MacOS/Blockd\ Browser \
    -output BlockedBrowser-universal

# Copy to app bundle
cp BlockedBrowser-universal \
    "out/Release/Blockd Browser.app/Contents/MacOS/Blockd Browser"
```

Benefits:
- Native performance on both Apple Silicon and Intel
- Larger app size (~150 MB vs ~85 MB)

## Performance Optimization

### Build Times

- **Apple Silicon (M1/M2)**: 2-4 hours (full), 5-15 min (incremental)
- **Intel (8-core)**: 4-6 hours (full), 10-30 min (incremental)
- **Use ccache**: Cache compiled objects

### DMG Size

- Current: ~85 MB (arm64), ~150 MB (universal)
- Compression: UDZO (zlib) is default, ULFO (LZFSE) for smaller size

## Maintenance

### Chromium Rebases

Every 6 weeks with new Chromium stable:

```bash
cd ~/chromium/src
git fetch origin
git checkout -b update-chromium-M120
git merge refs/remotes/origin/120.0.6099.109
# Resolve conflicts
# Rebuild and test
```

### Certificate Renewal

Developer ID certificates expire after 1 year:
1. Renew in Apple Developer portal 30 days before expiration
2. Download new certificate
3. Install in Keychain
4. Re-sign all binaries
5. Re-notarize
6. Update distribution

## Appendix

### Entitlements Reference

```xml
<!-- Required for Chromium -->
<key>com.apple.security.cs.allow-jit</key>
<true/>

<!-- Camera access -->
<key>com.apple.security.device.camera</key>
<true/>

<!-- Microphone access -->
<key>com.apple.security.device.audio-input</key>
<true/>

<!-- Network access -->
<key>com.apple.security.network.client</key>
<true/>
```

## Contact

For macOS build issues:
- Email: build@blockd.com
- Slack: #engineering
- Wiki: https://wiki.blockd.com/macos-build
