# Blockd Browser Branding

This directory contains branding resources for the Blockd Interview Browser.

## Overview

The Blockd logo features a stylized "B" with a keyhole design, representing security and privacy. All icons feature:
- **Modern rounded corners** (22% corner radius, iOS/macOS style)
- **Clean, centered B icon** without wordmark
- **Transparent corners** for proper display on any background

## Files

### Core Assets
| File | Purpose | Dimensions |
|------|---------|------------|
| `BRANDING` | Product and company name definitions | N/A |
| `product_logo_16.png` | Small icon (taskbar, favicon) | 16x16 |
| `product_logo_22_mono.png` | macOS menu bar (monochrome) | 22x22 |
| `product_logo_24.png` | Medium icon | 24x24 |
| `product_logo_32.png` | Standard icon | 32x32 |
| `product_logo_48.png` | Medium-large icon | 48x48 |
| `product_logo_64.png` | Large icon | 64x64 |
| `product_logo_128.png` | App icon | 128x128 |
| `product_logo_256.png` | High-res icon | 256x256 |
| `product_logo_512.png` | Extra high-res | 512x512 |
| `product_logo_1024.png` | Maximum resolution | 1024x1024 |
| `blockd.ico` | Windows multi-resolution icon | Multi |
| `installer_logo.bmp` | Windows installer logo | 150x57 |

### Platform Directories
- `linux/` - Linux desktop icons (16-256px)
- `mac/` - macOS app.icns and Assets.xcassets
- `win/` - Windows ICO files and tiles

## Icon Design Specifications

### Corner Radius
All icons use a **22% corner radius** (relative to icon size), matching modern app icon standards:
- iOS App Store icons
- macOS Big Sur+ app icons
- Google Play Store icons

### Transparency
- Areas outside the rounded corners are **transparent**
- Icons display properly on any background color
- White background inside the rounded rectangle

### Centering
- The "B" icon is **vertically and horizontally centered**
- Fills approximately 96% of the canvas width
- Consistent positioning across all sizes

## Generating Icons

### Prerequisites
```bash
pip install Pillow
```

### Quick Generation
```bash
# From this directory
python fix_logos.py
```

The script:
1. Loads the source logo from `Blockd_Landing/New_Logos_Colors/BLOCKD_Primary_logo.png`
2. Crops to just the B icon (removes wordmark)
3. Centers the icon in a square canvas
4. Applies 22% rounded corners
5. Generates all required sizes (16-1024px)
6. Creates Windows ICO file
7. Copies to linux/, default_100_percent/, default_200_percent/ directories

### Manual Generation (Alternative)
```bash
python generate_icons.py
```

## Source Logo

The source logo is located at:
- `Blockd_Landing/New_Logos_Colors/BLOCKD_Primary_logo.png` (primary)
- `Blockd_Landing/public/logo.png` (alternate)

The source contains the B icon with "BLOCKD" wordmark below. The icon generation script automatically crops to just the B icon.

## Color Scheme

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | `#000000` | Main logo (black B) |
| Accent | `#0D9488` | Teal highlights |
| Alert | `#DC2626` | Security alerts (red) |
| Background | `#F9FAFB` | Light gray |
| Text | `#111827` | Dark gray |

## BRANDING File Format

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

## Verification Checklist

After generating icons:
- [ ] All sizes generated (16, 24, 32, 48, 64, 128, 256, 512, 1024)
- [ ] Rounded corners visible on all icons
- [ ] B icon centered (not cropped at edges)
- [ ] No wordmark visible
- [ ] linux/ directory populated
- [ ] blockd.ico created
- [ ] Icons look correct in logo_preview.html

## Testing Icons

Open the preview page to visually verify all icons:
```
logo_preview.html
```

This displays all icon sizes on both light and dark backgrounds.

## Notes

- Always use "Blockd" (not "Blocked") in user-facing text
- The B icon includes a keyhole design symbolizing security
- Icons should work on any background due to transparent corners
- Run `fix_logos.py` after any changes to the source logo
