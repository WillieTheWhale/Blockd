#!/usr/bin/env python3
"""
Blockd Browser Branding Fix Script

This script applies branding fixes to ensure Blockd branding appears correctly
in built browsers. It implements "Strategy A" from the build investigation report:
replacing Chromium branding files with Blockd equivalents.

IMPORTANT: This script ONLY copies existing branding assets. It will NEVER
generate, create, or modify logo files. All logo files (PNG, SVG, ICO, ICNS)
must be created manually by a designer to ensure pixel-perfect accuracy.

Usage:
    python scripts/fix_branding.py [--check-only] [--restore]

Options:
    --check-only    Only check for missing files, don't modify anything
    --restore       Restore original Chromium branding from backup
"""

import os
import sys
import shutil
import argparse
from pathlib import Path

# Get script directory and project root
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
SRC_DIR = PROJECT_ROOT / "src"

# Branding directories
BLOCKED_THEME = SRC_DIR / "chrome" / "app" / "theme" / "blocked"
CHROMIUM_THEME = SRC_DIR / "chrome" / "app" / "theme" / "chromium"
CHROMIUM_BACKUP = SRC_DIR / "chrome" / "app" / "theme" / "chromium_original"

# Required files for build to succeed
REQUIRED_FILES = [
    "BRANDING",
    "product_logo_16.png",
    "product_logo_24.png",
    "product_logo_32.png",
    "product_logo_48.png",
    "product_logo_64.png",
    "product_logo_128.png",
    "product_logo_256.png",
    "product_logo_22_mono.png",
    "linux/product_logo_16.png",
    "linux/product_logo_24.png",
    "linux/product_logo_32.png",
    "linux/product_logo_48.png",
    "linux/product_logo_64.png",
    "linux/product_logo_128.png",
    "linux/product_logo_256.png",
]

# Files that need to exist in win/ subdirectory
WIN_REQUIRED = [
    "win/chromium.ico",  # Will be copied from blockd.ico
    "win/app_list.ico",
    "win/incognito.ico",
]

# Files that need to exist in mac/ subdirectory
MAC_REQUIRED = [
    "mac/app.icns",
]

# SVG files required (these are the problematic ones)
SVG_REQUIRED = [
    "product_logo.svg",
    "product_logo_animation.svg",
]


def check_blocked_files() -> dict:
    """Check which required files exist in blocked theme directory."""
    results = {"present": [], "missing": []}

    all_required = REQUIRED_FILES + WIN_REQUIRED + MAC_REQUIRED + SVG_REQUIRED

    for f in all_required:
        path = BLOCKED_THEME / f
        if path.exists():
            results["present"].append(f)
        else:
            results["missing"].append(f)

    return results


# NOTE: Logo generation functions have been intentionally removed.
# All logo files (PNG, SVG, ICO, ICNS) MUST be created manually by a designer.
# Auto-generating logos results in inaccurate, warped, or deformed branding.


