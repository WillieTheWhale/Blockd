# Application Icons

## Required Icons

To build the Electron app for distribution, you need to create platform-specific icons:

### Windows (.ico)
- **icon.ico** - Multi-resolution icon (16x16, 32x32, 48x48, 64x64, 128x128, 256x256)

### macOS (.icns)
- **icon.icns** - Apple icon format with multiple resolutions

### Linux (PNG folder)
- **16x16.png**
- **32x32.png**
- **48x48.png**
- **64x64.png**
- **128x128.png**
- **256x256.png**
- **512x512.png**

## Generating Icons

You can use tools like:
- [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder)
- [png2icons](https://www.npmjs.com/package/png2icons)
- Online converters like [icoconvert.com](https://icoconvert.com/)

### Using electron-icon-builder

```bash
npm install -g electron-icon-builder
electron-icon-builder --input=./icon.svg --output=./
```

### Quick Generation (requires ImageMagick)

```bash
# Generate PNG from SVG
convert icon.svg -resize 512x512 icon-512.png

# Generate ICO (Windows)
convert icon-512.png -define icon:auto-resize="256,128,64,48,32,16" icon.ico

# Generate ICNS (macOS) - requires iconutil on macOS
mkdir icon.iconset
for size in 16 32 64 128 256 512; do
  convert icon-512.png -resize ${size}x${size} icon.iconset/icon_${size}x${size}.png
done
iconutil -c icns icon.iconset
```

## Source Icon

The source SVG icon is provided in `icon.svg`. Use this as the base for generating all required formats.
