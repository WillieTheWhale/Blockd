#!/bin/bash
# Blockd Browser - Master Installer Build Script
# Copyright 2025 The Blockd Authors. All rights reserved.
#
# This script builds installers for all platforms:
# - macOS: DMG (requires: macOS with iconutil)
# - Windows: NSIS installer (requires: NSIS + ImageMagick)
# - Linux: DEB, RPM, AppImage (requires: respective tools)
#
# Usage:
#   ./build_installers.sh [options]
#
# Options:
#   --platform <all|macos|windows|linux>  Target platform(s) (default: all)
#   --skip-build                          Skip Chromium build, use existing out/Release
#   --release                             Build release version (default)
#   --debug                               Build debug version
#   --version <x.y.z>                     Override version number
#   --output-dir <path>                   Output directory for installers
#   --help                                Show this help message

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Default configuration
PLATFORM="all"
SKIP_BUILD=false
BUILD_TYPE="Release"
VERSION="1.0.0"
OUTPUT_DIR="${SCRIPT_DIR}/dist"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --release)
            BUILD_TYPE="Release"
            shift
            ;;
        --debug)
            BUILD_TYPE="Debug"
            shift
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --help)
            head -30 "$0" | tail -22
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Banner
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}         ${GREEN}Blockd Browser - Installer Build Script${NC}          ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Platform:    ${YELLOW}${PLATFORM}${NC}"
echo -e "Build Type:  ${YELLOW}${BUILD_TYPE}${NC}"
echo -e "Version:     ${YELLOW}${VERSION}${NC}"
echo -e "Output:      ${YELLOW}${OUTPUT_DIR}${NC}"
echo -e "Skip Build:  ${YELLOW}${SKIP_BUILD}${NC}"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Detect current platform
detect_platform() {
    case "$(uname -s)" in
        Darwin*)    echo "macos" ;;
        Linux*)     echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*)  echo "windows" ;;
        *)          echo "unknown" ;;
    esac
}

CURRENT_PLATFORM=$(detect_platform)
echo -e "Current OS:  ${YELLOW}${CURRENT_PLATFORM}${NC}"
echo ""

# Check prerequisites
check_prerequisites() {
    local platform=$1
    local missing=()

    case $platform in
        macos)
            command -v iconutil &>/dev/null || missing+=("iconutil (macOS built-in)")
            command -v hdiutil &>/dev/null || missing+=("hdiutil (macOS built-in)")
            ;;
        windows)
            command -v makensis &>/dev/null || missing+=("NSIS (brew install nsis or choco install nsis)")
            command -v magick &>/dev/null || missing+=("ImageMagick (brew install imagemagick)")
            ;;
        linux)
            if [[ "$PLATFORM" == "all" ]] || [[ "$PLATFORM" == "linux" ]]; then
                command -v dpkg-deb &>/dev/null || missing+=("dpkg-deb (for DEB packages)")
                command -v rpmbuild &>/dev/null || missing+=("rpmbuild (for RPM packages)")
                command -v appimagetool &>/dev/null || missing+=("appimagetool (for AppImage)")
            fi
            ;;
    esac

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${YELLOW}Warning: Missing tools for $platform:${NC}"
        for tool in "${missing[@]}"; do
            echo "  - $tool"
        done
        return 1
    fi
    return 0
}

# Build Chromium if needed
build_chromium() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        echo -e "${YELLOW}Skipping Chromium build (--skip-build specified)${NC}"
        return 0
    fi

    if [[ ! -d "out/${BUILD_TYPE}" ]]; then
        echo -e "${BLUE}Building Chromium (${BUILD_TYPE})...${NC}"
        ./build.sh --$(echo $BUILD_TYPE | tr '[:upper:]' '[:lower:]')
    else
        echo -e "${GREEN}Using existing build: out/${BUILD_TYPE}${NC}"
    fi
}