def apply_strategy_a():
    """
    Strategy A: Replace Chromium branding with Blockd branding.

    This is the most reliable method as it uses the existing build infrastructure
    without needing to modify RC files.
    """
    print("\n" + "="*60)
    print("APPLYING STRATEGY A: Replace Chromium Branding")
    print("="*60)

    # Step 1: Backup original Chromium branding if not already done
    if CHROMIUM_THEME.exists() and not CHROMIUM_BACKUP.exists():
        print(f"\n1. Backing up original Chromium branding...")
        shutil.copytree(CHROMIUM_THEME, CHROMIUM_BACKUP)
        print(f"   Backed up to: {CHROMIUM_BACKUP}")
    elif CHROMIUM_BACKUP.exists():
        print(f"\n1. Backup already exists at: {CHROMIUM_BACKUP}")
    else:
        print(f"\n1. WARNING: Chromium theme directory not found!")
        return False

    # Step 2: Check blocked branding exists
    if not BLOCKED_THEME.exists():
        print(f"\n2. ERROR: Blocked theme directory not found: {BLOCKED_THEME}")
        return False
    print(f"\n2. Blocked theme directory found: {BLOCKED_THEME}")

    # Step 3: Verify all required files exist (NO auto-generation)
    print(f"\n3. Checking for missing files in blocked theme...")
    results = check_blocked_files()

    # Handle win/chromium.ico specially - copy from blockd.ico if needed
    if "win/chromium.ico" in results["missing"]:
        src = BLOCKED_THEME / "blockd.ico"
        if src.exists():
            dest = BLOCKED_THEME / "win" / "chromium.ico"
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dest)
            print(f"   Copied blockd.ico -> win/chromium.ico")
            results["missing"].remove("win/chromium.ico")
            results["present"].append("win/chromium.ico")
        elif (BLOCKED_THEME / "win" / "blockd.ico").exists():
            src = BLOCKED_THEME / "win" / "blockd.ico"
            dest = BLOCKED_THEME / "win" / "chromium.ico"
            shutil.copy(src, dest)
            print(f"   Copied win/blockd.ico -> win/chromium.ico")
            results["missing"].remove("win/chromium.ico")
            results["present"].append("win/chromium.ico")

    # Check for critical missing files (logos MUST exist - never auto-generate)
    critical_missing = [f for f in results["missing"] if f.endswith(('.svg', '.png', '.ico', '.icns'))]

    if critical_missing:
        print(f"\n   CRITICAL ERROR: Missing logo files that MUST be created manually:")
        for f in critical_missing:
            print(f"     - {f}")
        print("\n   Logo files must NEVER be auto-generated.")
        print("   Please create these files manually with the exact Blockd logo.")
        print("   Source logo: Blockd_Landing/public/logo.png")
        return False

    if results["missing"]:
        print(f"   Missing files: {len(results['missing'])}")
        for f in results["missing"]:
            print(f"     - {f}")
    else:
        print("   All required files present!")

    # Step 4: Copy blocked branding to chromium directory
    print(f"\n4. Copying Blockd branding to Chromium directory...")

    # Remove existing chromium theme
    if CHROMIUM_THEME.exists():
        shutil.rmtree(CHROMIUM_THEME)

    # Copy blocked to chromium
    shutil.copytree(BLOCKED_THEME, CHROMIUM_THEME)

    # Rename blockd.ico to chromium.ico if needed
    blockd_ico = CHROMIUM_THEME / "win" / "blockd.ico"
    chromium_ico = CHROMIUM_THEME / "win" / "chromium.ico"
    if blockd_ico.exists() and not chromium_ico.exists():
        shutil.copy(blockd_ico, chromium_ico)
        print("   Copied blockd.ico to chromium.ico")

    # Also copy to root level if needed
    root_blockd_ico = CHROMIUM_THEME / "blockd.ico"
    root_chromium_ico = CHROMIUM_THEME / "chromium.ico"
    if root_blockd_ico.exists() and not root_chromium_ico.exists():
        shutil.copy(root_blockd_ico, root_chromium_ico)

    print(f"   Copied Blockd branding to: {CHROMIUM_THEME}")

    # Step 5: Update BRANDING file to ensure correct paths
    branding_file = CHROMIUM_THEME / "BRANDING"
    if branding_file.exists():
        content = branding_file.read_text()
        print(f"\n5. BRANDING file contents:")
        for line in content.strip().split('\n'):
            print(f"   {line}")

    print("\n" + "="*60)
    print("Strategy A applied successfully!")
    print("="*60)
    print("\nNOTE: The branding_path_component should now be 'chromium'")
    print("      (which now contains Blockd assets)")

    return True


def restore_original():
    """Restore original Chromium branding from backup."""
    print("\n" + "="*60)
    print("RESTORING ORIGINAL CHROMIUM BRANDING")
    print("="*60)

    if not CHROMIUM_BACKUP.exists():
        print(f"\nERROR: Backup not found at: {CHROMIUM_BACKUP}")
        print("Cannot restore without backup.")
        return False

    # Remove current chromium theme
    if CHROMIUM_THEME.exists():
        shutil.rmtree(CHROMIUM_THEME)
        print(f"\nRemoved current: {CHROMIUM_THEME}")

    # Restore from backup
    shutil.copytree(CHROMIUM_BACKUP, CHROMIUM_THEME)
    print(f"Restored from: {CHROMIUM_BACKUP}")

    print("\nOriginal Chromium branding restored.")
    return True


def check_only():
    """Only check file status, don't modify anything."""
    print("\n" + "="*60)
    print("BRANDING FILE CHECK")
    print("="*60)

    print(f"\nBlocked theme directory: {BLOCKED_THEME}")
    print(f"Exists: {BLOCKED_THEME.exists()}")

    if BLOCKED_THEME.exists():
        results = check_blocked_files()

        print(f"\nPresent files ({len(results['present'])}):")
        for f in results["present"]:
            print(f"  [OK] {f}")

        if results["missing"]:
            print(f"\nMissing files ({len(results['missing'])}):")
            for f in results["missing"]:
                print(f"  [MISSING] {f}")
            print("\nWARNING: Build may fail due to missing files!")
            return False
        else:
            print("\nAll required branding files present.")
            return True
    else:
        print("\nERROR: Blocked theme directory does not exist!")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Blockd Browser Branding Fix Script"
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Only check for missing files, don't modify anything"
    )
    parser.add_argument(
        "--restore",
        action="store_true",
        help="Restore original Chromium branding from backup"
    )

    args = parser.parse_args()

    print("Blockd Browser Branding Fix Script")
    print(f"Project root: {PROJECT_ROOT}")
    print(f"Source directory: {SRC_DIR}")

    if args.check_only:
        success = check_only()
    elif args.restore:
        success = restore_original()
    else:
        # Default: Apply Strategy A
        success = apply_strategy_a()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
