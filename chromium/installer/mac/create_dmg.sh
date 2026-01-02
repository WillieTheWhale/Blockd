#!/bin/bash
# Create DMG installer for macOS
# Copyright 2025 The Blockd Authors. All rights reserved.

set -e

echo "========================================"
echo "Blockd Browser - DMG Creation"
echo "========================================"
echo ""

# Configuration
APP_PATH="out/Release/Blockd Browser.app"
DMG_PATH="out/Release/BlockedBrowser-v1.0.0.dmg"
VOLUME_NAME="Blockd Browser"
DMG_SIZE="200m"
BACKGROUND_IMAGE="installer/mac/dmg_background.png"

# Check if app bundle exists
if [ ! -d "$APP_PATH" ]; then
    echo "ERROR: App bundle not found at $APP_PATH"
    echo "Please run sign_and_notarize.sh first"
    exit 1
fi

# Check if app is signed
if ! codesign --verify --deep "$APP_PATH" 2>/dev/null; then
    echo "ERROR: App bundle is not properly signed"
    echo "Please run sign_and_notarize.sh first"
    exit 1
fi

echo "Step 1: Creating temporary DMG..."
temp_dmg="temp.dmg"
hdiutil create -size "$DMG_SIZE" -fs HFS+ -volname "$VOLUME_NAME" "$temp_dmg"

echo "Step 2: Mounting temporary DMG..."
mount_point=$(hdiutil attach "$temp_dmg" | grep "/Volumes/" | awk '{print $3}')

echo "Step 3: Copying app bundle to DMG..."
cp -R "$APP_PATH" "$mount_point/"

echo "Step 4: Creating Applications symlink..."
ln -s /Applications "$mount_point/Applications"

# Set custom background and icon positions (if create-dmg tool is available)
if command -v create-dmg &> /dev/null; then
    echo "Step 5: Setting up DMG appearance..."
    # Position icons
    osascript <<EOF
    tell application "Finder"
        tell disk "$VOLUME_NAME"
            open
            set current view of container window to icon view
            set toolbar visible of container window to false
            set statusbar visible of container window to false
            set bounds of container window to {100, 100, 600, 450}
            set viewOptions to the icon view options of container window
            set arrangement of viewOptions to not arranged
            set icon size of viewOptions to 128
            set position of item "Blockd Browser.app" of container window to {150, 200}
            set position of item "Applications" of container window to {350, 200}
            update without registering applications
            delay 2
        end tell
    end tell
EOF
else
    echo "Step 5: Skipping DMG appearance setup (create-dmg not installed)"
fi

echo "Step 6: Ejecting temporary DMG..."
hdiutil detach "$mount_point"

echo "Step 7: Converting to compressed read-only DMG..."
rm -f "$DMG_PATH"
hdiutil convert "$temp_dmg" -format UDZO -o "$DMG_PATH"
rm "$temp_dmg"

echo "Step 8: Verifying DMG..."
hdiutil verify "$DMG_PATH"

echo ""
echo "========================================"
echo "DMG created successfully!"
echo "========================================"
echo ""
echo "Output: $DMG_PATH"
echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
echo ""
echo "Next steps:"
echo "1. Test DMG on a clean macOS system"
echo "2. Upload to distribution server"
echo "3. Update Sparkle appcast.xml"
echo ""
