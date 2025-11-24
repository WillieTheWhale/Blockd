#!/bin/bash

# Blocked Browser - Patch Application Script
# Applies all Chromium modifications for Blocked browser

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROMIUM_DIR="$SCRIPT_DIR/../src"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if Chromium source exists
if [ ! -d "$CHROMIUM_DIR" ]; then
    error "Chromium source not found at: $CHROMIUM_DIR"
fi

info "Applying Blocked browser patches to Chromium..."

cd "$CHROMIUM_DIR"

# Apply patches
PATCHES=(
    "0001-add-blocked-security-module.patch"
    "0002-modify-browser-ui.patch"
    "0003-add-blocked-branding.patch"
)

for patch in "${PATCHES[@]}"; do
    patch_file="$SCRIPT_DIR/$patch"

    if [ ! -f "$patch_file" ]; then
        warn "Patch file not found: $patch"
        continue
    fi

    info "Applying patch: $patch"

    if git apply --check "$patch_file" 2>/dev/null; then
        git apply "$patch_file"
        info "✓ Patch applied successfully: $patch"
    else
        warn "Patch may not apply cleanly: $patch"

        # Try with --reject to create .rej files for manual resolution
        if git apply --reject "$patch_file" 2>/dev/null; then
            warn "Patch applied with conflicts. Check .rej files for manual resolution."
        else
            error "Failed to apply patch: $patch"
        fi
    fi
done

info "All patches applied successfully!"
info ""
info "Next steps:"
info "  1. Build the browser: cd .. && ./build.sh"
info "  2. Run the browser: ./out/Blocked/chrome"
