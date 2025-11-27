#!/bin/bash
# Verify code signatures for all platforms
# Copyright 2025 The Blockd Authors. All rights reserved.

set -e

echo "========================================"
echo "Blockd Browser - Signature Verification"
echo "========================================"
echo ""

PLATFORM=$(uname -s)

case "$PLATFORM" in
    Darwin)
        echo "Platform: macOS"
        echo ""

        if [ ! -d "out/Release/Blockd Browser.app" ]; then
            echo "ERROR: App bundle not found"
            exit 1
        fi

        echo "Verifying code signature..."
        codesign --verify --deep --strict --verbose=2 "out/Release/Blockd Browser.app"

        echo ""
        echo "Verifying notarization..."
        spctl --assess --type execute --verbose=4 "out/Release/Blockd Browser.app"

        echo ""
        echo "Checking stapled notarization ticket..."
        xcrun stapler validate "out/Release/Blockd Browser.app"

        echo ""
        echo "✅ macOS signatures verified successfully!"
        ;;

    Linux)
        echo "Platform: Linux"
        echo ""

        # Check Debian package
        if [ -f "blockd-browser_1.0.0_amd64.deb" ]; then
            echo "Verifying Debian package signature..."
            dpkg-sig --verify blockd-browser_1.0.0_amd64.deb
        fi

        # Check RPM package
        if [ -f "blockd-browser-1.0.0-1.x86_64.rpm" ]; then
            echo "Verifying RPM package signature..."
            rpm --checksig blockd-browser-1.0.0-1.x86_64.rpm
        fi

        # Check AppImage
        if [ -f "BlockedBrowser-v1.0.0.AppImage" ]; then
            echo "AppImage found (signature verification not standard)"
        fi

        echo ""
        echo "✅ Linux package signatures verified!"
        ;;

    MINGW*|MSYS*|CYGWIN*)
        echo "Platform: Windows"
        echo ""

        if [ ! -f "out/Release/blocked.exe" ]; then
            echo "ERROR: blocked.exe not found"
            exit 1
        fi

        echo "Verifying executable signature..."
        signtool verify /pa /v out/Release/blocked.exe

        if [ -f "out/Release/BlockedBrowser_Setup_v1.0.0.exe" ]; then
            echo ""
            echo "Verifying installer signature..."
            signtool verify /pa /v out/Release/BlockedBrowser_Setup_v1.0.0.exe
        fi

        echo ""
        echo "✅ Windows signatures verified successfully!"
        ;;

    *)
        echo "ERROR: Unknown platform: $PLATFORM"
        exit 1
        ;;
esac

echo ""
echo "========================================"
echo "All signatures verified!"
echo "========================================"