# Build macOS DMG
build_macos_dmg() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Building macOS DMG Installer${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

    if [[ "$CURRENT_PLATFORM" != "macos" ]]; then
        echo -e "${YELLOW}Skipping macOS build (not on macOS)${NC}"
        return 0
    fi

    # Check prerequisites
    if ! check_prerequisites macos; then
        echo -e "${RED}Missing prerequisites for macOS build${NC}"
        return 1
    fi

    # Create app bundle if build exists
    local BUILD_DIR="out/${BUILD_TYPE}"
    local APP_BUNDLE="Blockd Browser.app"
    local DMG_NAME="BlockedBrowser-v${VERSION}-macOS.dmg"

    if [[ ! -d "$BUILD_DIR" ]]; then
        echo -e "${YELLOW}No build directory found. Creating mock installer...${NC}"
        create_mock_macos_installer
        return 0
    fi

    echo "Step 1: Creating app bundle..."
    rm -rf "$APP_BUNDLE"
    mkdir -p "$APP_BUNDLE/Contents/MacOS"
    mkdir -p "$APP_BUNDLE/Contents/Resources"

    # Copy Info.plist
    cp installer/mac/Info.plist "$APP_BUNDLE/Contents/"

    # Update version in Info.plist
    sed -i '' "s/1.0.0/${VERSION}/g" "$APP_BUNDLE/Contents/Info.plist"

    # Copy browser files
    cp -r "$BUILD_DIR"/* "$APP_BUNDLE/Contents/MacOS/"

    # Copy icon
    cp installer/mac/resources/app.icns "$APP_BUNDLE/Contents/Resources/"

    echo "Step 2: Creating DMG..."
    cd installer/mac
    ./create_dmg.sh
    cd "$SCRIPT_DIR"

    # Move to output
    if [[ -f "BlockedBrowser.dmg" ]]; then
        mv "BlockedBrowser.dmg" "$OUTPUT_DIR/$DMG_NAME"
        echo -e "${GREEN}Created: $OUTPUT_DIR/$DMG_NAME${NC}"
    fi

    # Cleanup
    rm -rf "$APP_BUNDLE"
}

# Create mock macOS installer for testing
create_mock_macos_installer() {
    local DMG_NAME="BlockedBrowser-v${VERSION}-macOS.dmg"
    local APP_BUNDLE="${SCRIPT_DIR}/Blockd Browser.app"

    echo "Creating mock app bundle for testing..."

    rm -rf "$APP_BUNDLE"
    mkdir -p "$APP_BUNDLE/Contents/MacOS"
    mkdir -p "$APP_BUNDLE/Contents/Resources"

    # Create minimal Info.plist
    cat > "$APP_BUNDLE/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>blocked</string>
    <key>CFBundleIconFile</key>
    <string>app.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.blockd.browser</string>
    <key>CFBundleName</key>
    <string>Blockd Browser</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

    # Create mock executable
    cat > "$APP_BUNDLE/Contents/MacOS/blocked" << 'SCRIPT'
#!/bin/bash
echo "Blockd Browser Mock - This is a placeholder for the actual Chromium browser"
echo "To build the real browser, run: ./build.sh --release"
osascript -e 'display dialog "Blockd Browser Mock\n\nThis is a placeholder installer.\nBuild the real browser with:\n./build.sh --release" with title "Blockd Browser" buttons {"OK"} default button "OK"' 2>/dev/null || true
SCRIPT
    chmod +x "$APP_BUNDLE/Contents/MacOS/blocked"

    # Copy icon
    if [[ -f "${SCRIPT_DIR}/installer/mac/resources/app.icns" ]]; then
        cp "${SCRIPT_DIR}/installer/mac/resources/app.icns" "$APP_BUNDLE/Contents/Resources/"
    fi

    echo "Creating DMG from mock app bundle..."

    # Use hdiutil create with srcfolder for simplicity
    local DMG_TMP="${SCRIPT_DIR}/${DMG_NAME}.tmp"
    local STAGING_DIR="${SCRIPT_DIR}/dmg_staging"

    rm -rf "$STAGING_DIR"
    mkdir -p "$STAGING_DIR"
    cp -R "$APP_BUNDLE" "$STAGING_DIR/"
    ln -s /Applications "$STAGING_DIR/Applications"

    # Create DMG directly from folder
    hdiutil create -volname "Blockd Browser" -srcfolder "$STAGING_DIR" -ov -format UDZO "$OUTPUT_DIR/$DMG_NAME"

    # Cleanup
    rm -rf "$APP_BUNDLE" "$STAGING_DIR"

    echo -e "${GREEN}Created mock installer: $OUTPUT_DIR/$DMG_NAME${NC}"
}

# Build Windows NSIS installer
build_windows_nsis() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Building Windows NSIS Installer${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

    local BUILD_DIR="out/${BUILD_TYPE}"
    local INSTALLER_NAME="BlockedBrowser_Setup_v${VERSION}.exe"

    # Check if NSIS is available
    if ! command -v makensis &>/dev/null; then
        echo -e "${YELLOW}NSIS not found. Install with: brew install nsis${NC}"
        echo -e "${YELLOW}Creating Windows installer package instead...${NC}"
        create_windows_package
        return 0
    fi

    if [[ ! -d "$BUILD_DIR" ]]; then
        echo -e "${YELLOW}No build directory found. Creating mock installer...${NC}"
        create_mock_windows_installer
        return 0
    fi

    echo "Building NSIS installer..."
    cd installer/windows

    # Update version in NSI file
    sed "s/!define PRODUCT_VERSION \"1.0.0\"/!define PRODUCT_VERSION \"${VERSION}\"/" \
        blocked_installer.nsi > blocked_installer_temp.nsi

    makensis blocked_installer_temp.nsi
    rm blocked_installer_temp.nsi

    cd "$SCRIPT_DIR"

    if [[ -f "installer/windows/$INSTALLER_NAME" ]]; then
        mv "installer/windows/$INSTALLER_NAME" "$OUTPUT_DIR/"
        echo -e "${GREEN}Created: $OUTPUT_DIR/$INSTALLER_NAME${NC}"
    fi
}

# Create Windows package (ZIP) when NSIS not available
create_windows_package() {
    local ZIP_NAME="BlockedBrowser-v${VERSION}-Windows.zip"
    local BUILD_DIR="out/${BUILD_TYPE}"
    local PKG_DIR="BlockedBrowser-Windows"

    echo "Creating Windows distribution package..."

    rm -rf "$PKG_DIR"
    mkdir -p "$PKG_DIR"

    if [[ -d "$BUILD_DIR" ]]; then
        cp -r "$BUILD_DIR"/* "$PKG_DIR/"
    else
        echo "Creating mock content..."
        cat > "$PKG_DIR/README.txt" << EOF
Blockd Browser v${VERSION} for Windows

This is a placeholder package. To get the full browser:
1. Build Chromium with: ./build.sh --release
2. Re-run installer build: ./build_installers.sh --platform windows

For more information, visit: https://blockd.com
EOF
    fi

    # Copy resources
    cp installer/windows/LICENSE.txt "$PKG_DIR/" 2>/dev/null || true
    cp installer/windows/resources/app_icon.ico "$PKG_DIR/" 2>/dev/null || true

    # Create ZIP
    zip -rq "$OUTPUT_DIR/$ZIP_NAME" "$PKG_DIR"
    rm -rf "$PKG_DIR"

    echo -e "${GREEN}Created: $OUTPUT_DIR/$ZIP_NAME${NC}"
}

# Create mock Windows installer
create_mock_windows_installer() {
    create_windows_package
}

# Build Linux packages
build_linux_packages() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Building Linux Packages${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

    local BUILD_DIR="out/${BUILD_TYPE}"

    # Build DEB package
    build_linux_deb

    # Build RPM package
    build_linux_rpm

    # Build AppImage
    build_linux_appimage
}

# Build Debian package
build_linux_deb() {
    echo ""
    echo -e "${BLUE}Building DEB package...${NC}"

    local DEB_NAME="blockd-browser_${VERSION}_amd64.deb"
    local PKG_DIR="blockd-browser_${VERSION}_amd64"
    local BUILD_DIR="out/${BUILD_TYPE}"

    if ! command -v dpkg-deb &>/dev/null; then
        echo -e "${YELLOW}dpkg-deb not found. Creating tar.gz package instead...${NC}"
        create_linux_tarball "deb"
        return 0
    fi

    rm -rf "$PKG_DIR"
    mkdir -p "$PKG_DIR/DEBIAN"
    mkdir -p "$PKG_DIR/opt/blockd-browser"
    mkdir -p "$PKG_DIR/usr/share/applications"
    mkdir -p "$PKG_DIR/usr/share/icons/hicolor/256x256/apps"
    mkdir -p "$PKG_DIR/usr/bin"

    # Copy control files
    cp installer/linux/debian/control "$PKG_DIR/DEBIAN/"
    cp installer/linux/debian/postinst "$PKG_DIR/DEBIAN/"
    cp installer/linux/debian/postrm "$PKG_DIR/DEBIAN/"
    chmod 755 "$PKG_DIR/DEBIAN/postinst" "$PKG_DIR/DEBIAN/postrm"

    # Update version
    sed -i.bak "s/Version: 1.0.0/Version: ${VERSION}/" "$PKG_DIR/DEBIAN/control"
    rm "$PKG_DIR/DEBIAN/control.bak" 2>/dev/null || true

    # Copy browser files or create mock
    if [[ -d "$BUILD_DIR" ]]; then
        cp -r "$BUILD_DIR"/* "$PKG_DIR/opt/blockd-browser/"
    else
        echo "Creating mock content..."
        cat > "$PKG_DIR/opt/blockd-browser/blocked" << 'EOF'
#!/bin/bash
echo "Blockd Browser Mock - Build the real browser with: ./build.sh --release"
EOF
        chmod +x "$PKG_DIR/opt/blockd-browser/blocked"
    fi

    # Copy desktop file and icon
    cp installer/linux/blocked.desktop "$PKG_DIR/usr/share/applications/"
    cp resources/app_icon_256.png "$PKG_DIR/usr/share/icons/hicolor/256x256/apps/blockd-browser.png"

    # Create symlink
    ln -s /opt/blockd-browser/blocked "$PKG_DIR/usr/bin/blockd-browser"

    # Build DEB
    dpkg-deb --build "$PKG_DIR" "$OUTPUT_DIR/$DEB_NAME"
    rm -rf "$PKG_DIR"

    echo -e "${GREEN}Created: $OUTPUT_DIR/$DEB_NAME${NC}"
}

# Build RPM package
build_linux_rpm() {
    echo ""
    echo -e "${BLUE}Building RPM package...${NC}"

    local RPM_NAME="blockd-browser-${VERSION}-1.x86_64.rpm"

    if ! command -v rpmbuild &>/dev/null; then
        echo -e "${YELLOW}rpmbuild not found. Creating tar.gz package instead...${NC}"
        create_linux_tarball "rpm"
        return 0
    fi

    # Setup rpmbuild directories
    local RPMBUILD_DIR="${HOME}/rpmbuild"
    mkdir -p "${RPMBUILD_DIR}"/{SOURCES,SPECS,BUILD,RPMS,SRPMS}

    # Create source tarball
    local BUILD_DIR="out/${BUILD_TYPE}"
    local SRC_DIR="blockd-browser-${VERSION}"

    rm -rf "$SRC_DIR"
    mkdir -p "$SRC_DIR"

    if [[ -d "$BUILD_DIR" ]]; then
        cp -r "$BUILD_DIR"/* "$SRC_DIR/"
    else
        cat > "$SRC_DIR/blocked" << 'EOF'
#!/bin/bash
echo "Blockd Browser Mock - Build the real browser with: ./build.sh --release"
EOF
        chmod +x "$SRC_DIR/blocked"
    fi

    mkdir -p "$SRC_DIR/installer/linux"
    mkdir -p "$SRC_DIR/resources"
    cp installer/linux/blocked.desktop "$SRC_DIR/installer/linux/"
    cp resources/app_icon_256.png "$SRC_DIR/resources/"

    tar czf "${RPMBUILD_DIR}/SOURCES/blockd-browser-${VERSION}.tar.gz" "$SRC_DIR"
    rm -rf "$SRC_DIR"

    # Copy spec file
    sed "s/Version:        1.0.0/Version:        ${VERSION}/" \
        installer/linux/rpm/blockd-browser.spec > "${RPMBUILD_DIR}/SPECS/blockd-browser.spec"

    # Build RPM
    rpmbuild -bb "${RPMBUILD_DIR}/SPECS/blockd-browser.spec"

    # Copy to output
    if [[ -f "${RPMBUILD_DIR}/RPMS/x86_64/$RPM_NAME" ]]; then
        cp "${RPMBUILD_DIR}/RPMS/x86_64/$RPM_NAME" "$OUTPUT_DIR/"
        echo -e "${GREEN}Created: $OUTPUT_DIR/$RPM_NAME${NC}"
    fi
}

# Build AppImage
build_linux_appimage() {
    echo ""
    echo -e "${BLUE}Building AppImage...${NC}"

    local APPIMAGE_NAME="BlockedBrowser-v${VERSION}.AppImage"
    local BUILD_DIR="out/${BUILD_TYPE}"

    if ! command -v appimagetool &>/dev/null; then
        echo -e "${YELLOW}appimagetool not found. Creating tar.gz package instead...${NC}"
        create_linux_tarball "appimage"
        return 0
    fi

    local APPDIR="BlockedBrowser.AppDir"
    rm -rf "$APPDIR"
    mkdir -p "$APPDIR/usr/bin"
    mkdir -p "$APPDIR/usr/lib"
    mkdir -p "$APPDIR/usr/share/applications"
    mkdir -p "$APPDIR/usr/share/icons/hicolor/256x256/apps"

    # Copy browser files or create mock
    if [[ -d "$BUILD_DIR" ]]; then
        cp -r "$BUILD_DIR"/* "$APPDIR/usr/lib/"
    else
        cat > "$APPDIR/usr/lib/blocked" << 'EOF'
#!/bin/bash
echo "Blockd Browser Mock - Build the real browser with: ./build.sh --release"
EOF
        chmod +x "$APPDIR/usr/lib/blocked"
    fi

    # Create wrapper script
    cat > "$APPDIR/usr/bin/blockd-browser" << 'EOF'
#!/bin/bash
APPDIR="$(dirname "$(readlink -f "${0}")")/.."
export LD_LIBRARY_PATH="${APPDIR}/usr/lib:${LD_LIBRARY_PATH}"
exec "${APPDIR}/usr/lib/blocked" "$@"
EOF
    chmod +x "$APPDIR/usr/bin/blockd-browser"

    # Install desktop file and icon
    cp installer/linux/blocked.desktop "$APPDIR/usr/share/applications/"
    cp installer/linux/blocked.desktop "$APPDIR/"
    cp resources/app_icon_256.png "$APPDIR/usr/share/icons/hicolor/256x256/apps/blockd-browser.png"
    cp resources/app_icon_256.png "$APPDIR/blockd-browser.png"

    # Create AppRun
    cat > "$APPDIR/AppRun" << 'EOF'
#!/bin/bash
APPDIR="$(dirname "$(readlink -f "${0}")")"
export LD_LIBRARY_PATH="${APPDIR}/usr/lib:${LD_LIBRARY_PATH}"
export PATH="${APPDIR}/usr/bin:${PATH}"
exec "${APPDIR}/usr/lib/blocked" "$@"
EOF
    chmod +x "$APPDIR/AppRun"

    # Build AppImage
    ARCH=x86_64 appimagetool "$APPDIR" "$OUTPUT_DIR/$APPIMAGE_NAME"
    rm -rf "$APPDIR"

    echo -e "${GREEN}Created: $OUTPUT_DIR/$APPIMAGE_NAME${NC}"
}

# Create Linux tarball when specific tools not available
create_linux_tarball() {
    local TYPE=$1
    local TAR_NAME="BlockedBrowser-v${VERSION}-Linux-${TYPE}.tar.gz"
    local BUILD_DIR="out/${BUILD_TYPE}"
    local PKG_DIR="blockd-browser-${VERSION}"

    rm -rf "$PKG_DIR"
    mkdir -p "$PKG_DIR"

    if [[ -d "$BUILD_DIR" ]]; then
        cp -r "$BUILD_DIR"/* "$PKG_DIR/"
    else
        cat > "$PKG_DIR/blocked" << 'EOF'
#!/bin/bash
echo "Blockd Browser Mock - Build the real browser with: ./build.sh --release"
EOF
        chmod +x "$PKG_DIR/blocked"
    fi

    cp installer/linux/blocked.desktop "$PKG_DIR/"
    cp resources/app_icon_256.png "$PKG_DIR/"

    tar czf "$OUTPUT_DIR/$TAR_NAME" "$PKG_DIR"
    rm -rf "$PKG_DIR"

    echo -e "${GREEN}Created: $OUTPUT_DIR/$TAR_NAME${NC}"
}

# Main execution
main() {
    echo -e "${BLUE}Starting installer build...${NC}"
    echo ""

    # Build Chromium if needed
    build_chromium

    # Build platform-specific installers
    case $PLATFORM in
        all)
            build_macos_dmg
            build_windows_nsis
            build_linux_packages
            ;;
        macos)
            build_macos_dmg
            ;;
        windows)
            build_windows_nsis
            ;;
        linux)
            build_linux_packages
            ;;
        *)
            echo -e "${RED}Unknown platform: $PLATFORM${NC}"
            exit 1
            ;;
    esac

    # Summary
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Build Summary${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "Output directory: ${GREEN}$OUTPUT_DIR${NC}"
    echo ""
    echo "Generated installers:"
    ls -lh "$OUTPUT_DIR" 2>/dev/null | tail -n +2 | while read line; do
        echo "  $line"
    done
    echo ""
    echo -e "${GREEN}Installer build complete!${NC}"
}

# Run main function
main
