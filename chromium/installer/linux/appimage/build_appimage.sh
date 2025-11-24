#!/bin/bash
# Build AppImage for Blockd Browser
# Copyright 2025 The Blockd Authors. All rights reserved.

set -e

echo "========================================"
echo "Blockd Browser - AppImage Build"
echo "========================================"
echo ""

# Configuration
VERSION="1.0.0"
APPDIR="BlockedBrowser.AppDir"
OUTPUT="BlockedBrowser-v${VERSION}.AppImage"

# Check if appimagetool is installed
if ! command -v appimagetool &> /dev/null; then
    echo "ERROR: appimagetool not found"
    echo "Download from: https://github.com/AppImage/AppImageKit/releases"
    exit 1
fi

# Check if build exists
if [ ! -d "out/Release" ]; then
    echo "ERROR: Build directory not found"
    exit 1
fi

echo "Step 1: Creating AppDir structure..."
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin"
mkdir -p "$APPDIR/usr/lib"
mkdir -p "$APPDIR/usr/share/applications"
mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"

echo "Step 2: Copying browser files..."
cp -r out/Release/* "$APPDIR/usr/lib/"

echo "Step 3: Creating wrapper script..."
cat > "$APPDIR/usr/bin/blockd-browser" <<'EOF'
#!/bin/bash
APPDIR="$(dirname "$(readlink -f "${0}")")/.."
export LD_LIBRARY_PATH="${APPDIR}/usr/lib:${LD_LIBRARY_PATH}"
exec "${APPDIR}/usr/lib/blocked" "$@"
EOF
chmod +x "$APPDIR/usr/bin/blockd-browser"

echo "Step 4: Installing desktop file..."
cp installer/linux/blocked.desktop "$APPDIR/usr/share/applications/"
cp installer/linux/blocked.desktop "$APPDIR/"

echo "Step 5: Installing icon..."
cp resources/app_icon_256.png "$APPDIR/usr/share/icons/hicolor/256x256/apps/blockd-browser.png"
cp resources/app_icon_256.png "$APPDIR/blockd-browser.png"

echo "Step 6: Creating AppRun..."
cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/bash
APPDIR="$(dirname "$(readlink -f "${0}")")"
export LD_LIBRARY_PATH="${APPDIR}/usr/lib:${LD_LIBRARY_PATH}"
export PATH="${APPDIR}/usr/bin:${PATH}"
export XDG_DATA_DIRS="${APPDIR}/usr/share:${XDG_DATA_DIRS}"

# Chrome sandbox needs SUID, but AppImage can't preserve it
# Set alternative sandbox mode
export CHROME_DEVEL_SANDBOX="${APPDIR}/usr/lib/chrome-sandbox"

exec "${APPDIR}/usr/lib/blocked" "$@"
EOF
chmod +x "$APPDIR/AppRun"

echo "Step 7: Building AppImage..."
ARCH=x86_64 appimagetool "$APPDIR" "$OUTPUT"

echo "Step 8: Making AppImage executable..."
chmod +x "$OUTPUT"

echo "Step 9: Verifying AppImage..."
./"$OUTPUT" --version || true

echo ""
echo "========================================"
echo "AppImage created successfully!"
echo "========================================"
echo ""
echo "Output: $OUTPUT"
echo "Size: $(du -h "$OUTPUT" | cut -f1)"
echo ""
echo "Test with: ./$OUTPUT"
echo ""
echo "Next steps:"
echo "1. Test AppImage on clean Linux system"
echo "2. Sign AppImage (optional)"
echo "3. Upload to distribution server"
echo ""
