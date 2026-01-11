# Blocked Browser Branding

This directory contains branding resources for the Blocked Interview Browser.

## Files

### Source Files
- `logo_source.png` - Original logo source (1024x1024)
- `generate_icons.py` - Python script to generate PNG icons from source
- `generate_platform_icons.sh` - Shell script to create platform-specific icons

### Generated Icons
- `product_logo_16.png` - 16x16 icon
- `product_logo_32.png` - 32x32 icon
- `product_logo_48.png` - 48x48 icon
- `product_logo_64.png` - 64x64 icon
- `product_logo_128.png` - 128x128 icon
- `product_logo_256.png` - 256x256 icon
- `product_logo_512.png` - 512x512 icon
- `product_logo_1024.png` - 1024x1024 icon

### Platform Icons (generated to installer directories)
- `installer/mac/resources/app.icns` - macOS application icon
- `installer/windows/resources/app_icon.ico` - Windows application icon (requires ImageMagick)

## Icon Requirements

### Windows
- 16x16, 32x32, 48x48, 256x256 PNG icons
- Combined into .ico file by `generate_platform_icons.sh`

### macOS
- 16x16, 32x32, 128x128, 256x256, 512x512, 1024x1024 PNG icons
- Combined into .icns file by `generate_platform_icons.sh`

### Linux
- 16x16, 32x32, 48x48, 64x64, 128x128, 256x256 PNG icons
- Installed to /usr/share/icons/ during package installation

## Logo Design

The Blockd logo features a stylized "B" with a keyhole in the center, representing:
- **B** - Blockd brand identity
- **Keyhole** - Security and access control, core to the interview security platform

### Color Scheme
- Primary Logo Color: #4A4A4A (Dark Gray)
- Background variations: White or transparent

### Brand Colors (for UI)
- Primary Brand Color: #1E40AF (Blue)
- Secondary Color: #DC2626 (Red - for security alerts)
- Background: #F9FAFB (Light gray)
- Text: #111827 (Dark gray)

## Regenerating Icons

1. Replace `logo_source.png` with updated artwork (must be 1024x1024)
2. Run: `python3 generate_icons.py`
3. Run: `./generate_platform_icons.sh`

Note: The Windows .ico generation requires ImageMagick:
```bash
brew install imagemagick
```
