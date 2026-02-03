# Auto-Update Infrastructure Guide

This document describes the auto-update system for Blockd Browser across all platforms.

## Overview

Blockd Browser uses platform-specific auto-update mechanisms:
- **Windows**: Google Omaha protocol
- **macOS**: Sparkle framework
- **Linux**: Custom HTTP-based updater

All platforms check for updates on browser startup (max once per 24 hours).

## Architecture

```
┌─────────────────┐
│  Blockd Browser │
│   (Client)      │
└────────┬────────┘
         │ 1. Check for updates
         │    (on startup, max 1/day)
         ▼
┌─────────────────┐
│  Update Server  │
│  (CDN-backed)   │
└────────┬────────┘
         │ 2. Return update manifest
         │    (version, URL, SHA-256)
         ▼
┌─────────────────┐
│     Client      │
│  (Downloads &   │
│   Verifies)     │
└────────┬────────┘
         │ 3. Download update
         │    Verify signature
         ▼
┌─────────────────┐
│     Install     │
│  (Background)   │
└─────────────────┘
```

## Windows Auto-Update (Omaha)

### Client Implementation

Browser registers with Google Update on installation:

```cpp
// chrome/browser/blocked/update_checker_win.cc
class UpdateCheckerWin : public UpdateChecker {
 public:
  void CheckForUpdates() override {
    // Query Omaha server
    std::string url = "https://update.blockd.com/service/update2";

    // Build request
    OmahaRequest request;
    request.set_protocol_version("3.0");
    request.set_app_id("{BLOCKD-GUID}");
    request.set_version(GetCurrentVersion());
    request.set_platform("win");

    // Send request
    HttpClient::Post(url, request.ToXml());
  }
};
```

### Server Configuration

#### Update Manifest (XML)

`https://update.blockd.com/service/update2`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response protocol="3.0" server="prod">
  <daystart elapsed_seconds="0"/>
  <app appid="{BLOCKD-GUID}" status="ok">
    <updatecheck status="ok">
      <urls>
        <url codebase="https://downloads.blockd.com/windows/"/>
      </urls>
      <manifest version="1.0.1">
        <packages>
          <package name="BlockdBrowser_Setup_v1.0.1.exe"
                   size="86000000"
                   hash_sha256="abc123def456..."
                   required="true"/>
        </packages>
        <actions>
          <action event="update"
                  run="BlockdBrowser_Setup_v1.0.1.exe"
                  arguments="/S /UPDATE"
                  successaction="exitsilentlyonlaunchcmd"/>
        </actions>
      </manifest>
    </updatecheck>
  </app>
</response>
```

#### Server Implementation (Node.js)

```javascript
// update_server.js
const express = require('express');
const app = express();

app.post('/service/update2', (req, res) => {
  // Parse Omaha request
  const request = parseOmahaXML(req.body);

  // Get latest version
  const latestVersion = '1.0.1';
  const currentVersion = request.version;

  if (isNewerVersion(latestVersion, currentVersion)) {
    // Send update available response
    res.send(generateUpdateResponse(latestVersion));
  } else {
    // Send no update response
    res.send(generateNoUpdateResponse());
  }

  // Log for analytics
  logUpdateCheck(request);
});

app.listen(443);
```

### Update Process

1. **Check**: Browser sends POST request to update server
2. **Response**: Server returns manifest if update available
3. **Download**: Browser downloads installer in background
4. **Verify**: Browser verifies SHA-256 hash
5. **Install**: User prompted to restart browser
6. **Apply**: Installer runs silently on restart (`/S /UPDATE` flags)

### Registry Configuration

Installer creates:
```
HKLM\Software\Google\Update\Clients\{BLOCKD-GUID}
  pv = "1.0.0"               (current version)
  name = "Blockd Browser"
  lang = "en"

HKLM\Software\Google\Update\ClientState\{BLOCKD-GUID}
  lastCheckTime = 1700000000  (Unix timestamp)
  updateCheckInterval = 86400  (24 hours in seconds)
