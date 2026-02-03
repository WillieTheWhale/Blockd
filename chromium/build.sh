#!/bin/bash

# Blockd Browser - Build Script
# Builds the Chromium-based Blockd Browser with custom security monitoring

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROMIUM_DIR="$SCRIPT_DIR/src"
DEPOT_TOOLS_DIR="$SCRIPT_DIR/depot_tools"
BUILD_DIR="$SCRIPT_DIR/out/Blocked"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Parse command line arguments
BUILD_TYPE="release"
JOBS=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
VERBOSE=false
CLEAN=false
TARGET="chrome"

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Build the Blockd Browser

OPTIONS:
    -d, --debug         Build debug version (slower, larger, with symbols)
    -r, --release       Build release version (default)
    -j N, --jobs N      Number of parallel jobs (default: $JOBS)
    -v, --verbose       Verbose build output
    -c, --clean         Clean build (remove out directory)
    -t, --target TARGET Build target (default: chrome)
    -h, --help          Show this help message

TARGETS:
    chrome                  Main browser executable
    blocked_unittests       Unit tests
    blocked_integration_tests Integration tests
    mini_installer          Windows installer

EXAMPLES:
    $0                      # Build release version
    $0 --debug              # Build debug version
    $0 --jobs 16            # Build with 16 parallel jobs
    $0 --target blocked_unittests  # Build unit tests only
    $0 --clean --release    # Clean build of release version

EOF
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--debug)
            BUILD_TYPE="debug"
            shift
            ;;
        -r|--release)
            BUILD_TYPE="release"
            shift
            ;;
        -j|--jobs)
            JOBS="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -c|--clean)
            CLEAN=true
            shift
            ;;
        -t|--target)
            TARGET="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Adjust build directory based on build type
if [ "$BUILD_TYPE" = "debug" ]; then
    BUILD_DIR="$SCRIPT_DIR/out/Debug"
fi

check_environment() {
    section "Checking Build Environment"

    # Check if depot_tools is in PATH
    if ! command -v gn &> /dev/null; then
        error "depot_tools not found in PATH. Run setup.sh first or add depot_tools to PATH"
    fi

    info "depot_tools: $(which gn)"

    # Check if Chromium source exists
    if [ ! -d "$CHROMIUM_DIR" ]; then
        error "Chromium source not found. Run setup.sh first"
    fi

    info "Chromium source: $CHROMIUM_DIR"

    # Check disk space (need 50+ GB)
    # macOS uses df -g, Linux uses df -BG
    if [[ "$OSTYPE" == "darwin"* ]]; then
        AVAILABLE_SPACE=$(df -g "$SCRIPT_DIR" | awk 'NR==2 {print $4}')
    else
        AVAILABLE_SPACE=$(df -BG "$SCRIPT_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
    fi
    info "Available disk space: ${AVAILABLE_SPACE} GB"

    if [ "$AVAILABLE_SPACE" -lt 50 ]; then
        warn "Low disk space. At least 50 GB recommended for builds"
    fi
}

clean_build() {
    if [ "$CLEAN" = true ]; then
        section "Cleaning Build Directory"
        if [ -d "$BUILD_DIR" ]; then
            info "Removing $BUILD_DIR..."
            rm -rf "$BUILD_DIR"
            info "Clean complete"
        else
            info "Build directory doesn't exist, nothing to clean"
        fi
    fi
}

generate_build_files() {
    section "Generating Build Files (GN)"

    cd "$CHROMIUM_DIR"

    # Create build directory
    mkdir -p "$BUILD_DIR"

    # Copy args.gn or generate default
    if [ -f "$SCRIPT_DIR/args.gn" ]; then
        info "Using args.gn from $SCRIPT_DIR/args.gn"
        cp "$SCRIPT_DIR/args.gn" "$BUILD_DIR/args.gn"
    else
        info "Generating default args.gn"
        generate_default_args
    fi

    # Override some args based on build type
    if [ "$BUILD_TYPE" = "debug" ]; then
        info "Build type: DEBUG"
        cat >> "$BUILD_DIR/args.gn" << EOF

# Debug overrides
is_debug = true
is_component_build = true
symbol_level = 2
EOF
    else
        info "Build type: RELEASE"
        cat >> "$BUILD_DIR/args.gn" << EOF

# Release overrides
is_debug = false
is_component_build = false
is_official_build = true
symbol_level = 1
EOF
    fi

    # Run GN
    info "Running: gn gen $BUILD_DIR"
    gn gen "$BUILD_DIR"

    if [ $? -eq 0 ]; then
        info "Build files generated successfully"
    else
        error "GN generation failed"
    fi

    # Show GN args
    info "Build configuration:"
    gn args "$BUILD_DIR" --list --short
}

generate_default_args() {
    cat > "$BUILD_DIR/args.gn" << 'EOF'
# Blockd Browser Build Configuration

# Core build settings
is_component_build = false
is_official_build = true
is_debug = false
symbol_level = 1

# Blocked features
blocked_enable_security_monitoring = true
blocked_enable_eye_tracking = true
blocked_enable_telemetry = true
blocked_enable_video_capture = true
blocked_backend_url = "wss://api.blockd.site"

# Branding (use Chromium branding, not Chrome)
is_chrome_branded = false

# Codecs
proprietary_codecs = true
ffmpeg_branding = "Chrome"

# Disable unnecessary features
enable_nacl = false
enable_widevine = false
enable_hangout_services_extension = false

# Optimization
use_thin_lto = true
is_cfi = false

# Platform-specific
use_sysroot = true
use_custom_libcxx = true
EOF
}

build_target() {
    section "Building Target: $TARGET"

    cd "$CHROMIUM_DIR"

    # Use relative path from src to out directory
    local RELATIVE_BUILD_DIR="../out/$(basename $BUILD_DIR)"
    local NINJA_ARGS="-C $RELATIVE_BUILD_DIR $TARGET"

    if [ "$VERBOSE" = true ]; then
        NINJA_ARGS="$NINJA_ARGS -v"
    fi

    info "Build command: ninja -j $JOBS $NINJA_ARGS"
    info "Build started at: $(date)"

    local START_TIME=$(date +%s)

    # Run ninja
    if ninja -j "$JOBS" $NINJA_ARGS; then
        local END_TIME=$(date +%s)
        local DURATION=$((END_TIME - START_TIME))
        local HOURS=$((DURATION / 3600))
        local MINUTES=$(((DURATION % 3600) / 60))
        local SECONDS=$((DURATION % 60))

        section "Build Successful!"
        info "Build completed at: $(date)"
        info "Build time: ${HOURS}h ${MINUTES}m ${SECONDS}s"

        show_build_outputs
    else
        error "Build failed"
    fi
}

show_build_outputs() {
    section "Build Outputs"

    cd "$BUILD_DIR"

    case "$TARGET" in
        chrome)
            if [ -f "chrome" ] || [ -f "chrome.exe" ]; then
                info "Browser executable:"
                ls -lh chrome chrome.exe 2>/dev/null || true
                echo ""
                info "Run with: $BUILD_DIR/chrome"
            fi
            ;;
        blocked_unittests)
            if [ -f "blocked_unittests" ] || [ -f "blocked_unittests.exe" ]; then
                info "Unit tests:"
                ls -lh blocked_unittests blocked_unittests.exe 2>/dev/null || true
                echo ""
                info "Run with: $BUILD_DIR/blocked_unittests"
            fi
            ;;
        mini_installer)
            if [ -f "mini_installer.exe" ]; then
                info "Windows installer:"
                ls -lh mini_installer.exe
                echo ""
                info "Installer: $BUILD_DIR/mini_installer.exe"
            fi
            ;;
    esac

    # Show total build size
    local BUILD_SIZE=$(du -sh "$BUILD_DIR" | cut -f1)
    info "Total build size: $BUILD_SIZE"
}

