# Icon Resources

This directory contains the application icons for the Blockd Interviewee app.

## Required Files

After running the icon generation script, you should have:

- `icon.png` - 1024x1024 PNG (source icon, also used for Linux)
- `icon.ico` - Windows icon (multiple sizes embedded)
- `icon.icns` - macOS icon (Apple Icon Image format)

## Generating Icons

1. Place your source PNG file (at least 1024x1024 pixels, square aspect ratio) named `Electron_Logo.png` in this directory

2. Run the icon generation script:
   ```bash
   npm run generate-icons
   ```

3. The script will create all required icon formats automatically.

## Manual Generation (Alternative)

If you prefer to generate icons manually:

### For Windows (.ico)
Use an online converter or tool like ImageMagick:
```bash
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### For macOS (.icns)
On macOS, you can use `iconutil`:
```bash
mkdir icon.iconset
sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -rf icon.iconset
```

## Icon Requirements

- **Minimum size**: 512x512 pixels (1024x1024 recommended)
- **Aspect ratio**: 1:1 (square)
- **Format**: PNG with transparency support
- **Background**: Transparent or solid color as desired
