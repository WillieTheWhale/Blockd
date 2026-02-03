# Chromium Browser Branding Customization Guide

> **Last Updated:** January 2026
> **Chromium Version:** 142.0.7444.175

This document provides comprehensive guidance for customizing Chromium branding for the Blockd Interview Browser.

## Table of Contents

1. [Overview](#overview)
2. [Directory Structure](#directory-structure)
3. [BRANDING File Format](#branding-file-format)
4. [GN Build Arguments](#gn-build-arguments)
5. [Resource Files](#resource-files)
6. [Platform-Specific Assets](#platform-specific-assets)
7. [Build System Integration](#build-system-integration)
8. [Common Issues and Solutions](#common-issues-and-solutions)

---

## Overview

Chromium's branding system is designed to support multiple branded builds (Chromium, Google Chrome, Chrome for Testing) from the same codebase. For custom forks like Blockd, you must:

1. Create a custom branding directory with all required assets
2. Update GN build arguments to point to your branding
3. Modify GRD resource files that hardcode "chromium" paths
4. Ensure all platform-specific assets exist

### Key Branding Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `is_chrome_branded` | Use Google Chrome branding | `false` |
| `branding_path_component` | Subdirectory name in chrome/app/theme | `"chromium"` |
| `branding_path_product` | Product directory name | `"chromium"` |
| `branding_file_path` | Path to BRANDING file | `"//chrome/app/theme/$branding_path_component/BRANDING"` |

---

## Directory Structure

### Required Branding Directory Structure

```
chrome/app/theme/blocked/
├── BRANDING                     # Product name definitions
├── product_logo.svg             # Vector logo (required for non-Google builds)
├── product_logo_animation.svg   # Animated logo
├── product_logo_16.png          # 16x16 icon
├── product_logo_22_mono.png     # 22x22 monochrome (macOS status bar)
├── product_logo_24.png          # 24x24 icon
├── product_logo_32.png          # 32x32 icon
├── product_logo_48.png          # 48x48 icon
├── product_logo_64.png          # 64x64 icon
├── product_logo_128.png         # 128x128 icon
├── product_logo_256.png         # 256x256 icon
├── product_logo_512.png         # 512x512 icon
├── product_logo_1024.png        # 1024x1024 icon
├── linux/
│   ├── product_logo_24.png
│   ├── product_logo_32.xpm      # XPM format for legacy Linux
│   ├── product_logo_48.png
│   ├── product_logo_64.png
│   ├── product_logo_128.png
│   └── product_logo_256.png
├── mac/
│   ├── app.icns                 # macOS application icon
│   ├── Assets.car               # Compiled asset catalog
│   └── Assets.xcassets/
│       ├── Contents.json
│       └── AppIcon.appiconset/
│           ├── Contents.json
│           └── appicon_*.png    # All sizes: 16, 32, 64, 128, 256, 512, 1024
└── win/
    ├── blockd.ico               # Windows main icon (multi-resolution)
    ├── blockd_doc.ico           # Document icon
    ├── blockd_pdf.ico           # PDF document icon
    ├── incognito.ico            # Incognito mode icon
    ├── app_list.ico             # App list icon
    └── tiles/
        ├── Logo.png             # Windows Start menu tile
        └── SmallLogo.png        # Small Start menu tile
```

### Required default_100_percent Directory

```
chrome/app/theme/default_100_percent/blocked/
├── favicon_password_manager.png
├── product_logo_16.png
├── product_logo_32.png
├── product_logo_name_22.png       # Logo with product name
├── product_logo_name_22_white.png # White version
├── webstore_icon.png
├── webstore_icon_16.png
├── webstore_icon_24.png
├── webstore_icon_32.png
└── linux/
    ├── product_logo_16.png
    └── product_logo_32.png
```

### Required default_200_percent Directory

```
chrome/app/theme/default_200_percent/blocked/
├── favicon_password_manager.png
├── product_logo_32.png
├── product_logo_64.png
├── product_logo_name_44.png
├── product_logo_name_44_white.png
└── linux/
    ├── product_logo_32.png
    └── product_logo_64.png
```

---

## BRANDING File Format

The BRANDING file contains key-value pairs that define product naming:

```ini
COMPANY_FULLNAME=Blockd Inc.
COMPANY_SHORTNAME=Blockd
PRODUCT_FULLNAME=Blockd
PRODUCT_SHORTNAME=Blockd
PRODUCT_INSTALLER_FULLNAME=Blockd Installer
PRODUCT_INSTALLER_SHORTNAME=Blockd Installer
COPYRIGHT=Copyright 2024 Blockd Inc. All rights reserved.
MAC_BUNDLE_ID=com.blockd.browser
MAC_CREATOR_CODE=Blkd
MAC_TEAM_ID=XXXXXXXXXX
```

### Field Descriptions

| Field | Description | Example |
|-------|-------------|---------|
| `COMPANY_FULLNAME` | Legal company name | `Blockd Inc.` |
| `COMPANY_SHORTNAME` | Short company name | `Blockd` |
| `PRODUCT_FULLNAME` | Full product name | `Blockd` |
| `PRODUCT_SHORTNAME` | Short product name (UI) | `Blockd` |
| `PRODUCT_INSTALLER_FULLNAME` | Installer display name | `Blockd Installer` |
| `PRODUCT_INSTALLER_SHORTNAME` | Short installer name | `Blockd Installer` |
| `COPYRIGHT` | Copyright notice | `Copyright 2024 Blockd Inc.` |
| `MAC_BUNDLE_ID` | macOS bundle identifier | `com.blockd.browser` |
| `MAC_CREATOR_CODE` | 4-character legacy code | `Blkd` |
| `MAC_TEAM_ID` | Apple Developer Team ID | `XXXXXXXXXX` |

---

## GN Build Arguments

### Required args.gn Settings

```gn
# Disable Google Chrome branding
is_chrome_branded = false

# Set custom branding path
branding_path_component = "blocked"
branding_path_product = "blocked"
branding_file_path = "//chrome/app/theme/blocked/BRANDING"

# Override product names (backup if BRANDING parsing fails)
chrome_product_short_name = "Blockd"
chrome_product_full_name = "Blockd"
```

### Important Notes

1. **`branding_path_component`** is declared in `build/config/chrome_build.gni` with conditional logic
2. Setting it in `args.gn` will override the default only if it's within a `declare_args()` block
3. For guaranteed override, you may need to modify `chrome_build.gni` directly

---

## Resource Files

### chrome_unscaled_resources.grd

This file at `chrome/app/theme/chrome_unscaled_resources.grd` references branding assets using `${branding_path_component}`:

```xml
<include name="IDR_PRODUCT_LOGO_64" file="${branding_path_component}/product_logo_64.png" type="BINDATA" />
```

**Critical Issue:** Some resources hardcode "chromium/":
```xml
<include name="IDR_PRODUCT_LOGO_16_SHORTCUTS" file="chromium/product_logo_16.png" type="BINDATA" />
```

**Solution:** Either:
1. Modify the GRD file to use `${branding_path_component}`
2. Create a symbolic link from `chromium/` to `blocked/`
3. Copy your assets to both directories

### theme_resources.grd

Located at `chrome/app/theme/theme_resources.grd`, this file also uses `${branding_path_component}`.

---

## Platform-Specific Assets

### Windows

| File | Purpose | Location |
|------|---------|----------|
| `blockd.ico` | Main application icon | `win/blockd.ico` |
| `Logo.png` | Start menu tile (150x150) | `win/tiles/Logo.png` |
| `SmallLogo.png` | Small tile (70x70) | `win/tiles/SmallLogo.png` |

**Windows ICO Format Requirements:**
- Must contain multiple resolutions: 16, 24, 32, 48, 64, 128, 256
- Use 32-bit color depth with alpha channel

### macOS

| File | Purpose | Location |
|------|---------|----------|
| `app.icns` | Application icon | `mac/app.icns` |
| `Assets.car` | Compiled asset catalog | `mac/Assets.car` |

**Creating app.icns:**
```bash
# From a 1024x1024 PNG source
iconutil -c icns AppIcon.iconset
```

### Linux

| File | Purpose | Location |
|------|---------|----------|
| `product_logo_*.png` | Desktop icons | `linux/product_logo_*.png` |
| `product_logo_32.xpm` | Legacy X11 icon | `linux/product_logo_32.xpm` |

---

## Build System Integration

### Modifying chrome_build.gni

For complete control, modify `build/config/chrome_build.gni`:

```gn
declare_args() {
  if (is_chrome_branded) {
    branding_path_component = "google_chrome"
    branding_path_product = "google_chrome"
  } else {
    # Custom: Use Blockd branding instead of Chromium
    branding_path_component = "blocked"
    branding_path_product = "blocked"
  }
}
```

### Modifying chrome_unscaled_resources.grd

Replace hardcoded "chromium" paths:

```xml
<!-- Before -->
<include name="IDR_PRODUCT_LOGO_16_SHORTCUTS" file="chromium/product_logo_16.png" type="BINDATA" />

<!-- After -->
<include name="IDR_PRODUCT_LOGO_16_SHORTCUTS" file="${branding_path_component}/product_logo_16.png" type="BINDATA" />
```

---

## Common Issues and Solutions

### Issue: Browser shows "Chromium" name despite BRANDING changes

**Cause:** The `branding_file_path` variable is being overridden or the BRANDING file isn't being parsed.

**Solution:**
1. Verify `branding_file_path` points to correct location
2. Check that BRANDING file has no syntax errors (no trailing spaces, proper line endings)
3. Run `gn gen --check out/Blockd` to verify GN configuration

### Issue: Blue Chromium logo appears instead of custom logo

**Cause:** Resource files (GRD) are hardcoding chromium paths.

**Solution:**
1. Search all `.grd` files for hardcoded "chromium/" paths
2. Replace with `${branding_path_component}/`
3. Ensure all required logo files exist in blocked/ directory

### Issue: DMG installer shows Chromium branding

**Cause:** macOS installer uses separate branding assets.

**Solution:**
1. Create complete `mac/Assets.xcassets/` structure
2. Generate proper `Assets.car` file
3. Ensure `mac/app.icns` is properly formatted

### Issue: Windows Task Manager shows "Chromium"

**Cause:** The PE file description comes from `chrome_version.rc.version`.

**Solution:**
1. Verify BRANDING file has correct `PRODUCT_FULLNAME`
2. Ensure the version file is regenerated during build
3. Check that `branding_file_path` is correct

---

## Verification Checklist

Before building, verify:

- [ ] BRANDING file exists at `chrome/app/theme/blocked/BRANDING`
- [ ] All logo sizes exist (16, 32, 48, 64, 128, 256, 512, 1024)
- [ ] Linux-specific logos exist in `blocked/linux/`
- [ ] macOS assets exist in `blocked/mac/`
- [ ] Windows ICO file exists at `blocked/win/blockd.ico`
- [ ] `default_100_percent/blocked/` directory exists with assets
- [ ] GN args properly set `branding_path_component = "blocked"`
- [ ] No hardcoded "chromium/" paths in GRD files (or assets copied)

After building, verify:

- [ ] `chrome --version` shows "Blockd"
- [ ] About page shows correct logo
- [ ] Windows Task Manager shows "Blockd"
- [ ] macOS Finder shows correct icon
- [ ] Linux desktop file shows correct name

---

## References

- [Chromium Branded Builds Documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/google_chrome_branded_builds.md)
- [GN Build Configuration](https://www.chromium.org/developers/gn-build-configuration/)
- [Chromium Theme Directory](https://chromium.googlesource.com/chromium/src.git/+/HEAD/chrome/app/theme/)
- [BRANDING File Example](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/app/theme/chromium/BRANDING)

---

*Document maintained by Blockd Engineering Team*