print_next_steps() {
    section "Next Steps"

    case "$TARGET" in
        chrome)
            echo "Run the browser:"
            echo "  $BUILD_DIR/chrome"
            echo ""
            echo "Run with logging:"
            echo "  $BUILD_DIR/chrome --enable-logging --v=1"
            echo ""
            echo "Run with debugging:"
            echo "  gdb $BUILD_DIR/chrome  # Linux"
            echo "  lldb $BUILD_DIR/chrome  # macOS"
            ;;
        blocked_unittests)
            echo "Run all unit tests:"
            echo "  $BUILD_DIR/blocked_unittests"
            echo ""
            echo "Run specific test:"
            echo "  $BUILD_DIR/blocked_unittests --gtest_filter=BlockedSecurityServiceTest.*"
            ;;
    esac
}

estimate_build_time() {
    section "Build Time Estimate"

    local CPU_CORES=$JOBS
    local BUILD_TYPE_STR="Release"

    if [ "$BUILD_TYPE" = "debug" ]; then
        BUILD_TYPE_STR="Debug"
    fi

    info "Build type: $BUILD_TYPE_STR"
    info "CPU cores: $CPU_CORES"

    if [ "$CLEAN" = true ]; then
        info "Clean build (full rebuild)"
        if [ "$CPU_CORES" -ge 16 ]; then
            warn "Estimated time: 2-3 hours"
        elif [ "$CPU_CORES" -ge 8 ]; then
            warn "Estimated time: 4-6 hours"
        else
            warn "Estimated time: 6-8+ hours"
        fi
    else
        info "Incremental build"
        if [ "$CPU_CORES" -ge 16 ]; then
            info "Estimated time: 10-20 minutes"
        elif [ "$CPU_CORES" -ge 8 ]; then
            info "Estimated time: 20-40 minutes"
        else
            info "Estimated time: 30-60 minutes"
        fi
    fi

    echo ""
    read -p "Continue with build? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        info "Build cancelled"
        exit 0
    fi
}

main() {
    section "Blockd Browser Build Script"
    info "Build type: $BUILD_TYPE"
    info "Target: $TARGET"
    info "Parallel jobs: $JOBS"

    check_environment
    estimate_build_time
    clean_build
    generate_build_files
    build_target
    print_next_steps
}

# Export depot_tools to PATH if it exists
if [ -d "$DEPOT_TOOLS_DIR" ]; then
    export PATH="$DEPOT_TOOLS_DIR:$PATH"
fi

# Run main
main "$@"
