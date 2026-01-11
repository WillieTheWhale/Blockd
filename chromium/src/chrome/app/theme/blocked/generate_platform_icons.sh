#!/bin/bash
# Generate platform-specific icon files for Blockd Browser
#
# This script creates:
# - Windows: app_icon.ico (multi-resolution ICO file)
# - macOS: app.icns (Apple icon container)
# - Linux: Icons are already in PNG format
#
# Requirements:
# - macOS: iconutil (pre-installed)
# - Optional: ImageMagick (brew install imagemagick) for .ico generation

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WINDOWS_RESOURCES="${SCRIPT_DIR}/../../../../../installer/windows/resources"
MAC_RESOURCES="${SCRIPT_DIR}/../../../../../installer/mac/resources"

echo "=== Blockd Browser Icon Generation ==="
echo ""

# Ensure resource directories exist
mkdir -p "$WINDOWS_RESOURCES"
mkdir -p "$MAC_RESOURCES"

# === macOS .icns generation ===
echo "Generating macOS .icns file..."

# Create iconset directory
ICONSET_DIR="${SCRIPT_DIR}/blockd.iconset"
mkdir -p "$ICONSET_DIR"

# Copy PNGs to iconset with correct naming
cp "${SCRIPT_DIR}/product_logo_16.png" "${ICONSET_DIR}/icon_16x16.png"
cp "${SCRIPT_DIR}/product_logo_32.png" "${ICONSET_DIR}/icon_16x16@2x.png"
cp "${SCRIPT_DIR}/product_logo_32.png" "${ICONSET_DIR}/icon_32x32.png"
cp "${SCRIPT_DIR}/product_logo_64.png" "${ICONSET_DIR}/icon_32x32@2x.png"
cp "${SCRIPT_DIR}/product_logo_128.png" "${ICONSET_DIR}/icon_128x128.png"
cp "${SCRIPT_DIR}/product_logo_256.png" "${ICONSET_DIR}/icon_128x128@2x.png"
cp "${SCRIPT_DIR}/product_logo_256.png" "${ICONSET_DIR}/icon_256x256.png"
cp "${SCRIPT_DIR}/product_logo_512.png" "${ICONSET_DIR}/icon_256x256@2x.png"
cp "${SCRIPT_DIR}/product_logo_512.png" "${ICONSET_DIR}/icon_512x512.png"
cp "${SCRIPT_DIR}/product_logo_1024.png" "${ICONSET_DIR}/icon_512x512@2x.png"

# Generate .icns file
iconutil -c icns "$ICONSET_DIR" -o "${MAC_RESOURCES}/app.icns"
echo "  Created: ${MAC_RESOURCES}/app.icns"

# Cleanup iconset
rm -rf "$ICONSET_DIR"

# === Windows .ico generation ===
echo ""
echo "Generating Windows .ico file..."

if command -v magick &> /dev/null; then
    # Using ImageMagick 7
    magick \
        "${SCRIPT_DIR}/product_logo_16.png" \
        "${SCRIPT_DIR}/product_logo_32.png" \
        "${SCRIPT_DIR}/product_logo_48.png" \
        "${SCRIPT_DIR}/product_logo_256.png" \
        "${WINDOWS_RESOURCES}/app_icon.ico"
    echo "  Created: ${WINDOWS_RESOURCES}/app_icon.ico"
elif command -v convert &> /dev/null; then
    # Using ImageMagick 6
    convert \
        "${SCRIPT_DIR}/product_logo_16.png" \
        "${SCRIPT_DIR}/product_logo_32.png" \
        "${SCRIPT_DIR}/product_logo_48.png" \
        "${SCRIPT_DIR}/product_logo_256.png" \
        "${WINDOWS_RESOURCES}/app_icon.ico"
    echo "  Created: ${WINDOWS_RESOURCES}/app_icon.ico"
else
    echo "  Warning: ImageMagick not found. Cannot generate .ico file."
    echo "  Install with: brew install imagemagick"
    echo "  Or use an online ICO converter with these files:"
    echo "    - product_logo_16.png"
    echo "    - product_logo_32.png"
    echo "    - product_logo_48.png"
    echo "    - product_logo_256.png"
fi

# === Linux icons ===
echo ""
echo "Linux icons:"
echo "  PNG icons are already generated and can be installed to /usr/share/icons/"
echo "  during package installation (see installer/linux/)"

echo ""
echo "=== Icon generation complete ==="
