# Blockd Browser - Expected URLs

> **Version:** 1.0
> **Last Updated:** January 2026

This document lists all URLs that the Blockd browser expects to be available when deployed.

---

## Summary

Deploy these endpoints on `blockd.site`:

```
blockd.site
├── /login        ← User authentication
├── /session      ← Interview dashboard (DEFAULT HOMEPAGE)
└── /terms        ← Terms of Service

api.blockd.site
├── /             ← WebSocket endpoint (wss://)
└── /health       ← Health check endpoint

update.blockd.site
├── /macos/appcast.xml                  ← Sparkle update feed
└── /releases/windows/                  ← Windows update files
```

---

## User-Facing Pages (REQUIRED)

These URLs are hardcoded in the browser and MUST be deployed.

### 1. Login Page

| Property | Value |
|----------|-------|
| **URL** | `https://blockd.site/login` |
| **Purpose** | User authentication |
| **When Used** | First launch, session expired, manual logout |
| **Source** | `blocked_features.gni`, `blocked_first_run_service.h` |

**What it should do:**
- Accept user credentials (email/password or OAuth)
- Redirect to `/session` on successful login
- Set authentication cookies/tokens

---

### 2. Session Page (DEFAULT HOMEPAGE)

| Property | Value |
|----------|-------|
| **URL** | `https://blockd.site/session` |
| **Purpose** | Main interview dashboard |
| **When Used** | After login, browser launch (if logged in) |
| **Source** | `args.gn`, `blocked_features.gni` |

**This is the browser's default homepage.** When users open Blockd browser, they should land here.

**What it should do:**
- Show list of upcoming interviews
- Allow joining interview sessions
- Provide meeting platform selection (Meet, Zoom, Teams)
- Display session status and history

---

### 3. Terms of Service

| Property | Value |
|----------|-------|
| **URL** | `https://blockd.site/terms` |
| **Purpose** | Terms acceptance gate |
| **When Used** | First-run flow (before login) |
| **Source** | `blocked_features.gni` |

**What it should do:**
- Display Blockd Terms of Service
- Require acceptance before proceeding
- Only shown once per installation

---

## API Endpoints (REQUIRED)

### 4. WebSocket Backend

| Property | Value |
|----------|-------|
| **URL** | `wss://api.blockd.site` |
| **Protocol** | WebSocket Secure (TLS) |
| **Purpose** | Real-time data streaming |
| **Source** | `args.gn` line 21, `blocked_features.gni` |

**Data sent from browser:**
- Eye tracking/gaze data (batched)
- Security events (process detection, VM, screen recording)
- Telemetry (CPU, memory, focus state)
- Video frames (when streaming)
- Heartbeat messages

**Expected message format:** Protocol Buffers (defined in `blocked_protocol.proto`)

---

### 5. Health Check (Optional but Recommended)

| Property | Value |
|----------|-------|
| **URL** | `https://api.blockd.site/health` |
| **Purpose** | Connection verification |
| **Method** | GET |
| **Expected Response** | `200 OK` with JSON `{"status": "healthy"}` |

---

## Update Server URLs (FOR INSTALLERS)

### 6. macOS Sparkle Updates

| Property | Value |
|----------|-------|
| **URL** | `https://update.blockd.site/macos/appcast.xml` |
| **Purpose** | Sparkle update feed |
| **Source** | `installer/mac/sparkle_appcast.xml`, `installer/mac/Info.plist` |

**Appcast format:** Standard Sparkle XML with:
- Version information
- Download URL for DMG
- EdDSA signature
- Release notes link

---

### 7. Windows Update Server

| Property | Value |
|----------|-------|
| **URL** | `https://update.blockd.site/releases/windows/` |
| **Purpose** | Omaha 4 update server |
| **Source** | `installer/windows/omaha_config.xml` |

**Should serve:**
- Update manifests
- Installer executables
- Version information

---

## URL Configuration Locations

| File | URLs Defined |
|------|--------------|
| `args.gn` | `blockd_backend_url`, `blockd_default_homepage`, `blockd_startup_url` |
| `blocked_features.gni` | `blocked_default_homepage`, `blocked_login_url`, `blocked_terms_url` |
| `blocked_first_run_service.h` | `kBlockdLoginUrl`, `kBlockdSessionUrl` |
| `installer/mac/Info.plist` | Sparkle `SUFeedURL` |
| `installer/mac/sparkle_appcast.xml` | Update download URLs |
| `installer/windows/omaha_config.xml` | Windows update server |
| `installer/windows/blocked_installer.nsi` | `PRODUCT_WEB_SITE` |

---

## Canonical URL Values

To ensure consistency, use these exact values:

```
# User-facing pages
https://blockd.site/login
https://blockd.site/session
https://blockd.site/terms

# API
wss://api.blockd.site

# Updates
https://update.blockd.site/macos/appcast.xml
https://update.blockd.site/releases/windows/
```

**NOTE:** Some files incorrectly use `app.blockd.site` instead of `blockd.site`. The canonical domain is `blockd.site`.

---

## Deployment Checklist

### Must Have (Browser Won't Function Without)
- [ ] `blockd.site/login` - Returns login page
- [ ] `blockd.site/session` - Returns session dashboard
- [ ] `wss://api.blockd.site` - WebSocket accepts connections

### Should Have (First-Run Flow)
- [ ] `blockd.site/terms` - Terms of Service page

### For Auto-Updates
- [ ] `update.blockd.site/macos/appcast.xml` - Sparkle feed (macOS)
- [ ] `update.blockd.site/releases/windows/` - Update files (Windows)

### Optional
- [ ] `api.blockd.site/health` - Health check endpoint

---

## Testing URLs

After deployment, verify with:

```bash
# Check login page
curl -I https://blockd.site/login
# Expected: 200 OK

# Check session page
curl -I https://blockd.site/session
# Expected: 200 OK (may redirect to login if auth required)

# Check terms page
curl -I https://blockd.site/terms
# Expected: 200 OK

# Check WebSocket (requires wscat)
wscat -c wss://api.blockd.site
# Expected: Connection established

# Check update feed (macOS)
curl https://update.blockd.site/macos/appcast.xml
# Expected: XML content
```

---

## SSL/TLS Requirements

All URLs MUST use HTTPS/WSS with valid certificates:

- Certificate must be valid (not self-signed for production)
- TLS 1.2 or higher required
- WebSocket endpoint must support secure WebSocket (wss://)

---

*Document maintained by Blockd Engineering Team*