```

## macOS Auto-Update (Sparkle)

### Client Integration

Sparkle framework is embedded in app bundle:

```
Blockd Browser.app/
├── Contents/
│   ├── Frameworks/
│   │   └── Sparkle.framework/
│   ├── Info.plist
│   └── MacOS/
│       └── Blockd Browser
```

Info.plist configuration:
```xml
<key>SUEnableAutomaticChecks</key>
<true/>
<key>SUFeedURL</key>
<string>https://update.blockd.com/macos/appcast.xml</string>
<key>SUAllowsAutomaticUpdates</key>
<true/>
<key>SUScheduledCheckInterval</key>
<integer>86400</integer>
<key>SUPublicEDKey</key>
<string>BASE64_EDDSA_PUBLIC_KEY</string>
```

### Server Configuration

#### Appcast XML

`https://update.blockd.com/macos/appcast.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Blockd Browser Updates</title>
    <link>https://update.blockd.com/macos/appcast.xml</link>
    <description>Most recent updates</description>

    <item>
      <title>Version 1.0.1</title>
      <sparkle:releaseNotesLink>
        https://blockd.com/release-notes/1.0.1.html
      </sparkle:releaseNotesLink>
      <pubDate>Mon, 25 Dec 2025 12:00:00 +0000</pubDate>
      <enclosure
        url="https://downloads.blockd.com/macos/BlockdBrowser-v1.0.1.dmg"
        sparkle:version="1.0.1"
        sparkle:shortVersionString="1.0.1"
        length="86000000"
        type="application/octet-stream"
        sparkle:edSignature="EDDSA_SIGNATURE_HERE"/>
      <sparkle:minimumSystemVersion>11.0</sparkle:minimumSystemVersion>
    </item>
  </channel>
</rss>
```

### Update Process

1. **Check**: Sparkle fetches appcast.xml
2. **Compare**: Check if new version > current version
3. **Verify**: Validate EdDSA signature with public key
4. **Prompt**: Show update dialog with release notes
5. **Download**: Download DMG in background
6. **Install**: Extract new app, replace old app
7. **Relaunch**: Restart browser with new version

### Signing Updates

```bash
# Generate EdDSA signature
./Pods/Sparkle/bin/sign_update \
    BlockdBrowser-v1.0.1.dmg \
    sparkle_private.pem

# Output: EdDSA signature for appcast.xml
# Example: MC0CFQDw7+zt1...
```

### Delta Updates (Optional)

For faster updates, Sparkle supports delta patches:

```xml
<enclosure
  url="https://downloads.blockd.com/macos/BlockdBrowser-v1.0.0-to-v1.0.1.delta"
  sparkle:version="1.0.1"
  sparkle:deltaFrom="1.0.0"
  length="15000000"
  type="application/octet-stream"
  sparkle:edSignature="DELTA_SIGNATURE_HERE"/>
```

## Linux Auto-Update

### Client Implementation

```cpp
// chrome/browser/blocked/update_checker_linux.cc
class UpdateCheckerLinux : public UpdateChecker {
 public:
  void CheckForUpdates() override {
    // Fetch update manifest
    std::string url = "https://update.blockd.com/linux/latest.json";
    std::string response = HttpClient::Get(url);

    // Parse JSON
    auto manifest = json::parse(response);
    std::string latest_version = manifest["version"];

    // Compare versions
    if (IsNewerVersion(latest_version, GetCurrentVersion())) {
      // Determine package format
      std::string format = GetPackageFormat();  // "deb", "rpm", or "appimage"

      // Get download URL and SHA-256
      std::string download_url = manifest["formats"][format]["url"];
      std::string sha256 = manifest["formats"][format]["sha256"];

      // Notify user
      ShowUpdateNotification(latest_version, download_url);
    }
  }

 private:
  std::string GetPackageFormat() {
    if (FileExists("/etc/debian_version")) return "deb";
    if (FileExists("/etc/redhat-release")) return "rpm";
    return "appimage";
  }
};
```

### Server Configuration

#### Update Manifest (JSON)

`https://update.blockd.com/linux/latest.json`

```json
{
  "version": "1.0.1",
  "release_date": "2025-12-25",
  "formats": {
    "deb": {
      "url": "https://downloads.blockd.com/linux/blockd-browser_1.0.1_amd64.deb",
      "sha256": "abc123def456...",
      "size": 86000000
    },
    "rpm": {
      "url": "https://downloads.blockd.com/linux/blockd-browser-1.0.1-1.x86_64.rpm",
      "sha256": "def456ghi789...",
      "size": 86000000
    },
    "appimage": {
      "url": "https://downloads.blockd.com/linux/BlockdBrowser-v1.0.1.AppImage",
      "sha256": "ghi789jkl012...",
      "size": 86000000
    }
  },
  "release_notes": "https://blockd.com/release-notes/1.0.1.html",
  "changelog": [
    "Fixed eye tracking accuracy on Linux",
    "Improved screen recording detection",
    "Security patch for VM detection bypass"
  ]
}
```

