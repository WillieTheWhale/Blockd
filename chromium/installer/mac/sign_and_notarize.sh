#!/bin/bash
# Code signing and notarization script for macOS
# Copyright 2025 The Blockd Authors. All rights reserved.

set -e

echo "========================================"
echo "Blockd Browser - macOS Code Signing"
echo "========================================"
echo ""

# Configuration
APP_PATH="out/Release/Blockd Browser.app"
DEVELOPER_ID="Developer ID Application: Blockd Inc. (TEAM_ID_HERE)"
INSTALLER_CERT="Developer ID Installer: Blockd Inc. (TEAM_ID_HERE)"
DMG_PATH="out/Release/BlockedBrowser-v1.0.0.dmg"
ZIP_PATH="out/Release/BlockedBrowser-v1.0.0.zip"
ENTITLEMENTS="installer/mac/entitlements.plist"
BUNDLE_ID="com.blockd.browser"

# Apple credentials for notarization
APPLE_ID="${BLOCKD_APPLE_ID}"
TEAM_ID="${BLOCKD_TEAM_ID}"
APP_PASSWORD="${BLOCKD_APP_PASSWORD}"

# Check if app bundle exists
if [ ! -d "$APP_PATH" ]; then
    echo "ERROR: App bundle not found at $APP_PATH"
    exit 1
fi

echo "Step 1: Signing all binaries and frameworks..."

# Sign all dylibs and frameworks first
find "$APP_PATH" -type f -name "*.dylib" -exec codesign --force --sign "$DEVELOPER_ID" --timestamp --options runtime {} \;
find "$APP_PATH" -type d -name "*.framework" -exec codesign --force --sign "$DEVELOPER_ID" --timestamp --options runtime {} \;

# Sign helper executables
find "$APP_PATH/Contents/Helpers" -type f -perm +111 -exec codesign --force --sign "$DEVELOPER_ID" --timestamp --options runtime {} \;

# Sign the main app bundle
echo "Step 2: Signing main application bundle..."
codesign --force --sign "$DEVELOPER_ID" \
    --entitlements "$ENTITLEMENTS" \
    --timestamp \
    --options runtime \
    --deep \
    "$APP_PATH"

echo "Step 3: Verifying signature..."
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"

echo "Step 4: Creating distribution archive..."
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

echo "Step 5: Submitting for notarization..."
xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$TEAM_ID" \
    --password "$APP_PASSWORD" \
    --wait

echo "Step 6: Stapling notarization ticket..."
xcrun stapler staple "$APP_PATH"

echo "Step 7: Verifying notarization..."
xcrun stapler validate "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"

echo ""
echo "========================================"
echo "Code signing and notarization complete!"
echo "========================================"
echo ""
echo "App bundle: $APP_PATH"
echo "Distribution archive: $ZIP_PATH"
echo ""
echo "Next steps:"
echo "1. Run create_dmg.sh to create installer DMG"
echo "2. Test on a clean macOS system"
echo "3. Upload to distribution server"
echo ""
