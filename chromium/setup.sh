#!/bin/bash

# Blocked Browser - Chromium Build Environment Setup Script
# This script sets up the complete Chromium build environment

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROMIUM_DIR="$SCRIPT_DIR/src"
DEPOT_TOOLS_DIR="$SCRIPT_DIR/depot_tools"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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

check_requirements() {
    info "Checking system requirements..."

    # Check Python
    if ! command -v python3 &> /dev/null; then
        error "Python 3 is required. Please install Python 3.11+"
    fi

    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
    info "Python version: $PYTHON_VERSION"

    # Check Git
    if ! command -v git &> /dev/null; then
        error "Git is required. Please install Git 2.40+"
    fi

    GIT_VERSION=$(git --version | cut -d' ' -f3)
    info "Git version: $GIT_VERSION"

    # Check disk space (need 100+ GB)
    AVAILABLE_SPACE=$(df -BG "$SCRIPT_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
    info "Available disk space: ${AVAILABLE_SPACE} GB"

    if [ "$AVAILABLE_SPACE" -lt 100 ]; then
        warn "Low disk space. At least 100 GB recommended (you have ${AVAILABLE_SPACE} GB)"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Platform-specific checks
    case "$(uname -s)" in
        Linux)
            info "Platform: Linux"
            check_linux_dependencies
            ;;
        Darwin)
            info "Platform: macOS"
            check_macos_dependencies
            ;;
        MINGW*|CYGWIN*|MSYS*)
            info "Platform: Windows"
            check_windows_dependencies
            ;;
        *)
            error "Unsupported platform: $(uname -s)"
            ;;
    esac
}

check_linux_dependencies() {
    info "Checking Linux dependencies..."

    REQUIRED_PACKAGES=(
        "build-essential"
        "libglib2.0-dev"
        "libgtk-3-dev"
        "libnss3-dev"
        "libatk1.0-dev"
        "libatk-bridge2.0-dev"
        "libcups2-dev"
        "libxcomposite-dev"
        "libxdamage-dev"
        "libxrandr-dev"
        "libgbm-dev"
        "libpango1.0-dev"
        "libasound2-dev"
        "libpulse-dev"
    )

    MISSING_PACKAGES=()

    for package in "${REQUIRED_PACKAGES[@]}"; do
        if ! dpkg -l | grep -q "^ii  $package"; then
            MISSING_PACKAGES+=("$package")
        fi
    done

    if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
        warn "Missing packages: ${MISSING_PACKAGES[*]}"
        echo "Install with:"
        echo "  sudo apt-get install -y ${MISSING_PACKAGES[*]}"
        exit 1
    fi

    info "All Linux dependencies installed"
}

check_macos_dependencies() {
    info "Checking macOS dependencies..."

    if ! command -v xcodebuild &> /dev/null; then
        error "Xcode is required. Install from App Store or xcode-select --install"
    fi

    XCODE_VERSION=$(xcodebuild -version | head -n1 | cut -d' ' -f2)
    info "Xcode version: $XCODE_VERSION"

    if ! command -v xcrun &> /dev/null; then
        error "Xcode Command Line Tools required. Run: xcode-select --install"
    fi

    info "macOS dependencies installed"
}

check_windows_dependencies() {
    info "Checking Windows dependencies..."

    if ! command -v cl.exe &> /dev/null; then
        error "Visual Studio 2022 with C++ Desktop Development workload is required"
    fi

    info "Windows dependencies installed"
}

install_depot_tools() {
    info "Installing depot_tools..."

    if [ -d "$DEPOT_TOOLS_DIR" ]; then
        info "depot_tools already exists, updating..."
        cd "$DEPOT_TOOLS_DIR"
        git pull origin main
    else
        info "Cloning depot_tools..."
        cd "$SCRIPT_DIR"
        git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
    fi

    # Add depot_tools to PATH
    export PATH="$DEPOT_TOOLS_DIR:$PATH"

    info "depot_tools installed at: $DEPOT_TOOLS_DIR"
    info "Add to your shell profile:"
    echo "  export PATH=\"$DEPOT_TOOLS_DIR:\$PATH\""
}