### Update Process

1. **Check**: Browser fetches latest.json
2. **Compare**: Check if new version > current version
3. **Detect Format**: Determine .deb, .rpm, or .AppImage
4. **Download**: Download package to /tmp
5. **Verify**: Check SHA-256 hash
6. **Notify**: Show notification with option to install
7. **Install**: Open package manager or run AppImage

### AppImage Self-Update

AppImages can update themselves:

```bash
# AppImageUpdate integration
wget https://github.com/AppImage/AppImageUpdate/releases/download/continuous/appimageupdatetool-x86_64.AppImage

# Update AppImage
./appimageupdatetool-x86_64.AppImage BlockdBrowser-v1.0.0.AppImage
```

## Update Server Infrastructure

### CDN Configuration

Use CloudFront or Cloudflare:

```
downloads.blockd.com (Origin: S3)
├── windows/
│   ├── BlockdBrowser_Setup_v1.0.0.exe
│   └── BlockdBrowser_Setup_v1.0.1.exe
├── macos/
│   ├── BlockdBrowser-v1.0.0.dmg
│   └── BlockdBrowser-v1.0.1.dmg
└── linux/
    ├── blockd-browser_1.0.0_amd64.deb
    ├── blockd-browser_1.0.1_amd64.deb
    └── BlockdBrowser-v1.0.1.AppImage

update.blockd.com (Origin: API Server)
├── /service/update2 (Windows Omaha)
├── /macos/appcast.xml (macOS Sparkle)
└── /linux/latest.json (Linux manifest)
```

### Server Implementation

```javascript
// Express.js update server
const express = require('express');
const app = express();

// Windows Omaha endpoint
app.post('/service/update2', handleOmahaRequest);

// macOS Sparkle appcast
app.get('/macos/appcast.xml', (req, res) => {
  res.type('application/rss+xml');
  res.send(generateAppcast());
});

// Linux update manifest
app.get('/linux/latest.json', (req, res) => {
  res.json(generateLinuxManifest());
});

// Analytics
app.use((req, res, next) => {
  logUpdateRequest(req);
  next();
});
```

### Analytics

Track:
- Update check requests (by version, platform, country)
- Download started
- Download completed
- Installation success/failure
- Version distribution (how many users on each version)

## Security

### Signature Verification

All platforms verify update integrity:

- **Windows**: SHA-256 hash + Authenticode signature
- **macOS**: EdDSA signature verification
- **Linux**: GPG signature (deb/rpm) or SHA-256 (AppImage)

### HTTPS Only

All update traffic uses HTTPS with certificate pinning:

```cpp
const char* kUpdateServerPins[] = {
  "sha256/AAAAAAAAAA...",  // Primary certificate
  "sha256/BBBBBBBBBB...",  // Backup certificate
  nullptr
};
```

### Staged Rollouts

Deploy updates gradually:

```javascript
function shouldServeUpdate(userId, version) {
  // Hash user ID to get deterministic value 0-100
  const bucket = hashUserId(userId) % 100;

  // Rollout stages:
  // 0-5%: Beta users
  // 5-25%: Early adopters
  // 25-100%: General availability

  const daysInProduction = getDaysSinceRelease(version);

  if (daysInProduction < 1) return bucket < 5;   // 5% on day 1
  if (daysInProduction < 3) return bucket < 25;  // 25% on day 3
  return true;  // 100% after day 3
}
```

## Monitoring

### Update Success Rate

Track successful updates vs. failures:

```sql
SELECT
  platform,
  from_version,
  to_version,
  COUNT(*) as total_attempts,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful,
  AVG(download_time_seconds) as avg_download_time
FROM update_logs
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY platform, from_version, to_version;
```

### Alerts

Set up alerts for:
- Update success rate < 95%
- Download failures > 5%
- Version distribution anomalies
- Update server downtime

## Testing

### Update Testing Checklist

For each release:
- [ ] Test update from previous version
- [ ] Test clean install
- [ ] Verify signature validation
- [ ] Test rollback if update fails
- [ ] Test on all supported OS versions
- [ ] Test with slow/unstable network
- [ ] Verify analytics tracking

## Contact

For auto-update issues:
- Email: infrastructure@blockd.com
- Slack: #infrastructure
- On-call: Auto-update PagerDuty rotation
