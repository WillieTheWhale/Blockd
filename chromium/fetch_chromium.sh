#!/bin/bash
# Chromium Source Fetch Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/fetch_chromium.log"
DEPOT_TOOLS="$SCRIPT_DIR/depot_tools"
BACKUP_DIR="$SCRIPT_DIR/blocked_backup"

export PATH="$DEPOT_TOOLS:$PATH"
export DEPOT_TOOLS_METRICS=0

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

> "$LOG_FILE"
log "=== Chromium Fetch Started ==="

# Backup custom modules
log "Backing up custom Blocked modules..."
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
[ -d "$SCRIPT_DIR/src/chrome" ] && cp -r "$SCRIPT_DIR/src/chrome" "$BACKUP_DIR/"
[ -d "$SCRIPT_DIR/src/content" ] && cp -r "$SCRIPT_DIR/src/content" "$BACKUP_DIR/"

# Clean state
log "Cleaning gclient state..."
cd "$SCRIPT_DIR"
rm -rf src .gclient .gclient_entries .cipd 2>/dev/null || true

# Create .gclient
log "Creating .gclient..."
cat > .gclient << 'EOF'
solutions = [
  {
    "name": "src",
    "url": "https://chromium.googlesource.com/chromium/src.git@142.0.7444.175",
    "managed": False,
    "custom_deps": {},
    "custom_vars": {},
  },
]
target_os = ["mac"]
EOF

# Fetch
log "Running gclient sync (this takes 1-3 hours)..."
gclient sync --nohooks --no-history --shallow 2>&1 | tee -a "$LOG_FILE"

# Run hooks
log "Running hooks..."
gclient runhooks 2>&1 | tee -a "$LOG_FILE"

# Restore custom modules
log "Restoring custom modules..."
[ -d "$BACKUP_DIR/chrome/browser/blocked" ] && mkdir -p "$SCRIPT_DIR/src/chrome/browser/blocked" && cp -r "$BACKUP_DIR/chrome/browser/blocked/"* "$SCRIPT_DIR/src/chrome/browser/blocked/"
[ -d "$BACKUP_DIR/chrome/browser/ui/blocked" ] && mkdir -p "$SCRIPT_DIR/src/chrome/browser/ui/blocked" && cp -r "$BACKUP_DIR/chrome/browser/ui/blocked/"* "$SCRIPT_DIR/src/chrome/browser/ui/blocked/"
[ -d "$BACKUP_DIR/chrome/app/theme/blocked" ] && mkdir -p "$SCRIPT_DIR/src/chrome/app/theme/blocked" && cp -r "$BACKUP_DIR/chrome/app/theme/blocked/"* "$SCRIPT_DIR/src/chrome/app/theme/blocked/"
[ -d "$BACKUP_DIR/content/renderer/blocked_eye_tracking" ] && mkdir -p "$SCRIPT_DIR/src/content/renderer/blocked_eye_tracking" && cp -r "$BACKUP_DIR/content/renderer/blocked_eye_tracking/"* "$SCRIPT_DIR/src/content/renderer/blocked_eye_tracking/"
[ -d "$BACKUP_DIR/content/renderer/blocked_ipc" ] && mkdir -p "$SCRIPT_DIR/src/content/renderer/blocked_ipc" && cp -r "$BACKUP_DIR/content/renderer/blocked_ipc/"* "$SCRIPT_DIR/src/content/renderer/blocked_ipc/"
[ -d "$BACKUP_DIR/content/renderer/blocked_video" ] && mkdir -p "$SCRIPT_DIR/src/content/renderer/blocked_video" && cp -r "$BACKUP_DIR/content/renderer/blocked_video/"* "$SCRIPT_DIR/src/content/renderer/blocked_video/"

log "=== Fetch Complete ==="
echo "SUCCESS" > "$SCRIPT_DIR/fetch_status.txt"