fetch_chromium() {
    info "Fetching Chromium source code..."

    if [ -d "$CHROMIUM_DIR" ]; then
        warn "Chromium source already exists at: $CHROMIUM_DIR"
        read -p "Re-sync? This may take a while. (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cd "$CHROMIUM_DIR"
            gclient sync --with_branch_heads --with_tags
        fi
    else
        cd "$SCRIPT_DIR"

        info "Fetching Chromium 142.0.7444.175 (stable)..."
        info "This will download ~30 GB and may take 1-3 hours..."

        # Create .gclient config
        cat > .gclient << 'EOF'
solutions = [
  {
    "name": "src",
    "url": "https://chromium.googlesource.com/chromium/src.git",
    "managed": False,
    "custom_deps": {},
    "custom_vars": {},
  },
]
target_os = ["linux", "mac", "win"]
EOF

        # Fetch Chromium
        fetch --nohooks chromium

        cd src

        # Checkout stable branch
        git fetch origin refs/tags/142.0.7444.175:refs/tags/142.0.7444.175
        git checkout 142.0.7444.175

        # Sync dependencies
        gclient sync --with_branch_heads --with_tags

        info "Chromium source fetched successfully"
    fi
}

create_build_dirs() {
    info "Creating build directories..."

    mkdir -p "$CHROMIUM_DIR/../out/Blocked"
    mkdir -p "$CHROMIUM_DIR/../patches"

    info "Build directories created"
}

install_blocked_modules() {
    info "Installing Blocked browser modules..."

    # Create Blocked module directories
    BLOCKED_BASE="$CHROMIUM_DIR/chrome/browser/blocked"

    mkdir -p "$BLOCKED_BASE/blocked_security/platform/windows"
    mkdir -p "$BLOCKED_BASE/blocked_security/platform/macos"
    mkdir -p "$BLOCKED_BASE/blocked_security/platform/linux"
    mkdir -p "$BLOCKED_BASE/blocked_telemetry"
    mkdir -p "$BLOCKED_BASE/blocked_ipc"
    mkdir -p "$BLOCKED_BASE/blocked_video"

    # Create renderer eye tracking directory
    mkdir -p "$CHROMIUM_DIR/content/renderer/blocked_eye_tracking"

    # Create UI modification directories
    mkdir -p "$CHROMIUM_DIR/chrome/browser/ui/blocked"

    # Create branding directory
    mkdir -p "$CHROMIUM_DIR/chrome/app/theme/blocked"

    info "Blocked module directories created"
}

setup_git_hooks() {
    info "Setting up Git hooks..."

    cd "$CHROMIUM_DIR"

    # Create pre-commit hook for code formatting
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Run clang-format on modified C++ files

FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(cc|h)$')

if [ -n "$FILES" ]; then
    echo "Running clang-format on modified files..."
    for file in $FILES; do
        clang-format -i "$file"
        git add "$file"
    done
fi
EOF

    chmod +x .git/hooks/pre-commit

    info "Git hooks installed"
}

print_next_steps() {
    info "Setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Add depot_tools to your PATH:"
    echo "     export PATH=\"$DEPOT_TOOLS_DIR:\$PATH\""
    echo ""
    echo "  2. Apply Blocked modifications:"
    echo "     cd $SCRIPT_DIR"
    echo "     ./patches/apply-patches.sh"
    echo ""
    echo "  3. Build the browser:"
    echo "     ./build.sh"
    echo ""
    echo "  4. Run the browser:"
    echo "     ./out/Blocked/chrome"
    echo ""
}

main() {
    info "Blocked Browser - Chromium Build Environment Setup"
    info "=================================================="
    echo ""

    check_requirements
    install_depot_tools
    fetch_chromium
    create_build_dirs
    install_blocked_modules
    setup_git_hooks
    print_next_steps
}

# Run main function
main "$@"
