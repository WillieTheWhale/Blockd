# Blockd Browser Build Investigation Report

> **Date:** January 2026
> **Status:** CRITICAL ISSUES IDENTIFIED
> **Build Success Rate:** Previous builds failed with no branding/features

---

## Executive Summary

A comprehensive investigation of the Blockd Chromium fork has identified **multiple critical issues** that explain why previous builds produced browsers with:
- No custom branding (showed "Chromium" instead of "Blockd")
- No custom features working
- No proper product naming

This document details all issues found and provides fallback strategies for both Windows and macOS builds.

---

## Table of Contents

1. [Critical Issues Found](#critical-issues-found)
2. [Branding System Analysis](#branding-system-analysis)
3. [Feature Integration Status](#feature-integration-status)
4. [Expected URLs](#expected-urls)
5. [Build Fallback Strategies](#build-fallback-strategies)
6. [Pre-Build Checklist](#pre-build-checklist)
7. [Post-Build Verification](#post-build-verification)

---

## Critical Issues Found

### Issue 1: Missing SVG Logo Files (CRITICAL - BUILD WILL FAIL)

**Severity:** CRITICAL - Build will fail
**Location:** `src/chrome/app/theme/blocked/`

The GRD resource files reference SVG logos that **DO NOT EXIST**:

| Required File | Status |
|--------------|--------|
| `blocked/product_logo.svg` | **MISSING** |
| `blocked/product_logo_animation.svg` | **MISSING** |

**Evidence:** `chrome_unscaled_resources.grd` lines 88-89:
```xml
<include name="IDR_PRODUCT_LOGO_SVG" file="${branding_path_component}/product_logo.svg" />
<include name="IDR_PRODUCT_LOGO_ANIMATION_SVG" file="${branding_path_component}/product_logo_animation.svg" />
```

**Fix Required:**
1. Create `product_logo.svg` in `src/chrome/app/theme/blocked/`
2. Create `product_logo_animation.svg` in `src/chrome/app/theme/blocked/`
3. Or copy from Chromium's directory and modify

---

### Issue 2: Windows RC Files Use Hardcoded Paths (CRITICAL - WRONG ICON)

**Severity:** CRITICAL - Windows builds will show Chromium icon
**Location:** `src/chrome/app/chrome_dll.rc` and `chrome_exe.rc`

The Windows resource compiler files use **hardcoded conditional paths** that only check for Google Chrome or Chromium branding:

```c
// chrome_dll.rc line 176-177
#else
IDR_MAINFRAME       ICON  "theme\chromium\win\chromium.ico"
#endif
```

**Result:** Even with `branding_path_component = "blocked"`, Windows builds will use `chromium.ico`, NOT `blockd.ico`.

**Fix Required:** Modify `chrome_dll.rc` and `chrome_exe.rc` to include Blockd condition:
```c
#elif defined(BLOCKD_BRANDING)
IDR_MAINFRAME       ICON  "theme\\blocked\\win\\blockd.ico"
```

Or use **Fallback Strategy A** (replace Chromium branding entirely).

---

### Issue 3: Missing Windows ICO Files in Correct Location

**Severity:** HIGH
**Location:** `src/chrome/app/theme/blocked/win/`

The RC files expect icons at specific paths:

| Expected Path | Required |
|--------------|----------|
| `theme/blocked/win/blockd.ico` | Main app icon |
| `theme/blocked/win/app_list.ico` | App list icon |
| `theme/blocked/win/incognito.ico` | Private mode icon |

**Current Status:**
- `blockd.ico` exists at `src/chrome/app/theme/blocked/blockd.ico`
- `blockd.ico` exists at `src/chrome/app/theme/blocked/win/blockd.ico` ✓
- `app_list.ico` exists at `src/chrome/app/theme/blocked/win/app_list.ico` ✓
- `incognito.ico` exists at `src/chrome/app/theme/blocked/win/incognito.ico` ✓

---

### Issue 4: branding_path_component Not Used by RC Files

**Severity:** CRITICAL
**Root Cause:** GN variables like `branding_path_component` work for GRD files but NOT for RC files

RC files are processed by the Windows resource compiler, which doesn't understand GN variables. They use preprocessor conditionals (`#if BUILDFLAG(...)`) instead.

**Fix Required:** Either:
1. Modify RC files to add `BLOCKD_BRANDING` condition
2. Create a buildflags header that defines `BLOCKD_BRANDING`
3. **Fallback:** Replace Chromium branding files entirely

---

### Issue 5: URL Inconsistencies in Configuration

**Severity:** MEDIUM
**Locations:** Multiple files have different URLs

| File | Homepage URL | Login URL |
|------|-------------|-----------|
| `args.gn` | `https://blockd.site/session` | - |
| `build_blockd.py` | `https://app.blockd.site/session` | `https://app.blockd.site/login` |
| `blocked_features.gni` | `https://blockd.site/session` | `https://blockd.site/login` |

**Recommended Canonical URLs:**
- Homepage: `https://blockd.site/session`
- Login: `https://blockd.site/login`
- Terms: `https://blockd.site/terms`
- WebSocket: `wss://api.blockd.site`

---

### Issue 6: is_official_build = true Requires Google Tools

**Severity:** HIGH
**Location:** `args.gn` line 8

```gn
is_official_build = true
```

Setting `is_official_build = true` enables optimizations that may require Google's internal tools and signing infrastructure. This could cause build failures.

**Fix Required:** Change to `is_official_build = false` for non-Google builds.

---

## Branding System Analysis

### How Chromium Branding Works

1. **GN Variables** (defined in `build/config/chrome_build.gni`):
   - `branding_path_component` - Directory name under `chrome/app/theme/`
   - `branding_file_path` - Path to BRANDING file
   - `is_chrome_branded` - Boolean for Google Chrome

2. **GRD Files** (use `${branding_path_component}` substitution):
   - `chrome_unscaled_resources.grd` - Large images
   - `theme_resources.grd` - Scaled images
   - Works correctly with custom branding

3. **RC Files** (use `#if BUILDFLAG()` preprocessor):
   - `chrome_dll.rc` - DLL resources
   - `chrome_exe.rc` - EXE resources
   - **DO NOT** support custom branding without modification

4. **String Resources** (use `IDS_PRODUCT_NAME` etc.):
   - Loaded from BRANDING file at build time
   - Should work if BRANDING file path is correct

### Current Blockd Branding Setup

| Component | Status | Notes |
|-----------|--------|-------|
| `chrome_build.gni` modification | ✅ DONE | Sets `branding_path_component = "blocked"` |
| BRANDING file | ✅ DONE | Located at `chrome/app/theme/blocked/BRANDING` |
| PNG logos | ✅ DONE | All sizes from 16px to 1024px |
| SVG logos | ❌ MISSING | Required by GRD files |
| Windows ICO | ✅ DONE | In `blocked/win/` directory |
| macOS ICNS | ✅ DONE | In `blocked/mac/` directory |
| RC file modification | ❌ NOT DONE | Still uses Chromium icons |

---

## Feature Integration Status

### Browser Process Modules

| Module | BUILD.gn | In chrome/browser/BUILD.gn | Status |
|--------|----------|---------------------------|--------|
| `blocked_security` | ✅ | ✅ | Ready |
| `blocked_telemetry` | ✅ | ✅ | Ready |
| `blocked_ipc` | ✅ | ✅ | Ready |
| `blocked_video` | ✅ | ✅ | Ready |
| `blocked_meeting` | ✅ | ✅ | Ready |
| `blocked_first_run` | ✅ | ✅ | Ready |

### Renderer Process Modules

| Module | BUILD.gn | In content/renderer/BUILD.gn | Status |
|--------|----------|------------------------------|--------|
| `blocked_eye_tracking` | ✅ | ✅ | Ready |
| `blocked_ipc` | ✅ | ✅ | Ready |
| `blocked_video` | ✅ | ✅ | Ready |

### Feature Flags

All flags defined in `blocked_features.gni`:

| Flag | Default | Used |
|------|---------|------|
| `blocked_enable_security_monitoring` | `true` | ✅ |
| `blocked_enable_eye_tracking` | `true` | ✅ |
| `blocked_enable_telemetry` | `true` | ✅ |
| `blocked_enable_meeting_detection` | `true` | ✅ |
| `blocked_enable_video_capture` | `true` | ✅ |
| `blocked_enable_media_streaming` | `true` | ✅ |

---

## Expected URLs

The Blockd browser expects the following URLs to be available:

### User-Facing URLs (Must Deploy)

| URL | Purpose | When Used |
|-----|---------|-----------|
| `https://blockd.site/login` | User login page | First launch, re-auth |
| `https://blockd.site/session` | Interview session page | After login (homepage) |
| `https://blockd.site/terms` | Terms of Service | First-run acceptance |

### API Endpoints (Backend)

| URL | Purpose | Protocol |
|-----|---------|----------|
| `wss://api.blockd.site` | WebSocket backend | WSS (TLS) |
| `https://api.blockd.site/health` | Health check | HTTPS |

### Update URLs (Installers)

| URL | Purpose | Platform |
|-----|---------|----------|
| `https://update.blockd.site/macos/appcast.xml` | Sparkle updates | macOS |
| `https://update.blockd.site/releases/windows/` | Omaha updates | Windows |

### Summary: Deploy These Routes

```
blockd.site/
├── login          # Auth page
├── session        # Interview dashboard (default homepage)
└── terms          # Terms of Service

api.blockd.site/
├── /              # WebSocket endpoint (wss://)
└── /health        # Health check

update.blockd.site/
├── macos/
│   └── appcast.xml
└── releases/
    └── windows/
```

---

## Build Fallback Strategies

### Strategy A: Replace Chromium Branding (RECOMMENDED)

Instead of adding a new branding directory, **replace the default Chromium branding entirely**.

**Steps:**
1. Backup original Chromium branding:
   ```bash
   mv src/chrome/app/theme/chromium src/chrome/app/theme/chromium_original
   ```

2. Copy Blockd branding to Chromium directory:
   ```bash
   cp -r src/chrome/app/theme/blocked src/chrome/app/theme/chromium
   ```

3. Rename icons to match expected names:
   ```bash
   cd src/chrome/app/theme/chromium
   mv blockd.ico win/chromium.ico
   # Create other required files
   ```

4. Reset branding variables in args.gn:
   ```gn
   branding_path_component = "chromium"
   branding_path_product = "chromium"
   ```

**Pros:**
- No RC file modifications needed
- Uses existing build infrastructure
- All paths resolve correctly

**Cons:**
- Loses "chromium" as fallback
- More invasive change

---

### Strategy B: Modify RC Files for Blockd

Add Blockd-specific conditionals to RC files.

**Step 1:** Create buildflags file `build/branding_buildflags.h`:
```cpp
#ifndef BUILD_BRANDING_BUILDFLAGS_H_
#define BUILD_BRANDING_BUILDFLAGS_H_

#define BUILDFLAG_INTERNAL_BLOCKD_BRANDING() (1)

#endif
```

**Step 2:** Modify `chrome_dll.rc`:
```c
#if BUILDFLAG(GOOGLE_CHROME_BRANDING)
IDR_MAINFRAME       ICON  "theme\google_chrome\win\chrome.ico"
#elif BUILDFLAG(BLOCKD_BRANDING)
IDR_MAINFRAME       ICON  "theme\blocked\win\blockd.ico"
#else
IDR_MAINFRAME       ICON  "theme\chromium\win\chromium.ico"
#endif
```

**Step 3:** Modify `chrome_exe.rc` similarly.

**Step 4:** Update BUILD.gn to define the buildflag:
```gn
# In build/config/features.gni or similar
declare_args() {
  is_blockd_branded = true
}
```

**Pros:**
- Clean separation of branding
- Preserves Chromium as fallback

**Cons:**
- Requires RC file patches
- More complex to maintain

---

### Strategy C: Post-Build Binary Patching

Use external tools to modify the built executable.

**Windows:**
```bash
# Use Resource Hacker to replace icons
ResourceHacker.exe -open chrome.exe -save chrome_patched.exe \
    -action addoverwrite -res blockd.ico -mask ICONGROUP,IDR_MAINFRAME,
```

**macOS:**
```bash
# Replace app icon
cp blockd.icns out/Release/Blockd.app/Contents/Resources/app.icns
# Update Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleName Blockd" Info.plist
```

**Pros:**
- No source code changes
- Works with any build

**Cons:**
- Fragile, may break signatures
- Must be done after each build
- May not update all branding locations

---

### Strategy D: Create Missing SVG Files

If using Strategy B, create the missing SVG files.

**Create `product_logo.svg`:**
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Copy from PNG and trace, or create new -->
  <rect width="128" height="128" rx="28" fill="#fff"/>
  <!-- B with keyhole design -->
  <path d="..." fill="#000"/>
</svg>
```

**Create `product_logo_animation.svg`:**
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <!-- Static version is acceptable -->
  <rect width="128" height="128" rx="28" fill="#fff"/>
  <path d="..." fill="#000"/>
</svg>
```

**Alternative:** Copy from Chromium and modify:
```bash
cp src/chrome/app/theme/chromium/product_logo.svg src/chrome/app/theme/blocked/
cp src/chrome/app/theme/chromium/product_logo_animation.svg src/chrome/app/theme/blocked/
# Then edit the SVGs to use Blockd logo
```

---

## Pre-Build Checklist

### Before Every Build

- [ ] Verify `src/chrome/app/theme/blocked/BRANDING` exists and has correct values
- [ ] Verify all PNG logos exist (16, 24, 32, 48, 64, 128, 256, 512, 1024)
- [ ] Verify `product_logo.svg` exists (or apply Strategy A/C)
- [ ] Verify `product_logo_animation.svg` exists (or apply Strategy A/C)
- [ ] Verify `blockd.ico` exists in `blocked/win/` or `chromium/win/`
- [ ] Verify `app.icns` exists in `blocked/mac/`
- [ ] Verify `chrome_build.gni` has correct branding path
- [ ] Verify `args.gn` has `is_official_build = false`
- [ ] Verify `args.gn` has correct URLs set
- [ ] Run `gn gen out/Release` without errors
- [ ] Check `gn args --list out/Release | grep brand` shows correct values

### File Existence Check Script

```bash
#!/bin/bash
# check_branding.sh

THEME_DIR="src/chrome/app/theme/blocked"

FILES=(
    "BRANDING"
    "product_logo_16.png"
    "product_logo_32.png"
    "product_logo_48.png"
    "product_logo_64.png"
    "product_logo_128.png"
    "product_logo_256.png"
    "product_logo.svg"
    "product_logo_animation.svg"
    "blockd.ico"
    "win/blockd.ico"
    "mac/app.icns"
    "linux/product_logo_128.png"
)

echo "Checking branding files..."
MISSING=0
for f in "${FILES[@]}"; do
    if [ ! -f "$THEME_DIR/$f" ]; then
        echo "MISSING: $THEME_DIR/$f"
        MISSING=$((MISSING+1))
    else
        echo "OK: $f"
    fi
done

if [ $MISSING -gt 0 ]; then
    echo ""
    echo "ERROR: $MISSING files missing!"
    exit 1
else
    echo ""
    echo "All branding files present."
fi
```

---

## Post-Build Verification

### Windows Verification

1. **Check executable icon:**
   ```batch
   :: Visual inspection - right-click chrome.exe, Properties, should show Blockd icon
   ```

2. **Check product name:**
   ```batch
   :: Run browser, check window title
   :: Check Task Manager process name
   :: Check Add/Remove Programs entry
   ```

3. **Check about page:**
   - Navigate to `chrome://version`
   - Should show "Blockd Interview Browser"

4. **Check default homepage:**
   - Fresh launch should go to `https://blockd.site/session`

5. **Verify Blockd features:**
   ```javascript
   // In DevTools console (if enabled)
   console.log(typeof window.BlockedAPI);  // Should be 'object'
   ```

### macOS Verification

1. **Check app icon:**
   - Visual inspection in Finder and Dock

2. **Check app name:**
   ```bash
   /usr/libexec/PlistBuddy -c "Print :CFBundleName" \
       out/Release/Blockd.app/Contents/Info.plist
   # Should output: Blockd
   ```

3. **Check bundle identifier:**
   ```bash
   /usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" \
       out/Release/Blockd.app/Contents/Info.plist
   # Should output: com.blockd.browser
   ```

4. **Check version page:**
   - Navigate to `chrome://version`
   - Verify product name and version

---

## Recommended Action Plan

### Immediate (Before Next Build)

1. **Create missing SVG files** OR apply Strategy A (replace Chromium branding)
2. **Fix args.gn:** Change `is_official_build = true` to `false`
3. **Standardize URLs:** Use `blockd.site` not `app.blockd.site`
4. **Run pre-build checklist**

### Short-term

1. Apply Strategy A or B permanently
2. Create automated pre-build verification script
3. Document build process with all fixes applied

### Long-term

1. Create CI/CD pipeline with branding verification
2. Automated post-build testing
3. Consider using patch files for all Chromium modifications

---

## Appendix: File Locations Reference

| Purpose | Path |
|---------|------|
| GN branding config | `src/build/config/chrome_build.gni` |
| BRANDING file | `src/chrome/app/theme/blocked/BRANDING` |
| PNG logos | `src/chrome/app/theme/blocked/product_logo_*.png` |
| Windows RC (DLL) | `src/chrome/app/chrome_dll.rc` |
| Windows RC (EXE) | `src/chrome/app/chrome_exe.rc` |
| GRD unscaled | `src/chrome/app/theme/chrome_unscaled_resources.grd` |
| GRD themed | `src/chrome/app/theme/theme_resources.grd` |
| Feature flags | `src/chrome/browser/blocked/blocked_features.gni` |
| args.gn | `chromium/args.gn` |

---

*Report generated by comprehensive build investigation - January 2026*
